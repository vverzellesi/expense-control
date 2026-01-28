import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId();

    const { id } = await params;
    const category = await prisma.category.findUnique({
      where: { id, userId },
      include: {
        _count: {
          select: { transactions: true },
        },
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Categoria nao encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(category);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching category:", error);
    return NextResponse.json(
      { error: "Erro ao buscar categoria" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId();

    const { id } = await params;
    const body = await request.json();
    const { name, color, icon } = body;

    const category = await prisma.category.update({
      where: { id, userId },
      data: {
        name,
        color,
        icon,
      },
    });

    return NextResponse.json(category);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error updating category:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar categoria" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId();

    const { id } = await params;

    // Check if category has transactions
    const category = await prisma.category.findUnique({
      where: { id, userId },
      include: {
        _count: {
          select: { transactions: true },
        },
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Categoria nao encontrada" },
        { status: 404 }
      );
    }

    if (category._count.transactions > 0) {
      return NextResponse.json(
        { error: "Nao e possivel excluir categoria com transacoes vinculadas" },
        { status: 400 }
      );
    }

    await prisma.category.delete({
      where: { id, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error deleting category:", error);
    return NextResponse.json(
      { error: "Erro ao excluir categoria" },
      { status: 500 }
    );
  }
}
