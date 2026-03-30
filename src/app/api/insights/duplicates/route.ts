import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import { normalizeMerchant } from "@/lib/merchant-normalizer";
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

    const transactions = await prisma.transaction.findMany({
      where: {
        ...ctx.ownerFilter,
        type: "EXPENSE",
        isInstallment: false, // Excluir parcelas (falso positivo)
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
        investmentTransaction: null,
      },
      select: { id: true, description: true, amount: true, date: true, origin: true },
    });

    // Group by normalized merchant + amount
    const groups = new Map<string, typeof transactions>();
    for (const tx of transactions) {
      const key = `${normalizeMerchant(tx.description)}|${Math.abs(tx.amount).toFixed(2)}`;
      const existing = groups.get(key) || [];
      existing.push(tx);
      groups.set(key, existing);
    }

    // Filter groups with 2+ transactions (potential duplicates)
    const duplicates = Array.from(groups.entries())
      .filter(([, txs]) => txs.length >= 2)
      .map(([key, txs]) => {
        const [merchant] = key.split("|");
        return {
          merchant,
          amount: Math.abs(txs[0].amount),
          count: txs.length,
          transactions: txs.map((t) => ({
            id: t.id,
            description: t.description,
            date: t.date,
            origin: t.origin,
          })),
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({ duplicates });
  } catch (error) {
    return handleApiError(error, "buscar cobranças duplicadas");
  }
}
