import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET - List deleted transactions
export async function GET() {
  try {
    const transactions = await prisma.transaction.findMany({
      where: {
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
    console.error("Error fetching deleted transactions:", error);
    return NextResponse.json(
      { error: "Erro ao buscar transacoes excluidas" },
      { status: 500 }
    );
  }
}

// PUT - Restore a transaction
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json(
        { error: "ID da transacao e obrigatorio" },
        { status: 400 }
      );
    }

    const transaction = await prisma.transaction.update({
      where: { id },
      data: { deletedAt: null },
      include: {
        category: true,
        installment: true,
      },
    });

    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Error restoring transaction:", error);
    return NextResponse.json(
      { error: "Erro ao restaurar transacao" },
      { status: 500 }
    );
  }
}

// DELETE - Permanently delete items older than 30 days or specific item
export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");
    const cleanOld = searchParams.get("cleanOld");

    if (id) {
      // Delete specific transaction permanently
      await prisma.transaction.delete({
        where: { id },
      });
      return NextResponse.json({ success: true, message: "Transacao excluida permanentemente" });
    }

    if (cleanOld === "true") {
      // Delete all transactions deleted more than 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const result = await prisma.transaction.deleteMany({
        where: {
          deletedAt: {
            not: null,
            lt: thirtyDaysAgo,
          },
        },
      });

      return NextResponse.json({
        success: true,
        message: `${result.count} transacoes antigas excluidas permanentemente`,
        count: result.count,
      });
    }

    return NextResponse.json(
      { error: "Parametro id ou cleanOld=true e obrigatorio" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error permanently deleting transactions:", error);
    return NextResponse.json(
      { error: "Erro ao excluir transacoes permanentemente" },
      { status: 500 }
    );
  }
}
