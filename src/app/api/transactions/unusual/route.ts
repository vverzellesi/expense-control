import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const thresholdParam = searchParams.get("threshold");

    const currentDate = new Date();
    const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();
    const threshold = thresholdParam ? parseFloat(thresholdParam) : 2; // Default: 2x average

    // Get transactions for target month
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);

    const currentMonthTransactions = await prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lte: endDate,
        },
        type: "EXPENSE",
        deletedAt: null,
      },
      include: {
        category: true,
      },
    });

    // Get transactions from last 6 months for average calculation
    const sixMonthsAgo = new Date(targetYear, targetMonth - 7, 1);
    const lastMonthEnd = new Date(targetYear, targetMonth - 1, 0);

    const historicalTransactions = await prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: sixMonthsAgo,
          lte: lastMonthEnd,
        },
        type: "EXPENSE",
        deletedAt: null,
      },
      include: {
        category: true,
      },
    });

    // Calculate average per category from historical data
    // Track both total amount and which months had transactions
    const categoryAverages: Record<string, {
      total: number;
      count: number;
      months: Set<string>;
      name: string;
      color: string
    }> = {};

    for (const t of historicalTransactions) {
      if (t.categoryId) {
        if (!categoryAverages[t.categoryId]) {
          categoryAverages[t.categoryId] = {
            total: 0,
            count: 0,
            months: new Set(),
            name: t.category?.name || "Sem categoria",
            color: t.category?.color || "#888888",
          };
        }
        categoryAverages[t.categoryId].total += Math.abs(t.amount);
        categoryAverages[t.categoryId].count += 1;
        // Track which month this transaction belongs to
        const txDate = new Date(t.date);
        const monthKey = `${txDate.getFullYear()}-${txDate.getMonth()}`;
        categoryAverages[t.categoryId].months.add(monthKey);
      }
    }

    // Calculate average transaction amount per category
    const categoryAvgAmounts: Record<string, number> = {};
    for (const [categoryId, data] of Object.entries(categoryAverages)) {
      categoryAvgAmounts[categoryId] = data.count > 0 ? data.total / data.count : 0;
    }

    // Find unusual transactions (amount > threshold * category average)
    // Only consider categories with history in at least 2 different months
    const MIN_MONTHS_FOR_HISTORY = 2;

    const unusualTransactions = currentMonthTransactions
      .filter(t => {
        if (!t.categoryId) return false;
        const categoryData = categoryAverages[t.categoryId];
        // Skip if category doesn't have enough historical data
        if (!categoryData || categoryData.months.size < MIN_MONTHS_FOR_HISTORY) return false;
        const avgAmount = categoryAvgAmounts[t.categoryId];
        if (!avgAmount || avgAmount === 0) return false;
        const amount = Math.abs(t.amount);
        return amount > threshold * avgAmount;
      })
      .map(t => {
        const avgAmount = categoryAvgAmounts[t.categoryId!] || 0;
        const amount = Math.abs(t.amount);
        const exceedsBy = avgAmount > 0 ? ((amount - avgAmount) / avgAmount) * 100 : 0;

        return {
          id: t.id,
          description: t.description,
          amount: amount,
          date: t.date,
          categoryId: t.categoryId,
          categoryName: t.category?.name || null,
          categoryColor: t.category?.color || null,
          categoryAverage: avgAmount,
          exceedsBy,
        };
      })
      .sort((a, b) => b.exceedsBy - a.exceedsBy);

    return NextResponse.json({
      transactions: unusualTransactions,
      threshold,
      period: {
        month: targetMonth,
        year: targetYear,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching unusual transactions:", error);
    return NextResponse.json(
      { error: "Erro ao buscar transacoes incomuns" },
      { status: 500 }
    );
  }
}
