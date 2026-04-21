import { NextRequest, NextResponse } from "next/server";
import { parseFileForImport, type ParseResult } from "@/lib/parse-pipeline";
import {
  suggestCategory,
  detectInstallment,
  detectRecurringTransaction,
} from "@/lib/categorizer";
import prisma from "@/lib/db";
import {
  getAuthContext,
  unauthorizedResponse,
  forbiddenResponse,
} from "@/lib/auth-utils";
import { encrypt, decrypt } from "@/lib/crypto";

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

function guessMimeFromName(fileName: string): string {
  if (fileName.endsWith(".pdf")) return "application/pdf";
  if (fileName.endsWith(".png")) return "image/png";
  if (fileName.endsWith(".webp")) return "image/webp";
  if (fileName.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

type OcrErrorBody = { error: string };
type OcrPasswordBody = { needsPassword: true; error?: string; savedPasswordFailed?: boolean };

type OcrSuccessBody = Awaited<ReturnType<typeof buildSuccessBody>>;

type PipelineOutcome =
  | { kind: "success"; body: OcrSuccessBody }
  | { kind: "error"; body: OcrErrorBody; status: number }
  | { kind: "password"; body: OcrPasswordBody };

/**
 * Pós-processa o resultado do parseFileForImport: aplica categorização,
 * detecção de parcela e recorrência, removendo rawText do output (segurança).
 */
async function buildSuccessBody(
  result: Extract<ParseResult, { kind: "success" }>,
  userId: string,
  ownerFilter: Record<string, unknown>
) {
  const defaultCategory = await prisma.category.findFirst({
    where: { ...ownerFilter, name: "Outros" },
  });

  const transactions = await Promise.all(
    result.transactions.map(async (t) => {
      const suggestedCat = await suggestCategory(t.description, userId);
      const categoryId = suggestedCat?.id || defaultCategory?.id;
      const installmentInfo = detectInstallment(t.description);
      const recurringInfo = detectRecurringTransaction(t.description);

      return {
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
      };
    })
  );

  return {
    transactions,
    origin: result.bank,
    confidence: result.confidence,
    source: result.source,
    usedFallback: result.usedFallback,
    aiEnabled: result.aiEnabled,
    aiAttempted: result.aiAttempted,
    fallbackReason: result.fallbackReason,
    // NOTA: `rawText` NÃO é exposto ao cliente (dado financeiro bruto).
  };
}

/**
 * Executa o pipeline completo (com retry de senha salva) e devolve um outcome
 * discriminado pronto pra virar JSON ou evento NDJSON.
 */
async function runOcrPipeline(
  file: File,
  password: string | undefined,
  userId: string,
  ownerFilter: Record<string, unknown>,
  savePasswordFlag: boolean
): Promise<PipelineOutcome> {
  const fileName = file.name.toLowerCase();
  const validExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
  if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
    return {
      kind: "error",
      body: {
        error: "Formato de arquivo não suportado. Use PDF ou imagem (PNG, JPG)",
      },
      status: 400,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mimeType = file.type || guessMimeFromName(fileName);

  // Primeiro tenta com a senha explícita (se houver).
  let result = await parseFileForImport({
    buffer,
    mimeType,
    filename: file.name,
    userId,
    password,
  });

  // Se pediu senha e não foi passada explícita, tenta com a senha salva.
  let savedPasswordTried = false;
  if (
    result.kind === "error" &&
    (result.error === "needs_password" || result.error === "wrong_password") &&
    !password
  ) {
    const savedPassword = await getSavedPdfPassword(userId);
    if (savedPassword) {
      savedPasswordTried = true;
      result = await parseFileForImport({
        buffer,
        mimeType,
        filename: file.name,
        userId,
        password: savedPassword,
      });
    }
  }

  if (result.kind === "error") {
    if (result.error === "needs_password") {
      return { kind: "password", body: { needsPassword: true } };
    }
    if (result.error === "wrong_password") {
      // Senha explícita errada.
      if (password) {
        return {
          kind: "password",
          body: {
            needsPassword: true,
            error: "Senha incorreta. Tente novamente.",
          },
        };
      }
      // Senha salva foi tentada e falhou.
      if (savedPasswordTried) {
        return {
          kind: "password",
          body: { needsPassword: true, savedPasswordFailed: true },
        };
      }
      // Fallback: pede senha ao usuário.
      return { kind: "password", body: { needsPassword: true } };
    }
    if (result.error === "no_transactions_found") {
      // NÃO expor rawText ao cliente (dado financeiro bruto).
      return {
        kind: "error",
        body: {
          error:
            "Nenhuma transação encontrada no arquivo. Certifique-se de que o extrato está claro e legível.",
        },
        status: 400,
      };
    }
    if (result.error === "invalid_file") {
      return {
        kind: "error",
        body: { error: result.message || "Arquivo inválido" },
        status: 400,
      };
    }
    return {
      kind: "error",
      body: { error: result.message || "Erro ao processar arquivo" },
      status: 500,
    };
  }

  // Salva senha se requisitada (best-effort) — só se veio senha explícita.
  if (savePasswordFlag && password) {
    try {
      await savePdfPassword(userId, password);
    } catch (saveError) {
      console.error("Failed to save PDF password:", saveError);
    }
  }

  const body = await buildSuccessBody(result, userId, ownerFilter);
  return { kind: "success", body };
}

/**
 * Stream do pipeline como NDJSON pra o cliente renderizar progresso real.
 * Eventos:
 *   { type: "progress", status, progress }   — progresso coarse-grained
 *   { type: "result", ... }                  — payload final (inclui source/fallbackReason)
 *   { type: "password", ... }                — prompt de senha
 *   { type: "error", error, status }         — falha
 *
 * Como `parseFileForImport` não expõe callback de progresso granular (o OCR
 * interno é chamado dentro do pipeline), emitimos eventos coarse-grained em
 * torno da chamada para manter a UX viva e evitar timeouts de proxy.
 */
function streamOcrResponse(
  file: File,
  password: string | undefined,
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

      // Keep-alive tick para manter a conexão viva durante o parse
      // (evita cortes em proxies com timeout curto em bytes ociosos).
      const keepAlive = setInterval(() => {
        try {
          writeEvent({ type: "progress", status: "processing", progress: 0.5 });
        } catch {
          // Stream já fechado — ignora.
        }
      }, 5000);

      try {
        writeEvent({ type: "progress", status: "initializing", progress: 0.05 });
        const outcome = await runOcrPipeline(
          file,
          password,
          userId,
          ownerFilter,
          savePasswordFlag
        );

        if (outcome.kind === "success") {
          writeEvent({ type: "result", ...outcome.body });
        } else if (outcome.kind === "password") {
          writeEvent({ type: "password", ...outcome.body });
        } else {
          writeEvent({ type: "error", ...outcome.body });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro ao processar arquivo";
        if (message === "Unauthorized" || message === "Forbidden") {
          writeEvent({
            type: "error",
            error: message,
            status: message === "Unauthorized" ? 401 : 403,
          });
        } else {
          console.error("OCR streaming error:", error);
          // Mensagem genérica ao cliente (não vazar error.message do servidor).
          writeEvent({ type: "error", error: "Erro ao processar arquivo", status: 500 });
        }
      } finally {
        clearInterval(keepAlive);
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
    const password = (formData.get("password") as string | null) || undefined;
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

    const outcome = await runOcrPipeline(
      file,
      password,
      ctx.userId,
      ctx.ownerFilter,
      savePasswordFlag
    );

    if (outcome.kind === "success") return NextResponse.json(outcome.body);
    if (outcome.kind === "password") return NextResponse.json(outcome.body);
    return NextResponse.json(outcome.body, { status: outcome.status });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("OCR processing error:", error);
    return NextResponse.json(
      { error: "Erro ao processar arquivo" },
      { status: 500 }
    );
  }
}
