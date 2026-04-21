import {
  processFile,
  processImageOCR,
  isPdfEncrypted,
  PdfPasswordError,
} from "@/lib/ocr-parser";
import { parseStatementText } from "@/lib/statement-parser";
import { parseNotificationText } from "@/lib/notification-parser";
import {
  tryReserve,
  currentYearMonth,
} from "@/lib/rate-limit/ai-quota";
import { createGeminiClient } from "@/lib/ai-parser/gemini-client";
import { parseFileWithAi } from "@/lib/ai-parser/invoice-parser";
import type { StatementParseResult } from "@/types";

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB — limite Gemini
const VALID_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export type ParseInput = {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  userId: string;
  password?: string;
};

/**
 * Motivos estruturados para o fallback. Usados pela UI (badges, Telegram)
 * para dar feedback preciso ao invés de colapsar tudo em "usedFallback=true".
 * - "disabled"        → GEMINI_API_KEY não configurada no servidor
 * - "quota_exhausted" → reserva atômica retornou false (limite mensal atingido)
 * - "quota_error"     → tryReserve lançou (ex: DB indisponível)
 * - "ai_error"        → generateContent falhou (timeout, erro 5xx, JSON inválido)
 * - "gate_rejected"   → AI retornou mas gate de aceitação recusou (doc não reconhecido)
 * - "pdf_encrypted"   → PDF criptografado, AI pulada (Gemini não aceita senha)
 */
export type FallbackReason =
  | "disabled"
  | "quota_exhausted"
  | "quota_error"
  | "ai_error"
  | "gate_rejected"
  | "pdf_encrypted";

export type ParseResult =
  | {
      kind: "success";
      bank: string;
      transactions: StatementParseResult["transactions"];
      source: "ai" | "notif" | "regex";
      /** Derivado: source !== "notif" && fallbackReason != null. Mantido por compat. */
      usedFallback: boolean;
      /** true se GEMINI_API_KEY está configurada no servidor. */
      aiEnabled: boolean;
      /** true se a IA foi tentada (mesmo que tenha falhado). */
      aiAttempted: boolean;
      /** Motivo do fallback quando source !== "ai". undefined em sucesso AI ou notif. */
      fallbackReason?: FallbackReason;
      confidence: number;
      /** OCR bruto (APENAS para uso server-side — NUNCA expor ao cliente). */
      rawText?: string;
    }
  | {
      kind: "error";
      error:
        | "needs_password"
        | "wrong_password"
        | "invalid_file"
        | "no_transactions_found"
        | "internal";
      message?: string;
      /** OCR bruto (APENAS para uso server-side — NUNCA expor ao cliente). */
      rawText?: string;
    };

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

function bufferToFile(buffer: Buffer, name: string, mime: string): File {
  return new File([new Uint8Array(buffer)], name, { type: mime });
}

/**
 * Loga uma linha JSON com observabilidade do pipeline. Fica em console.info
 * (stdout) para ser consumida por agregadores de logs. Nunca loga userId nem
 * o conteúdo das transações — apenas metadados.
 */
function logParseResult(event: {
  source: "ai" | "notif" | "regex";
  fallbackReason?: FallbackReason;
  documentType?: "fatura_cartao" | "extrato_bancario" | "desconhecido";
  txCount: number;
  latencyMs: number;
  mimeType: string;
  quotaReserved: boolean;
}): void {
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: "parse_pipeline",
      ...event,
    })
  );
}

/**
 * Versão multi-input do pipeline. Usada quando o usuário envia múltiplos
 * arquivos que representam o MESMO documento (ex: várias fotos de uma mesma
 * fatura). A IA roda UMA VEZ com todas as parts no mesmo prompt — consome
 * apenas 1 quota para o batch inteiro.
 *
 * Comportamento:
 *  - N == 1: comporta-se igual a `parseFileForImport` (compat total).
 *  - N >= 2:
 *    - Guards pré-IA rodam por arquivo (mime inválido, >50MB, PDF encriptado).
 *    - STEP 1 (notif fast-path) é PULADO — só faz sentido para imagem única.
 *    - STEP 2: se AI disponível e nenhum arquivo for PDF criptografado, reserva
 *      quota 1x e chama AI com o array.
 *    - STEP 3: se AI falhar/pular, cai em loop fallback (OCR+regex) arquivo-por-arquivo,
 *      AGREGANDO transações de todos.
 *    - O resultado é UM ParseResult único; fallbackReason = primeiro observado.
 *
 * PDFs criptografados em ANY arquivo: pulam a AI pro batch inteiro.
 */
