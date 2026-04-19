import { NextRequest, NextResponse } from "next/server";
import { processFile, PdfPasswordError, type OcrProgressCallback } from "@/lib/ocr-parser";
import { parseStatementText, suggestCategoryForStatement } from "@/lib/statement-parser";
import { parseNotificationText } from "@/lib/notification-parser";
import { suggestCategory, detectInstallment, detectRecurringTransaction } from "@/lib/categorizer";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { encrypt, decrypt } from "@/lib/crypto";
import type { ImportedTransaction } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const PDF_PASSWORD_KEY = "pdfPassword";

async function getSavedPdfPassword(userId: string): Promise<string | null> {
  const setting = await prisma.settings.findUnique({
    where: { key_userId: { key: PDF_PASSWORD_KEY, userId } },
  });
  if (!setting?.value) return null;
  try {
    const { encrypted, iv } = JSON.parse(setting.value);
    return decrypt(encrypted, iv);
  } catch {
    return null;
  }
}

async function savePdfPassword(userId: string, password: string): Promise<void> {
  const { encrypted, iv } = encrypt(password);
  await prisma.settings.upsert({
    where: { key_userId: { key: PDF_PASSWORD_KEY, userId } },
    update: { value: JSON.stringify({ encrypted, iv }) },
    create: {
      key: PDF_PASSWORD_KEY,
      value: JSON.stringify({ encrypted, iv }),
      userId,
    },
  });
}

type OcrSuccessBody = {
  transactions: (ImportedTransaction & {
    categoryId?: string;
    selected: boolean;
    transactionKind?: string;
  })[];
  origin: string;
  confidence: number;
  rawText: string;
};

type OcrErrorBody = { error: string; rawText?: string; confidence?: number };
type OcrPasswordBody = { needsPassword: true; error?: string; savedPasswordFailed?: boolean };

/**
 * Run the full OCR → parse → categorize pipeline.
 * `onProgress` is forwarded to Tesseract; callers consuming a JSON response
 * can omit it. Returns either a success body, an error body, or a signal that
 * the PDF needs a password.
 */
async function runOcrPipeline(
  file: File,
  password: string | null,
  userId: string,
  ownerFilter: Record<string, unknown>,
  savePasswordFlag: boolean,
  onProgress?: OcrProgressCallback
): Promise<
  | { kind: "success"; body: OcrSuccessBody }
  | { kind: "error"; body: OcrErrorBody; status: number }
  | { kind: "password"; body: OcrPasswordBody }
