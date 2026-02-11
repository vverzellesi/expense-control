import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/auth-utils";
import { MONTH_LABELS } from "@/lib/constants";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(
      searchParams.get("year") || String(new Date().getFullYear()),
      10
    );

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31, 23, 59, 59, 999);

    // Query transactions, investment snapshots, and current investment totals in parallel
    const [transactions, snapshots, investmentAggregate] = await Promise.all([
      prisma.transaction.findMany({
        where: {
          userId,
          deletedAt: null,
          date: { gte: yearStart, lte: yearEnd },
        },
        select: { amount: true, type: true, date: true },
      }),
      prisma.investmentSnapshot.findMany({
        where: {
          userId,
          year,
        },
        select: { month: true, totalValue: true },
      }),
      prisma.investment.aggregate({
        where: { userId },
        _sum: { currentValue: true, totalInvested: true },
      }),
    ]);

    // Build a map of month -> snapshot totalValue
    const snapshotMap = new Map<number, number>();
    for (const snap of snapshots) {
      snapshotMap.set(snap.month, snap.totalValue);
    }

    // Build monthly income/expense from transactions
    const monthlyIncome = new Array<number>(12).fill(0);
    const monthlyExpense = new Array<number>(12).fill(0);

    for (const t of transactions) {
      const d = new Date(t.date);
      const monthIndex = d.getMonth(); // 0-based
      if (t.type === "INCOME") {
        monthlyIncome[monthIndex] += t.amount;
      } else {
        monthlyExpense[monthIndex] += Math.abs(t.amount);
      }
    }

    const currentMonth = new Date().getMonth(); // 0-based
    const isCurrentYear = year === new Date().getFullYear();
    const currentInvestmentValue =
      investmentAggregate._sum.currentValue || 0;

    let cumulativeCash = 0;
    const months = MONTH_LABELS.map((monthLabel, i) => {
      const income = monthlyIncome[i];
      const expense = monthlyExpense[i];
      const cashDelta = income - expense;
      cumulativeCash += cashDelta;

      // For the current month of the current year, use live aggregate;
      // otherwise use the snapshot (or 0)
      const investmentValue =
        isCurrentYear && i === currentMonth
          ? currentInvestmentValue
          : snapshotMap.get(i + 1) || 0;

      const netWorth = cumulativeCash + investmentValue;

      return {
        monthLabel,
        income,
        expense,
        cashDelta,
        cumulativeCash,
        investmentValue,
        netWorth,
      };
    });

    // Determine the "last relevant month" index for the current summary
    const lastMonthIndex = isCurrentYear
      ? currentMonth
      : 11;
    const current = months[lastMonthIndex];
    const prevMonth = lastMonthIndex > 0 ? months[lastMonthIndex - 1] : null;

    return NextResponse.json({
      months,
      current: {
        netWorth: current.netWorth,
        cashBalance: current.cumulativeCash,
        investmentValue: current.investmentValue,
        monthlyChange: prevMonth
          ? current.netWorth - prevMonth.netWorth
          : current.netWorth,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching net worth data:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados de patrimonio" },
      { status: 500 }
    );
  }
}
