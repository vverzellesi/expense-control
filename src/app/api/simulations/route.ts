import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET() {
  try {
    const ctx = await getAuthContext();

    const simulations = await prisma.simulation.findMany({
      where: { userId: ctx.userId },
      include: { category: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(simulations);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error fetching simulations:", error);
    return NextResponse.json({ error: "Erro ao buscar simulações" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const body = await request.json();

    const { description, totalAmount, totalInstallments, categoryId } = body;

    const parsedAmount = parseFloat(totalAmount);
    const parsedInstallments = parseInt(totalInstallments, 10);

    if (!description || !totalAmount || !totalInstallments) {
      return NextResponse.json(
        { error: "Descrição, valor total e parcelas são obrigatórios" },
        { status: 400 },
      );
    }

    if (isNaN(parsedAmount) || parsedAmount <= 0 || isNaN(parsedInstallments) || parsedInstallments < 1) {
      return NextResponse.json(
        { error: "Valor e parcelas devem ser números positivos" },
        { status: 400 },
      );
    }

    const simulation = await prisma.simulation.create({
      data: {
        description,
        totalAmount: parsedAmount,
        totalInstallments: parsedInstallments,
        categoryId: categoryId || null,
        userId: ctx.userId,
      },
      include: { category: true },
    });

    return NextResponse.json(simulation, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error creating simulation:", error);
    return NextResponse.json({ error: "Erro ao criar simulação" }, { status: 500 });
  }
}
