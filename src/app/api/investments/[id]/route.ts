import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, handleApiError } from "@/lib/auth-utils";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    const { id } = await params;

    const investment = await prisma.investment.findFirst({
      where: { id, ...ctx.ownerFilter },
      include: {
        category: true,
        transactions: {
          orderBy: { date: "desc" },
          include: {
            linkedTransaction: {
              include: {
                category: true,
              },
            },
          },
        },
      },
    });

    if (!investment) {
      return NextResponse.json(
        { error: "Investimento nao encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(investment);
  } catch (error) {
    return handleApiError(error, "buscar investimento");
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
    const { name, description, categoryId, goalAmount, broker } = body;

    // Verify investment belongs to user before updating
    const existingInvestment = await prisma.investment.findFirst({
      where: { id, ...ctx.ownerFilter },
    });

    if (!existingInvestment) {
      return NextResponse.json(
        { error: "Investimento nao encontrado" },
        { status: 404 }
      );
    }

    // If categoryId is provided, verify it belongs to the user or is a default category
    if (categoryId) {
      const category = await prisma.investmentCategory.findFirst({
        where: {
          id: categoryId,
          OR: [ctx.ownerFilter, { userId: null, isDefault: true }],
        },
      });

      if (!category) {
        return NextResponse.json(
          { error: "Categoria de investimento nao encontrada" },
          { status: 404 }
        );
      }
    }

    const investment = await prisma.investment.update({
      where: { id },
      data: {
        name: name !== undefined ? name : existingInvestment.name,
        description: description !== undefined ? description : existingInvestment.description,
        categoryId: categoryId !== undefined ? categoryId : existingInvestment.categoryId,
        goalAmount: goalAmount !== undefined ? goalAmount : existingInvestment.goalAmount,
        broker: broker !== undefined ? broker : existingInvestment.broker,
      },
      include: {
        category: true,
        transactions: {
          orderBy: { date: "desc" },
        },
      },
    });

    return NextResponse.json(investment);
  } catch (error) {
    return handleApiError(error, "atualizar investimento");
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    const { id } = await params;

    // Verify investment belongs to user before deleting
    const existingInvestment = await prisma.investment.findFirst({
      where: { id, ...ctx.ownerFilter },
      include: {
        transactions: true,
      },
    });

    if (!existingInvestment) {
      return NextResponse.json(
        { error: "Investimento nao encontrado" },
        { status: 404 }
      );
    }

    // Delete investment and its InvestmentTransactions (cascade)
    // Note: Linked Transactions are kept (the foreign key is on InvestmentTransaction side)
    await prisma.investment.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "excluir investimento");
  }
}
