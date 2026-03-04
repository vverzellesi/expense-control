import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";
import { invalidateTagsCache } from "@/lib/categorizer";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const categoryId = request.nextUrl.searchParams.get("categoryId");

    const tags = await prisma.categoryTag.findMany({
      where: {
        userId,
        ...(categoryId ? { categoryId } : {}),
      },
      include: { category: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(tags);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching category tags:", error);
    return NextResponse.json(
      { error: "Erro ao buscar tags de categoria" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const body = await request.json();
    const { name, keywords, categoryId } = body;

    if (!name || !keywords || !categoryId) {
      return NextResponse.json(
        { error: "Nome, keywords e categoryId são obrigatórios" },
        { status: 400 }
      );
    }

    // Verify category belongs to user
    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Categoria não encontrada" },
        { status: 404 }
      );
    }

    const tag = await prisma.categoryTag.create({
      data: {
        name,
        keywords: keywords.toLowerCase(),
        categoryId,
        userId,
      },
      include: { category: true },
    });

    invalidateTagsCache();

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error creating category tag:", error);
    return NextResponse.json(
      { error: "Erro ao criar tag de categoria" },
      { status: 500 }
    );
  }
}