> {
  const fileName = file.name.toLowerCase();
  const validExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
  if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
    return {
      kind: "error",
      body: { error: "Formato de arquivo não suportado. Use PDF ou imagem (PNG, JPG)" },
      status: 400,
    };
  }

  let ocrResult;
  try {
    ocrResult = await processFile(file, password || undefined, onProgress);
  } catch (error) {
    if (error instanceof PdfPasswordError) {
      if (password) {
        return {
          kind: "password",
          body: { needsPassword: true, error: "Senha incorreta. Tente novamente." },
        };
      }
      const savedPassword = await getSavedPdfPassword(userId);
      if (savedPassword) {
        try {
          ocrResult = await processFile(file, savedPassword, onProgress);
        } catch (retryError) {
          if (retryError instanceof PdfPasswordError) {
            return {
              kind: "password",
              body: { needsPassword: true, savedPasswordFailed: true },
            };
          }
          throw retryError;
        }
      } else {
        return { kind: "password", body: { needsPassword: true } };
      }
    } else {
      throw error;
    }
  }

  if (savePasswordFlag && password) {
    try {
      await savePdfPassword(userId, password);
    } catch (saveError) {
      console.error("Failed to save PDF password:", saveError);
    }
  }

  if (!ocrResult.text || ocrResult.text.trim().length === 0) {
    return {
      kind: "error",
      body: {
        error: "Não foi possível extrair texto do arquivo. Verifique se a imagem está legível.",
      },
      status: 400,
    };
  }

  let parseResult = parseStatementText(ocrResult.text, ocrResult.confidence);
  if (parseResult.transactions.length === 0) {
    const notificationResult = parseNotificationText(ocrResult.text, ocrResult.confidence);
    if (notificationResult) parseResult = notificationResult;
  }

  if (parseResult.transactions.length === 0) {
    return {
      kind: "error",
      body: {
        error:
          "Nenhuma transação encontrada no arquivo. Certifique-se de que o extrato está claro e legível.",
        rawText: ocrResult.text,
        confidence: ocrResult.confidence,
      },
      status: 400,
    };
  }

  const defaultCategory = await prisma.category.findFirst({
    where: { ...ownerFilter, name: "Outros" },
  });

  const transactions: OcrSuccessBody["transactions"] = [];
  for (const t of parseResult.transactions) {
    const suggestedCat = await suggestCategory(t.description, userId);
    const categoryId = suggestedCat?.id || defaultCategory?.id;
    const installmentInfo = detectInstallment(t.description);
    const recurringInfo = detectRecurringTransaction(t.description);

    transactions.push({
      description: t.description,
      amount: t.amount,
      date: t.date,
      type: t.type,
      categoryId,
      suggestedCategoryId: categoryId,
      isInstallment: installmentInfo.isInstallment,
      currentInstallment: installmentInfo.currentInstallment,
      totalInstallments: installmentInfo.totalInstallments,
      isRecurring: recurringInfo.isRecurring,
      recurringName: recurringInfo.recurringName,
      confidence: t.confidence,
      transactionKind: t.transactionKind,
      selected: true,
    });
  }

  return {
    kind: "success",
    body: {
      transactions,
      origin: parseResult.bank,
      confidence: parseResult.averageConfidence,
      rawText: ocrResult.text,
    },
  };
}

/**
 * Stream the OCR pipeline as newline-delimited JSON events so the client
 * can render real Tesseract progress. Events:
 *   { type: "progress", status, progress }   — repeated during OCR
 *   { type: "result", ... }                  — final payload
 *   { type: "password", ... }                — PDF password prompt
 *   { type: "error", error, status }         — failure
 */
function streamOcrResponse(
  file: File,
  password: string | null,
  userId: string,
  ownerFilter: Record<string, unknown>,
  savePasswordFlag: boolean
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const writeEvent = (event: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const result = await runOcrPipeline(
          file,
          password,
          userId,
          ownerFilter,
          savePasswordFlag,
          (update) => writeEvent({ type: "progress", ...update })
        );

        if (result.kind === "success") {
          writeEvent({ type: "result", ...result.body });
        } else if (result.kind === "password") {
          writeEvent({ type: "password", ...result.body });
        } else {
          writeEvent({ type: "error", ...result.body });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao processar arquivo";
        if (message === "Unauthorized" || message === "Forbidden") {
          writeEvent({ type: "error", error: message, status: message === "Unauthorized" ? 401 : 403 });
        } else {
          console.error("OCR streaming error:", error);
          writeEvent({ type: "error", error: message, status: 500 });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const password = formData.get("password") as string | null;
    const savePasswordFlag = formData.get("savePassword") === "true";
    const streamMode = formData.get("stream") === "true";

    if (!file) {
      return NextResponse.json({ error: "Nenhum arquivo enviado" }, { status: 400 });
    }

    if (streamMode) {
      return streamOcrResponse(
        file,
        password,
        ctx.userId,
        ctx.ownerFilter,
        savePasswordFlag
      );
    }

    const result = await runOcrPipeline(
      file,
      password,
      ctx.userId,
      ctx.ownerFilter,
      savePasswordFlag
    );

    if (result.kind === "success") return NextResponse.json(result.body);
    if (result.kind === "password") return NextResponse.json(result.body);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("OCR processing error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao processar arquivo" },
      { status: 500 }
    );
  }
}
