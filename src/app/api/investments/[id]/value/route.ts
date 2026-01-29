import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId();
    const { id } = await params;
    const body = await request.json();
    const { currentValue } = body;

    // Validate required fields
    if (currentValue === undefined || currentValue === null) {
      return NextResponse.json(
        { error: "Valor atual e obrigatorio" },
        { status: 400 }
      );
    }

    if (currentValue < 0) {
      return NextResponse.json(
        { error: "Valor atual nao pode ser negativo" },
        { status: 400 }
      );
    }

    // Verify investment belongs to user before updating
    const existingInvestment = await prisma.investment.findFirst({
      where: { id, userId },
    });

    if (!existingInvestment) {
      return NextResponse.json(
        { error: "Investimento nao encontrado" },
        { status: 404 }
      );
    }

    // Update only the currentValue field (no cash flow transaction)
    const investment = await prisma.investment.update({
      where: { id },
      data: {
        currentValue: currentValue,
      },
      include: {
        category: true,
      },
    });

    return NextResponse.json(investment);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error updating investment value:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar valor do investimento" },
      { status: 500 }
    );
  }
}
