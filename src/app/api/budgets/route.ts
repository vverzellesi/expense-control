import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET() {
  try {
    const ctx = await getAuthContext();

    // In space context, check budget viewing permission
    if (ctx.spaceId && ctx.permissions && !ctx.permissions.canViewBudgets()) {
      return forbiddenResponse();
    }

    const budgets = await prisma.budget.findMany({
      where: {
        ...ctx.ownerFilter,
      },
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error fetching budgets:", error);
    return NextResponse.json(
      { error: "Erro ao buscar orcamentos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    // In space context, check budget viewing permission
    if (ctx.spaceId && ctx.permissions && !ctx.permissions.canViewBudgets()) {
      return forbiddenResponse();
    }

    const body = await request.json();
    const { categoryId, amount, isActive } = body;

    if (!categoryId || amount === undefined) {
      return NextResponse.json(
        { error: "categoryId e amount sao obrigatorios" },
        { status: 400 }
      );
    }

    // For personal context, use userId-based unique key; for space, use spaceId
    const ownerKey = ctx.spaceId
      ? { categoryId, spaceId: ctx.spaceId }
      : { categoryId, userId: ctx.userId };

    // Check if budget already exists for this category and owner
    const existing = await prisma.budget.findFirst({
      where: {
        categoryId,
        ...ctx.ownerFilter,
      },
    });

    let budget;
    if (existing) {
      budget = await prisma.budget.update({
        where: { id: existing.id },
        data: { amount, isActive: isActive ?? true },
        include: { category: true },
      });
    } else {
      budget = await prisma.budget.create({
        data: {
          categoryId,
          amount,
          isActive: isActive ?? true,
          userId: ctx.userId,
          spaceId: ctx.spaceId,
        },
        include: { category: true },
      });
    }

    return NextResponse.json(budget, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error creating/updating budget:", error);
    return NextResponse.json(
      { error: "Erro ao salvar orcamento" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    // In space context, check budget viewing permission
    if (ctx.spaceId && ctx.permissions && !ctx.permissions.canViewBudgets()) {
      return forbiddenResponse();
    }

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID do orcamento nao informado" },
        { status: 400 }
      );
    }

    await prisma.budget.deleteMany({
      where: {
        id,
        ...ctx.ownerFilter,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error deleting budget:", error);
    return NextResponse.json(
      { error: "Erro ao excluir orcamento" },
      { status: 500 }
    );
  }
}
