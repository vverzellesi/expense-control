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
    const { month, year, amount } = body;

    if (!month || !year) {
      return NextResponse.json(
        { error: "Mes e ano sao obrigatorios" },
        { status: 400 }
      );
    }

    const recurringExpense = await prisma.recurringExpense.findUnique({
      where: { id, ...ctx.ownerFilter },
    });

    if (!recurringExpense) {
      return NextResponse.json(
        { error: "Despesa recorrente nao encontrada" },
        { status: 404 }
      );
    }

    // Check if this recurring expense should be auto-generated
    if (!recurringExpense.autoGenerate) {
      return NextResponse.json(
        { error: "Esta despesa aguarda vinculacao via importacao de fatura. Desative 'Gerar automaticamente' se quiser gerar manualmente." },
        { status: 400 }
      );
    }

    // Check if transaction already exists for this month
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);

    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        recurringExpenseId: id,
        ...ctx.ownerFilter,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    if (existingTransaction) {
      return NextResponse.json(
        { error: "Ja existe uma transacao para este mes", transaction: existingTransaction },
        { status: 400 }
      );
    }

    // Calculate the date (use dayOfMonth, but cap at last day of month)
    const lastDayOfMonth = new Date(year, month, 0).getDate();
    const day = Math.min(recurringExpense.dayOfMonth, lastDayOfMonth);
    const transactionDate = new Date(year, month - 1, day);

    // Use custom amount or default amount
    const finalAmount = amount !== undefined ? Math.abs(amount) : recurringExpense.defaultAmount;

    const transaction = await prisma.transaction.create({
      data: {
        description: recurringExpense.description,
        amount: recurringExpense.type === "EXPENSE" ? -finalAmount : finalAmount,
        date: transactionDate,
        type: recurringExpense.type,
        origin: recurringExpense.origin,
        categoryId: recurringExpense.categoryId,
        isFixed: true,
        recurringExpenseId: id,
        userId: ctx.userId,
        spaceId: ctx.spaceId,
        createdByUserId: ctx.userId,
      },
      include: {
        category: true,
        recurringExpense: true,
      },
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    return unauthorizedResponse();
  }
}
