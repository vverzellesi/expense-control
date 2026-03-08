import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();

    const { id } = await params;
    const recurringExpense = await prisma.recurringExpense.findUnique({
      where: { id, ...ctx.ownerFilter },
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    return unauthorizedResponse();
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();

    const { id } = await params;
    const body = await request.json();
    const { description, defaultAmount, dayOfMonth, type, origin, categoryId, isActive, autoGenerate } = body;

    const recurringExpense = await prisma.recurringExpense.update({
      where: { id, ...ctx.ownerFilter },
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    return unauthorizedResponse();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();

    const { id } = await params;

    // First, unlink all transactions from this recurring expense
    await prisma.transaction.updateMany({
      where: { recurringExpenseId: id, ...ctx.ownerFilter },
      data: { recurringExpenseId: null },
    });

    // Then delete the recurring expense
    await prisma.recurringExpense.delete({
      where: { id, ...ctx.ownerFilter },
    });

    return NextResponse.json({ success: true });
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
