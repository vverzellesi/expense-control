import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, handleApiError } from "@/lib/auth-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    const { id } = await params;

    // Verify installment exists and belongs to user
    const installment = await prisma.installment.findUnique({
      where: { id, ...ctx.ownerFilter },
      include: {
        transactions: {
          orderBy: { currentInstallment: "asc" },
        },
      },
    });

    if (!installment) {
      return NextResponse.json(
        { error: "Parcelamento não encontrado" },
        { status: 404 }
      );
    }

    // Boundary: same as UI's "paid" indicator (date < now = paid, date >= now = future)
    // This ensures the dialog count matches what the endpoint actually deletes
    const now = new Date();

    const futureTransactions = installment.transactions.filter(
      (t) => new Date(t.date) >= now
    );
    const pastTransactions = installment.transactions.filter(
      (t) => new Date(t.date) < now
    );

    if (futureTransactions.length === 0) {
      return NextResponse.json({
        success: true,
        cancelledCount: 0,
        remainingCount: installment.transactions.length,
      });
    }

    const futureIds = futureTransactions.map((t) => t.id);

    await prisma.$transaction([
      prisma.transaction.deleteMany({
        where: {
          id: { in: futureIds },
          ...ctx.ownerFilter,
        },
      }),
      prisma.installment.update({
        where: { id, ...ctx.ownerFilter },
        data: {
          totalInstallments: pastTransactions.length,
          totalAmount: installment.installmentAmount * pastTransactions.length,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      cancelledCount: futureTransactions.length,
      remainingCount: pastTransactions.length,
    });
  } catch (error) {
    return handleApiError(error, "cancelar parcelamento");
  }
}
