import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId();

    const { id } = await params;

    // Find the category
    const category = await prisma.investmentCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { investments: true },
        },
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Categoria nao encontrada" },
        { status: 404 }
      );
    }

    // Cannot delete default categories
    if (category.isDefault) {
      return NextResponse.json(
        { error: "Nao e possivel excluir categorias padrao" },
        { status: 400 }
      );
    }

    // Cannot delete categories that belong to other users
    if (category.userId !== userId) {
      return NextResponse.json(
        { error: "Voce nao tem permissao para excluir esta categoria" },
        { status: 403 }
      );
    }

    // Cannot delete categories with linked investments
    if (category._count.investments > 0) {
      return NextResponse.json(
        { error: "Nao e possivel excluir categoria com investimentos vinculados" },
        { status: 400 }
      );
    }

    await prisma.investmentCategory.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error deleting investment category:", error);
    return NextResponse.json(
      { error: "Erro ao excluir categoria de investimento" },
      { status: 500 }
    );
  }
}
