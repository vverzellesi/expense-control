import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// Helper to get Monday of a given week
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  return new Date(d.setDate(diff));
}

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

    // Check if viewing a past month (for auto-recording savings history)
    const isCurrentMonth = targetMonth === currentDate.getMonth() + 1 && targetYear === currentDate.getFullYear();
    const isPastMonth = new Date(targetYear, targetMonth - 1, 1) < new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

    // Get transactions for the month (excluding soft-deleted)
    const transactions = await prisma.transaction.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate,
        },
        deletedAt: null,
      },
      include: {
        category: true,
      },
    });

    // Get previous month transactions for comparison (excluding soft-deleted)
    const prevMonthStart = new Date(targetYear, targetMonth - 2, 1);
    const prevMonthEnd = new Date(targetYear, targetMonth - 1, 0);
    const prevTransactions = await prisma.transaction.findMany({
      where: {
        date: {
          gte: prevMonthStart,
          lte: prevMonthEnd,
        },
        deletedAt: null,
      },
      include: {
        category: true,
      },
    });

    // Calculate previous month totals and category breakdown
    let prevIncome = 0;
    let prevExpense = 0;
    const prevCategoryTotals: Record<string, { total: number; name: string; color: string }> = {};

    for (const t of prevTransactions) {
      if (t.type === "INCOME") {
        prevIncome += Math.abs(t.amount);
      } else if (t.type === "EXPENSE") {
        prevExpense += Math.abs(t.amount);
        // Track category totals for previous month
        if (t.category && t.categoryId) {
          if (!prevCategoryTotals[t.categoryId]) {
            prevCategoryTotals[t.categoryId] = {
              total: 0,
              name: t.category.name,
              color: t.category.color,
            };
          }
          prevCategoryTotals[t.categoryId].total += Math.abs(t.amount);
        }
      }
      // TRANSFER is ignored in totals
    }

    // Calculate summary
    let income = 0;
    let expense = 0;
    const categoryTotals: Record<string, { total: number; name: string; color: string }> = {};

    for (const t of transactions) {
      if (t.type === "INCOME") {
        income += Math.abs(t.amount);
      } else if (t.type === "EXPENSE") {
        expense += Math.abs(t.amount);
      }
      // TRANSFER is ignored in totals

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

    // Calculate comparison percentages
    const incomeChange = prevIncome > 0 ? ((income - prevIncome) / prevIncome) * 100 : 0;
    const expenseChange = prevExpense > 0 ? ((expense - prevExpense) / prevExpense) * 100 : 0;
    const prevBalance = prevIncome - prevExpense;
    const balance = income - expense;
    const balanceChange = prevBalance !== 0 ? ((balance - prevBalance) / Math.abs(prevBalance)) * 100 : 0;

    // Get category breakdown with previous month comparison (Feature 1)
    const categoryBreakdown = Object.entries(categoryTotals)
      .map(([categoryId, data]) => {
        const prevTotal = prevCategoryTotals[categoryId]?.total || null;
        const changePercentage = prevTotal && prevTotal > 0
          ? ((data.total - prevTotal) / prevTotal) * 100
          : null;

        return {
          categoryId,
          categoryName: data.name,
          categoryColor: data.color,
          total: data.total,
          percentage: expense > 0 ? (data.total / expense) * 100 : 0,
          previousTotal: prevTotal,
          changePercentage,
        };
      })
      .sort((a, b) => b.total - a.total);

    // Get last 6 months data (excluding soft-deleted)
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
          deletedAt: null,
        },
      });

      let monthIncome = 0;
      let monthExpense = 0;

      for (const t of monthTransactions) {
        if (t.type === "INCOME") {
          monthIncome += Math.abs(t.amount);
        } else if (t.type === "EXPENSE") {
          monthExpense += Math.abs(t.amount);
        }
        // TRANSFER is ignored in totals
      }

      monthlyData.push({
        month: monthStart.toLocaleDateString("pt-BR", { month: "short" }),
        year: monthStart.getFullYear(),
        income: monthIncome,
        expense: monthExpense,
      });
    }

    // Feature 8: Weekly Summary - Calculate current and previous week totals
    let weeklySummary = null;
    if (isCurrentMonth) {
      const today = new Date();
      const currentWeekStart = getMondayOfWeek(today);
      currentWeekStart.setHours(0, 0, 0, 0);

      const currentWeekEnd = new Date(today);
      currentWeekEnd.setHours(23, 59, 59, 999);

      const prevWeekStart = new Date(currentWeekStart);
      prevWeekStart.setDate(prevWeekStart.getDate() - 7);

      const prevWeekEnd = new Date(currentWeekStart);
      prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
      prevWeekEnd.setHours(23, 59, 59, 999);

      // Current week transactions
      const currentWeekTransactions = transactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate >= currentWeekStart && tDate <= currentWeekEnd && t.type === "EXPENSE";
      });

      const currentWeekTotal = currentWeekTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      // Previous week transactions (need to query since might be previous month)
      const prevWeekTransactions = await prisma.transaction.findMany({
        where: {
          date: {
            gte: prevWeekStart,
            lte: prevWeekEnd,
          },
          type: "EXPENSE",
          deletedAt: null,
        },
      });

      const prevWeekTotal = prevWeekTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      const weekChangePercentage = prevWeekTotal > 0
        ? ((currentWeekTotal - prevWeekTotal) / prevWeekTotal) * 100
        : null;

      weeklySummary = {
        currentWeek: {
          total: currentWeekTotal,
          count: currentWeekTransactions.length,
          startDate: currentWeekStart.toISOString(),
          endDate: currentWeekEnd.toISOString(),
        },
        previousWeek: {
          total: prevWeekTotal,
          count: prevWeekTransactions.length,
        },
        changePercentage: weekChangePercentage,
      };
    }

    // Feature 9: End of Month Projection
    let projection = null;
    if (isCurrentMonth) {
      const today = new Date();
      const daysElapsed = today.getDate();
      const totalDays = endDate.getDate();
      const remainingDays = totalDays - daysElapsed;

      const dailyExpenseAverage = daysElapsed > 0 ? expense / daysElapsed : 0;
      const dailyIncomeAverage = daysElapsed > 0 ? income / daysElapsed : 0;

      const projectedExpense = expense + (dailyExpenseAverage * remainingDays);
      const projectedIncome = income + (dailyIncomeAverage * remainingDays);
      const projectedBalance = projectedIncome - projectedExpense;

      projection = {
        currentDay: daysElapsed,
        totalDays,
        remainingDays,
        dailyExpenseAverage,
        dailyIncomeAverage,
        projectedExpense,
        projectedIncome,
        projectedBalance,
        isProjectionNegative: projectedBalance < 0,
      };
    }

    // Get savings goal
    const savingsGoalSetting = await prisma.settings.findUnique({
      where: { key: "savingsGoal" },
    });
    const savingsGoal = savingsGoalSetting ? parseFloat(savingsGoalSetting.value) : null;
    const currentSavings = income - expense;
    const savingsPercentage = savingsGoal && savingsGoal > 0
      ? (currentSavings / savingsGoal) * 100
      : null;

    // Feature 15: Auto-record savings history for past months
    if (isPastMonth && savingsGoal && savingsGoal > 0) {
      try {
        await prisma.savingsHistory.upsert({
          where: {
            month_year: {
              month: targetMonth,
              year: targetYear,
            },
          },
          update: {
            goal: savingsGoal,
            actual: currentSavings,
            isAchieved: currentSavings >= savingsGoal,
            percentage: (currentSavings / savingsGoal) * 100,
          },
          create: {
            month: targetMonth,
            year: targetYear,
            goal: savingsGoal,
            actual: currentSavings,
            isAchieved: currentSavings >= savingsGoal,
            percentage: (currentSavings / savingsGoal) * 100,
          },
        });
      } catch (e) {
        // Silently ignore errors - this is a best-effort feature
        console.error("Error auto-recording savings history:", e);
      }
    }

    // Get budget alerts (categories at 80% or more of budget)
    const budgets = await prisma.budget.findMany({
      where: { isActive: true },
      include: { category: true },
    });

    const allBudgets = budgets
      .map((budget) => {
        const spent = categoryTotals[budget.categoryId]?.total || 0;
        const percentage = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
        return {
          categoryId: budget.categoryId,
          categoryName: budget.category.name,
          categoryColor: budget.category.color,
          budgetAmount: budget.amount,
          spent,
          percentage,
          isOver: spent > budget.amount,
        };
      })
      .sort((a, b) => b.percentage - a.percentage);

    const budgetAlerts = allBudgets.filter((budget) => budget.percentage >= 80);

    // Get fixed expenses (excluding soft-deleted)
    const fixedExpenses = await prisma.transaction.findMany({
      where: {
        isFixed: true,
        type: "EXPENSE",
        deletedAt: null,
      },
      include: {
        category: true,
      },
      distinct: ["description"],
    });

    // Get upcoming installments (next 3 months, excluding soft-deleted)
    const futureDate = new Date(targetYear, targetMonth + 2, 0);
    const upcomingInstallments = await prisma.transaction.findMany({
      where: {
        isInstallment: true,
        date: {
          gt: endDate,
          lte: futureDate,
        },
        deletedAt: null,
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
        balance,
      },
      comparison: {
        incomeChange,
        expenseChange,
        balanceChange,
        previousMonth: {
          income: prevIncome,
          expense: prevExpense,
          balance: prevBalance,
        },
      },
      savingsGoal: savingsGoal
        ? {
            goal: savingsGoal,
            current: currentSavings,
            percentage: savingsPercentage,
            isAchieved: currentSavings >= savingsGoal,
          }
        : null,
      categoryBreakdown,
      monthlyData,
      budgetAlerts,
      allBudgets,
      fixedExpenses,
      upcomingInstallments,
      weeklySummary,
      projection,
    });
  } catch (error) {
    console.error("Error fetching summary:", error);
    return NextResponse.json(
      { error: "Erro ao buscar resumo" },
      { status: 500 }
    );
  }
}
