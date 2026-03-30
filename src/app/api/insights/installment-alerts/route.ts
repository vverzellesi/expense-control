import { getAuthContext, handleApiError } from "@/lib/auth-utils";
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

    // Find installment transactions in the current month
    const installmentTxs = await prisma.transaction.findMany({
      where: {
        ...ctx.ownerFilter,
        isInstallment: true,
        type: "EXPENSE",
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
      },
      include: { category: true, installment: true },
    });

    const ending: Array<{
      description: string;
      currentInstallment: number;
      totalInstallments: number;
      monthlyAmount: number;
      categoryName: string | null;
    }> = [];

    const starting: Array<{
      description: string;
      currentInstallment: number;
      totalInstallments: number;
      monthlyAmount: number;
      totalCommitment: number;
      endDate: string;
      categoryName: string | null;
    }> = [];

    for (const tx of installmentTxs) {
      const total = tx.installment?.totalInstallments || tx.totalInstallments;
      const current = tx.currentInstallment;
      if (!total || !current) continue;

      const monthlyAmount = Math.abs(tx.amount);

      if (current === total) {
        ending.push({
          description: tx.description,
          currentInstallment: current,
          totalInstallments: total,
          monthlyAmount,
          categoryName: tx.category?.name || null,
        });
      }

      if (current === 1) {
        const remainingMonths = total - 1;
        const endMonth = new Date(year, month - 1 + remainingMonths, 15);
        starting.push({
          description: tx.description,
          currentInstallment: current,
          totalInstallments: total,
          monthlyAmount,
          totalCommitment: monthlyAmount * total,
          endDate: endMonth.toISOString(),
          categoryName: tx.category?.name || null,
        });
      }
    }

    return NextResponse.json({ ending, starting });
  } catch (error) {
    return handleApiError(error, "buscar alertas de parcelas");
  }
}
