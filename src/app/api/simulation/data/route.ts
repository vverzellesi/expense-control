import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

const MONTH_LABELS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    const now = new Date();

    // 1. Average income from last 3 months (only months with income)
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const incomeTransactions = await prisma.transaction.findMany({
      where: {
        userId,
        type: "INCOME",
        date: { gte: threeMonthsAgo, lte: currentMonthEnd },
        deletedAt: null,
      },
    });

    const incomeByMonth = new Map<string, number>();
    for (const t of incomeTransactions) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      incomeByMonth.set(key, (incomeByMonth.get(key) || 0) + Math.abs(t.amount));
    }
    const monthlyIncomes = Array.from(incomeByMonth.values());
    const averageIncome =
      monthlyIncomes.length > 0
        ? monthlyIncomes.reduce((sum, v) => sum + v, 0) / monthlyIncomes.length
        : 0;

    // 2. Active recurring expenses with effective amounts
    const activeRecurring = await prisma.recurringExpense.findMany({
      where: { userId, isActive: true },
    });

    const recurringWithLatestAmount = await Promise.all(
      activeRecurring.map(async (recurring) => {
        const latestTransaction = await prisma.transaction.findFirst({
          where: { userId, recurringExpenseId: recurring.id },
          orderBy: { date: "desc" },
          select: { amount: true },
        });
        return {
          ...recurring,
          effectiveAmount: latestTransaction?.amount ?? recurring.defaultAmount,
        };
      })
    );

    // 3. Future installments (next 12 months) - grouped
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 12, 0);

    const futureInstallments = await prisma.transaction.findMany({
      where: {
        userId,
        isInstallment: true,
        installmentId: { not: null },
        date: { gte: startOfCurrentMonth, lte: endDate },
        deletedAt: null,
      },
    });

    // 3b. Standalone installments (manually tagged, no group) - project remaining
    const standaloneInstallments = await prisma.transaction.findMany({
      where: {
        userId,
        isInstallment: true,
        installmentId: null,
        totalInstallments: { not: null },
        currentInstallment: { not: null },
        deletedAt: null,
      },
    });

    const projectedStandalone: Array<{ amount: number; date: Date }> = [];
    standaloneInstallments.forEach((t) => {
      if (!t.currentInstallment || !t.totalInstallments) return;
      const remaining = t.totalInstallments - t.currentInstallment;
      const tDate = new Date(t.date);
      for (let j = 1; j <= remaining; j++) {
        const futureDate = new Date(tDate);
        futureDate.setMonth(tDate.getMonth() + j);
        if (futureDate >= startOfCurrentMonth && futureDate <= endDate) {
          projectedStandalone.push({ amount: Math.abs(t.amount), date: futureDate });
        }
      }
    });

    // 4. Build 12-month baseline
    const months = [];
    for (let i = 0; i < 12; i++) {
      const projMonth = now.getMonth() + i;
      const projYear = now.getFullYear() + Math.floor(projMonth / 12);
      const normalizedMonth = (projMonth % 12) + 1;
      const label = `${MONTH_LABELS[normalizedMonth - 1]}/${String(projYear).slice(-2)}`;

      const monthInstallments = futureInstallments.filter((t) => {
        const d = new Date(t.date);
        return d.getMonth() + 1 === normalizedMonth && d.getFullYear() === projYear;
      });
      const monthStandalone = projectedStandalone.filter((t) => {
        return t.date.getMonth() + 1 === normalizedMonth && t.date.getFullYear() === projYear;
      });
      const installmentsTotal =
        monthInstallments.reduce((sum, t) => sum + Math.abs(t.amount), 0) +
        monthStandalone.reduce((sum, t) => sum + t.amount, 0);

      const recurringExpensesTotal = recurringWithLatestAmount
        .filter((r) => r.type === "EXPENSE")
        .reduce((sum, r) => sum + Math.abs(r.effectiveAmount), 0);

      months.push({
        month: normalizedMonth,
        year: projYear,
        label,
        currentExpenses: recurringExpensesTotal + installmentsTotal,
        recurringExpenses: recurringExpensesTotal,
        installmentsTotal,
      });
    }

    return NextResponse.json({ averageIncome, months });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching simulation data:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados de simulação" },
      { status: 500 }
    );
  }
}
