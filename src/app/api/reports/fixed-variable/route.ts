import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";
import { MONTH_LABELS } from "@/lib/constants";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const searchParams = request.nextUrl.searchParams;
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1), 10);
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);

    // Calculate 12-month range ending at the given month
    const endDate = new Date(year, month, 0); // last day of target month
    // Start from 11 months before the target month (total of 12 months inclusive)
    const startDate = new Date(year, month - 12, 1);

    // Fetch 12 months of expense transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        deletedAt: null,
        type: "EXPENSE",
        date: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        description: true,
        amount: true,
        date: true,
        isFixed: true,
        categoryId: true,
        category: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        date: "asc",
      },
    });

    // Build monthly breakdown
    const monthlyEntries: { key: string; label: string; fixed: number; variable: number }[] = [];
    const entryMap = new Map<string, { key: string; label: string; fixed: number; variable: number }>();
    for (let i = 0; i < 12; i++) {
      const d = new Date(startDate);
      d.setMonth(d.getMonth() + i);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const label = `${MONTH_LABELS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
      const entry = { key, label, fixed: 0, variable: 0 };
      monthlyEntries.push(entry);
      entryMap.set(key, entry);
    }

    // Aggregate transactions into monthly buckets
    for (const t of transactions) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const entry = entryMap.get(key);
      if (entry) {
        const absAmount = Math.abs(t.amount);
        if (t.isFixed) {
          entry.fixed += absAmount;
        } else {
          entry.variable += absAmount;
        }
      }
    }

    const monthlyBreakdown = monthlyEntries.map((e) => ({
      monthLabel: e.label,
      fixed: e.fixed,
      variable: e.variable,
    }));

    // Current month data
    const currentMonthStart = new Date(year, month - 1, 1);
    const currentMonthEnd = new Date(year, month, 0);
    const currentMonthTransactions = transactions.filter((t) => {
      const d = new Date(t.date);
      return d >= currentMonthStart && d <= currentMonthEnd;
    });

    const fixed = currentMonthTransactions
      .filter((t) => t.isFixed)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const variable = currentMonthTransactions
      .filter((t) => !t.isFixed)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);

    const total = fixed + variable;
    const fixedPercentage = total > 0 ? (fixed / total) * 100 : 0;

    // Distinct fixed expenses for current month
    const fixedTransactions = currentMonthTransactions.filter((t) => t.isFixed);
    const seenDescriptions = new Set<string>();
    const fixedExpenses: { description: string; amount: number; categoryName: string }[] = [];

    for (const t of fixedTransactions) {
      if (!seenDescriptions.has(t.description)) {
        seenDescriptions.add(t.description);
        fixedExpenses.push({
          description: t.description,
          amount: Math.abs(t.amount),
          categoryName: t.category?.name || "Sem categoria",
        });
      }
    }

    fixedExpenses.sort((a, b) => b.amount - a.amount);

    // Top 10 variable expenses for current month
    const topVariableExpenses = currentMonthTransactions
      .filter((t) => !t.isFixed)
      .map((t) => ({
        description: t.description,
        amount: Math.abs(t.amount),
        categoryName: t.category?.name || "Sem categoria",
        date: new Date(t.date).toISOString().split("T")[0],
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    return NextResponse.json({
      currentMonth: {
        fixed,
        variable,
        total,
        fixedPercentage,
      },
      monthlyBreakdown,
      fixedExpenses,
      topVariableExpenses,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching fixed/variable data:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados fixos/variaveis" },
      { status: 500 }
    );
  }
}
