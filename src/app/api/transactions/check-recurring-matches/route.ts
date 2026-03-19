import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { parseDateLocal } from "@/lib/utils";

interface TransactionToCheck {
  description: string;
  amount: number;
  date: string;
  origin?: string;
}

interface RecurringMatch {
  index: number;
  recurringExpenseId: string;
  recurringDescription: string;
  recurringAmount: number;
  hasExistingTransaction: boolean;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function matchesRecurring(
  transactionDesc: string,
  recurringDesc: string
): boolean {
  const normalizedTransaction = normalizeText(transactionDesc);
  const normalizedRecurring = normalizeText(recurringDesc);

  const keywords = normalizedRecurring.split(/\s+/).filter((k) => k.length > 2);
  return keywords.some((keyword) => normalizedTransaction.includes(keyword));
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const body = await request.json();
    const { transactions, origin } = body as {
      transactions: TransactionToCheck[];
      origin?: string;
    };

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Transações não fornecidas" },
        { status: 400 }
      );
    }

    // Fetch all active recurring expenses
    const recurringExpenses = await prisma.recurringExpense.findMany({
      where: {
        ...ctx.ownerFilter,
        isActive: true,
      },
      include: {
        transactions: {
          select: { id: true, date: true },
          where: { deletedAt: null },
        },
      },
    });

    const matches: RecurringMatch[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      const transactionDate = !t.date.includes("T") ? parseDateLocal(t.date) : new Date(t.date);
      const transactionMonth = transactionDate.getMonth();
      const transactionYear = transactionDate.getFullYear();
      const transactionOrigin = origin || t.origin || "";

      const matchingRecurring = recurringExpenses.filter((recurring) => {
        // Origin must match if both sides have a non-empty value
        if (transactionOrigin && recurring.origin && recurring.origin !== transactionOrigin) {
          return false;
        }

        // Description must match
        if (!matchesRecurring(t.description, recurring.description)) {
          return false;
        }

        return true;
      });

      // Only use if exactly one match (conservative)
      if (matchingRecurring.length === 1) {
        const recurring = matchingRecurring[0];

        // Check if recurring already has a transaction for this month
        const hasExistingTransaction = recurring.transactions.some((tx) => {
          const txDate = new Date(tx.date);
          return (
            txDate.getMonth() === transactionMonth &&
            txDate.getFullYear() === transactionYear
          );
        });

        matches.push({
          index: i,
          recurringExpenseId: recurring.id,
          recurringDescription: recurring.description,
          recurringAmount: recurring.defaultAmount,
          hasExistingTransaction,
        });
      }
    }

    return NextResponse.json({
      matches,
      hasMatches: matches.length > 0,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error checking recurring matches:", error);
    return NextResponse.json(
      { error: "Erro ao verificar recorrentes" },
      { status: 500 }
    );
  }
}
