import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import { calculateCardScore } from "@/lib/card-score";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const searchParams = request.nextUrl.searchParams;
    const month = parseInt(
      searchParams.get("month") || String(new Date().getMonth() + 1),
      10
    );
    const year = parseInt(
      searchParams.get("year") || String(new Date().getFullYear()),
      10
    );

    // Get all credit card origins for this user/space
    const origins = await prisma.origin.findMany({
      where: {
        ...ctx.ownerFilter,
        type: "CREDIT_CARD",
      },
    });

    if (origins.length === 0) {
      return NextResponse.json({ scores: [] });
    }

    const originNames = origins.map((o) => o.name);

    // Get current month boundaries
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Get previous month boundaries
    const prevStart = new Date(year, month - 2, 1);
    const prevEnd = new Date(year, month - 1, 0, 23, 59, 59);

    // Query transactions for current and previous month in parallel
    const [currentTransactions, previousTransactions, billPayments] =
      await Promise.all([
        prisma.transaction.findMany({
          where: {
            ...ctx.ownerFilter,
            type: "EXPENSE",
            origin: { in: originNames },
            date: { gte: startDate, lte: endDate },
            deletedAt: null,
          },
          select: {
            origin: true,
            amount: true,
            isInstallment: true,
          },
        }),
        prisma.transaction.findMany({
          where: {
            ...ctx.ownerFilter,
            type: "EXPENSE",
            origin: { in: originNames },
            date: { gte: prevStart, lte: prevEnd },
            deletedAt: null,
          },
          select: {
            origin: true,
            amount: true,
          },
        }),
        prisma.billPayment.findMany({
          where: {
            userId: ctx.userId,
            origin: { in: originNames },
            billYear: {
              gte: year - 1,
              lte: year,
            },
          },
          select: {
            billMonth: true,
            billYear: true,
            origin: true,
            paymentType: true,
            amountCarried: true,
            totalBillAmount: true,
          },
        }),
      ]);

    // Group data by origin
    const scores = origins.map((origin) => {
      const currentTxns = currentTransactions.filter(
        (t) => t.origin === origin.name
      );
      const prevTxns = previousTransactions.filter(
        (t) => t.origin === origin.name
      );
      const originBills = billPayments.filter(
        (bp) => bp.origin === origin.name
      );

      const currentMonthTotal = currentTxns.reduce(
        (sum, t) => sum + Math.abs(t.amount),
        0
      );
      const installmentTotal = currentTxns
        .filter((t) => t.isInstallment)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      const previousMonthTotal = prevTxns.reduce(
        (sum, t) => sum + Math.abs(t.amount),
        0
      );

      return calculateCardScore(
        {
          origin: origin.name,
          creditLimit: origin.creditLimit,
          currentMonthTotal,
          installmentTotal,
          billPayments: originBills,
          previousMonthTotal,
        },
        month,
        year
      );
    });

    return NextResponse.json({ scores });
  } catch (error) {
    return handleApiError(error, "card-score");
  }
}
