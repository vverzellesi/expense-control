import { NextRequest, NextResponse } from "next/server";
import { processFile } from "@/lib/ocr-parser";
import { parseStatementText, suggestCategoryForStatement } from "@/lib/statement-parser";
import { suggestCategory, detectInstallment, detectRecurringTransaction } from "@/lib/categorizer";
import prisma from "@/lib/db";
import type { ImportedTransaction } from "@/types";

export const runtime = "nodejs";
export const maxDuration = 60; // Allow up to 60 seconds for OCR processing

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

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
        { error: "Formato de arquivo nao suportado. Use PDF ou imagem (PNG, JPG)" },
        { status: 400 }
      );
    }

    // Process file with OCR
    const ocrResult = await processFile(file);

    if (!ocrResult.text || ocrResult.text.trim().length === 0) {
      return NextResponse.json(
        { error: "Nao foi possivel extrair texto do arquivo. Verifique se a imagem esta legivel." },
        { status: 400 }
      );
    }

    // Parse statement text
    const parseResult = parseStatementText(ocrResult.text, ocrResult.confidence);

    if (parseResult.transactions.length === 0) {
      return NextResponse.json(
        {
          error: "Nenhuma transacao encontrada no arquivo. Certifique-se de que o extrato esta claro e legivel.",
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

    // Get default category "Outros" for when no rule matches
    const defaultCategory = await prisma.category.findFirst({
      where: { name: "Outros" },
    });

    for (const t of parseResult.transactions) {
      // Try to find category from rules
      const suggestedCat = await suggestCategory(t.description);

      // If no rule matched, use default category "Outros"
      let categoryId = suggestedCat?.id || defaultCategory?.id;

      // Detect installments
      const installmentInfo = detectInstallment(t.description);

      // Detect recurring transactions (subscriptions)
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
    console.error("OCR processing error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Erro ao processar arquivo",
      },
      { status: 500 }
    );
  }
}
