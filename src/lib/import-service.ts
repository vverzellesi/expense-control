import prisma from "@/lib/db";
import {
  isCarryoverTransaction,
  findMatchingBillPayment,
  calculateInterest,
} from "@/lib/carryover-detector";
import { findDuplicate } from "@/lib/dedup";
import { parseDateLocal } from "@/lib/utils";

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

  const keywords = normalizedRecurring.split(/\s+/).filter((k) => k.length > 2);

  return keywords.some((keyword) => normalizedTransaction.includes(keyword));
}

export interface ImportTransaction {
  description: string;
  amount: number;
  date: Date | string;
  type?: string;
  categoryId?: string | null;
  categoryTagId?: string | null;
  isInstallment?: boolean;
  currentInstallment?: number | null;
  totalInstallments?: number | null;
  recurringExpenseId?: string | null;
  origin?: string;
}

export interface ImportResult {
  created: Array<{
    id: string;
    description: string;
    amount: number;
    date: Date;
    type: string;
    categoryId: string | null;
    recurringExpenseId: string | null;
  }>;
  skippedCount: number;
  linkedCount: number;
  carryoverLinkedCount: number;
  linkedCarryovers: Array<{
    transactionId: string;
    billPaymentId: string;
    fromBill: string;
    interestRate: number | null;
    interestAmount: number | null;
  }>;
}

export async function importTransactions(
  userId: string,
  transactions: ImportTransaction[],
  defaultOrigin: string
): Promise<ImportResult> {
  // Fetch ALL active recurring expenses for matching
  const recurringToMatch = await prisma.recurringExpense.findMany({
    where: {
      userId,
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
      where: { userId },
      select: { id: true, categoryId: true },
    })).map(t => `${t.id}:${t.categoryId}`)
  );

  const created: ImportResult["created"] = [];
  let linkedCount = 0;
  let skippedCount = 0;
  let carryoverLinkedCount = 0;
  const linkedCarryovers: ImportResult["linkedCarryovers"] = [];

  for (const t of transactions) {
    const type = t.type || "EXPENSE";
    let amount = t.amount;

    if (type === "EXPENSE" && amount > 0) {
      amount = -amount;
    } else if (type === "INCOME" && amount < 0) {
      amount = Math.abs(amount);
    }

    // Parse date safely using local timezone
    const transactionDate = typeof t.date === "string" && !t.date.includes("T")
      ? parseDateLocal(t.date)
      : new Date(t.date);
    const transactionMonth = transactionDate.getMonth();
    const transactionYear = transactionDate.getFullYear();
    const transactionOrigin = t.origin || defaultOrigin;

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
        if (recurring.origin !== transactionOrigin) {
          return false;
        }

        if (recurring.categoryId && t.categoryId && recurring.categoryId !== t.categoryId) {
          return false;
        }

        if (!matchesRecurring(t.description, recurring.description)) {
          return false;
        }

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

      if (matches.length === 1) {
        matchedRecurringId = matches[0].id;
        matches[0].transactions.push({ id: "temp", date: transactionDate });
        linkedCount++;
      }
    } else {
      linkedCount++;
    }

    // Check for duplicate transaction
    const duplicate = await findDuplicate({
      userId,
      description: t.description,
      amount,
      date: transactionDate,
    });
    if (duplicate) {
      skippedCount++;
      continue;
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
        userId,
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
    });
    created.push({
      id: transaction.id,
      description: transaction.description,
      amount: transaction.amount,
      date: transaction.date,
      type: transaction.type,
      categoryId: transaction.categoryId,
      recurringExpenseId: transaction.recurringExpenseId,
    });

    // Check if this is a carryover transaction and try to link it to a BillPayment
    if (isCarryoverTransaction(t.description)) {
      try {
        const matchingBillPayment = await findMatchingBillPayment({
          origin: transactionOrigin,
          month: transactionMonth + 1,
          year: transactionYear,
          amount: Math.abs(amount),
          userId,
        });

        if (matchingBillPayment) {
          const interest = calculateInterest(
            matchingBillPayment.amountCarried,
            Math.abs(amount)
          );

          await prisma.billPayment.update({
            where: { id: matchingBillPayment.id },
            data: {
              linkedTransactionId: transaction.id,
              interestRate: interest.rate,
              interestAmount: interest.amount,
            },
          });

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
        console.error("Error linking carryover transaction:", carryoverError);
      }
    }
  }

  return {
    created,
    skippedCount,
    linkedCount,
    carryoverLinkedCount,
    linkedCarryovers,
  };
}
