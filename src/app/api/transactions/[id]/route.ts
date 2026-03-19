import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, handleApiError, forbiddenResponse } from "@/lib/auth-utils";
import { parseDateLocal } from "@/lib/utils";

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
        categoryTag: true,
        installment: true,
      },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: "Transação não encontrada" },
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
    return handleApiError(error, "buscar transação");
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
      categoryTagId,
      isFixed,
      tags,
      isInstallment,
      currentInstallment,
      totalInstallments,
      isPrivate,
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
        { error: "Transação não encontrada" },
        { status: 404 }
      );
    }

    // In space context with LIMITED role, only allow editing own transactions
    if (ctx.spaceId && ctx.permissions && !ctx.permissions.canViewAllTransactions()) {
      if (existingTransaction.createdByUserId !== ctx.userId) {
        return NextResponse.json({ error: 'Sem permissao' }, { status: 403 });
      }
    }

    // Validate categoryTagId belongs to user and matches category
    let validatedTagId: string | null | undefined = undefined;
    if (categoryTagId !== undefined) {
      if (categoryTagId === null || categoryTagId === "") {
        validatedTagId = null;
      } else {
        const tag = await prisma.categoryTag.findFirst({
          where: {
            id: categoryTagId,
            ...ctx.ownerFilter,
            categoryId: categoryId || undefined,
          },
        });
        validatedTagId = tag ? categoryTagId : null;
      }
    }

    const transaction = await prisma.transaction.update({
      where: { id },
      data: {
        description,
        amount: type === "EXPENSE" ? -Math.abs(amount) : Math.abs(amount),
        date: parseDateLocal(date),
        type,
        origin,
        categoryId: categoryId || null,
        categoryTagId: validatedTagId !== undefined ? validatedTagId : undefined,
        isFixed: isFixed || false,
        tags: processedTags,
        isInstallment: isInstallment || false,
        ...(isPrivate !== undefined && { isPrivate }),
        currentInstallment: isInstallment ? currentInstallment : null,
        totalInstallments: isInstallment ? totalInstallments : null,
      },
      include: {
        category: true,
        categoryTag: true,
        installment: true,
      },
    });

    return NextResponse.json(transaction);
  } catch (error) {
    return handleApiError(error, "atualizar transação");
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
        { error: "Transação não encontrada" },
        { status: 404 }
      );
    }

    // In space context with LIMITED role, only allow deleting own transactions
    if (ctx.spaceId && ctx.permissions && !ctx.permissions.canViewAllTransactions()) {
      if (existingTransaction.createdByUserId !== ctx.userId) {
        return NextResponse.json({ error: 'Sem permissão' }, { status: 403 });
      }
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
    return handleApiError(error, "excluir transação");
  }
}
