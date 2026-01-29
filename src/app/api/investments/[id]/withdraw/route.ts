import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId();
    const { id } = await params;
    const body = await request.json();
    const { amount, date, notes } = body;

    // Validate required fields
    if (!amount || amount <= 0) {
      return NextResponse.json(
        { error: "Valor do resgate deve ser maior que zero" },
        { status: 400 }
      );
    }

    // Verify investment belongs to user
    const existingInvestment = await prisma.investment.findFirst({
      where: { id, userId },
    });

    if (!existingInvestment) {
      return NextResponse.json(
        { error: "Investimento nao encontrado" },
        { status: 404 }
      );
    }

    // Validate: amount <= currentValue
    if (amount > existingInvestment.currentValue) {
      return NextResponse.json(
        { error: "Valor do resgate nao pode ser maior que o valor atual do investimento" },
        { status: 400 }
      );
    }

    // Find "Investimentos" category - first try user's own, then global default
    let investmentCategory = await prisma.category.findFirst({
      where: {
        userId,
        name: { contains: "Investimento", mode: "insensitive" },
      },
    });

    if (!investmentCategory) {
      investmentCategory = await prisma.category.findFirst({
        where: {
          userId: null,
          name: { contains: "Investimento", mode: "insensitive" },
        },
      });
    }

    const transactionDate = date ? new Date(date + "T12:00:00") : new Date();

    // Use transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the cash flow Transaction (INCOME - money coming back to account)
      const transaction = await tx.transaction.create({
        data: {
          description: `Resgate - ${existingInvestment.name}`,
          amount: Math.abs(amount), // INCOME is positive
          date: transactionDate,
          type: "INCOME",
          origin: existingInvestment.broker || "Investimento",
          categoryId: investmentCategory?.id || null,
          isFixed: false,
          userId,
        },
      });

      // 2. Create the InvestmentTransaction (WITHDRAWAL) linked to transaction
      const investmentTransaction = await tx.investmentTransaction.create({
        data: {
          investmentId: id,
          type: "WITHDRAWAL",
          amount: Math.abs(amount),
          date: transactionDate,
          notes: notes || null,
          linkedTransactionId: transaction.id,
        },
      });

      // 3. Update Investment: currentValue -= amount, totalWithdrawn += amount
      const updatedInvestment = await tx.investment.update({
        where: { id },
        data: {
          currentValue: existingInvestment.currentValue - Math.abs(amount),
          totalWithdrawn: existingInvestment.totalWithdrawn + Math.abs(amount),
        },
        include: {
          category: true,
        },
      });

      return {
        investment: updatedInvestment,
        investmentTransaction,
        transaction,
      };
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error creating withdrawal:", error);
    return NextResponse.json(
      { error: "Erro ao registrar resgate" },
      { status: 500 }
    );
  }
}
