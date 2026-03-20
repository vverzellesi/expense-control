import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { Prisma } from "@prisma/client";

const VALID_ORIGIN_TYPES = ["CREDIT_CARD", "DEBIT", "PIX", "OTHER"];

function validateOriginFields(fields: {
  type?: string;
  creditLimit?: unknown;
  rotativoRateMonth?: unknown;
  parcelamentoRate?: unknown;
  cetAnual?: unknown;
  billingCycleDay?: unknown;
  dueDateDay?: unknown;
}): string | null {
  if (fields.type && !VALID_ORIGIN_TYPES.includes(fields.type)) {
    return `Tipo inválido. Valores aceitos: ${VALID_ORIGIN_TYPES.join(", ")}`;
  }

  const numericFields = [
    { name: "creditLimit", value: fields.creditLimit },
    { name: "rotativoRateMonth", value: fields.rotativoRateMonth },
    { name: "parcelamentoRate", value: fields.parcelamentoRate },
    { name: "cetAnual", value: fields.cetAnual },
  ];

  for (const { name, value } of numericFields) {
    if (value != null && (typeof value !== "number" || isNaN(value))) {
      return `Campo ${name} deve ser um número válido`;
    }
    if (value != null && typeof value === "number" && value < 0) {
      return `Campo ${name} não pode ser negativo`;
    }
  }

  const dayFields = [
    { name: "billingCycleDay", value: fields.billingCycleDay },
    { name: "dueDateDay", value: fields.dueDateDay },
  ];

  for (const { name, value } of dayFields) {
    if (value != null) {
      const num = typeof value === "number" ? value : Number(value);
      if (isNaN(num) || !Number.isInteger(num) || num < 1 || num > 31) {
        return `Campo ${name} deve ser um dia válido (1-31)`;
      }
    }
  }

  return null;
}

export async function GET() {
  try {
    const ctx = await getAuthContext();

    const origins = await prisma.origin.findMany({
      where: {
        ...ctx.ownerFilter,
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
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
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
    const ctx = await getAuthContext();

    const body = await request.json();
    const { name, type, creditLimit, rotativoRateMonth, parcelamentoRate, cetAnual, billingCycleDay, dueDateDay } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Nome é obrigatório" },
        { status: 400 }
      );
    }

    const validationError = validateOriginFields({ type, creditLimit, rotativoRateMonth, parcelamentoRate, cetAnual, billingCycleDay, dueDateDay });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const trimmedName = name.trim();

    const origin = await prisma.origin.create({
      data: {
        name: trimmedName,
        type: type || "OTHER",
        creditLimit: creditLimit != null ? Number(creditLimit) : null,
        rotativoRateMonth: rotativoRateMonth != null ? Number(rotativoRateMonth) : null,
        parcelamentoRate: parcelamentoRate != null ? Number(parcelamentoRate) : null,
        cetAnual: cetAnual != null ? Number(cetAnual) : null,
        billingCycleDay: billingCycleDay != null ? Number(billingCycleDay) : null,
        dueDateDay: dueDateDay != null ? Number(dueDateDay) : null,
        userId: ctx.userId,
        spaceId: ctx.spaceId,
      },
    });

    return NextResponse.json(origin, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
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
    const ctx = await getAuthContext();

    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get("id");

    if (!id) {
      return NextResponse.json(
        { error: "ID da origem não informado" },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, type, creditLimit, rotativoRateMonth, parcelamentoRate, cetAnual, billingCycleDay, dueDateDay } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Nome é obrigatório" },
        { status: 400 }
      );
    }

    const validationError = validateOriginFields({ type, creditLimit, rotativoRateMonth, parcelamentoRate, cetAnual, billingCycleDay, dueDateDay });
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    const trimmedName = name.trim();

    // Fetch current origin to get old name
    const currentOrigin = await prisma.origin.findUnique({
      where: { id, ...ctx.ownerFilter },
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
        where: { id, ...ctx.ownerFilter },
        data: {
          name: trimmedName,
          ...(type !== undefined && { type }),
          ...(creditLimit !== undefined && { creditLimit: creditLimit ?? null }),
          ...(rotativoRateMonth !== undefined && { rotativoRateMonth: rotativoRateMonth ?? null }),
          ...(parcelamentoRate !== undefined && { parcelamentoRate: parcelamentoRate ?? null }),
          ...(cetAnual !== undefined && { cetAnual: cetAnual ?? null }),
          ...(billingCycleDay !== undefined && { billingCycleDay: billingCycleDay ?? null }),
          ...(dueDateDay !== undefined && { dueDateDay: dueDateDay ?? null }),
        },
      });

      // Update all transactions with the old origin name
      await tx.transaction.updateMany({
        where: { origin: oldName, ...ctx.ownerFilter },
        data: { origin: trimmedName },
      });

      return updated;
    });

    return NextResponse.json(origin);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
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
    const ctx = await getAuthContext();

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
      where: { id, ...ctx.ownerFilter },
    });

    if (!origin) {
      return NextResponse.json(
        { error: "Origem não encontrada" },
        { status: 404 }
      );
    }

    await prisma.origin.delete({
      where: { id, ...ctx.ownerFilter },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error deleting origin:", error);
    return NextResponse.json(
      { error: "Erro ao excluir origem" },
      { status: 500 }
    );
  }
}
