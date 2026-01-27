import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
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
    const searchParams = request.nextUrl.searchParams;
    const monthsParam = searchParams.get("months");
    const numMonths = monthsParam ? Math.min(Math.max(parseInt(monthsParam), 1), 12) : 6;

    const now = new Date();
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 1 + numMonths, 0);

    // Fetch future installment transactions (from grouped installments)
    const futureInstallments = await prisma.transaction.findMany({
      where: {
        isInstallment: true,
        installmentId: { not: null }, // Only grouped installments
        date: {
          gte: startOfNextMonth,
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
        if (futureDate >= startOfNextMonth && futureDate <= endDate) {
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
        isActive: true,
      },
    });

    // For each recurring, find the most recent transaction to get the latest amount
    // (in case user edited the value)
    const recurringWithLatestAmount = await Promise.all(
      activeRecurring.map(async (recurring) => {
        const latestTransaction = await prisma.transaction.findFirst({
          where: {
            recurringExpenseId: recurring.id,
          },
          orderBy: { date: "desc" },
          select: { amount: true },
        });

        return {
          ...recurring,
          // Use the latest transaction amount if exists, otherwise use defaultAmount
          effectiveAmount: latestTransaction?.amount ?? recurring.defaultAmount,
        };
      })
    );

    // Build monthly projections
    const months: MonthProjection[] = [];
    let totalInstallmentsSum = 0;
    let totalRecurringExpensesSum = 0;
    let totalRecurringIncomeSum = 0;

    for (let i = 0; i < numMonths; i++) {
      const projMonth = now.getMonth() + 1 + i;
      const projYear = now.getFullYear() + Math.floor((projMonth - 1) / 12);
      const normalizedMonth = ((projMonth - 1) % 12) + 1;

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

      // Calculate recurring for this month (using effective amount from latest transaction)
      const recurringItems: ProjectionRecurringItem[] = recurringWithLatestAmount.map((r) => ({
        description: r.description,
        amount: Math.abs(r.effectiveAmount),
        type: r.type as "INCOME" | "EXPENSE",
      }));

      const recurringExpenses = recurringWithLatestAmount
        .filter((r) => r.type === "EXPENSE")
        .reduce((sum, r) => sum + Math.abs(r.effectiveAmount), 0);

      const recurringIncome = recurringWithLatestAmount
        .filter((r) => r.type === "INCOME")
        .reduce((sum, r) => sum + Math.abs(r.effectiveAmount), 0);

      totalRecurringExpensesSum += recurringExpenses;
      totalRecurringIncomeSum += recurringIncome;

      const totalExpenses = installmentsTotal + recurringExpenses;
      const totalIncome = recurringIncome;
      const projectedBalance = totalIncome - totalExpenses;

      months.push({
        month: normalizedMonth,
        year: projYear,
        monthLabel,
        installmentsTotal,
        installmentsCount: monthInstallments.length + monthStandaloneInstallments.length,
        installments: installmentItems,
        recurringExpenses,
        recurringIncome,
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
    console.error("Error fetching projection:", error);
    return NextResponse.json(
      { error: "Erro ao buscar projecao financeira" },
      { status: 500 }
    );
  }
}
