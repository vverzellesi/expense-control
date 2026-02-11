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

    const installments = await prisma.installment.findMany({
      where: { userId },
      include: {
        transactions: {
          where: { deletedAt: null },
          orderBy: { date: "asc" },
        },
      },
    });

    const now = new Date();
    let activeCount = 0;
    let monthlyTotal = 0;
    let totalRemaining = 0;

    const installmentList = installments.map((inst) => {
      const paidInstallments = inst.transactions.length;
      const remainingInstallments = inst.totalInstallments - paidInstallments;
      const remainingAmount = remainingInstallments * inst.installmentAmount;
      const isActive = paidInstallments < inst.totalInstallments;

      const startDate = inst.transactions.length > 0
        ? new Date(inst.transactions[0].date)
        : inst.startDate;

      // Projected end date: startDate + totalInstallments months
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + inst.totalInstallments);

      if (isActive) {
        activeCount++;
        monthlyTotal += inst.installmentAmount;
        totalRemaining += remainingAmount;
      }

      return {
        id: inst.id,
        description: inst.description,
        installmentAmount: inst.installmentAmount,
        totalInstallments: inst.totalInstallments,
        paidInstallments,
        remainingInstallments,
        remainingAmount,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        isActive,
      };
    });

    // Sort: active first, then by remaining desc
    installmentList.sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return b.remainingInstallments - a.remainingInstallments;
    });

    // Timeline: for the next 12 months, sum up projected installment amounts
    const timeline = [];
    for (let i = 0; i < 12; i++) {
      const targetMonth = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthLabel = MONTH_LABELS[targetMonth.getMonth()];
      let total = 0;

      for (const inst of installmentList) {
        if (!inst.isActive) continue;

        const instStart = new Date(inst.startDate);
        const instEnd = new Date(inst.endDate);

        // Check if this installment is active during the target month
        if (targetMonth >= instStart && targetMonth < instEnd) {
          total += inst.installmentAmount;
        }
      }

      timeline.push({
        monthLabel: `${monthLabel}/${String(targetMonth.getFullYear()).slice(2)}`,
        total,
      });
    }

    return NextResponse.json({
      summary: {
        activeCount,
        monthlyTotal,
        totalRemaining,
      },
      timeline,
      installments: installmentList,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching installments report:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados de parcelas" },
      { status: 500 }
    );
  }
}
