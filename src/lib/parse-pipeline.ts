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

  // Cache do OCR leve do STEP 1 — reusado no STEP 3 pra evitar dupla tesseract
  // em imagens. Sem esse cache, uma imagem de extrato (não-notif) sem AI_KEY
  // passava por 2 OCR passes e estourava o timeout de 60s da Vercel.
  let cachedImageOcr: { text: string; confidence: number } | null = null;

  // STEP 1: notification-parser rápido (só imagens)
  if (isImage(mimeType)) {
    try {
      const ocrLight = await processImageOCR(
        bufferToFile(buffer, input.filename, mimeType)
      );
      cachedImageOcr = { text: ocrLight.text, confidence: ocrLight.confidence };
      const notifResult = parseNotificationText(ocrLight.text, ocrLight.confidence);
      if (notifResult && notifResult.transactions.length > 0) {
        const client = createGeminiClient();
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
          aiEnabled: client !== null,
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
  const client = !skipAiDueToEncryption ? createGeminiClient() : null;
  const aiEnabled = createGeminiClient() !== null;

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
