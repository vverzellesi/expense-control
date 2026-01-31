import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";
import { Prisma } from "@prisma/client";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();

    const origins = await prisma.origin.findMany({
      where: {
        userId,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(origins);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching origins:", error);
    return NextResponse.json(
      { error: "Erro ao buscar origens" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Nome é obrigatório" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    const origin = await prisma.origin.create({
      data: {
        name: trimmedName,
        userId,
      },
    });

    return NextResponse.json(origin, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Origem já existe" },
        { status: 400 }
      );
    }
    console.error("Error creating origin:", error);
    return NextResponse.json(
      { error: "Erro ao criar origem" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID da origem não informado" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Nome é obrigatório" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // Fetch current origin to get old name
    const currentOrigin = await prisma.origin.findUnique({
      where: { id, userId },
    });

    if (!currentOrigin) {
      return NextResponse.json(
        { error: "Origem não encontrada" },
        { status: 404 }
      );
    }

    const oldName = currentOrigin.name;

    // Use transaction to update origin and all related transactions
    const origin = await prisma.$transaction(async (tx) => {
      const updated = await tx.origin.update({
        where: { id, userId },
        data: { name: trimmedName },
      });

      // Update all transactions with the old origin name
      await tx.transaction.updateMany({
        where: { origin: oldName, userId },
        data: { origin: trimmedName },
      });

      return updated;
    });

    return NextResponse.json(origin);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Origem já existe" },
        { status: 400 }
      );
    }
    console.error("Error updating origin:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar origem" },
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
        { error: "ID da origem não informado" },
        { status: 400 }
      );
    }

    // Check if origin exists
    const origin = await prisma.origin.findUnique({
      where: { id, userId },
    });

    if (!origin) {
      return NextResponse.json(
        { error: "Origem não encontrada" },
        { status: 404 }
      );
    }

    await prisma.origin.delete({
      where: { id, userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error deleting origin:", error);
    return NextResponse.json(
      { error: "Erro ao excluir origem" },
      { status: 500 }
    );
  }
}
