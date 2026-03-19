import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { ensureDefaultInvestmentCategories } from "@/lib/categorizer";

export async function GET() {
  try {
    const ctx = await getAuthContext();

    // Ensure default investment categories exist (self-healing)
    await ensureDefaultInvestmentCategories();

    // Get default categories (userId is null) and user's custom categories
    const categories = await prisma.investmentCategory.findMany({
      where: {
        OR: [
          { userId: null, isDefault: true },
          { ...ctx.ownerFilter },
        ],
      },
      include: {
        _count: {
          select: { investments: true },
        },
      },
      orderBy: [
        { isDefault: "desc" },
        { name: "asc" },
      ],
    });

    return NextResponse.json(categories);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error fetching investment categories:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Erro ao buscar categorias de investimento", details: errorMessage },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    const body = await request.json();
    const { name, color, icon } = body;

    if (!name || !color) {
      return NextResponse.json(
        { error: "Nome e cor são obrigatórios" },
        { status: 400 }
      );
    }

    // Check if category with same name already exists for this user/space
    const existingCategory = await prisma.investmentCategory.findFirst({
      where: {
        name,
        OR: [
          { userId: null, isDefault: true },
          { ...ctx.ownerFilter },
        ],
      },
    });

    if (existingCategory) {
      return NextResponse.json(
        { error: "Já existe uma categoria com este nome" },
        { status: 400 }
      );
    }

    const category = await prisma.investmentCategory.create({
      data: {
        name,
        color,
        icon,
        isDefault: false,
        userId: ctx.userId,
        spaceId: ctx.spaceId,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error creating investment category:", error);
    return NextResponse.json(
      { error: "Erro ao criar categoria de investimento" },
      { status: 500 }
    );
  }
}
