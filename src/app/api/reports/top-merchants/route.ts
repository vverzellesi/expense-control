import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import { groupByMerchant } from "@/lib/merchant-normalizer";
import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const { searchParams } = new URL(request.url);
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Current month transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        ...ctx.ownerFilter,
        type: "EXPENSE",
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
        investmentTransaction: null,
      },
      select: { id: true, description: true, amount: true, date: true },
    });

    // Previous month for comparison
    const prevStartDate = new Date(year, month - 2, 1);
    const prevEndDate = new Date(year, month - 1, 0, 23, 59, 59);

    const prevTransactions = await prisma.transaction.findMany({
      where: {
        ...ctx.ownerFilter,
        type: "EXPENSE",
        deletedAt: null,
        date: { gte: prevStartDate, lte: prevEndDate },
        investmentTransaction: null,
      },
      select: { id: true, description: true, amount: true, date: true },
    });

    const currentGroups = groupByMerchant(transactions);
    const prevGroups = groupByMerchant(prevTransactions);

    const prevMap = new Map(prevGroups.map((g) => [g.merchant, g.total]));

    const topMerchants = currentGroups.slice(0, 10).map((group) => {
      const { transactions: _txs, ...rest } = group;
      const prevTotal = prevMap.get(group.merchant) || 0;
      const change = prevTotal > 0 ? ((group.total - prevTotal) / prevTotal) * 100 : null;
      return {
        ...rest,
        previousTotal: prevTotal,
        changePercent: change !== null ? Math.round(change) : null,
      };
    });

    return NextResponse.json({
      topMerchants,
      totalMerchants: currentGroups.length,
      totalExpenses: currentGroups.reduce((sum, g) => sum + g.total, 0),
    });
  } catch (error) {
    return handleApiError(error, "buscar maiores gastos");
  }
}
