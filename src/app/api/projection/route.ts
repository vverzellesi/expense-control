import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import type {
  MonthProjection,
  ProjectionResponse,
  ProjectionInstallmentItem,
  ProjectionRecurringItem,
} from "@/types";

const MONTH_LABELS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const searchParams = request.nextUrl.searchParams;
    const monthsParam = searchParams.get("months");
    const numMonths = monthsParam ? Math.min(Math.max(parseInt(monthsParam), 1), 12) : 6;

    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + numMonths, 0);

    // Fetch future installment transactions (from grouped installments)
    const futureInstallments = await prisma.transaction.findMany({
      where: {
        ...ctx.ownerFilter,
        isInstallment: true,
        installmentId: { not: null }, // Only grouped installments
        date: {
          gte: startOfCurrentMonth,
          lte: endDate,
        },
      },
      include: {
        installment: true,
      },
      orderBy: { date: "asc" },
    });

    // Fetch standalone installments (manually marked, without group)
    // These need to have their future installments projected
    const standaloneInstallments = await prisma.transaction.findMany({
      where: {
        ...ctx.ownerFilter,
        isInstallment: true,
        installmentId: null,
        totalInstallments: { not: null },
        currentInstallment: { not: null },
      },
    });

    // Project future installments from standalone transactions
    interface ProjectedInstallment {
      description: string;
      amount: number;
      date: Date;
      currentInstallment: number;
      totalInstallments: number;
    }

    const projectedStandaloneInstallments: ProjectedInstallment[] = [];
    standaloneInstallments.forEach((t) => {
      if (!t.currentInstallment || !t.totalInstallments) return;

      const remainingInstallments = t.totalInstallments - t.currentInstallment;
      const transactionDate = new Date(t.date);

      for (let i = 1; i <= remainingInstallments; i++) {
        const futureDate = new Date(transactionDate);
        futureDate.setMonth(transactionDate.getMonth() + i);

        // Only include if within projection range
        if (futureDate >= startOfCurrentMonth && futureDate <= endDate) {
          projectedStandaloneInstallments.push({
            description: t.description,
            amount: Math.abs(t.amount),
            date: futureDate,
            currentInstallment: t.currentInstallment + i,
            totalInstallments: t.totalInstallments,
          });
        }
      }
    });

    // Fetch active recurring expenses/incomes
    const activeRecurring = await prisma.recurringExpense.findMany({
      where: {
        ...ctx.ownerFilter,
        isActive: true,
      },
    });

    // Busca o valor mais recente de cada recurring numa query só (evita N+1).
    const recurringIds = activeRecurring.map((r) => r.id);
    const latestByRecurring =
      recurringIds.length > 0
        ? await prisma.transaction.findMany({
            where: {
              ...ctx.ownerFilter,
              recurringExpenseId: { in: recurringIds },
            },
            // id tiebreaker garante ordem determinística quando 2 transactions
            // do mesmo recurring caem na mesma data.
            orderBy: [{ date: "desc" }, { id: "desc" }],
            distinct: ["recurringExpenseId"],
            select: { recurringExpenseId: true, amount: true },
          })
        : [];

    const latestAmountByRecurring = new Map<string, number>();
    for (const t of latestByRecurring) {
      if (t.recurringExpenseId) {
        latestAmountByRecurring.set(t.recurringExpenseId, t.amount);
      }
    }

    const recurringWithLatestAmount = activeRecurring.map((recurring) => ({
      ...recurring,
      effectiveAmount:
        latestAmountByRecurring.get(recurring.id) ?? recurring.defaultAmount,
    }));

    // Fetch all actual transactions for current month (for real expenses calculation)
    const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const currentMonthTransactions = await prisma.transaction.findMany({
      where: {
        ...ctx.ownerFilter,
        date: {
          gte: startOfCurrentMonth,
          lte: endOfCurrentMonth,
        },
        deletedAt: null,
        investmentTransaction: null,
      },
    });

    // Calculate actual expenses and income for current month
    const actualExpenses = currentMonthTransactions
      .filter((t) => t.type === "EXPENSE")
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const actualIncome = currentMonthTransactions
      .filter((t) => t.type === "INCOME")
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    // Find which recurring expenses have already been charged this month
    const chargedRecurringIds = new Set(
      currentMonthTransactions
        .filter((t) => t.recurringExpenseId !== null)
        .map((t) => t.recurringExpenseId)
    );

    // Filter recurring to only include those NOT yet charged (for current month projection)
    const pendingRecurring = recurringWithLatestAmount.filter(
      (r) => !chargedRecurringIds.has(r.id)
    );

    // Build monthly projections
    const months: MonthProjection[] = [];
    let totalInstallmentsSum = 0;
    let totalRecurringExpensesSum = 0;
    let totalRecurringIncomeSum = 0;
    let totalActualExpensesSum = 0;
    let totalActualIncomeSum = 0;

    for (let i = 0; i < numMonths; i++) {
      const isCurrentMonth = i === 0;
      const projMonth = now.getMonth() + i;
      const projYear = now.getFullYear() + Math.floor(projMonth / 12);
      const normalizedMonth = (projMonth % 12) + 1;

      const monthLabel = `${MONTH_LABELS[normalizedMonth - 1]}/${String(projYear).slice(-2)}`;

      // Get grouped installments for this month
      const monthInstallments = futureInstallments.filter((t) => {
        const tDate = new Date(t.date);
        return tDate.getMonth() + 1 === normalizedMonth && tDate.getFullYear() === projYear;
      });

      // Get projected standalone installments for this month
      const monthStandaloneInstallments = projectedStandaloneInstallments.filter((t) => {
        return t.date.getMonth() + 1 === normalizedMonth && t.date.getFullYear() === projYear;
      });

      const installmentItems: ProjectionInstallmentItem[] = [
        // From grouped installments
        ...monthInstallments.map((t) => ({
          description: t.description,
          amount: Math.abs(t.amount),
          currentInstallment: t.currentInstallment || 1,
          totalInstallments: t.installment?.totalInstallments || 1,
        })),
        // From projected standalone installments
        ...monthStandaloneInstallments.map((t) => ({
          description: t.description,
          amount: t.amount,
          currentInstallment: t.currentInstallment,
          totalInstallments: t.totalInstallments,
        })),
      ];

      const installmentsTotal =
        monthInstallments.reduce((sum, t) => sum + Math.abs(t.amount), 0) +
        monthStandaloneInstallments.reduce((sum, t) => sum + t.amount, 0);
      totalInstallmentsSum += installmentsTotal;

      // For current month: use only pending recurring (not yet charged)
      // For future months: use all recurring
      const recurringToUse = isCurrentMonth ? pendingRecurring : recurringWithLatestAmount;

      const recurringItems: ProjectionRecurringItem[] = recurringToUse.map((r) => ({
        description: r.description,
        amount: Math.abs(r.effectiveAmount),
        type: r.type as "INCOME" | "EXPENSE",
      }));

      const recurringExpensesPending = recurringToUse
        .filter((r) => r.type === "EXPENSE")
        .reduce((sum, r) => sum + Math.abs(r.effectiveAmount), 0);

      const recurringIncomePending = recurringToUse
        .filter((r) => r.type === "INCOME")
        .reduce((sum, r) => sum + Math.abs(r.effectiveAmount), 0);

      // For current month: actual + pending recurring
      // For future months: just projected recurring
      const monthActualExpenses = isCurrentMonth ? actualExpenses : 0;
      const monthActualIncome = isCurrentMonth ? actualIncome : 0;

      totalActualExpensesSum += monthActualExpenses;
      totalActualIncomeSum += monthActualIncome;
      totalRecurringExpensesSum += recurringExpensesPending;
      totalRecurringIncomeSum += recurringIncomePending;

      // Total expenses = actual expenses (current month) + pending recurring expenses
      // For current month, installments are already included in actual expenses if they exist
      // For future months, we add installments separately
      let totalExpenses: number;
      let totalIncome: number;

      if (isCurrentMonth) {
        // Actual already includes what was spent (including any installments/recurring already charged)
        // Add only pending recurring
        totalExpenses = monthActualExpenses + recurringExpensesPending;
        totalIncome = monthActualIncome + recurringIncomePending;
      } else {
        // Future months: installments + all recurring
        totalExpenses = installmentsTotal + recurringExpensesPending;
        totalIncome = recurringIncomePending;
      }

      const projectedBalance = totalIncome - totalExpenses;

      months.push({
        month: normalizedMonth,
        year: projYear,
        monthLabel,
        isCurrentMonth,
        actualExpenses: monthActualExpenses,
        actualIncome: monthActualIncome,
        installmentsTotal,
        installmentsCount: monthInstallments.length + monthStandaloneInstallments.length,
        installments: installmentItems,
        recurringExpenses: recurringExpensesPending,
        recurringIncome: recurringIncomePending,
        recurringItems,
        totalExpenses,
        totalIncome,
        projectedBalance,
        isNegative: projectedBalance < 0,
      });
    }

    const response: ProjectionResponse = {
      months,
      totals: {
        totalInstallments: totalInstallmentsSum,
        totalRecurringExpenses: totalRecurringExpensesSum,
        totalRecurringIncome: totalRecurringIncomeSum,
        netProjectedBalance: totalRecurringIncomeSum - totalInstallmentsSum - totalRecurringExpensesSum,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error fetching projection:", error);
    return NextResponse.json(
      { error: "Erro ao buscar projeção financeira" },
      { status: 500 }
    );
  }
}