export async function parseFilesForImport(
  inputs: ParseInput[]
): Promise<ParseResult> {
  if (inputs.length === 0) {
    return {
      kind: "error",
      error: "invalid_file",
      message: "Nenhum arquivo fornecido",
    };
  }
  if (inputs.length === 1) {
    return parseFileForImport(inputs[0]);
  }

  const startedAt = Date.now();
  const userId = inputs[0].userId;
  const yearMonth = currentYearMonth();

  // Guards pré-IA por arquivo
  for (const inp of inputs) {
    if (!VALID_MIMES.has(inp.mimeType)) {
      return {
        kind: "error",
        error: "invalid_file",
        message: `Tipo de arquivo não suportado: ${inp.filename}`,
      };
    }
    if (inp.buffer.byteLength > MAX_BYTES) {
      return {
        kind: "error",
        error: "invalid_file",
        message: `Arquivo excede 50 MB: ${inp.filename}`,
      };
    }
  }

  // PREFLIGHT: se QUALQUER PDF for encriptado, pula a AI pro batch
  let anyEncryptedPdf = false;
  for (const inp of inputs) {
    if (inp.mimeType === "application/pdf") {
      try {
        if (await isPdfEncrypted(inp.buffer)) {
          anyEncryptedPdf = true;
          break;
        }
      } catch {
        // Se preflight quebrar, seguir assumindo não-criptografado (AI decide)
      }
    }
  }

  const client = !anyEncryptedPdf ? createGeminiClient() : null;
  const aiEnabled = client !== null;

  let fallbackReason: FallbackReason | null = null;
  let aiAttempted = false;
  let quotaReserved = false;

  if (anyEncryptedPdf) {
    fallbackReason = "pdf_encrypted";
  } else if (!aiEnabled) {
    fallbackReason = "disabled";
  }

  // STEP 2 MULTI-PART: reserva 1 quota, chama AI com array de parts
  if (client) {
    try {
      quotaReserved = await tryReserve(userId, yearMonth);
      if (!quotaReserved) {
        fallbackReason = "quota_exhausted";
      }
    } catch (err) {
      console.warn(
        "tryReserve falhou (multi), caindo em fallback:",
        err instanceof Error ? err.message : String(err)
      );
      quotaReserved = false;
      fallbackReason = "quota_error";
    }

    if (quotaReserved) {
      aiAttempted = true;
      try {
        const aiResult = await parseFileWithAi(
          inputs.map((inp) => ({ buffer: inp.buffer, mimeType: inp.mimeType })),
          client
        );

        const validDocType =
          aiResult.documentType === "fatura_cartao" ||
          aiResult.documentType === "extrato_bancario";

        // Threshold mais alto que o single-file (0.5) porque em batches
        // heterogêneos (álbum com docs diferentes) o modelo tende a devolver
        // confidence intermediário. Rejeitar sub-0.6 aqui faz o fallback
        // processar imagem por imagem, evitando mesclar bancos/docs distintos.
        const MULTI_PART_CONFIDENCE_THRESHOLD = 0.6;
        const confidenceOk =
          aiResult.documentConfidence === undefined ||
          aiResult.documentConfidence >= MULTI_PART_CONFIDENCE_THRESHOLD;

        if (validDocType && aiResult.transactions.length > 0 && confidenceOk) {
          logParseResult({
            source: "ai",
            documentType: aiResult.documentType,
            txCount: aiResult.transactions.length,
            latencyMs: Date.now() - startedAt,
            mimeType: `multi(${inputs.length})`,
            quotaReserved: true,
          });
          return {
            kind: "success",
            bank: aiResult.bank,
            transactions: aiResult.transactions,
            source: "ai",
            usedFallback: false,
            aiEnabled: true,
            aiAttempted: true,
            confidence: aiResult.averageConfidence,
          };
        }
        fallbackReason = "gate_rejected";
      } catch (err) {
        console.warn(
          "AI multi-part falhou, caindo em fallback por-arquivo:",
          err instanceof Error ? err.message : String(err)
        );
        fallbackReason = "ai_error";
      }
    }
  }

  // STEP 3 FALLBACK: loop arquivo-por-arquivo. IMPORTANTE — a partir daqui,
  // NÃO re-chamamos a IA por item (ela já foi tentada/pulada uma vez no batch).
  // Portanto cada item roda apenas OCR + regex/notif, sem quota extra.
  if (fallbackReason === null) {
    fallbackReason = "ai_error";
  }

  const aggregatedTx: StatementParseResult["transactions"] = [];
  let aggregatedBank = "";
  let aggregatedConfidenceSum = 0;
  let aggregatedConfidenceCount = 0;
  let aggregatedRawText = "";
  // Rastreia falhas internas de OCR/parse (não PdfPasswordError) pra
  // distinguir "ausência real de transações" de "falha de infra que mascarou
  // transações". Se TODOS os itens falharem assim, retornamos "internal"
  // em vez de "no_transactions_found" (que seria falso negativo de negócio).
  let internalFailures = 0;
  let lastInternalError: string | undefined;

  for (const inp of inputs) {
    try {
      // PDF criptografado + fallback: processFile pode lançar PdfPasswordError.
      const ocrResult = await processFile(
        bufferToFile(inp.buffer, inp.filename, inp.mimeType),
        inp.password
      );

      const statementResult = parseStatementText(
        ocrResult.text,
        ocrResult.confidence
      );
      if (statementResult.transactions.length > 0) {
        if (!aggregatedBank) aggregatedBank = statementResult.bank;
        aggregatedTx.push(...statementResult.transactions);
        aggregatedConfidenceSum += statementResult.averageConfidence;
        aggregatedConfidenceCount++;
        aggregatedRawText += ocrResult.text + "\n";
        continue;
      }

      const notifResult = parseNotificationText(
        ocrResult.text,
        ocrResult.confidence
      );
      if (notifResult && notifResult.transactions.length > 0) {
        if (!aggregatedBank) aggregatedBank = notifResult.bank;
        aggregatedTx.push(...notifResult.transactions);
        aggregatedConfidenceSum += notifResult.averageConfidence;
        aggregatedConfidenceCount++;
        aggregatedRawText += ocrResult.text + "\n";
      }
    } catch (err) {
      if (err instanceof PdfPasswordError) {
        return {
          kind: "error",
          error: err.needsPassword ? "needs_password" : "wrong_password",
        };
      }
      // Erro de OCR em um item individual — registra pro diagnóstico final.
      // Se pelo menos um outro item extrair transações, seguimos com sucesso.
      // Se TODOS falharem assim, retornamos "internal" (não "no_transactions_found").
      internalFailures++;
      lastInternalError = err instanceof Error ? err.message : String(err);
      console.warn(
        `Erro processando ${inp.filename} no fallback multi:`,
        lastInternalError
      );
    }
  }

  if (aggregatedTx.length > 0) {
    const avgConfidence =
      aggregatedConfidenceCount > 0
        ? aggregatedConfidenceSum / aggregatedConfidenceCount
        : 0;
    logParseResult({
      source: "regex",
      fallbackReason,
      txCount: aggregatedTx.length,
      latencyMs: Date.now() - startedAt,
      mimeType: `multi(${inputs.length})`,
      quotaReserved,
    });
    return {
      kind: "success",
      bank: aggregatedBank,
      transactions: aggregatedTx,
      source: "regex",
      usedFallback: true,
      aiEnabled,
      aiAttempted,
      fallbackReason,
      confidence: avgConfidence,
      rawText: aggregatedRawText || undefined,
    };
  }

  // Se TODOS os itens falharam por erro interno (OCR quebrado, parser quebrado,
  // lib indisponível), propaga como "internal" pra não mascarar problema de
  // infra como se fosse "documento sem transações".
  if (internalFailures === inputs.length) {
    return {
      kind: "error",
      error: "internal",
      message: lastInternalError ?? "Erro ao processar arquivos",
    };
  }

  return {
    kind: "error",
    error: "no_transactions_found",
    rawText: aggregatedRawText || undefined,
  };
}

