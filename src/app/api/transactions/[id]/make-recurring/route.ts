import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();

    const { id } = await params;
    const body = await request.json();
    const { dayOfMonth, autoGenerate = true } = body;

    // Fetch the transaction
    const transaction = await prisma.transaction.findUnique({
      where: { id, ...ctx.ownerFilter },
      include: { category: true },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transação não encontrada" },
        { status: 404 }
      );
    }

    // Check if transaction is already linked to a recurring expense
    if (transaction.recurringExpenseId) {
      return NextResponse.json(
        { error: "Esta transação já está vinculada a uma despesa recorrente" },
        { status: 400 }
      );
    }

    // Check if transaction is an installment
    if (transaction.isInstallment || transaction.installmentId) {
      return NextResponse.json(
        { error: "Transações parceladas não podem ser marcadas como recorrentes" },
        { status: 400 }
      );
    }

    // Calculate day of month from transaction date if not provided
    const transactionDate = new Date(transaction.date);
    const calculatedDayOfMonth = dayOfMonth || transactionDate.getDate();

    // Create the recurring expense and link the transaction in a single transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create the recurring expense
      const recurringExpense = await tx.recurringExpense.create({
        data: {
          description: transaction.description,
          defaultAmount: Math.abs(transaction.amount),
          dayOfMonth: calculatedDayOfMonth,
          type: transaction.type,
          origin: transaction.origin,
          categoryId: transaction.categoryId,
          isActive: true,
          autoGenerate,
          userId: ctx.userId,
          spaceId: ctx.spaceId,
        },
      });

      // Update the transaction to link it to the recurring expense and mark as fixed
      const updatedTransaction = await tx.transaction.update({
        where: { id, ...ctx.ownerFilter },
        data: {
          recurringExpenseId: recurringExpense.id,
          isFixed: true,
        },
        include: {
          category: true,
          recurringExpense: true,
        },
      });

      return { recurringExpense, transaction: updatedTransaction };
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error making transaction recurring:", error);
    return NextResponse.json(
      { error: "Erro ao criar despesa recorrente" },
      { status: 500 }
    );
  }
}
