import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import {
  isCarryoverTransaction,
  findMatchingBillPayment,
  calculateInterest,
} from "@/lib/carryover-detector";

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
    const ctx = await getAuthContext();
    const body = await request.json();
    const { transactions, origin } = body;

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Transacoes invalidas" },
        { status: 400 }
      );
    }

    // Fetch ALL active recurring expenses for matching (not just autoGenerate=false)
    const recurringToMatch = await prisma.recurringExpense.findMany({
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

    // Fetch user's category tags for validation
    const userTagIds = new Set(
      (await prisma.categoryTag.findMany({
        where: { ...ctx.ownerFilter },
        select: { id: true, categoryId: true },
      })).map(t => `${t.id}:${t.categoryId}`)
    );

    const created = [];
    let linkedCount = 0;
    let carryoverLinkedCount = 0;
    const linkedCarryovers: Array<{
      transactionId: string;
      billPaymentId: string;
      fromBill: string;
      interestRate: number | null;
      interestAmount: number | null;
    }> = [];

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

      // Validate frontend-provided recurringExpenseId belongs to this user
      if (t.recurringExpenseId) {
        const isOwned = recurringToMatch.some(r => r.id === t.recurringExpenseId);
        if (isOwned) {
          matchedRecurringId = t.recurringExpenseId;
        }
      }

      // Only do server-side matching if no valid match from frontend
      if (!matchedRecurringId) {
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
      } else {
        linkedCount++;
      }

      // Validate frontend-provided categoryTagId belongs to user and matches category
      let validatedTagId: string | null = null;
      if (t.categoryTagId) {
        const tagKey = `${t.categoryTagId}:${t.categoryId || ""}`;
        if (userTagIds.has(tagKey)) {
          validatedTagId = t.categoryTagId;
        }
      }

      const transaction = await prisma.transaction.create({
        data: {
          userId: ctx.userId,
          spaceId: ctx.spaceId,
          createdByUserId: ctx.userId,
          description: t.description,
          amount,
          date: transactionDate,
          type,
          origin: transactionOrigin,
          categoryId: t.categoryId || null,
          categoryTagId: validatedTagId,
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

      // Check if this is a carryover transaction and try to link it to a BillPayment
      if (isCarryoverTransaction(t.description)) {
        try {
          const matchingBillPayment = await findMatchingBillPayment({
            origin: transactionOrigin,
            month: transactionMonth + 1, // Convert from 0-indexed to 1-indexed
            year: transactionYear,
            amount: Math.abs(amount),
            userId: ctx.userId,
          });

          if (matchingBillPayment) {
            // Calculate interest from the difference
            const interest = calculateInterest(
              matchingBillPayment.amountCarried,
              Math.abs(amount)
            );

            // Update the BillPayment with the linked transaction and interest info
            await prisma.billPayment.update({
              where: { id: matchingBillPayment.id },
              data: {
                linkedTransactionId: transaction.id,
                interestRate: interest.rate,
                interestAmount: interest.amount,
              },
            });

            // Soft delete the old carryover transaction if it exists
            if (matchingBillPayment.carryoverTransactionId) {
              await prisma.transaction.update({
                where: { id: matchingBillPayment.carryoverTransactionId },
                data: { deletedAt: new Date() },
              });
            }

            carryoverLinkedCount++;
            linkedCarryovers.push({
              transactionId: transaction.id,
              billPaymentId: matchingBillPayment.id,
              fromBill: `${matchingBillPayment.billMonth}/${matchingBillPayment.billYear}`,
              interestRate: interest.rate,
              interestAmount: interest.amount,
            });
          }
        } catch (carryoverError) {
          // Log but don't fail the import if carryover linking fails
          console.error("Error linking carryover transaction:", carryoverError);
        }
      }
    }

    // Build response message
    const messageParts = [`${created.length} transacoes importadas`];
    if (linkedCount > 0) {
      messageParts.push(`${linkedCount} vinculadas a recorrentes`);
    }
    if (carryoverLinkedCount > 0) {
      messageParts.push(`${carryoverLinkedCount} vinculadas a saldo rolado`);
    }
    const message =
      linkedCount > 0 || carryoverLinkedCount > 0
        ? `${messageParts[0]} (${messageParts.slice(1).join(", ")})`
        : `${created.length} transacoes importadas com sucesso`;

    return NextResponse.json(
      {
        message,
        count: created.length,
        linkedCount,
        carryoverLinkedCount,
        linkedCarryovers,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error importing transactions:", error);
    return NextResponse.json(
      { error: "Erro ao importar transacoes" },
      { status: 500 }
    );
  }
}
