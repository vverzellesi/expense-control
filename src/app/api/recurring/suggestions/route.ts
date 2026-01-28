import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

interface PatternMatch {
  description: string;
  normalizedDescription: string;
  avgAmount: number;
  occurrences: number;
  avgDayOfMonth: number;
  categoryId: string | null;
  categoryName: string | null;
  origin: string;
}

function normalizeDescription(desc: string): string {
  // Remove installment patterns like "1/10", "PARCELA 1 DE 10"
  let normalized = desc
    .replace(/\d+\s*(?:\/|DE)\s*\d+/gi, "")
    .replace(/PARCELA/gi, "")
    .trim();

  // Remove common prefixes/suffixes that vary
  normalized = normalized
    .replace(/\s*-\s*\d+$/g, "")
    .replace(/^\d+\s*-\s*/g, "")
    .trim();

  // Remove extra whitespace
  normalized = normalized.replace(/\s+/g, " ").toUpperCase();

  return normalized;
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();

    // Get the last 6 months of transactions
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const transactions = await prisma.transaction.findMany({
      where: {
        date: { gte: sixMonthsAgo },
        type: "EXPENSE",
        isInstallment: false,
        recurringExpenseId: null,
        userId,
      },
      include: {
        category: true,
      },
      orderBy: {
        date: "desc",
      },
    });

    // Get existing recurring expenses to exclude from suggestions
    const existingRecurring = await prisma.recurringExpense.findMany({
      where: { userId },
      select: { description: true },
    });
    const existingDescriptions = new Set(
      existingRecurring.map((r) => normalizeDescription(r.description))
    );

    // Group transactions by normalized description
    const groups: Record<string, {
      transactions: typeof transactions;
      normalizedDesc: string;
    }> = {};

    for (const t of transactions) {
      const normalized = normalizeDescription(t.description);
      if (!normalized) continue;

      if (!groups[normalized]) {
        groups[normalized] = {
          transactions: [],
          normalizedDesc: normalized,
        };
      }
      groups[normalized].transactions.push(t);
    }

    // Analyze patterns - look for transactions that appear 3+ times
    const suggestions: PatternMatch[] = [];

    for (const [key, group] of Object.entries(groups)) {
      // Skip if this pattern already exists as a recurring expense
      if (existingDescriptions.has(key)) continue;

      // Need at least 3 occurrences to suggest
      if (group.transactions.length < 3) continue;

      // Check if they are in different months
      const monthSet = new Set(
        group.transactions.map((t) => {
          const d = new Date(t.date);
          return `${d.getFullYear()}-${d.getMonth()}`;
        })
      );

      // Need at least 2 different months
      if (monthSet.size < 2) continue;

      // Calculate average values
      const amounts = group.transactions.map((t) => Math.abs(t.amount));
      const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;

      const days = group.transactions.map((t) => new Date(t.date).getDate());
      const avgDayOfMonth = Math.round(
        days.reduce((a, b) => a + b, 0) / days.length
      );

      // Use the most recent transaction for category and origin
      const latest = group.transactions[0];

      suggestions.push({
        description: latest.description,
        normalizedDescription: key,
        avgAmount,
        occurrences: group.transactions.length,
        avgDayOfMonth,
        categoryId: latest.categoryId,
        categoryName: latest.category?.name || null,
        origin: latest.origin,
      });
    }

    // Sort by occurrence count (most frequent first)
    suggestions.sort((a, b) => b.occurrences - a.occurrences);

    return NextResponse.json(suggestions.slice(0, 10));
  } catch {
    return unauthorizedResponse();
  }
}
