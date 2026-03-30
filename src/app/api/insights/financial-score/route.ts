import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import { calculateFinancialScore } from "@/lib/financial-score";
import { analyzeDebtPattern } from "@/lib/debt-detector";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const searchParams = request.nextUrl.searchParams;
    const month = parseInt(
      searchParams.get("month") || String(new Date().getMonth() + 1),
      10
    );
    const year = parseInt(
      searchParams.get("year") || String(new Date().getFullYear()),
      10
    );

    // Calculate date ranges for last 3 months
    const threeMonthsAgo = new Date(year, month - 4, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const [transactions, installments, billPayments, incomeTransactions] =
      await Promise.all([
        // Expenses for the last 3 months
        prisma.transaction.findMany({
          where: {
            ...ctx.ownerFilter,
            type: "EXPENSE",
            date: { gte: threeMonthsAgo, lte: endDate },
            deletedAt: null,
            investmentTransaction: null,
          },
          select: {
            amount: true,
            date: true,
            isFixed: true,
          },
        }),
        // Active installments
        prisma.installment.findMany({
          where: {
            ...ctx.ownerFilter,
            transactions: {
              some: {
                date: { gte: new Date() },
                deletedAt: null,
              },
            },
          },
          select: {
            id: true,
            totalInstallments: true,
            transactions: {
              where: { date: { lte: new Date() }, deletedAt: null },
              select: { id: true },
              orderBy: { date: "desc" },
              take: 1,
            },
          },
        }),
        // Bill payments for last 6 months (for debt analysis)
        prisma.billPayment.findMany({
          where: {
            userId: ctx.userId,
            billYear: { gte: year - 1, lte: year },
          },
          select: {
            billMonth: true,
            billYear: true,
            origin: true,
            totalBillAmount: true,
            amountPaid: true,
            amountCarried: true,
            paymentType: true,
          },
        }),
        // Income for current month
        prisma.transaction.findMany({
          where: {
            ...ctx.ownerFilter,
            type: "INCOME",
            date: {
              gte: new Date(year, month - 1, 1),
              lte: endDate,
            },
            deletedAt: null,
          },
          select: { amount: true },
        }),
      ]);

    // Calculate income
    const income = incomeTransactions.reduce(
      (sum, t) => sum + Math.abs(t.amount),
      0
    );

    // Calculate fixed expenses for current month
    const currentMonthStart = new Date(year, month - 1, 1);
    const fixedExpensesTotal = transactions
      .filter(
        (t) => t.isFixed && new Date(t.date) >= currentMonthStart
      )
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Calculate installments total for current month
    const installmentsTotal = 0; // Placeholder - could be derived from installment transactions

    // Calculate monthly expenses for trend (last 3 months, oldest first)
    const monthlyExpenses: number[] = [];
    for (let i = 2; i >= 0; i--) {
      const mStart = new Date(year, month - 1 - i, 1);
      const mEnd = new Date(year, month - i, 0, 23, 59, 59);
      const total = transactions
        .filter((t) => {
          const d = new Date(t.date);
          return d >= mStart && d <= mEnd;
        })
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      monthlyExpenses.push(total);
    }

    // Calculate active installments and remaining months
    const activeInstallments = installments.length;
    const totalRemainingMonths = installments.reduce((sum, inst) => {
      // Approximate paid installments from the count of past transactions
      const paidCount = inst.transactions.length;
      const remaining = inst.totalInstallments - paidCount;
      return sum + Math.max(remaining, 0);
    }, 0);

    // Analyze debt pattern
    const debtAlerts = analyzeDebtPattern(billPayments, month, year);
    const debtAlertCount = debtAlerts.length;
    const hasCriticalDebt = debtAlerts.some((a) => a.severity === "critical");

    const result = calculateFinancialScore({
      income,
      fixedExpensesTotal,
      installmentsTotal,
      monthlyExpenses,
      activeInstallments,
      totalRemainingMonths,
      debtAlertCount,
      hasCriticalDebt,
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "financial-score");
  }
}
