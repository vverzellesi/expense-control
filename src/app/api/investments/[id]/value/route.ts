import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, handleApiError } from "@/lib/auth-utils";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    const { id } = await params;
    const body = await request.json();
    const { currentValue } = body;

    // Validate required fields
    if (currentValue === undefined || currentValue === null) {
      return NextResponse.json(
        { error: "Valor atual é obrigatório" },
        { status: 400 }
      );
    }

    if (currentValue < 0) {
      return NextResponse.json(
        { error: "Valor atual não pode ser negativo" },
        { status: 400 }
      );
    }

    // Verify investment belongs to user before updating
    const existingInvestment = await prisma.investment.findFirst({
      where: { id, ...ctx.ownerFilter },
    });

    if (!existingInvestment) {
      return NextResponse.json(
        { error: "Investimento não encontrado" },
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
    return handleApiError(error, "atualizar valor do investimento");
  }
}
