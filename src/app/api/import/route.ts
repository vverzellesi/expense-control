import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { importTransactions, type ImportTransaction } from "@/lib/import-service";

// Lista explícita dos campos aceitos do request. Qualquer outro campo
// (ex.: campos internos da integração Pluggy) é descartado pelo parse.
const importItemSchema = z.object({
  description: z.string(),
  amount: z.number().finite(),
  date: z.string(),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER"]).nullish(),
  categoryId: z.string().nullish(),
  categoryTagId: z.string().nullish(),
  isInstallment: z.boolean().nullish(),
  currentInstallment: z.number().int().nullish(),
  totalInstallments: z.number().int().nullish(),
  recurringExpenseId: z.string().nullish(),
  origin: z.string().nullish(),
});

const importBodySchema = z.object({
  transactions: z.array(importItemSchema),
  origin: z.string().nullish(),
});

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const body = await request.json();

    const parsed = importBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Transações inválidas" },
        { status: 400 }
      );
    }
    const { origin } = parsed.data;

    // categoryId só vale se a categoria for pessoal do usuário ou do espaço ativo
    // (a tela de importação lista as categorias do contexto ativo); o resto é descartado.
    const requestedCategoryIds = Array.from(
      new Set(parsed.data.transactions.map((t) => t.categoryId).filter((id): id is string => !!id))
    );
    const allowedCategoryIds = new Set(
      requestedCategoryIds.length === 0
        ? []
        : (
            await prisma.category.findMany({
              where: {
                id: { in: requestedCategoryIds },
                OR: [{ userId: ctx.userId, spaceId: null }, ...(ctx.spaceId ? [{ spaceId: ctx.spaceId }] : [])],
              },
              select: { id: true },
            })
          ).map((c) => c.id)
    );

    const transactions: ImportTransaction[] = parsed.data.transactions.map((t) => ({
      description: t.description,
      amount: t.amount,
      date: t.date,
      type: t.type ?? undefined,
      categoryId: t.categoryId && allowedCategoryIds.has(t.categoryId) ? t.categoryId : null,
      categoryTagId: t.categoryTagId ?? undefined,
      isInstallment: t.isInstallment ?? undefined,
      currentInstallment: t.currentInstallment ?? undefined,
      totalInstallments: t.totalInstallments ?? undefined,
      recurringExpenseId: t.recurringExpenseId ?? undefined,
      origin: t.origin ?? undefined,
    }));

    const result = await importTransactions(ctx.userId, transactions, origin || "Importação CSV");

    // Build response message
    const messageParts = [`${result.created.length} transações importadas`];
    if (result.skippedCount > 0) {
      messageParts.push(`${result.skippedCount} duplicatas ignoradas`);
    }
    if (result.skippedPluggyManaged > 0) {
      messageParts.push(`${result.skippedPluggyManaged} ignoradas (conta sincronizada automaticamente)`);
    }
    if (result.linkedCount > 0) {
      messageParts.push(`${result.linkedCount} vinculadas a recorrentes`);
    }
    if (result.carryoverLinkedCount > 0) {
      messageParts.push(`${result.carryoverLinkedCount} vinculadas a saldo rolado`);
    }
    if (result.futureInstallmentsCreated > 0) {
      messageParts.push(`${result.futureInstallmentsCreated} parcelas futuras geradas`);
    }
    const hasExtras = result.skippedCount > 0 || result.skippedPluggyManaged > 0 || result.linkedCount > 0 ||
      result.carryoverLinkedCount > 0 || result.futureInstallmentsCreated > 0;
    const message = hasExtras
        ? `${messageParts[0]} (${messageParts.slice(1).join(", ")})`
        : `${result.created.length} transações importadas com sucesso`;

    return NextResponse.json(
      {
        message,
        count: result.created.length,
        skippedCount: result.skippedCount,
        skippedPluggyManaged: result.skippedPluggyManaged,
        linkedCount: result.linkedCount,
        carryoverLinkedCount: result.carryoverLinkedCount,
        installmentGroupsCreated: result.installmentGroupsCreated,
        futureInstallmentsCreated: result.futureInstallmentsCreated,
        linkedCarryovers: result.linkedCarryovers,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error importing transactions:", error);
    return NextResponse.json(
      { error: "Erro ao importar transações" },
      { status: 500 }
    );
  }
}
