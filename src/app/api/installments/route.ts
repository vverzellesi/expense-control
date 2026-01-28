import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

    const searchParams = request.nextUrl.searchParams;
    const active = searchParams.get("active");
    const origin = searchParams.get("origin");

    const where: Record<string, unknown> = { userId };
    if (origin) {
      where.origin = origin;
    }

    const installments = await prisma.installment.findMany({
      where,
      include: {
        transactions: {
          include: {
            category: true,
          },
          orderBy: {
            currentInstallment: "asc",
          },
        },
      },
      orderBy: {
        startDate: "desc",
      },
    });

    // Filter active installments (those with future transactions)
    if (active === "true") {
      const now = new Date();
      const activeInstallments = installments.filter((i) =>
        i.transactions.some((t) => new Date(t.date) >= now)
      );
      return NextResponse.json(activeInstallments);
    }

    return NextResponse.json(installments);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching installments:", error);
    return NextResponse.json(
      { error: "Erro ao buscar parcelas" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID do parcelamento nao informado" },
        { status: 400 }
      );
    }

    // Delete all transactions and the installment
    await prisma.transaction.deleteMany({
      where: { installmentId: id, userId },
    });

    await prisma.installment.delete({
      where: { id, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error deleting installment:", error);
    return NextResponse.json(
      { error: "Erro ao excluir parcelamento" },
      { status: 500 }
    );
  }
}
