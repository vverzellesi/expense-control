import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getAuthenticatedUserId();
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.simulation.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Simulação não encontrada" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.totalAmount !== undefined) {
      const parsedAmount = parseFloat(body.totalAmount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        return NextResponse.json({ error: "Valor deve ser um número positivo" }, { status: 400 });
      }
      updateData.totalAmount = parsedAmount;
    }
    if (body.totalInstallments !== undefined) {
      const parsedInstallments = parseInt(body.totalInstallments, 10);
      if (isNaN(parsedInstallments) || parsedInstallments < 1) {
        return NextResponse.json({ error: "Parcelas deve ser um número positivo" }, { status: 400 });
      }
      updateData.totalInstallments = parsedInstallments;
    }
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId || null;

    const updated = await prisma.simulation.update({
      where: { id },
      data: updateData,
      include: { category: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error updating simulation:", error);
    return NextResponse.json({ error: "Erro ao atualizar simulação" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getAuthenticatedUserId();
    const { id } = await params;

    const existing = await prisma.simulation.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Simulação não encontrada" }, { status: 404 });
    }

    await prisma.simulation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error deleting simulation:", error);
    return NextResponse.json({ error: "Erro ao deletar simulação" }, { status: 500 });
  }
}
