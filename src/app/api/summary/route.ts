import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

// Helper to get Monday of a given week
function getMondayOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  return new Date(d.setDate(diff));
}

// Helper to calculate weekly breakdown for the month
interface WeekDataInternal {
  weekNumber: number;
  startDate: Date;
  endDate: Date;
  total: number;
  count: number;
  categories: Record<string, { name: string; color: string; total: number }>;
}

function calculateWeeklyBreakdown(
  transactions: Array<{
    date: Date;
    amount: number;
    type: string;
    categoryId: string | null;
    category: { name: string; color: string } | null;
  }>,
  monthStart: Date,
  monthEnd: Date
) {
  // Get all weeks that overlap with this month
  const weeks: WeekDataInternal[] = [];
  let weekNumber = 1;
  let currentDate = new Date(monthStart);

  while (currentDate <= monthEnd) {
    // Find the start of the week (Sunday or first day of month)
    const weekStart = new Date(currentDate);
    if (weekStart < monthStart) {
      weekStart.setTime(monthStart.getTime());
    }
    weekStart.setHours(0, 0, 0, 0);

    // Find the end of the week (Saturday or last day of month)
    const weekEnd = new Date(currentDate);
    // Move to Saturday (day 6)
    const daysUntilSaturday = 6 - weekEnd.getDay();
    weekEnd.setDate(weekEnd.getDate() + daysUntilSaturday);
    weekEnd.setHours(23, 59, 59, 999);

    // Cap at month end
    if (weekEnd > monthEnd) {
      weekEnd.setTime(monthEnd.getTime());
      weekEnd.setHours(23, 59, 59, 999);
    }

    weeks.push({
      weekNumber,
      startDate: new Date(weekStart),
      endDate: new Date(weekEnd),
      total: 0,
      count: 0,
      categories: {},
    });

    // Move to next week (Sunday)
    currentDate = new Date(weekEnd);
    currentDate.setDate(currentDate.getDate() + 1);
    currentDate.setHours(0, 0, 0, 0);
    weekNumber++;
  }

  // Distribute transactions into weeks
  for (const t of transactions) {
    if (t.type !== "EXPENSE") continue;

    const tDate = new Date(t.date);
    tDate.setHours(12, 0, 0, 0); // Normalize to midday to avoid timezone issues

    for (const week of weeks) {
      if (tDate >= week.startDate && tDate <= week.endDate) {
        week.total += Math.abs(t.amount);
        week.count++;

        if (t.categoryId && t.category) {
          if (!week.categories[t.categoryId]) {
            week.categories[t.categoryId] = {
              name: t.category.name,
              color: t.category.color,
              total: 0,
            };
          }
          week.categories[t.categoryId].total += Math.abs(t.amount);
        }
        break;
      }
    }
  }

  // Format weeks for response
  const formattedWeeks = weeks.map((week) => {
    const daysDiff =
      Math.ceil(
        (week.endDate.getTime() - week.startDate.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;

    return {
      weekNumber: week.weekNumber,
      startDate: week.startDate.toISOString(),
      endDate: week.endDate.toISOString(),
      total: week.total,
      count: week.count,
      dailyAverage: daysDiff > 0 ? week.total / daysDiff : 0,
      categories: Object.entries(week.categories)
        .map(([categoryId, data]) => ({
          categoryId,
          categoryName: data.name,
          categoryColor: data.color,
          total: data.total,
        }))
        .sort((a, b) => b.total - a.total),
    };
  });

  // Find highest and lowest spending weeks
  const weeksWithSpending = formattedWeeks.filter((w) => w.total > 0);
  let highestWeek = 1;
  let lowestWeek = 1;
  let maxTotal = 0;
  let minTotal = Infinity;

  for (const week of weeksWithSpending) {
    if (week.total > maxTotal) {
      maxTotal = week.total;
      highestWeek = week.weekNumber;
    }
    if (week.total < minTotal) {
      minTotal = week.total;
      lowestWeek = week.weekNumber;
    }
  }

  const totalSpending = formattedWeeks.reduce((sum, w) => sum + w.total, 0);
  const averagePerWeek = formattedWeeks.length > 0 ? totalSpending / formattedWeeks.length : 0;

  return {
    weeks: formattedWeeks,
    highestWeek,
    lowestWeek,
    averagePerWeek,
  };
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    const currentDate = new Date();
    const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);
    endDate.setHours(23, 59, 59, 999);

    // Check if viewing a past month (for auto-recording savings history)
    const isCurrentMonth = targetMonth === currentDate.getMonth() + 1 && targetYear === currentDate.getFullYear();
    const isPastMonth = new Date(targetYear, targetMonth - 1, 1) < new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);

    // Calculate date ranges for consolidated query
    const sixMonthsAgo = new Date(targetYear, targetMonth - 6, 1);
    const futureDate = new Date(targetYear, targetMonth + 3, 0); // For installments (next 3 months)
    futureDate.setHours(23, 59, 59, 999);

    // Previous month boundaries
    const prevMonthStart = new Date(targetYear, targetMonth - 2, 1);
    const prevMonthEnd = new Date(targetYear, targetMonth - 1, 0);
    prevMonthEnd.setHours(23, 59, 59, 999);

    // Weekly boundaries for current month
    const today = new Date();
    const currentWeekStart = getMondayOfWeek(today);
    currentWeekStart.setHours(0, 0, 0, 0);
    const prevWeekStart = new Date(currentWeekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevWeekEnd = new Date(currentWeekStart);
    prevWeekEnd.setDate(prevWeekEnd.getDate() - 1);
    prevWeekEnd.setHours(23, 59, 59, 999);

    // ===========================================
    // OPTIMIZED: Run all queries in parallel
    // ===========================================
    const [
      // Query 1: All transactions for 6 months (includes current, previous, and monthly data)
      allTransactions,
      // Query 2: Active budgets
      budgets,
      // Query 3: Fixed expenses (distinct by description)
      fixedExpenses,
      // Query 4: Future installment transactions (for upcoming installments)
      futureInstallments,
      // Query 5: Standalone installments for projection
      standaloneInstallments,
      // Query 6: Savings goal setting
      savingsGoalSetting,
    ] = await Promise.all([
      // Query 1: All transactions for 6 months with category and installment info
      prisma.transaction.findMany({
        where: {
          userId,
          date: {
            gte: sixMonthsAgo,
            lte: endDate,
          },
          deletedAt: null,
        },
        include: {
          category: true,
          installment: true,
        },
      }),

      // Query 2: Active budgets with category
      prisma.budget.findMany({
        where: { userId, isActive: true },
        include: { category: true },
      }),

      // Query 3: Fixed expenses (distinct by description)
      prisma.transaction.findMany({
        where: {
          userId,
          isFixed: true,
          type: "EXPENSE",
          deletedAt: null,
        },
        include: {
          category: true,
        },
        distinct: ["description"],
      }),

      // Query 4: Future grouped installments (next 3 months)
      prisma.transaction.findMany({
        where: {
          userId,
          isInstallment: true,
          installmentId: { not: null },
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
      }),

      // Query 5: Standalone installments for projection
      prisma.transaction.findMany({
        where: {
          userId,
          isInstallment: true,
          installmentId: null,
          totalInstallments: { not: null },
          currentInstallment: { not: null },
          deletedAt: null,
        },
        include: {
          category: true,
        },
      }),

      // Query 6: Savings goal setting
      prisma.settings.findUnique({
        where: { key_userId: { key: "savingsGoal", userId } },
      }),
    ]);

    // ===========================================
    // DERIVE DATA FROM CONSOLIDATED QUERIES
    // ===========================================

    // Filter transactions for current month
    const transactions = allTransactions.filter((t) => {
      const tDate = new Date(t.date);
      return tDate >= startDate && tDate <= endDate;
    });

    // Filter transactions for previous month
    const prevTransactions = allTransactions.filter((t) => {
      const tDate = new Date(t.date);
      return tDate >= prevMonthStart && tDate <= prevMonthEnd;
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

    // Calculate current month summary
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

    // Get category breakdown with previous month comparison
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

    // ===========================================
    // DERIVE MONTHLY DATA FROM 6-MONTH QUERY
    // ===========================================
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const monthStart = new Date(targetYear, targetMonth - 1 - i, 1);
      const monthEnd = new Date(targetYear, targetMonth - i, 0);
      monthEnd.setHours(23, 59, 59, 999);

      // Filter from already-fetched transactions
      const monthTransactions = allTransactions.filter((t) => {
        const tDate = new Date(t.date);
        return tDate >= monthStart && tDate <= monthEnd;
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

    // ===========================================
    // WEEKLY SUMMARY (derived from existing data when possible)
    // ===========================================
    let weeklySummary = null;
    if (isCurrentMonth) {
      // End of current week (Sunday)
      const currentWeekEnd = new Date(currentWeekStart);
      currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
      currentWeekEnd.setHours(23, 59, 59, 999);

      // Current week transactions (filter from already-fetched data)
      const currentWeekTransactions = transactions.filter((t) => {
        const tDate = new Date(t.date);
        return tDate >= currentWeekStart && tDate <= currentWeekEnd && t.type === "EXPENSE";
      });

      const currentWeekTotal = currentWeekTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);

      // Previous week transactions (filter from 6-month data if available)
      const prevWeekTransactions = allTransactions.filter((t) => {
        const tDate = new Date(t.date);
        return tDate >= prevWeekStart && tDate <= prevWeekEnd && t.type === "EXPENSE";
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

    // Weekly Breakdown: gastos por semana do mês
    const weeklyBreakdown = calculateWeeklyBreakdown(transactions, startDate, endDate);

    // ===========================================
    // SAVINGS GOAL
    // ===========================================
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
            month_year_userId: {
              month: targetMonth,
              year: targetYear,
              userId,
            },
          },
          update: {
            goal: savingsGoal,
            actual: currentSavings,
            isAchieved: currentSavings >= savingsGoal,
            percentage: (currentSavings / savingsGoal) * 100,
          },
          create: {
            userId,
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

    // ===========================================
    // BUDGET ALERTS (using already-fetched budgets)
    // ===========================================
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

    // ===========================================
    // UPCOMING INSTALLMENTS (project from standalone)
    // ===========================================
    const projectedInstallments: typeof futureInstallments = [];
    for (const t of standaloneInstallments) {
      if (!t.currentInstallment || !t.totalInstallments) continue;

      const remainingInstallments = t.totalInstallments - t.currentInstallment;
      const transactionDate = new Date(t.date);

      for (let i = 1; i <= remainingInstallments; i++) {
        const futureInstallmentDate = new Date(transactionDate);
        futureInstallmentDate.setMonth(transactionDate.getMonth() + i);

        // Only include if within the date range (after current month, before futureDate)
        if (futureInstallmentDate > endDate && futureInstallmentDate <= futureDate) {
          projectedInstallments.push({
            ...t,
            id: `${t.id}-projected-${i}`,
            date: futureInstallmentDate,
            description: `${t.description} (${t.currentInstallment + i}/${t.totalInstallments})`,
            currentInstallment: t.currentInstallment + i,
            installment: null,
          });
        }
      }
    }

    // Combine and sort all upcoming installments
    const upcomingInstallments = [...futureInstallments, ...projectedInstallments]
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

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
      weeklyBreakdown,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching summary:", error);
    return NextResponse.json(
      { error: "Erro ao buscar resumo" },
      { status: 500 }
    );
  }
}
