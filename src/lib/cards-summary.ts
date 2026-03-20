import prisma from "./db";
import type { AuthContext } from "./auth-utils";

export type CardStatus = "healthy" | "warning" | "critical";

export interface CardCurrentMonth {
  total: number;
  installmentTotal: number;
  newExpenseTotal: number;
  fixedTotal: number;
  transactionCount: number;
  limitUsedPercent: number | null;
  status: CardStatus;
}

export interface CardProjection {
  installmentTotal: number;
  fixedTotal: number;
  estimatedTotal: number;
}

export interface CardRates {
  rotativoRateMonth: number | null;
  parcelamentoRate: number | null;
  cetAnual: number | null;
}

export interface CardSummary {
  id: string;
  name: string;
  creditLimit: number | null;
  billingCycleDay: number | null;
  dueDateDay: number | null;
  currentMonth: CardCurrentMonth;
  projection: CardProjection;
  rates: CardRates;
}

export interface CardsSummaryResponse {
  cards: CardSummary[];
  totals: {
    totalAllCards: number;
    projectedNextMonth: number;
  };
}

export function calculateStatus(limitUsedPercent: number | null): CardStatus {
  if (limitUsedPercent === null) return "healthy";
  if (limitUsedPercent >= 80) return "critical";
  if (limitUsedPercent >= 60) return "warning";
  return "healthy";
}

export function calculateLimitUsedPercent(
  total: number,
  creditLimit: number | null
): number | null {
  if (!creditLimit || creditLimit <= 0) return null;
  return Math.round((Math.abs(total) / creditLimit) * 100 * 100) / 100;
}

export async function calculateCardsSummary(
  ctx: AuthContext,
  targetMonth: number,
  targetYear: number
): Promise<CardsSummaryResponse> {
  // Fetch credit card origins
  const creditCards = await prisma.origin.findMany({
    where: {
      ...ctx.ownerFilter,
      type: "CREDIT_CARD",
    },
    orderBy: { name: "asc" },
  });

  if (creditCards.length === 0) {
    return { cards: [], totals: { totalAllCards: 0, projectedNextMonth: 0 } };
  }

  const cardNames = creditCards.map((c) => c.name);

  // Date ranges for current month
  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate = new Date(targetYear, targetMonth, 0);
  endDate.setHours(23, 59, 59, 999);

  // Next month range for projection
  const nextMonthStart = new Date(targetYear, targetMonth, 1);
  const nextMonthEnd = new Date(targetYear, targetMonth + 1, 0);
  nextMonthEnd.setHours(23, 59, 59, 999);

  // Fetch bill payment records to exclude synthetic transactions
  const billPayments = await prisma.billPayment.findMany({
    where: {
      ...ctx.ownerFilter,
      origin: { in: cardNames },
    },
    select: {
      entryTransactionId: true,
      carryoverTransactionId: true,
      installmentId: true,
    },
  });

  const excludeTransactionIds = billPayments
    .flatMap((bp) => [bp.entryTransactionId, bp.carryoverTransactionId])
    .filter((id): id is string => id !== null);

  const excludeInstallmentIds = billPayments
    .map((bp) => bp.installmentId)
    .filter((id): id is string => id !== null);

  // Fetch all transactions for credit cards in current month
  // Exclude bill payment synthetic transactions (entries, carryovers, financing installments)
  const transactions = await prisma.transaction.findMany({
    where: {
      ...ctx.ownerFilter,
      origin: { in: cardNames },
      date: { gte: startDate, lte: endDate },
      type: "EXPENSE",
      deletedAt: null,
      id: excludeTransactionIds.length > 0 ? { notIn: excludeTransactionIds } : undefined,
      installmentId: excludeInstallmentIds.length > 0 ? { notIn: excludeInstallmentIds } : undefined,
    },
    select: {
      origin: true,
      amount: true,
      isInstallment: true,
      isFixed: true,
    },
  });

  // Fetch future installment transactions for next month
  // Exclude financing installments from bill payments
  const futureInstallments = await prisma.transaction.findMany({
    where: {
      ...ctx.ownerFilter,
      origin: { in: cardNames },
      isInstallment: true,
      type: "EXPENSE",
      date: { gte: nextMonthStart, lte: nextMonthEnd },
      deletedAt: null,
      installmentId: excludeInstallmentIds.length > 0 ? { notIn: excludeInstallmentIds } : undefined,
    },
    select: {
      origin: true,
      amount: true,
    },
  });

  // Fetch active recurring expenses for credit cards
  const recurringExpenses = await prisma.recurringExpense.findMany({
    where: {
      ...ctx.ownerFilter,
      origin: { in: cardNames },
      isActive: true,
      type: "EXPENSE",
    },
    select: {
      origin: true,
      defaultAmount: true,
    },
  });

  // Build per-card summaries
  const cards: CardSummary[] = creditCards.map((card) => {
    // Current month breakdown
    const cardTransactions = transactions.filter((t) => t.origin === card.name);
    const total = cardTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const installmentTotal = cardTransactions
      .filter((t) => t.isInstallment)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const fixedTotal = cardTransactions
      .filter((t) => t.isFixed && !t.isInstallment)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const newExpenseTotal = total - installmentTotal - fixedTotal;

    const limitUsedPercent = calculateLimitUsedPercent(total, card.creditLimit);
    const status = calculateStatus(limitUsedPercent);

    // Projection for next month
    const projInstallments = futureInstallments
      .filter((t) => t.origin === card.name)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const projFixed = recurringExpenses
      .filter((r) => r.origin === card.name)
      .reduce((sum, r) => sum + Math.abs(r.defaultAmount), 0);

    return {
      id: card.id,
      name: card.name,
      creditLimit: card.creditLimit,
      billingCycleDay: card.billingCycleDay,
      dueDateDay: card.dueDateDay,
      currentMonth: {
        total,
        installmentTotal,
        fixedTotal,
        newExpenseTotal,
        transactionCount: cardTransactions.length,
        limitUsedPercent,
        status,
      },
      projection: {
        installmentTotal: projInstallments,
        fixedTotal: projFixed,
        estimatedTotal: projInstallments + projFixed,
      },
      rates: {
        rotativoRateMonth: card.rotativoRateMonth,
        parcelamentoRate: card.parcelamentoRate,
        cetAnual: card.cetAnual,
      },
    };
  });

  const totalAllCards = cards.reduce((sum, c) => sum + c.currentMonth.total, 0);
  const projectedNextMonth = cards.reduce(
    (sum, c) => sum + c.projection.estimatedTotal,
    0
  );

  return {
    cards,
    totals: { totalAllCards, projectedNextMonth },
  };
}
