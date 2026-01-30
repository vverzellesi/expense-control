import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";
import { ensureDefaultInvestmentCategories } from "@/lib/categorizer";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();

    // Ensure default investment categories exist (self-healing)
    await ensureDefaultInvestmentCategories();

    // Get default categories (userId is null) and user's custom categories
    const categories = await prisma.investmentCategory.findMany({
      where: {
        OR: [
          { userId: null, isDefault: true },
          { userId },
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
    console.error("Error fetching investment categories:", error);
    return NextResponse.json(
      { error: "Erro ao buscar categorias de investimento" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

    const body = await request.json();
    const { name, color, icon } = body;

    if (!name || !color) {
      return NextResponse.json(
        { error: "Nome e cor sao obrigatorios" },
        { status: 400 }
      );
    }

    // Check if category with same name already exists for this user
    const existingCategory = await prisma.investmentCategory.findFirst({
      where: {
        name,
        OR: [
          { userId: null, isDefault: true },
          { userId },
        ],
      },
    });

    if (existingCategory) {
      return NextResponse.json(
        { error: "Ja existe uma categoria com este nome" },
        { status: 400 }
      );
    }

    const category = await prisma.investmentCategory.create({
      data: {
        name,
        color,
        icon,
        isDefault: false,
        userId,
      },
    });

    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error creating investment category:", error);
    return NextResponse.json(
      { error: "Erro ao criar categoria de investimento" },
      { status: 500 }
    );
  }
}