/**
 * Pipeline unificado de extração de transações a partir de arquivos
 * (PDF, imagens de extratos, fotos de notificações bancárias).
 *
 * Ordem de tentativas:
 *   1. Notification-parser rápido (só imagens) — OCR leve + regex
 *   2. AI (Gemini) com quota mensal reservada atomicamente + acceptance gate
 *   3. Fallback regex (OCR completo + statement-parser + notification-parser)
 *
 * Falhas na IA (erro, quota esgotada, gate reprovado) caem silenciosamente
 * para o STEP 3 com fallbackReason explícito. PDFs criptografados pulam a IA.
 */
export async function parseFileForImport(input: ParseInput): Promise<ParseResult> {
  const { buffer, mimeType, userId, password } = input;
  const startedAt = Date.now();

  // yearMonth capturado UMA vez no início pra evitar race na virada de mês UTC.
  const yearMonth = currentYearMonth();

  // Guardas pré-IA
  if (!VALID_MIMES.has(mimeType)) {
    return {
      kind: "error",
      error: "invalid_file",
      message: "Tipo de arquivo não suportado",
    };
  }
  if (buffer.byteLength > MAX_BYTES) {
    return {
      kind: "error",
      error: "invalid_file",
      message: "Arquivo excede 50 MB (limite da IA)",
    };
  }

  // PREFLIGHT: PDFs criptografados pulam AI (Gemini não aceita senha).
  let skipAiDueToEncryption = false;
  if (mimeType === "application/pdf") {
    try {
      skipAiDueToEncryption = await isPdfEncrypted(buffer);
    } catch {
      // Se o preflight quebrar, assumir não-criptografado (AI decide se aceita)
      skipAiDueToEncryption = false;
    }
  }

  // Cliente AI resolvido uma vez. STEP 1 (notif tesseract) só vale a pena
  // para imagens pequenas — notificações de push no Telegram/celular
  // comprimem pra <500KB, enquanto screenshots de extrato em alta resolução
  // passam disso. Rodar tesseract em imagem grande ANTES da AI adicionava
  // 20-30s ao caminho e estourava o timeout de 60s da Vercel.
  const client = !skipAiDueToEncryption ? createGeminiClient() : null;
  const aiEnabled = client !== null;

  // Imagens acima deste limite pulam STEP 1 quando AI está habilitada —
  // AI é mais rápida e precisa que OCR+regex pra documentos grandes.
  // Quando AI está desabilitada, STEP 1 sempre roda (fallback único).
  const NOTIF_FAST_PATH_MAX_BYTES = 500 * 1024;
  const runStep1 =
    isImage(mimeType) &&
    (!aiEnabled || buffer.byteLength <= NOTIF_FAST_PATH_MAX_BYTES);

  // Cache do OCR leve — reusado no STEP 3 pra evitar dupla tesseract.
  let cachedImageOcr: { text: string; confidence: number } | null = null;

  // STEP 1: notification-parser rápido (imagens pequenas ou AI desabilitada).
  if (runStep1) {
    try {
      const ocrLight = await processImageOCR(
        bufferToFile(buffer, input.filename, mimeType)
      );
      cachedImageOcr = { text: ocrLight.text, confidence: ocrLight.confidence };
      const notifResult = parseNotificationText(ocrLight.text, ocrLight.confidence);
      if (notifResult && notifResult.transactions.length > 0) {
        logParseResult({
          source: "notif",
          txCount: notifResult.transactions.length,
          latencyMs: Date.now() - startedAt,
          mimeType,
          quotaReserved: false,
        });
        return {
          kind: "success",
          bank: notifResult.bank,
          transactions: notifResult.transactions,
          source: "notif",
          usedFallback: false,
          aiEnabled,
          aiAttempted: false,
          // fallbackReason UNDEFINED para notif — não é fallback, é uma via rápida.
          confidence: notifResult.averageConfidence,
          rawText: ocrLight.text,
        };
      }
    } catch (err) {
      console.warn("STEP 1 (notif) falhou, seguindo para STEP 2:", err instanceof Error ? err.message : String(err));
    }
  }

  // STEP 2: AI — só roda se não for PDF criptografado, tiver key e reserva vier OK.

  // Determina fallbackReason inicial baseado em guards síncronos
  let fallbackReason: FallbackReason | null = null;
  let aiAttempted = false;
  // Mantido no escopo da função para o structured log final.
  let quotaReserved = false;

  if (skipAiDueToEncryption) {
    fallbackReason = "pdf_encrypted";
  } else if (!aiEnabled) {
    fallbackReason = "disabled";
  }

  if (client) {
    // tryReserve pode falhar se o DB caiu. Wrap em try/catch para não vazar 500
    // do endpoint — caímos no fallback com fallbackReason="quota_error".
    try {
      quotaReserved = await tryReserve(userId, yearMonth);
      if (!quotaReserved) {
        fallbackReason = "quota_exhausted";
      }
    } catch (err) {
      console.warn("tryReserve falhou, caindo em fallback:", err instanceof Error ? err.message : String(err));
      quotaReserved = false;
      fallbackReason = "quota_error";
    }

    if (quotaReserved) {
      // IMPORTANTE: uma vez que generateContent() começa, o Gemini JÁ COBROU a
      // chamada. O release() só faria sentido se tivéssemos um preflight
      // server-side que aborte ANTES do generateContent ser emitido — o que
      // não temos hoje. Portanto: não liberamos quota em erro/gate reprovado,
      // porque o custo real já foi consumido.
      aiAttempted = true;
      try {
        const aiResult = await parseFileWithAi(buffer, mimeType, client);

        // Acceptance gate triplo:
        //   1. documentType reconhecido (fatura ou extrato, não "desconhecido")
        //   2. ao menos 1 transação extraída (doc sem conteúdo = sem valor)
        //   3. documentConfidence >= 0.5 quando presente (o modelo admite
        //      incerteza sobre o próprio documento — respeitar)
        const validDocType =
          aiResult.documentType === "fatura_cartao" ||
          aiResult.documentType === "extrato_bancario";

        const confidenceOk =
          aiResult.documentConfidence === undefined ||
          aiResult.documentConfidence >= 0.5;

        if (validDocType && aiResult.transactions.length > 0 && confidenceOk) {
          logParseResult({
            source: "ai",
            documentType: aiResult.documentType,
            txCount: aiResult.transactions.length,
            latencyMs: Date.now() - startedAt,
            mimeType,
            quotaReserved: true,
          });
          return {
            kind: "success",
            bank: aiResult.bank,
            transactions: aiResult.transactions,
            source: "ai",
            usedFallback: false,
            aiEnabled: true,
            aiAttempted: true,
            // fallbackReason UNDEFINED em sucesso AI.
            confidence: aiResult.averageConfidence,
          };
        }
        // Gate reprovou → cai no fallback (sem release — cobrado).
        fallbackReason = "gate_rejected";
      } catch (err) {
        console.warn("AI falhou, cai em fallback (quota permanece cobrada):", err instanceof Error ? err.message : String(err));
        fallbackReason = "ai_error";
        // PdfPasswordError não deveria chegar aqui (preflight filtrou),
        // mas por via das dúvidas, caímos no STEP 3.
      }
    }
  }

  // STEP 3: Fallback (tesseract/unpdf + regex)
  // Neste ponto, fallbackReason DEVE estar setado — garante contrato explícito.
  if (fallbackReason === null) {
    // Defensive: não deveria acontecer, mas se chegou aqui sem razão, é ai_error.
    fallbackReason = "ai_error";
  }

  try {
    // Reusa o OCR do STEP 1 se existir (imagem que não casou com notif).
    // Para PDFs (ou se STEP 1 falhou), roda processFile completo.
    const ocrResult = cachedImageOcr
      ? cachedImageOcr
      : await processFile(
          bufferToFile(buffer, input.filename, mimeType),
          password
        );

    const statementResult = parseStatementText(ocrResult.text, ocrResult.confidence);
    if (statementResult.transactions.length > 0) {
      logParseResult({
        source: "regex",
        fallbackReason,
        txCount: statementResult.transactions.length,
        latencyMs: Date.now() - startedAt,
        mimeType,
        quotaReserved,
      });
      return {
        kind: "success",
        bank: statementResult.bank,
        transactions: statementResult.transactions,
        source: "regex",
        usedFallback: true,
        aiEnabled,
        aiAttempted,
        fallbackReason,
        confidence: statementResult.averageConfidence,
        rawText: ocrResult.text,
      };
    }

    // Última tentativa: notification-parser em cima do texto OCR completo.
    const notifResult = parseNotificationText(ocrResult.text, ocrResult.confidence);
    if (notifResult && notifResult.transactions.length > 0) {
      logParseResult({
        source: "notif",
        fallbackReason,
        txCount: notifResult.transactions.length,
        latencyMs: Date.now() - startedAt,
        mimeType,
        quotaReserved,
      });
      return {
        kind: "success",
        bank: notifResult.bank,
        transactions: notifResult.transactions,
        source: "notif",
        // Aqui caímos do pipeline de fallback — é uma segunda via em cima do OCR completo.
        // Mantemos usedFallback=true pra sinalizar que a IA não deu conta.
        usedFallback: true,
        aiEnabled,
        aiAttempted,
        fallbackReason,
        confidence: notifResult.averageConfidence,
        rawText: ocrResult.text,
      };
    }

    return {
      kind: "error",
      error: "no_transactions_found",
      rawText: ocrResult.text,
    };
  } catch (err) {
    if (err instanceof PdfPasswordError) {
      return {
        kind: "error",
        error: err.needsPassword ? "needs_password" : "wrong_password",
      };
    }
    console.error("Erro no pipeline de parse:", err);
    return {
      kind: "error",
      error: "internal",
      message: "Erro ao processar arquivo",
    };
  }
}
