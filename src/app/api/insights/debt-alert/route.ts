import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import { analyzeDebtPattern } from "@/lib/debt-detector";
import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const { searchParams } = new URL(request.url);
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    // Query BillPayments from last 6 months for the user
    // Use the same year-range pattern as summary route
    const startDate = new Date(year, month - 7, 1);
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;

    const billPayments = await prisma.billPayment.findMany({
      where: {
        userId: ctx.userId,
        OR: [
          // Payments in months after the start boundary (same year as start)
          {
            billYear: startYear,
            billMonth: { gte: startMonth },
          },
          // Payments in years between start and current (if they span years)
          ...(year > startYear ? [{
            billYear: { gt: startYear, lt: year },
          }] : []),
          // Payments in the current year up to current month
          ...(year > startYear ? [{
            billYear: year,
            billMonth: { lte: month },
          }] : []),
        ],
      },
    });

    const paymentData = billPayments.map((bp) => ({
      billMonth: bp.billMonth,
      billYear: bp.billYear,
      origin: bp.origin,
      totalBillAmount: bp.totalBillAmount,
      amountPaid: bp.amountPaid,
      amountCarried: bp.amountCarried,
      paymentType: bp.paymentType,
    }));

    const alerts = analyzeDebtPattern(paymentData, month, year);

    return NextResponse.json({ alerts });
  } catch (error) {
    return handleApiError(error, "buscar alertas de endividamento");
  }
}
