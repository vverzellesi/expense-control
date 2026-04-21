import type { StatementParseResult, StatementTransaction } from "@/types";
import type { GeminiClient, GeminiInvoicePart } from "./gemini-client";
import type { AiInvoiceOutput } from "./schema";

export interface AiParseResult extends StatementParseResult {
  documentType: "fatura_cartao" | "extrato_bancario" | "desconhecido";
  /**
   * Confiança [0, 1] da própria IA de que o doc é mesmo um extrato/fatura.
   * undefined = IA não preencheu (compat com schemas antigos).
   * Usado pelo gate em parse-pipeline para rejeitar docs aleatórios.
   */
  documentConfidence?: number;
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

/**
 * Sanitiza documentConfidence para [0, 1]. Retorna undefined se ausente/NaN.
 * Valores fora do range são clampados (≤0 → 0, ≥1 → 1).
 */
function sanitizeDocumentConfidence(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Parseia um arquivo único com o Gemini. Retrocompat mantida.
 * Para múltiplos arquivos no mesmo prompt (Approach C — multi-part), use a
 * versão array (`parts: GeminiInvoicePart[]`).
 */
export async function parseFileWithAi(
  buffer: Buffer,
  mimeType: string,
  client: GeminiClient
): Promise<AiParseResult>;
export async function parseFileWithAi(
  parts: GeminiInvoicePart[],
  client: GeminiClient
): Promise<AiParseResult>;
export async function parseFileWithAi(
  bufferOrParts: Buffer | GeminiInvoicePart[],
  mimeTypeOrClient: string | GeminiClient,
  maybeClient?: GeminiClient
): Promise<AiParseResult> {
  let client: GeminiClient;
  let output: AiInvoiceOutput;

  if (Array.isArray(bufferOrParts)) {
    // parts[], client
    client = mimeTypeOrClient as GeminiClient;
    output = await client.generateInvoiceStructured(bufferOrParts);
  } else {
    // buffer, mimeType, client
    client = maybeClient as GeminiClient;
    output = await client.generateInvoiceStructured(
      bufferOrParts,
      mimeTypeOrClient as string
    );
  }

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
    documentConfidence: sanitizeDocumentConfidence(output.documentConfidence),
    transactions,
    averageConfidence: 1,
  };
}
