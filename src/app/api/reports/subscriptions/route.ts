import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    const subscriptions = await prisma.recurringExpense.findMany({
      where: {
        ...ctx.ownerFilter,
        isActive: true,
        type: "EXPENSE",
      },
      include: { category: true },
      orderBy: { defaultAmount: "desc" },
    });

    const items = subscriptions.map((sub) => ({
      id: sub.id,
      description: sub.description,
      monthlyAmount: sub.defaultAmount,
      annualAmount: sub.defaultAmount * 12,
      categoryName: sub.category?.name || null,
      categoryColor: sub.category?.color || null,
      origin: sub.origin,
      dayOfMonth: sub.dayOfMonth,
    }));

    const totalMonthly = items.reduce((sum, s) => sum + s.monthlyAmount, 0);
    const totalAnnual = totalMonthly * 12;

    return NextResponse.json({
      subscriptions: items,
      totalMonthly,
      totalAnnual,
      count: items.length,
    });
  } catch (error) {
    return handleApiError(error, "buscar assinaturas");
  }
}
