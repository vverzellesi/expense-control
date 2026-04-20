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
  release,
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

export type ParseResult =
  | {
      kind: "success";
      bank: string;
      transactions: StatementParseResult["transactions"];
      source: "ai" | "notif" | "regex";
      usedFallback: boolean;
      confidence: number;
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
      rawText?: string;
    };

function isImage(mime: string): boolean {
  return mime.startsWith("image/");
}

function bufferToFile(buffer: Buffer, name: string, mime: string): File {
  return new File([new Uint8Array(buffer)], name, { type: mime });
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
 * para o STEP 3. PDFs criptografados pulam a IA direto (preflight).
 */
export async function parseFileForImport(input: ParseInput): Promise<ParseResult> {
  const { buffer, mimeType, userId, password } = input;

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

  // STEP 1: notification-parser rápido (só imagens)
  if (isImage(mimeType)) {
    try {
      const ocrLight = await processImageOCR(
        bufferToFile(buffer, input.filename, mimeType)
      );
      const notifResult = parseNotificationText(ocrLight.text, ocrLight.confidence);
      if (notifResult && notifResult.transactions.length > 0) {
        return {
          kind: "success",
          bank: notifResult.bank,
          transactions: notifResult.transactions,
          source: "notif",
          usedFallback: false,
          confidence: notifResult.averageConfidence,
          rawText: ocrLight.text,
        };
      }
    } catch (err) {
      console.warn("STEP 1 (notif) falhou, seguindo para STEP 2:", err);
    }
  }

  // STEP 2: AI — só roda se não for PDF criptografado, tiver key e reserva vier OK.
  const client = !skipAiDueToEncryption ? createGeminiClient() : null;

  if (client) {
    const reserved = await tryReserve(userId, yearMonth);
    if (reserved) {
      let gatePassed = false;
      try {
        const aiResult = await parseFileWithAi(buffer, mimeType, client);

        // Acceptance gate duplo: documentType reconhecido + transações existem.
        const validDocType =
          aiResult.documentType === "fatura_cartao" ||
          aiResult.documentType === "extrato_bancario";

        if (validDocType && aiResult.transactions.length > 0) {
          gatePassed = true;
          return {
            kind: "success",
            bank: aiResult.bank,
            transactions: aiResult.transactions,
            source: "ai",
            usedFallback: false,
            confidence: aiResult.averageConfidence,
          };
        }
        // Gate reprovou → release + fallback (no finally abaixo)
      } catch (err) {
        console.warn("AI falhou, release quota + fallback:", err);
        // PdfPasswordError não deveria chegar aqui (preflight filtrou),
        // mas por via das dúvidas, liberamos e caímos no STEP 3.
      } finally {
        if (!gatePassed) {
          try {
            await release(userId, yearMonth);
          } catch (releaseErr) {
            console.error("Falha ao liberar quota (non-fatal):", releaseErr);
          }
        }
      }
    }
  }

  // STEP 3: Fallback (tesseract/unpdf + regex)
  try {
    const ocrResult = await processFile(
      bufferToFile(buffer, input.filename, mimeType),
      password
    );

    const statementResult = parseStatementText(ocrResult.text, ocrResult.confidence);
    if (statementResult.transactions.length > 0) {
      return {
        kind: "success",
        bank: statementResult.bank,
        transactions: statementResult.transactions,
        source: "regex",
        usedFallback: true,
        confidence: statementResult.averageConfidence,
        rawText: ocrResult.text,
      };
    }

    // Última tentativa: notification-parser em cima do texto OCR completo.
    const notifResult = parseNotificationText(ocrResult.text, ocrResult.confidence);
    if (notifResult && notifResult.transactions.length > 0) {
      return {
        kind: "success",
        bank: notifResult.bank,
        transactions: notifResult.transactions,
        source: "notif",
        usedFallback: true,
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
      message: err instanceof Error ? err.message : "Erro desconhecido",
    };
  }
}
