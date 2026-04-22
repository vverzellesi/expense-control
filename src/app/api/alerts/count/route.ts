import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import { getMonthBoundaries } from "@/lib/date-utils";

// Endpoint enxuto pro badge de alertas da Sidebar. Retorna apenas a contagem
// de budgets que já ultrapassaram 80% do limite. Substitui /api/summary nesse
// caso de uso, que trazia 6 meses de transactions + 6 outras queries.
export async function GET() {
  try {
    const ctx = await getAuthContext();

    const now = new Date();
    const [startDate, endDate] = getMonthBoundaries(
      now.getFullYear(),
      now.getMonth() + 1
    );

    const [budgets, spendingByCategory] = await Promise.all([
      prisma.budget.findMany({
        where: { ...ctx.ownerFilter, isActive: true },
        select: { categoryId: true, amount: true },
      }),
      prisma.transaction.groupBy({
        by: ["categoryId"],
        where: {
          ...ctx.ownerFilter,
          type: "EXPENSE",
          deletedAt: null,
          investmentTransaction: null,
          date: { gte: startDate, lte: endDate },
        },
        _sum: { amount: true },
      }),
    ]);

    const spentByCategory = new Map<string, number>();
    for (const row of spendingByCategory) {
      if (!row.categoryId) continue;
      spentByCategory.set(row.categoryId, Math.abs(row._sum.amount ?? 0));
    }

    let alertCount = 0;
    for (const budget of budgets) {
      if (budget.amount <= 0) continue;
      const spent = spentByCategory.get(budget.categoryId) ?? 0;
      if ((spent / budget.amount) * 100 >= 80) {
        alertCount++;
      }
    }

    return NextResponse.json({ alertCount });
  } catch (error) {
    return handleApiError(error, "buscar contagem de alertas");
  }
}
