import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { invalidateRulesCache } from "@/lib/categorizer";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();

    const rules = await prisma.categoryRule.findMany({
      where: {
        userId,
      },
      include: {
        category: true,
      },
      orderBy: {
        keyword: "asc",
      },
    });

    return NextResponse.json(rules);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching rules:", error);
    return NextResponse.json(
      { error: "Erro ao buscar regras" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

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
        userId,
      },
      include: {
        category: true,
      },
    });

    invalidateRulesCache();

    return NextResponse.json(rule, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error creating rule:", error);
    return NextResponse.json(
      { error: "Erro ao criar regra" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID da regra nao informado" },
        { status: 400 }
      );
    }

    await prisma.categoryRule.delete({
      where: { id, userId },
    });

    invalidateRulesCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error deleting rule:", error);
    return NextResponse.json(
      { error: "Erro ao excluir regra" },
      { status: 500 }
    );
  }
}
