import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { invalidateRulesCache } from "@/lib/categorizer";

export async function GET() {
  try {
    const rules = await prisma.categoryRule.findMany({
      include: {
        category: true,
      },
      orderBy: {
        keyword: "asc",
      },
    });

    return NextResponse.json(rules);
  } catch (error) {
    console.error("Error fetching rules:", error);
    return NextResponse.json(
      { error: "Erro ao buscar regras" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword, categoryId } = body;

    if (!keyword || !categoryId) {
      return NextResponse.json(
        { error: "Keyword e categoryId sao obrigatorios" },
        { status: 400 }
      );
    }

    const rule = await prisma.categoryRule.create({
      data: {
        keyword: keyword.toUpperCase(),
        categoryId,
      },
      include: {
        category: true,
      },
    });

    invalidateRulesCache();

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    console.error("Error creating rule:", error);
    return NextResponse.json(
      { error: "Erro ao criar regra" },
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
        { error: "ID da regra nao informado" },
        { status: 400 }
      );
    }

    await prisma.categoryRule.delete({
      where: { id },
    });

    invalidateRulesCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting rule:", error);
    return NextResponse.json(
      { error: "Erro ao excluir regra" },
      { status: 500 }
    );
  }
}
