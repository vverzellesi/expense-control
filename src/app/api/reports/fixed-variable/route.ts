import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { toLocalDateString } from "@/lib/utils";
import { MONTH_LABELS } from "@/lib/constants";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
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
        ...ctx.ownerFilter,
        deletedAt: null,
        type: "EXPENSE",
        investmentTransaction: null,
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
        date: toLocalDateString(new Date(t.date)),
      }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);

    // Load categories with flexibilityType for the user
    const categories = await prisma.category.findMany({
      where: ctx.ownerFilter,
      select: { id: true, name: true, flexibilityType: true },
    });

    const categoryFlexMap = new Map(categories.map((c) => [c.id, c.flexibilityType]));
    const hasFlexibility = categories.some((c) => c.flexibilityType !== null);

    let flexibilityBreakdown: {
      essential: number;
      negotiable: number;
      variable: number;
      unclassified: number;
    } | null = null;

    let flexibilityMonthly: {
      monthLabel: string;
      essential: number;
      negotiable: number;
      variable: number;
      unclassified: number;
    }[] | null = null;

    if (hasFlexibility) {
      // Current month flexibility breakdown
      let essential = 0;
      let negotiable = 0;
      let flexVariable = 0;
      let unclassified = 0;

      for (const t of currentMonthTransactions) {
        const absAmount = Math.abs(t.amount);
        const flexType = t.categoryId ? categoryFlexMap.get(t.categoryId) : null;
        switch (flexType) {
          case "ESSENTIAL":
            essential += absAmount;
            break;
          case "NEGOTIABLE":
            negotiable += absAmount;
            break;
          case "VARIABLE":
            flexVariable += absAmount;
            break;
          default:
            unclassified += absAmount;
            break;
        }
      }

      flexibilityBreakdown = {
        essential,
        negotiable,
        variable: flexVariable,
        unclassified,
      };

      // Monthly breakdown with 4 series for chart
      const flexMonthlyEntries: {
        key: string;
        label: string;
        essential: number;
        negotiable: number;
        variable: number;
        unclassified: number;
      }[] = [];
      const flexEntryMap = new Map<string, typeof flexMonthlyEntries[0]>();

      for (let i = 0; i < 12; i++) {
        const d = new Date(startDate);
        d.setMonth(d.getMonth() + i);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const label = `${MONTH_LABELS[d.getMonth()]}/${String(d.getFullYear()).slice(2)}`;
        const entry = { key, label, essential: 0, negotiable: 0, variable: 0, unclassified: 0 };
        flexMonthlyEntries.push(entry);
        flexEntryMap.set(key, entry);
      }

      for (const t of transactions) {
        const d = new Date(t.date);
        const key = `${d.getFullYear()}-${d.getMonth()}`;
        const entry = flexEntryMap.get(key);
        if (entry) {
          const absAmount = Math.abs(t.amount);
          const flexType = t.categoryId ? categoryFlexMap.get(t.categoryId) : null;
          switch (flexType) {
            case "ESSENTIAL":
              entry.essential += absAmount;
              break;
            case "NEGOTIABLE":
              entry.negotiable += absAmount;
              break;
            case "VARIABLE":
              entry.variable += absAmount;
              break;
            default:
              entry.unclassified += absAmount;
              break;
          }
        }
      }

      flexibilityMonthly = flexMonthlyEntries.map((e) => ({
        monthLabel: e.label,
        essential: e.essential,
        negotiable: e.negotiable,
        variable: e.variable,
        unclassified: e.unclassified,
      }));
    }

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
      flexibilityBreakdown,
      flexibilityMonthly,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error fetching fixed/variable data:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados fixos/variáveis" },
      { status: 500 }
    );
  }
}
