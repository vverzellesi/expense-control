import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recurringExpense = await prisma.recurringExpense.findUnique({
      where: { id },
      include: {
        category: true,
        transactions: {
          orderBy: { date: "desc" },
          include: { category: true },
        },
      },
    });

    if (!recurringExpense) {
      return NextResponse.json(
        { error: "Despesa recorrente nao encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(recurringExpense);
  } catch (error) {
    console.error("Error fetching recurring expense:", error);
    return NextResponse.json(
      { error: "Erro ao buscar despesa recorrente" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { description, defaultAmount, dayOfMonth, type, origin, categoryId, isActive, autoGenerate } = body;

    const recurringExpense = await prisma.recurringExpense.update({
      where: { id },
      data: {
        description,
        defaultAmount: Math.abs(defaultAmount),
        dayOfMonth: Math.min(Math.max(dayOfMonth, 1), 31),
        type,
        origin,
        categoryId: categoryId || null,
        isActive: isActive ?? true,
        autoGenerate: autoGenerate ?? true,
      },
      include: {
        category: true,
      },
    });

    return NextResponse.json(recurringExpense);
  } catch (error) {
    console.error("Error updating recurring expense:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar despesa recorrente" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // First, unlink all transactions from this recurring expense
    await prisma.transaction.updateMany({
      where: { recurringExpenseId: id },
      data: { recurringExpenseId: null },
    });

    // Then delete the recurring expense
    await prisma.recurringExpense.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting recurring expense:", error);
    return NextResponse.json(
      { error: "Erro ao excluir despesa recorrente" },
      { status: 500 }
    );
  }
}
