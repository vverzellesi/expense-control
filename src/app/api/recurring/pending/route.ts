import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);

    // Find recurring expenses with autoGenerate = false that don't have a transaction this month
    const recurringExpenses = await prisma.recurringExpense.findMany({
      where: {
        autoGenerate: false,
        isActive: true,
      },
      include: {
        category: true,
        transactions: {
          where: {
            date: {
              gte: startOfMonth,
              lte: endOfMonth,
            },
          },
        },
      },
    });

    // Filter to only those without transactions this month
    const pending = recurringExpenses.filter(
      (expense) => expense.transactions.length === 0
    );

    return NextResponse.json({
      month,
      year,
      pending: pending.map((expense) => ({
        id: expense.id,
        description: expense.description,
        defaultAmount: expense.defaultAmount,
        dayOfMonth: expense.dayOfMonth,
        type: expense.type,
        origin: expense.origin,
        category: expense.category,
      })),
      count: pending.length,
    });
  } catch (error) {
    console.error("Error fetching pending recurring expenses:", error);
    return NextResponse.json(
      { error: "Erro ao buscar despesas recorrentes pendentes" },
      { status: 500 }
    );
  }
}
