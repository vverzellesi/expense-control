import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET() {
  try {
    const ctx = await getAuthContext();

    const categories = await prisma.category.findMany({
      where: { ...ctx.ownerFilter },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(categories);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error fetching categories:", error);
    return NextResponse.json(
      { error: "Erro ao buscar categorias" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    const body = await request.json();
    const { name, color, icon, flexibilityType } = body;

    const VALID_FLEXIBILITY = ['ESSENTIAL', 'NEGOTIABLE', 'VARIABLE', null];
    if (flexibilityType !== undefined && flexibilityType !== null && !VALID_FLEXIBILITY.includes(flexibilityType)) {
      return NextResponse.json({ error: "Tipo de flexibilidade inválido" }, { status: 400 });
    }

    const category = await prisma.category.create({
      data: {
        name,
        color,
        icon,
        flexibilityType: flexibilityType || undefined,
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
    console.error("Error creating category:", error);
    return NextResponse.json(
      { error: "Erro ao criar categoria" },
      { status: 500 }
    );
  }
}
