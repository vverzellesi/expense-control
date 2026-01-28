import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();

    const recurringExpenses = await prisma.recurringExpense.findMany({
      where: { userId },
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
  } catch {
    return unauthorizedResponse();
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

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
        userId,
      },
      include: {
        category: true,
      },
    });

    return NextResponse.json(recurringExpense, { status: 201 });
  } catch {
    return unauthorizedResponse();
  }
}
