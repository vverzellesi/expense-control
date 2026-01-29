import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const searchParams = request.nextUrl.searchParams;
    const categoryId = searchParams.get("categoryId");

    const where: Record<string, unknown> = {
      userId,
    };

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const investments = await prisma.investment.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    // Calculate additional fields for each investment
    const investmentsWithCalculations = investments.map((investment) => {
      const totalReturn =
        investment.currentValue -
        investment.totalInvested +
        investment.totalWithdrawn;

      const totalReturnPercent =
        investment.totalInvested > 0
          ? (totalReturn / investment.totalInvested) * 100
          : 0;

      const goalProgress =
        investment.goalAmount && investment.goalAmount > 0
          ? (investment.currentValue / investment.goalAmount) * 100
          : null;

      return {
        ...investment,
        totalReturn,
        totalReturnPercent,
        goalProgress,
      };
    });

    return NextResponse.json(investmentsWithCalculations);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching investments:", error);
    return NextResponse.json(
      { error: "Erro ao buscar investimentos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const body = await request.json();
    const {
      name,
      categoryId,
      initialValue,
      description,
      goalAmount,
      broker,
      date,
    } = body;

    // Validate required fields
    if (!name || !categoryId || initialValue === undefined) {
      return NextResponse.json(
        { error: "Campos obrigatorios: name, categoryId, initialValue" },
        { status: 400 }
      );
    }

    const investmentDate = date ? new Date(date + "T12:00:00") : new Date();
    const amount = Math.abs(initialValue);

    // Use a transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Create the Investment record
      const investment = await tx.investment.create({
        data: {
          name,
          description: description || null,
          categoryId,
          currentValue: amount,
          totalInvested: amount,
          totalWithdrawn: 0,
          goalAmount: goalAmount || null,
          broker: broker || null,
          userId,
        },
        include: {
          category: true,
        },
      });

      // 2. Find the "Investimentos" category for transactions
      // First try user's own category, then fall back to global default
      let transactionCategory = await tx.category.findFirst({
        where: {
          name: "Investimentos",
          userId,
        },
      });

      if (!transactionCategory) {
        transactionCategory = await tx.category.findFirst({
          where: {
            name: "Investimentos",
            userId: null,
          },
        });
      }

      // 3. Create a Transaction (type: EXPENSE) for the initial deposit
      const transaction = await tx.transaction.create({
        data: {
          description: `Aporte - ${name}`,
          amount: -amount, // Negative for expense
          date: investmentDate,
          type: "EXPENSE",
          origin: broker || "Investimento",
          categoryId: transactionCategory?.id || null,
          isFixed: false,
          isInstallment: false,
          userId,
        },
      });

      // 4. Create an InvestmentTransaction (type: DEPOSIT) linked to that transaction
      await tx.investmentTransaction.create({
        data: {
          investmentId: investment.id,
          type: "DEPOSIT",
          amount: amount,
          date: investmentDate,
          linkedTransactionId: transaction.id,
        },
      });

      return investment;
    });

    // Calculate fields for response
    const totalReturn = result.currentValue - result.totalInvested + result.totalWithdrawn;
    const totalReturnPercent = result.totalInvested > 0
      ? (totalReturn / result.totalInvested) * 100
      : 0;
    const goalProgress = result.goalAmount && result.goalAmount > 0
      ? (result.currentValue / result.goalAmount) * 100
      : null;

    return NextResponse.json(
      {
        ...result,
        totalReturn,
        totalReturnPercent,
        goalProgress,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error creating investment:", error);
    return NextResponse.json(
      { error: "Erro ao criar investimento" },
      { status: 500 }
    );
  }
}
