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

    // Fetch bill payment records to exclude synthetic transactions
    // (same pattern as cards-summary.ts)
    const billPaymentRecords = await prisma.billPayment.findMany({
      where: {
        ...ctx.ownerFilter,
        origin: { in: originNames },
      },
      select: {
        entryTransactionId: true,
        carryoverTransactionId: true,
        installmentId: true,
        billMonth: true,
        billYear: true,
        origin: true,
        paymentType: true,
        amountCarried: true,
        totalBillAmount: true,
      },
    });

    const excludeTransactionIds = billPaymentRecords
      .flatMap((bp) => [bp.entryTransactionId, bp.carryoverTransactionId])
      .filter((id): id is string => id !== null);

    const excludeInstallmentIds = billPaymentRecords
      .map((bp) => bp.installmentId)
      .filter((id): id is string => id !== null);

    // Query transactions for current and previous month in parallel
    // Exclude bill payment synthetic transactions (entries, carryovers, financing installments)
    const [currentTransactions, previousTransactions, billPayments] =
      await Promise.all([
        prisma.transaction.findMany({
          where: {
            ...ctx.ownerFilter,
            type: "EXPENSE",
            origin: { in: originNames },
            date: { gte: startDate, lte: endDate },
            deletedAt: null,
            id: excludeTransactionIds.length > 0 ? { notIn: excludeTransactionIds } : undefined,
            installmentId: excludeInstallmentIds.length > 0 ? { notIn: excludeInstallmentIds } : undefined,
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
            id: excludeTransactionIds.length > 0 ? { notIn: excludeTransactionIds } : undefined,
            installmentId: excludeInstallmentIds.length > 0 ? { notIn: excludeInstallmentIds } : undefined,
          },
          select: {
            origin: true,
            amount: true,
          },
        }),
        // Bill payments for score calculation (reuse already-fetched records)
        Promise.resolve(
          billPaymentRecords.map((bp) => ({
            billMonth: bp.billMonth,
            billYear: bp.billYear,
            origin: bp.origin,
            paymentType: bp.paymentType,
            amountCarried: bp.amountCarried,
            totalBillAmount: bp.totalBillAmount,
          }))
        ),
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
