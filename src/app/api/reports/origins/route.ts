import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const searchParams = request.nextUrl.searchParams;
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);

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
        origin: true,
        amount: true,
      },
    });

    // Group by origin
    const originMap = new Map<string, { totalExpense: number; transactionCount: number }>();

    for (const t of transactions) {
      const origin = t.origin || "Sem origem";
      const existing = originMap.get(origin) || { totalExpense: 0, transactionCount: 0 };
      existing.totalExpense += Math.abs(t.amount);
      existing.transactionCount += 1;
      originMap.set(origin, existing);
    }

    const totalExpense = Array.from(originMap.values()).reduce((sum, o) => sum + o.totalExpense, 0);

    const origins = Array.from(originMap.entries())
      .map(([origin, data]) => ({
        origin,
        totalExpense: data.totalExpense,
        transactionCount: data.transactionCount,
        averageExpense: data.transactionCount > 0 ? data.totalExpense / data.transactionCount : 0,
        percentage: totalExpense > 0 ? (data.totalExpense / totalExpense) * 100 : 0,
      }))
      .sort((a, b) => b.totalExpense - a.totalExpense);

    return NextResponse.json({
      origins,
      totalExpense,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching origins data:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados por origem" },
      { status: 500 }
    );
  }
}
