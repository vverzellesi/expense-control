import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();

    const simulations = await prisma.simulation.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(simulations);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching simulations:", error);
    return NextResponse.json({ error: "Erro ao buscar simulacoes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const body = await request.json();

    const { description, totalAmount, totalInstallments, categoryId } = body;

    if (!description || !totalAmount || !totalInstallments) {
      return NextResponse.json(
        { error: "Descricao, valor total e parcelas sao obrigatorios" },
        { status: 400 },
      );
    }

    const simulation = await prisma.simulation.create({
      data: {
        description,
        totalAmount: parseFloat(totalAmount),
        totalInstallments: parseInt(totalInstallments),
        categoryId: categoryId || null,
        userId,
      },
      include: { category: true },
    });

    return NextResponse.json(simulation, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error creating simulation:", error);
    return NextResponse.json({ error: "Erro ao criar simulacao" }, { status: 500 });
  }
}
