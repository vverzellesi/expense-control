import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

const MONTH_LABELS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const searchParams = request.nextUrl.searchParams;
    const yearParam = searchParams.get("year");
    const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        type: "EXPENSE",
        date: {
          gte: new Date(year, 0, 1),
          lte: new Date(year, 11, 31, 23, 59, 59, 999),
        },
      },
      include: {
        category: true,
      },
    });

    // Group by category + month
    const categoryMap: Record<
      string,
      {
        categoryId: string;
        categoryName: string;
        categoryColor: string;
        monthlyTotals: number[];
        total: number;
      }
    > = {};

    for (const t of transactions) {
      if (!t.category || !t.categoryId) continue;

      const month = new Date(t.date).getMonth(); // 0-11
      const amount = Math.abs(t.amount);

      if (!categoryMap[t.categoryId]) {
        categoryMap[t.categoryId] = {
          categoryId: t.categoryId,
          categoryName: t.category.name,
          categoryColor: t.category.color,
          monthlyTotals: new Array(12).fill(0),
          total: 0,
        };
      }

      categoryMap[t.categoryId].monthlyTotals[month] += amount;
      categoryMap[t.categoryId].total += amount;
    }

    // Calculate trend for each category
    const categories = Object.values(categoryMap).map((cat) => {
      // Average of first 3 months with data
      const first3 = cat.monthlyTotals.slice(0, 3);
      const avgFirst3 = first3.reduce((a, b) => a + b, 0) / 3;

      // Average of last 3 months with data
      const monthsWithData = cat.monthlyTotals
        .map((val, idx) => ({ val, idx }))
        .filter((m) => m.val > 0);
      const last3Months = monthsWithData.slice(-3);
      const avgLast3 =
        last3Months.length > 0
          ? last3Months.reduce((a, b) => a + b.val, 0) / last3Months.length
          : 0;

      const trend = avgFirst3 > 0
        ? ((avgLast3 - avgFirst3) / avgFirst3) * 100
        : 0;

      return {
        ...cat,
        trend,
      };
    });

    // Sort by total descending
    categories.sort((a, b) => b.total - a.total);

    // Find highlights
    const categoriesWithTrend = categories.filter(
      (c) => c.trend !== 0 && c.total > 0
    );
    const mostGrown = categoriesWithTrend.length > 0
      ? categoriesWithTrend.reduce((max, c) =>
          c.trend > max.trend ? c : max
        )
      : null;
    const mostShrunk = categoriesWithTrend.length > 0
      ? categoriesWithTrend.reduce((min, c) =>
          c.trend < min.trend ? c : min
        )
      : null;

    return NextResponse.json({
      months: MONTH_LABELS,
      categories,
      highlights: {
        mostGrown: mostGrown
          ? { categoryName: mostGrown.categoryName, trend: mostGrown.trend }
          : null,
        mostShrunk: mostShrunk
          ? { categoryName: mostShrunk.categoryName, trend: mostShrunk.trend }
          : null,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching category trends:", error);
    return NextResponse.json(
      { error: "Erro ao buscar tendencias de categorias" },
      { status: 500 }
    );
  }
}
