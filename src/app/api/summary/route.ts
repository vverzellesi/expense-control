import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    const currentDate = new Date();
    const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);

    // Get transactions for the month
    const transactions = await prisma.transaction.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        category: true,
      },
    });

    // Calculate summary
    let income = 0;
    let expense = 0;
    const categoryTotals: Record<string, { total: number; name: string; color: string }> = {};

    for (const t of transactions) {
      if (t.type === "INCOME") {
        income += Math.abs(t.amount);
      } else {
        expense += Math.abs(t.amount);
      }

      if (t.category && t.type === "EXPENSE") {
        if (!categoryTotals[t.categoryId!]) {
          categoryTotals[t.categoryId!] = {
            total: 0,
            name: t.category.name,
            color: t.category.color,
          };
        }
        categoryTotals[t.categoryId!].total += Math.abs(t.amount);
      }
    }

    // Get category breakdown
    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([categoryId, data]) => ({
        categoryId,
        categoryName: data.name,
        categoryColor: data.color,
        total: data.total,
        percentage: expense > 0 ? (data.total / expense) * 100 : 0,
      }))
      .sort((a, b) => b.total - a.total);

    // Get last 6 months data
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(targetYear, targetMonth - 1 - i, 1);
      const monthEnd = new Date(targetYear, targetMonth - i, 0);

      const monthTransactions = await prisma.transaction.findMany({
        where: {
          date: {
            gte: monthStart,
            lte: monthEnd,
          },
        },
      });

      let monthIncome = 0;
      let monthExpense = 0;

      for (const t of monthTransactions) {
        if (t.type === "INCOME") {
          monthIncome += Math.abs(t.amount);
        } else {
          monthExpense += Math.abs(t.amount);
        }
      }

      monthlyData.push({
        month: monthStart.toLocaleDateString("pt-BR", { month: "short" }),
        year: monthStart.getFullYear(),
        income: monthIncome,
        expense: monthExpense,
      });
    }

    // Get fixed expenses
    const fixedExpenses = await prisma.transaction.findMany({
      where: {
        isFixed: true,
        type: "EXPENSE",
      },
      include: {
        category: true,
      },
      distinct: ["description"],
    });

    // Get upcoming installments (next 3 months)
    const futureDate = new Date(targetYear, targetMonth + 2, 0);
    const upcomingInstallments = await prisma.transaction.findMany({
      where: {
        isInstallment: true,
        date: {
          gt: endDate,
          lte: futureDate,
        },
      },
      include: {
        category: true,
        installment: true,
      },
      orderBy: {
        date: "asc",
      },
    });

    return NextResponse.json({
      summary: {
        income,
        expense,
        balance: income - expense,
      },
      categoryBreakdown,
      monthlyData,
      fixedExpenses,
      upcomingInstallments,
    });
  } catch (error) {
    console.error("Error fetching summary:", error);
    return NextResponse.json(
      { error: "Erro ao buscar resumo" },
      { status: 500 }
    );
  }
}
