import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";
import { MONTH_LABELS } from "@/lib/constants";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const searchParams = request.nextUrl.searchParams;
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam, 10) : new Date().getFullYear();

    const [currentYearTx, prevYearTx] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId,
          deletedAt: null,
          date: {
            gte: new Date(year, 0, 1),
            lte: new Date(year, 11, 31, 23, 59, 59, 999),
          },
        },
      }),
      prisma.transaction.findMany({
        where: {
          userId,
          deletedAt: null,
          date: {
            gte: new Date(year - 1, 0, 1),
            lte: new Date(year - 1, 11, 31, 23, 59, 59, 999),
          },
        },
      }),
    ]);

    // Group current year by month
    const currentByMonth: Record<number, { income: number; expense: number }> = {};
    for (let m = 1; m <= 12; m++) {
      currentByMonth[m] = { income: 0, expense: 0 };
    }
    for (const t of currentYearTx) {
      const m = new Date(t.date).getMonth() + 1;
      if (t.type === "INCOME") {
        currentByMonth[m].income += Math.abs(t.amount);
      } else if (t.type === "EXPENSE") {
        currentByMonth[m].expense += Math.abs(t.amount);
      }
    }

    // Group previous year by month
    const prevByMonth: Record<number, { income: number; expense: number }> = {};
    for (let m = 1; m <= 12; m++) {
      prevByMonth[m] = { income: 0, expense: 0 };
    }
    for (const t of prevYearTx) {
      const m = new Date(t.date).getMonth() + 1;
      if (t.type === "INCOME") {
        prevByMonth[m].income += Math.abs(t.amount);
      } else if (t.type === "EXPENSE") {
        prevByMonth[m].expense += Math.abs(t.amount);
      }
    }

    // Build months array
    const months = [];
    let totalIncome = 0;
    let totalExpense = 0;
    let totalPrevIncome = 0;
    let totalPrevExpense = 0;

    for (let m = 1; m <= 12; m++) {
      const curr = currentByMonth[m];
      const prev = prevByMonth[m];

      const incomeChange = prev.income > 0
        ? ((curr.income - prev.income) / prev.income) * 100
        : 0;
      const expenseChange = prev.expense > 0
        ? ((curr.expense - prev.expense) / prev.expense) * 100
        : 0;

      months.push({
        month: m,
        monthLabel: MONTH_LABELS[m - 1],
        income: curr.income,
        expense: curr.expense,
        prevIncome: prev.income,
        prevExpense: prev.expense,
        incomeChange,
        expenseChange,
      });

      totalIncome += curr.income;
      totalExpense += curr.expense;
      totalPrevIncome += prev.income;
      totalPrevExpense += prev.expense;
    }

    return NextResponse.json({
      months,
      totals: {
        income: totalIncome,
        expense: totalExpense,
        prevIncome: totalPrevIncome,
        prevExpense: totalPrevExpense,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching annual data:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados anuais" },
      { status: 500 }
    );
  }
}
