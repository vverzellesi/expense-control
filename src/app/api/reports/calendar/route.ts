import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const searchParams = request.nextUrl.searchParams;
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1), 10);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);
    const daysInMonth = monthEnd.getDate();

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        type: "EXPENSE",
        date: {
          gte: monthStart,
          lte: monthEnd,
        },
      },
      select: {
        description: true,
        amount: true,
        date: true,
      },
      orderBy: {
        date: "asc",
      },
    });

    // Group transactions by day
    const dayMap = new Map<number, { totalExpense: number; transactionCount: number; transactions: { description: string; amount: number }[] }>();

    for (const t of transactions) {
      const day = new Date(t.date).getDate();
      const existing = dayMap.get(day) || { totalExpense: 0, transactionCount: 0, transactions: [] };
      const absAmount = Math.abs(t.amount);
      existing.totalExpense += absAmount;
      existing.transactionCount += 1;
      existing.transactions.push({ description: t.description, amount: absAmount });
      dayMap.set(day, existing);
    }

    // Build days array for ALL days in the month
    let maxExpense = 0;
    const days = [];

    for (let d = 1; d <= daysInMonth; d++) {
      const dateObj = new Date(year, month - 1, d);
      const dayData = dayMap.get(d);
      const totalExpense = dayData?.totalExpense || 0;

      if (totalExpense > maxExpense) {
        maxExpense = totalExpense;
      }

      days.push({
        date: dateObj.toISOString().split("T")[0],
        dayOfMonth: d,
        dayOfWeek: dateObj.getDay(),
        totalExpense,
        transactionCount: dayData?.transactionCount || 0,
        transactions: dayData?.transactions || [],
      });
    }

    // Compute summary
    const daysWithExpenses = days.filter((d) => d.totalExpense > 0);
    const totalExpenseSum = days.reduce((sum, d) => sum + d.totalExpense, 0);

    let highestDay = { date: "", total: 0 };
    let lowestDay = { date: "", total: Infinity };

    for (const d of daysWithExpenses) {
      if (d.totalExpense > highestDay.total) {
        highestDay = { date: d.date, total: d.totalExpense };
      }
      if (d.totalExpense < lowestDay.total) {
        lowestDay = { date: d.date, total: d.totalExpense };
      }
    }

    if (daysWithExpenses.length === 0) {
      lowestDay = { date: "", total: 0 };
    }

    const zeroDays = days.filter((d) => d.totalExpense === 0).length;
    const averageDaily = daysInMonth > 0 ? totalExpenseSum / daysInMonth : 0;

    return NextResponse.json({
      days,
      summary: {
        highestDay,
        lowestDay,
        averageDaily,
        zeroDays,
      },
      maxExpense,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching calendar data:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados do calendario" },
      { status: 500 }
    );
  }
}
