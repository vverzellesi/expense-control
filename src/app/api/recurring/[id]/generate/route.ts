import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId();

    const { id } = await params;
    const body = await request.json();
    const { month, year, amount } = body;

    if (!month || !year) {
      return NextResponse.json(
        { error: "Mês e ano são obrigatórios" },
        { status: 400 }
      );
    }

    const recurringExpense = await prisma.recurringExpense.findUnique({
      where: { id, userId },
    });

    if (!recurringExpense) {
      return NextResponse.json(
        { error: "Despesa recorrente não encontrada" },
        { status: 404 }
      );
    }

    // Check if this recurring expense should be auto-generated
    if (!recurringExpense.autoGenerate) {
      return NextResponse.json(
        { error: "Esta despesa aguarda vinculação via importação de fatura. Desative 'Gerar automaticamente' se quiser gerar manualmente." },
        { status: 400 }
      );
    }

    // Check if transaction already exists for this month
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0);

    const existingTransaction = await prisma.transaction.findFirst({
      where: {
        recurringExpenseId: id,
        userId,
        date: {
          gte: startOfMonth,
          lte: endOfMonth,
        },
      },
    });

    if (existingTransaction) {
      return NextResponse.json(
        { error: "Já existe uma transação para este mês", transaction: existingTransaction },
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
        userId,
      },
      include: {
        category: true,
        recurringExpense: true,
      },
    });

    return NextResponse.json(transaction, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
