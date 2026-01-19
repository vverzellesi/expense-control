import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// Normalize text for matching (lowercase, remove accents)
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// Check if transaction description matches recurring expense keywords
function matchesRecurring(
  transactionDesc: string,
  recurringDesc: string
): boolean {
  const normalizedTransaction = normalizeText(transactionDesc);
  const normalizedRecurring = normalizeText(recurringDesc);

  // Split recurring description into keywords
  const keywords = normalizedRecurring.split(/\s+/).filter((k) => k.length > 2);

  // Check if any keyword is contained in the transaction description
  return keywords.some((keyword) => normalizedTransaction.includes(keyword));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactions, origin } = body;

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Transacoes invalidas" },
        { status: 400 }
      );
    }

    // Fetch recurring expenses that await import linking
    const recurringToMatch = await prisma.recurringExpense.findMany({
      where: {
        autoGenerate: false,
        isActive: true,
      },
      include: {
        transactions: {
          select: { id: true, date: true },
        },
      },
    });

    const created = [];
    let linkedCount = 0;

    for (const t of transactions) {
      // Determine type and amount sign
      const type = t.type || "EXPENSE";
      let amount = t.amount;

      // Ensure amount sign matches type
      if (type === "EXPENSE" && amount > 0) {
        amount = -amount;
      } else if (type === "INCOME" && amount < 0) {
        amount = Math.abs(amount);
      }

      // Parse date safely to avoid timezone issues with YYYY-MM-DD format
      const dateStr = typeof t.date === 'string' && !t.date.includes('T')
        ? t.date + 'T12:00:00'
        : t.date;
      const transactionDate = new Date(dateStr);
      const transactionMonth = transactionDate.getMonth();
      const transactionYear = transactionDate.getFullYear();
      const transactionOrigin = origin || t.origin || "Importacao CSV";

      // Try to match with a recurring expense
      let matchedRecurringId: string | null = null;

      const matches = recurringToMatch.filter((recurring) => {
        // Check origin match
        if (recurring.origin !== transactionOrigin) {
          return false;
        }

        // Check category match (if recurring has category defined)
        if (recurring.categoryId && t.categoryId && recurring.categoryId !== t.categoryId) {
          return false;
        }

        // Check description match
        if (!matchesRecurring(t.description, recurring.description)) {
          return false;
        }

        // Check if already has transaction for this month
        const hasThisMonth = recurring.transactions.some((existingTx) => {
          const existingDate = new Date(existingTx.date);
          return (
            existingDate.getMonth() === transactionMonth &&
            existingDate.getFullYear() === transactionYear
          );
        });

        if (hasThisMonth) {
          return false;
        }

        return true;
      });

      // Only link if we have exactly one match (conservative)
      if (matches.length === 1) {
        matchedRecurringId = matches[0].id;
        // Add to existing transactions to prevent double matching in same import
        matches[0].transactions.push({ id: "temp", date: transactionDate });
        linkedCount++;
      }

      const transaction = await prisma.transaction.create({
        data: {
          description: t.description,
          amount,
          date: transactionDate,
          type,
          origin: transactionOrigin,
          categoryId: t.categoryId || null,
          isFixed: matchedRecurringId !== null,
          isInstallment: t.isInstallment || false,
          currentInstallment: t.currentInstallment || null,
          totalInstallments: t.totalInstallments || null,
          recurringExpenseId: matchedRecurringId,
        },
        include: {
          category: true,
          recurringExpense: true,
        },
      });
      created.push(transaction);
    }

    const message = linkedCount > 0
      ? `${created.length} transacoes importadas (${linkedCount} vinculadas a recorrentes)`
      : `${created.length} transacoes importadas com sucesso`;

    return NextResponse.json(
      { message, count: created.length, linkedCount },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error importing transactions:", error);
    return NextResponse.json(
      { error: "Erro ao importar transacoes" },
      { status: 500 }
    );
  }
}
