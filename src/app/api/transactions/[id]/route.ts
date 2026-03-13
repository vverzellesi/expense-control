import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";
import { parseDateLocal } from "@/lib/utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId();
    const { id } = await params;
    const transaction = await prisma.transaction.findFirst({
      where: { id, userId },
      include: {
        category: true,
        categoryTag: true,
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
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
    const userId = await getAuthenticatedUserId();
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
    } = body;

    // Process tags - accept array or string, store as JSON string
    const processedTags = tags
      ? Array.isArray(tags)
        ? JSON.stringify(tags)
        : tags
      : null;

    // Verify transaction belongs to user before updating
    const existingTransaction = await prisma.transaction.findFirst({
      where: { id, userId },
    });

    if (!existingTransaction) {
      return NextResponse.json(
        { error: "Transacao nao encontrada" },
        { status: 404 }
      );
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
            userId,
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
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
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
    const userId = await getAuthenticatedUserId();
    const { id } = await params;
    const searchParams = request.nextUrl.searchParams;
    const permanent = searchParams.get("permanent");

    // Verify transaction belongs to user before deleting
    const existingTransaction = await prisma.transaction.findFirst({
      where: { id, userId },
    });

    if (!existingTransaction) {
      return NextResponse.json(
        { error: "Transacao nao encontrada" },
        { status: 404 }
      );
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
    console.error("Error deleting transaction:", error);
    return NextResponse.json(
      { error: "Erro ao excluir transacao" },
      { status: 500 }
    );
  }
}
