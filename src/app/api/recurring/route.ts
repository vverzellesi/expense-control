import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET() {
  try {
    const ctx = await getAuthContext();

    const recurringExpenses = await prisma.recurringExpense.findMany({
      where: { ...ctx.ownerFilter },
      include: {
        category: true,
        transactions: {
          orderBy: { date: "desc" },
          take: 12, // Last 12 transactions
        },
      },
      orderBy: { description: "asc" },
    });

    return NextResponse.json(recurringExpenses);
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

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    const body = await request.json();
    const { description, defaultAmount, dayOfMonth, type, origin, categoryId, autoGenerate } = body;

    if (!description || defaultAmount === undefined || !dayOfMonth || !type || !origin) {
      return NextResponse.json(
        { error: "Campos obrigatorios faltando" },
        { status: 400 }
      );
    }

    const recurringExpense = await prisma.recurringExpense.create({
      data: {
        description,
        defaultAmount: Math.abs(defaultAmount),
        dayOfMonth: Math.min(Math.max(dayOfMonth, 1), 31),
        type,
        origin,
        categoryId: categoryId || null,
        isActive: true,
        autoGenerate: autoGenerate ?? true,
        userId: ctx.userId,
        spaceId: ctx.spaceId,
      },
      include: {
        category: true,
      },
    });

    return NextResponse.json(recurringExpense, { status: 201 });
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
