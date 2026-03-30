import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import { calculateProjection } from "@/lib/projection";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const { searchParams } = new URL(request.url);
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
    const today = new Date().getDate();

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const [expenses, recurringExpenses, installments, incomeTransactions] = await Promise.all([
      // Current month EXPENSE transactions (excl investment, transfer)
      prisma.transaction.findMany({
        where: {
          ...ctx.ownerFilter,
          type: "EXPENSE",
          deletedAt: null,
          date: { gte: startDate, lte: endDate },
          investmentTransaction: null,
        },
        include: { category: true },
      }),
      // Active recurring expenses not yet generated this month
      prisma.recurringExpense.findMany({
        where: {
          ...ctx.ownerFilter,
          isActive: true,
          type: "EXPENSE",
          autoGenerate: true,
          dayOfMonth: { gt: today },
          transactions: {
            none: { date: { gte: startDate, lte: endDate }, deletedAt: null },
          },
        },
        include: { category: true },
      }),
      // Installments with remaining payments this month (future days only)
      prisma.transaction.findMany({
        where: {
          ...ctx.ownerFilter,
          isInstallment: true,
          type: "EXPENSE",
          deletedAt: null,
          date: { gte: new Date(year, month - 1, today + 1), lte: endDate },
          investmentTransaction: null,
        },
        include: { category: true, installment: true },
      }),
      // Income for the month
      prisma.transaction.findMany({
        where: {
          ...ctx.ownerFilter,
          type: "INCOME",
          deletedAt: null,
          date: { gte: startDate, lte: endDate },
          investmentTransaction: null,
        },
      }),
    ]);

    const currentExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const income = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);

    const result = calculateProjection({
      currentExpenses,
      income,
      pendingRecurring: recurringExpenses.map((r) => ({
        description: r.description,
        defaultAmount: r.defaultAmount,
        categoryName: r.category?.name,
      })),
      pendingInstallments: installments.map((t) => ({
        description: t.description,
        installmentAmount: Math.abs(t.amount),
        categoryName: t.category?.name,
      })),
    });

    return NextResponse.json(result);
  } catch (error) {
    return handleApiError(error, "calcular projeção");
  }
}
