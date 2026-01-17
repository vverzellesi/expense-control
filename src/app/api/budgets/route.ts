import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const budgets = await prisma.budget.findMany({
      include: {
        category: true,
      },
      orderBy: {
        category: {
          name: "asc",
        },
      },
    });

    return NextResponse.json(budgets);
  } catch (error) {
    console.error("Error fetching budgets:", error);
    return NextResponse.json(
      { error: "Erro ao buscar orcamentos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { categoryId, amount, isActive } = body;

    if (!categoryId || amount === undefined) {
      return NextResponse.json(
        { error: "categoryId e amount sao obrigatorios" },
        { status: 400 }
      );
    }

    // Check if budget already exists for this category
    const existing = await prisma.budget.findUnique({
      where: { categoryId },
    });

    let budget;
    if (existing) {
      budget = await prisma.budget.update({
        where: { categoryId },
        data: { amount, isActive: isActive ?? true },
        include: { category: true },
      });
    } else {
      budget = await prisma.budget.create({
        data: {
          categoryId,
          amount,
          isActive: isActive ?? true,
        },
        include: { category: true },
      });
    }

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    console.error("Error creating/updating budget:", error);
    return NextResponse.json(
      { error: "Erro ao salvar orcamento" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID do orcamento nao informado" },
        { status: 400 }
      );
    }

    await prisma.budget.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting budget:", error);
    return NextResponse.json(
      { error: "Erro ao excluir orcamento" },
      { status: 500 }
    );
  }
}
