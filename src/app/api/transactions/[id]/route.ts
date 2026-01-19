import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transaction = await prisma.transaction.findUnique({
      where: { id },
      include: {
        category: true,
        installment: true,
      },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transacao nao encontrada" },
        { status: 404 }
      );
    }

    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Error fetching transaction:", error);
    return NextResponse.json(
      { error: "Erro ao buscar transacao" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const {
      description,
      amount,
      date,
      type,
      origin,
      categoryId,
      isFixed,
      tags,
      isInstallment,
      currentInstallment,
      totalInstallments,
    } = body;

    // Process tags - accept array or string, store as JSON string
    const processedTags = tags
      ? Array.isArray(tags)
        ? JSON.stringify(tags)
        : tags
      : null;

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        description,
        amount: type === "EXPENSE" ? -Math.abs(amount) : Math.abs(amount),
        date: new Date(date),
        type,
        origin,
        categoryId: categoryId || null,
        isFixed: isFixed || false,
        tags: processedTags,
        isInstallment: isInstallment || false,
        currentInstallment: isInstallment ? currentInstallment : null,
        totalInstallments: isInstallment ? totalInstallments : null,
      },
      include: {
        category: true,
        installment: true,
      },
    });

    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Error updating transaction:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar transacao" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const permanent = searchParams.get("permanent");

    if (permanent === "true") {
      // Permanent delete
      await prisma.transaction.delete({
        where: { id },
      });
    } else {
      // Soft delete - set deletedAt timestamp
      await prisma.transaction.update({
        where: { id },
        data: { deletedAt: new Date() },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    return NextResponse.json(
      { error: "Erro ao excluir transacao" },
      { status: 500 }
    );
  }
}
