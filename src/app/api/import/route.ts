import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { importTransactions } from "@/lib/import-service";

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const body = await request.json();
    const { transactions, origin } = body;

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Transações inválidas" },
        { status: 400 }
      );
    }

    const result = await importTransactions(ctx.userId, transactions, origin || "Importação CSV");

    // Build response message
    const messageParts = [`${result.created.length} transações importadas`];
    if (result.skippedCount > 0) {
      messageParts.push(`${result.skippedCount} duplicatas ignoradas`);
    }
    if (result.linkedCount > 0) {
      messageParts.push(`${result.linkedCount} vinculadas a recorrentes`);
    }
    if (result.carryoverLinkedCount > 0) {
      messageParts.push(`${result.carryoverLinkedCount} vinculadas a saldo rolado`);
    }
    const message =
      result.skippedCount > 0 || result.linkedCount > 0 || result.carryoverLinkedCount > 0
        ? `${messageParts[0]} (${messageParts.slice(1).join(", ")})`
        : `${result.created.length} transações importadas com sucesso`;

    return NextResponse.json(
      {
        message,
        count: result.created.length,
        skippedCount: result.skippedCount,
        linkedCount: result.linkedCount,
        carryoverLinkedCount: result.carryoverLinkedCount,
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
