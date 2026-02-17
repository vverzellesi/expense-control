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
      return NextResponse.json({ error: "Simulacao nao encontrada" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.totalAmount !== undefined) updateData.totalAmount = parseFloat(body.totalAmount);
    if (body.totalInstallments !== undefined) updateData.totalInstallments = parseInt(body.totalInstallments);
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
    return NextResponse.json({ error: "Erro ao atualizar simulacao" }, { status: 500 });
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
      return NextResponse.json({ error: "Simulacao nao encontrada" }, { status: 404 });
    }

    await prisma.simulation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error deleting simulation:", error);
    return NextResponse.json({ error: "Erro ao deletar simulacao" }, { status: 500 });
  }
}
