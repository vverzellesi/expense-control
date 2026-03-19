import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

// GET - List deleted transactions
export async function GET() {
  try {
    const ctx = await getAuthContext();

    const transactions = await prisma.transaction.findMany({
      where: {
        ...ctx.ownerFilter,
        deletedAt: { not: null },
      },
      include: {
        category: true,
        installment: true,
      },
      orderBy: {
        deletedAt: "desc",
      },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error fetching deleted transactions:", error);
    return NextResponse.json(
      { error: "Erro ao buscar transações excluídas" },
      { status: 500 }
    );
  }
}

// PUT - Restore a transaction
export async function PUT(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID da transação é obrigatório" },
        { status: 400 }
      );
    }

    const transaction = await prisma.transaction.update({
      where: { id, ...ctx.ownerFilter },
      data: { deletedAt: null },
      include: {
        category: true,
        installment: true,
      },
    });

    return NextResponse.json(transaction);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error restoring transaction:", error);
    return NextResponse.json(
      { error: "Erro ao restaurar transação" },
      { status: 500 }
    );
  }
}

// DELETE - Permanently delete items older than 30 days or specific item
export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");
    const cleanOld = searchParams.get("cleanOld");

    if (id) {
      // Delete specific transaction permanently
      await prisma.transaction.delete({
        where: { id, ...ctx.ownerFilter },
      });
      return NextResponse.json({ success: true, message: "Transação excluída permanentemente" });
    }

    if (cleanOld === "true") {
      // Delete all transactions deleted more than 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await prisma.transaction.deleteMany({
        where: {
          ...ctx.ownerFilter,
          deletedAt: {
            not: null,
            lt: thirtyDaysAgo,
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: `${result.count} transações antigas excluídas permanentemente`,
        count: result.count,
      });
    }

    return NextResponse.json(
      { error: "Parâmetro id ou cleanOld=true é obrigatório" },
      { status: 400 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error permanently deleting transactions:", error);
    return NextResponse.json(
      { error: "Erro ao excluir transações permanentemente" },
      { status: 500 }
    );
  }
}
