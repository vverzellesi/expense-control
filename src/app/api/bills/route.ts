import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

interface BillPeriod {
  label: string;
  startDate: Date;
  endDate: Date;
  dueDate: Date;
}

// Calculate bill periods based on closing day
function getBillPeriods(closingDay: number, count: number = 6): BillPeriod[] {
  const periods: BillPeriod[] = [];
  const today = new Date();

  for (let i = 0; i < count; i++) {
    // Calculate the reference month (current month - i)
    const refDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const refMonth = refDate.getMonth();
    const refYear = refDate.getFullYear();

    // Bill period: from (closingDay + 1) of previous month to closingDay of current month
    const startDate = new Date(refYear, refMonth - 1, closingDay + 1);
    const endDate = new Date(refYear, refMonth, closingDay, 23, 59, 59, 999);

    // Due date is typically 7-10 days after closing (using 7 days as default)
    const dueDate = new Date(refYear, refMonth, closingDay + 7);

    // Label: month/year of the due date
    const monthNames = [
      "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    const label = `${monthNames[refMonth]} ${refYear}`;

    periods.push({
      label,
      startDate,
      endDate,
      dueDate,
    });
  }

  return periods;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const closingDay = parseInt(searchParams.get("closingDay") || "13");
    const origin = searchParams.get("origin"); // Optional: filter by card/origin

    // Get bill periods (last 6 months)
    const periods = getBillPeriods(closingDay, 6);

    // Fetch transactions for each period
    const bills = await Promise.all(
      periods.map(async (period) => {
        const where: Record<string, unknown> = {
          date: {
            gte: period.startDate,
            lte: period.endDate,
          },
          deletedAt: null,
          type: "EXPENSE", // Only expenses for bills
        };

        if (origin) {
          where.origin = origin;
        }

        const transactions = await prisma.transaction.findMany({
          where,
          include: {
            category: true,
          },
          orderBy: {
            date: "desc",
          },
        });

        // Calculate totals
        const total = transactions.reduce(
          (sum, t) => sum + Math.abs(t.amount),
          0
        );

        // Group by category
        const categoryTotals: Record<
          string,
          { name: string; color: string; total: number; count: number }
        > = {};

        for (const t of transactions) {
          const catId = t.categoryId || "uncategorized";
          const catName = t.category?.name || "Sem categoria";
          const catColor = t.category?.color || "#9CA3AF";

          if (!categoryTotals[catId]) {
            categoryTotals[catId] = {
              name: catName,
              color: catColor,
              total: 0,
              count: 0,
            };
          }
          categoryTotals[catId].total += Math.abs(t.amount);
          categoryTotals[catId].count++;
        }

        const categories = Object.entries(categoryTotals)
          .map(([id, data]) => ({
            id,
            ...data,
            percentage: total > 0 ? (data.total / total) * 100 : 0,
          }))
          .sort((a, b) => b.total - a.total);

        return {
          label: period.label,
          startDate: period.startDate.toISOString(),
          endDate: period.endDate.toISOString(),
          dueDate: period.dueDate.toISOString(),
          total,
          transactionCount: transactions.length,
          categories,
          transactions: transactions.map((t) => ({
            id: t.id,
            description: t.description,
            amount: t.amount,
            date: t.date.toISOString(),
            categoryId: t.categoryId,
            categoryName: t.category?.name || "Sem categoria",
            categoryColor: t.category?.color || "#9CA3AF",
            isInstallment: t.isInstallment,
            currentInstallment: t.currentInstallment,
          })),
        };
      })
    );

    // Get available origins for filtering
    const origins = await prisma.origin.findMany({
      orderBy: { name: "asc" },
    });

    // Calculate comparison with previous bill
    const billsWithComparison = bills.map((bill, index) => {
      const previousBill = bills[index + 1];
      const changePercentage = previousBill
        ? ((bill.total - previousBill.total) / previousBill.total) * 100
        : null;

      return {
        ...bill,
        previousTotal: previousBill?.total || null,
        changePercentage,
      };
    });

    return NextResponse.json({
      closingDay,
      bills: billsWithComparison,
      origins,
    });
  } catch (error) {
    console.error("Error fetching bills:", error);
    return NextResponse.json(
      { error: "Erro ao buscar faturas" },
      { status: 500 }
    );
  }
}
