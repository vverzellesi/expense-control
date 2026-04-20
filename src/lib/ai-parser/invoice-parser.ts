import type { StatementParseResult, StatementTransaction } from "@/types";
import type { GeminiClient } from "./gemini-client";
import type { AiInvoiceOutput } from "./schema";

export interface AiParseResult extends StatementParseResult {
  documentType: "fatura_cartao" | "extrato_bancario" | "desconhecido";
}

function parseIsoDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (isNaN(date.getTime())) return null;
  return date;
}

function sanitize(output: AiInvoiceOutput): StatementTransaction[] {
  const result: StatementTransaction[] = [];
  for (const t of output.transactions) {
    if (!t.description || t.description.trim().length === 0) continue;
    if (!Number.isFinite(t.amount) || t.amount <= 0) continue;
    const date = parseIsoDate(t.date);
    if (!date) continue;
    if (t.type !== "INCOME" && t.type !== "EXPENSE") continue;

    // Normaliza sinal pro contrato do statement-parser:
    // EXPENSE → amount negativo, INCOME → amount positivo.
    // IA retorna amount sempre positivo (schema), então:
    const signedAmount = t.type === "EXPENSE" ? -Math.abs(t.amount) : Math.abs(t.amount);

    result.push({
      date,
      description: t.description.trim().replace(/\s+/g, " "),
      amount: signedAmount,
      type: t.type,
      transactionKind: t.transactionKind,
      confidence: 1,
    });
  }
  return result;
}

export async function parseFileWithAi(
  buffer: Buffer,
  mimeType: string,
  client: GeminiClient
): Promise<AiParseResult> {
  const output = await client.generateInvoiceStructured(buffer, mimeType);
  const transactions = sanitize(output);

  const discarded = output.transactions.length - transactions.length;
  if (discarded > 0) {
    console.warn(
      `AI parser descartou ${discarded} transações inválidas de ${output.bank}`
    );
  }

  return {
    bank: output.bank,
    documentType: output.documentType,
    transactions,
    averageConfidence: 1,
  };
}
