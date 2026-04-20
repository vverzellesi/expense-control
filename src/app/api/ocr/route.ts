import { NextRequest, NextResponse } from "next/server";
import { parseFileForImport } from "@/lib/parse-pipeline";
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

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const password = (formData.get("password") as string | null) || undefined;
    const savePasswordFlag = formData.get("savePassword") === "true";

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    const fileName = file.name.toLowerCase();
    const validExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
    if (!validExtensions.some((ext) => fileName.endsWith(ext))) {
      return NextResponse.json(
        { error: "Formato de arquivo não suportado. Use PDF ou imagem (PNG, JPG)" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const mimeType = file.type || guessMimeFromName(fileName);

    // Primeiro tenta com a senha explícita (se houver).
    let result = await parseFileForImport({
      buffer,
      mimeType,
      filename: file.name,
      userId: ctx.userId,
      password,
    });

    // Se pediu senha e não foi passada explícita, tenta com a senha salva.
    let savedPasswordTried = false;
    if (
      result.kind === "error" &&
      (result.error === "needs_password" || result.error === "wrong_password") &&
      !password
    ) {
      const savedPassword = await getSavedPdfPassword(ctx.userId);
      if (savedPassword) {
        savedPasswordTried = true;
        result = await parseFileForImport({
          buffer,
          mimeType,
          filename: file.name,
          userId: ctx.userId,
          password: savedPassword,
        });
      }
    }

    if (result.kind === "error") {
      if (result.error === "needs_password") {
        return NextResponse.json({ needsPassword: true });
      }
      if (result.error === "wrong_password") {
        // Senha explícita errada.
        if (password) {
          return NextResponse.json({
            needsPassword: true,
            error: "Senha incorreta. Tente novamente.",
          });
        }
        // Senha salva foi tentada e falhou.
        if (savedPasswordTried) {
          return NextResponse.json({
            needsPassword: true,
            savedPasswordFailed: true,
          });
        }
        // Fallback: pede senha ao usuário.
        return NextResponse.json({ needsPassword: true });
      }
      if (result.error === "no_transactions_found") {
        return NextResponse.json(
          {
            error:
              "Nenhuma transação encontrada no arquivo. Certifique-se de que o extrato está claro e legível.",
            rawText: result.rawText,
          },
          { status: 400 }
        );
      }
      if (result.error === "invalid_file") {
        return NextResponse.json(
          { error: result.message || "Arquivo inválido" },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: result.message || "Erro ao processar arquivo" },
        { status: 500 }
      );
    }

    // Salva senha se requisitada (best-effort) — só se veio senha explícita.
    if (savePasswordFlag && password) {
      try {
        await savePdfPassword(ctx.userId, password);
      } catch (saveError) {
        console.error("Failed to save PDF password:", saveError);
      }
    }

    // Pós-processamento: categoria sugerida + parcelas + recorrência.
    const defaultCategory = await prisma.category.findFirst({
      where: { ...ctx.ownerFilter, name: "Outros" },
    });

    const transactions = await Promise.all(
      result.transactions.map(async (t) => {
        const suggestedCat = await suggestCategory(t.description, ctx.userId);
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

    return NextResponse.json({
      transactions,
      origin: result.bank,
      confidence: result.confidence,
      rawText: result.rawText,
      source: result.source, // NOVO — UI usa para mostrar "extraído com IA"
      usedFallback: result.usedFallback, // NOVO — UI usa para aviso amarelo
    });
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
