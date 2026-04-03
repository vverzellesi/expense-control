import { NextRequest, NextResponse } from "next/server";
import { processFile, PdfPasswordError } from "@/lib/ocr-parser";
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

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const password = formData.get("password") as string | null;
    const savePasswordFlag = formData.get("savePassword") === "true";

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo enviado" },
        { status: 400 }
      );
    }

    // Validate file type
    const fileName = file.name.toLowerCase();
    const validExtensions = [".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp"];
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValid) {
      return NextResponse.json(
        { error: "Formato de arquivo não suportado. Use PDF ou imagem (PNG, JPG)" },
        { status: 400 }
      );
    }

    // Process file — handle password-protected PDFs
    let ocrResult;
    try {
      ocrResult = await processFile(file, password || undefined);
    } catch (error) {
      if (error instanceof PdfPasswordError) {
        if (password) {
          // Explicit password was wrong
          return NextResponse.json({
            needsPassword: true,
            error: "Senha incorreta. Tente novamente.",
          });
        }

        // No password provided — try saved password
        const savedPassword = await getSavedPdfPassword(ctx.userId);
        if (savedPassword) {
          try {
            ocrResult = await processFile(file, savedPassword);
          } catch (retryError) {
            if (retryError instanceof PdfPasswordError) {
              // Saved password also failed — tell frontend
              return NextResponse.json({ needsPassword: true, savedPasswordFailed: true });
            }
            throw retryError;
          }
        } else {
          return NextResponse.json({ needsPassword: true });
        }
      } else {
        throw error;
      }
    }

    // Save password if requested and a password was explicitly provided
    if (savePasswordFlag && password) {
      await savePdfPassword(ctx.userId, password);
    }

    if (!ocrResult.text || ocrResult.text.trim().length === 0) {
      return NextResponse.json(
        { error: "Não foi possível extrair texto do arquivo. Verifique se a imagem está legível." },
        { status: 400 }
      );
    }

    // Parse statement text (try bank statement format first, then notification format)
    let parseResult = parseStatementText(ocrResult.text, ocrResult.confidence);

    // If no transactions found as statement, try notification format
    if (parseResult.transactions.length === 0) {
      const notificationResult = parseNotificationText(ocrResult.text, ocrResult.confidence);
      if (notificationResult) {
        parseResult = notificationResult;
      }
    }

    if (parseResult.transactions.length === 0) {
      return NextResponse.json(
        {
          error: "Nenhuma transação encontrada no arquivo. Certifique-se de que o extrato está claro e legível.",
          rawText: ocrResult.text,
          confidence: ocrResult.confidence,
        },
        { status: 400 }
      );
    }

    // Convert to ImportedTransaction format and apply categorization
    const transactions: (ImportedTransaction & {
      categoryId?: string;
      selected: boolean;
      transactionKind?: string;
    })[] = [];

    const defaultCategory = await prisma.category.findFirst({
      where: { ...ctx.ownerFilter, name: "Outros" },
    });

    for (const t of parseResult.transactions) {
      const suggestedCat = await suggestCategory(t.description, ctx.userId);
      let categoryId = suggestedCat?.id || defaultCategory?.id;
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

    return NextResponse.json({
      transactions,
      origin: parseResult.bank,
      confidence: parseResult.averageConfidence,
      rawText: ocrResult.text,
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
      {
        error: error instanceof Error ? error.message : "Erro ao processar arquivo",
      },
      { status: 500 }
    );
  }
}
