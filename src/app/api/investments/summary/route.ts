import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

interface CategorySummary {
  id: string;
  name: string;
  color: string;
  value: number;
  percent: number;
}

interface GoalProgress {
  investmentId: string;
  name: string;
  current: number;
  goal: number;
  percent: number;
}

interface InvestmentSummaryResponse {
  totalValue: number;
  totalInvested: number;
  totalWithdrawn: number;
  totalReturn: number;
  totalReturnPercent: number;
  byCategory: CategorySummary[];
  goalsProgress: GoalProgress[];
  investmentCount: number;
}

export async function GET(): Promise<NextResponse<InvestmentSummaryResponse | { error: string }>> {
  try {
    const userId = await getAuthenticatedUserId();

    // Fetch all investments for the user
    const investments = await prisma.investment.findMany({
      where: {
        userId,
      },
      include: {
        category: true,
      },
    });

    // Calculate totals
    let totalValue = 0;
    let totalInvested = 0;
    let totalWithdrawn = 0;

    // Group by category
    const categoryMap = new Map<string, { name: string; color: string; value: number }>();

    // Track goals
    const goalsProgress: GoalProgress[] = [];

    for (const investment of investments) {
      totalValue += investment.currentValue;
      totalInvested += investment.totalInvested;
      totalWithdrawn += investment.totalWithdrawn;

      // Add to category map
      const categoryId = investment.categoryId;
      const existing = categoryMap.get(categoryId);
      if (existing) {
        existing.value += investment.currentValue;
      } else {
        categoryMap.set(categoryId, {
          name: investment.category.name,
          color: investment.category.color,
          value: investment.currentValue,
        });
      }

      // Track goal progress for investments with goals
      if (investment.goalAmount && investment.goalAmount > 0) {
        const percent = (investment.currentValue / investment.goalAmount) * 100;
        goalsProgress.push({
          investmentId: investment.id,
          name: investment.name,
          current: investment.currentValue,
          goal: investment.goalAmount,
          percent,
        });
      }
    }

    // Calculate total return
    const totalReturn = totalValue - totalInvested + totalWithdrawn;
    const totalReturnPercent = totalInvested > 0 ? (totalReturn / totalInvested) * 100 : 0;

    // Convert category map to array with percentages
    const byCategory: CategorySummary[] = Array.from(categoryMap.entries())
      .map(([id, data]) => ({
        id,
        name: data.name,
        color: data.color,
        value: data.value,
        percent: totalValue > 0 ? (data.value / totalValue) * 100 : 0,
      }))
      .sort((a, b) => b.value - a.value);

    // Sort goals by progress percentage (ascending - show closest to goal first)
    goalsProgress.sort((a, b) => b.percent - a.percent);

    return NextResponse.json({
      totalValue,
      totalInvested,
      totalWithdrawn,
      totalReturn,
      totalReturnPercent,
      byCategory,
      goalsProgress,
      investmentCount: investments.length,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching investment summary:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Erro ao buscar resumo de investimentos", details: errorMessage },
      { status: 500 }
    );
  }
}
