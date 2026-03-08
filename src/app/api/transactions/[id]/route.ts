import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();

    const { id } = await params;
    const transaction = await prisma.transaction.findFirst({
      where: { id, ...ctx.ownerFilter },
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

    // In space context with LIMITED role, only allow viewing own transactions
    if (ctx.spaceId && ctx.permissions && !ctx.permissions.canViewAllTransactions()) {
      if (transaction.createdByUserId !== ctx.userId) {
        return forbiddenResponse();
      }
    }

    return NextResponse.json(transaction);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
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
    const ctx = await getAuthContext();
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

    // Verify transaction belongs to user/space before updating
    const existingTransaction = await prisma.transaction.findFirst({
      where: { id, ...ctx.ownerFilter },
    });

    if (!existingTransaction) {
      return NextResponse.json(
        { error: "Transacao nao encontrada" },
        { status: 404 }
      );
    }

    // In space context with LIMITED role, only allow editing own transactions
    if (ctx.spaceId && ctx.permissions && !ctx.permissions.canViewAllTransactions()) {
      if (existingTransaction.createdByUserId !== ctx.userId) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
    }

    // Personal transactions mirrored in space can only be mutated by the owner
    if (!existingTransaction.spaceId && existingTransaction.userId !== ctx.userId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        description,
        amount: type === "EXPENSE" ? -Math.abs(amount) : Math.abs(amount),
        date: new Date(date + "T12:00:00"),
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
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
    const ctx = await getAuthContext();
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const permanent = searchParams.get("permanent");

    // Verify transaction belongs to user/space before deleting
    const existingTransaction = await prisma.transaction.findFirst({
      where: { id, ...ctx.ownerFilter },
    });

    if (!existingTransaction) {
      return NextResponse.json(
        { error: "Transacao nao encontrada" },
        { status: 404 }
      );
    }

    // In space context with LIMITED role, only allow deleting own transactions
    if (ctx.spaceId && ctx.permissions && !ctx.permissions.canViewAllTransactions()) {
      if (existingTransaction.createdByUserId !== ctx.userId) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
    }

    // Personal transactions mirrored in space can only be mutated by the owner
    if (!existingTransaction.spaceId && existingTransaction.userId !== ctx.userId) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
    }

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
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error deleting transaction:", error);
    return NextResponse.json(
      { error: "Erro ao excluir transacao" },
      { status: 500 }
    );
  }
}
