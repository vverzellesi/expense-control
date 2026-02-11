import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import {
  getAuthenticatedUserId,
  unauthorizedResponse,
} from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(
      searchParams.get("year") || String(new Date().getFullYear())
    );

    const recurringExpenses = await prisma.recurringExpense.findMany({
      where: { userId },
      include: {
        category: true,
        transactions: {
          where: {
            deletedAt: null,
            date: {
              gte: new Date(year, 0, 1),
              lte: new Date(year, 11, 31, 23, 59, 59, 999),
            },
          },
          orderBy: { date: "asc" },
        },
      },
    });

    const items = recurringExpenses.map((re) => {
      const txns = re.transactions;

      // Monthly amounts: for each month, pick the first transaction amount (or 0)
      const monthlyAmounts = new Array<number>(12).fill(0);
      for (const t of txns) {
        const d = new Date(t.date);
        const monthIndex = d.getMonth();
        // Use the last transaction amount for each month (in case there are multiple)
        monthlyAmounts[monthIndex] = Math.abs(t.amount);
      }

      const firstAmount =
        txns.length > 0 ? Math.abs(txns[0].amount) : 0;
      const currentAmount =
        txns.length > 0 ? Math.abs(txns[txns.length - 1].amount) : 0;
      const changeAmount = currentAmount - firstAmount;
      const changePercent =
        firstAmount > 0
          ? ((currentAmount - firstAmount) / firstAmount) * 100
          : 0;

      return {
        description: re.description,
        currentAmount,
        firstAmount,
        changeAmount,
        changePercent,
        categoryName: re.category?.name || null,
        categoryColor: re.category?.color || null,
        isActive: re.isActive,
        monthlyAmounts,
      };
    });

    // Summary computations
    const activeItems = items.filter((item) => item.isActive);
    const totalMonthly = activeItems.reduce(
      (sum, item) => sum + item.currentAmount,
      0
    );
    const itemsWithChange = items.filter(
      (item) => item.firstAmount > 0
    );
    const increasedCount = itemsWithChange.filter(
      (item) => item.changeAmount > 0
    ).length;
    const decreasedCount = itemsWithChange.filter(
      (item) => item.changeAmount < 0
    ).length;
    const averageGrowthPercent =
      itemsWithChange.length > 0
        ? itemsWithChange.reduce(
            (sum, item) => sum + item.changePercent,
            0
          ) / itemsWithChange.length
        : 0;

    return NextResponse.json({
      summary: {
        totalMonthly,
        increasedCount,
        decreasedCount,
        averageGrowthPercent,
      },
      items,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching recurring growth data:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados de gastos recorrentes" },
      { status: 500 }
    );
  }
}
