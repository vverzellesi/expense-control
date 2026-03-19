import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { invalidateRulesCache } from "@/lib/categorizer";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET() {
  try {
    const ctx = await getAuthContext();

    const rules = await prisma.categoryRule.findMany({
      where: {
        ...ctx.ownerFilter,
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
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
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
    const ctx = await getAuthContext();

    const body = await request.json();
    const { keyword, categoryId } = body;

    if (!keyword || !categoryId) {
      return NextResponse.json(
        { error: "Keyword e categoryId são obrigatórios" },
        { status: 400 }
      );
    }

    const rule = await prisma.categoryRule.create({
      data: {
        keyword: keyword.toUpperCase(),
        categoryId,
        userId: ctx.userId,
        spaceId: ctx.spaceId,
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
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
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
    const ctx = await getAuthContext();

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID da regra não informado" },
        { status: 400 }
      );
    }

    await prisma.categoryRule.delete({
      where: { id, ...ctx.ownerFilter },
    });

    invalidateRulesCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error deleting rule:", error);
    return NextResponse.json(
      { error: "Erro ao excluir regra" },
      { status: 500 }
    );
  }
}
