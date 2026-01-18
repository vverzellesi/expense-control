import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const recurringExpenses = await prisma.recurringExpense.findMany({
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
    console.error("Error fetching recurring expenses:", error);
    return NextResponse.json(
      { error: "Erro ao buscar despesas recorrentes" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
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
      },
      include: {
        category: true,
      },
    });

    return NextResponse.json(recurringExpense, { status: 201 });
  } catch (error) {
    console.error("Error creating recurring expense:", error);
    return NextResponse.json(
      { error: "Erro ao criar despesa recorrente" },
      { status: 500 }
    );
  }
}
