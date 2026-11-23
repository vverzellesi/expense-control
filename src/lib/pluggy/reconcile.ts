/**
 * Conferências puras da sincronização Pluggy (sem banco, sem relógio).
 *
 * 1. Resíduo por fatura (Emenda 2 do contrato): o total da fatura não é a soma
 *    das transações dela, porque inclui o saldo da fatura anterior e parcelas de
 *    fatura parcelada que não vêm como transação. Vale
 *      total(n) = total(n−1) + débitos(n) − créditos(n) + resíduo(n)
 *    e o resíduo esperado é ≥ 0 (parcelas não expostas). Tudo em centavos.
 *    Resíduo negativo além da tolerância é estado impossível (warning); positivo
 *    é informativo; a primeira fatura da série, sem anterior, não é avaliável.
 *    Total igual não prova completude e total diferente não é erro.
 * 2. Cobertura: se o histórico devolvido começa depois do corte, a leitura não
 *    cobre o intervalo inteiro (coverage_truncated).
 */

export const BILL_RESIDUE_TOLERANCE_CENTS = 5;
/** Fatura anterior com vencimento mais distante que isso indica fatura faltando na série. */
export const MAX_BILL_GAP_DAYS = 45;

export interface BillInput {
  id: string;
  /** Vencimento, YYYY-MM-DD. */
  dueDate: string;
  /** Total da fatura em centavos (com sinal, como a Pluggy informa). */
  totalCents: number;
  currencyCode: string | null;
}

export interface BillTransactionInput {
  billId: string | null;
  direction: "DEBIT" | "CREDIT";
  /** Valor absoluto em centavos. */
  amountCents: number;
  currencyCode: string;
}

export type BillCheckResult = "balanced" | "residue_positive" | "residue_negative" | "not_evaluable";

export type BillNotEvaluableReason = "first_in_series" | "gap_in_series" | "foreign_currency";

export interface BillCheck {
  dueDate: string;
  totalCents: number;
  debitsCents: number;
  creditsCents: number;
  transactions: number;
  previousTotalCents: number | null;
  residueCents: number | null;
  result: BillCheckResult;
  reason: BillNotEvaluableReason | null;
}

export interface BillReconciliation {
  bills: BillCheck[];
  balanced: number;
  residuePositive: number;
  residueNegative: number;
  notEvaluable: number;
  /** Transações com billId que não corresponde a nenhuma fatura lida. */
  orphanTransactions: number;
}

const LEDGER_CURRENCY = "BRL";

function dayNumber(day: string): number {
  const [y, m, d] = day.split("-").map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000;
}

function isLedgerCurrency(code: string | null): boolean {
  return code === null || code.trim().toUpperCase() === LEDGER_CURRENCY;
}

export function computeBillResidue(input: {
  totalCents: number;
  previousTotalCents: number;
  debitsCents: number;
  creditsCents: number;
}): number {
  return input.totalCents - input.previousTotalCents - input.debitsCents + input.creditsCents;
}

export function classifyResidue(residueCents: number): BillCheckResult {
  if (residueCents < -BILL_RESIDUE_TOLERANCE_CENTS) return "residue_negative";
  if (residueCents > BILL_RESIDUE_TOLERANCE_CENTS) return "residue_positive";
  return "balanced";
}

export function reconcileBills(bills: BillInput[], transactions: BillTransactionInput[]): BillReconciliation {
  const sorted = [...bills].sort((a, b) =>
    a.dueDate !== b.dueDate ? (a.dueDate < b.dueDate ? -1 : 1) : a.id < b.id ? -1 : a.id > b.id ? 1 : 0
  );
  const byBill = new Map<string, { debits: number; credits: number; count: number; foreign: boolean }>();
  for (const bill of sorted) byBill.set(bill.id, { debits: 0, credits: 0, count: 0, foreign: false });

  let orphanTransactions = 0;
  for (const tx of transactions) {
    if (!tx.billId) continue;
    const acc = byBill.get(tx.billId);
    if (!acc) {
      orphanTransactions++;
      continue;
    }
    acc.count++;
    if (!isLedgerCurrency(tx.currencyCode)) acc.foreign = true;
    if (tx.direction === "DEBIT") acc.debits += tx.amountCents;
    else acc.credits += tx.amountCents;
  }

  const out: BillReconciliation = {
    bills: [],
    balanced: 0,
    residuePositive: 0,
    residueNegative: 0,
    notEvaluable: 0,
    orphanTransactions,
  };

  sorted.forEach((bill, index) => {
    const acc = byBill.get(bill.id)!;
    const previous = index > 0 ? sorted[index - 1] : null;
    const base = {
      dueDate: bill.dueDate,
      totalCents: bill.totalCents,
      debitsCents: acc.debits,
      creditsCents: acc.credits,
      transactions: acc.count,
      previousTotalCents: previous ? previous.totalCents : null,
    };
    let reason: BillNotEvaluableReason | null = null;
    if (!previous) reason = "first_in_series";
    else if (dayNumber(bill.dueDate) - dayNumber(previous.dueDate) > MAX_BILL_GAP_DAYS) reason = "gap_in_series";
    else if (acc.foreign || !isLedgerCurrency(bill.currencyCode) || !isLedgerCurrency(previous.currencyCode)) {
      reason = "foreign_currency";
    }

    if (reason) {
      out.notEvaluable++;
      out.bills.push({ ...base, residueCents: null, result: "not_evaluable", reason });
      return;
    }
    const residueCents = computeBillResidue({
      totalCents: bill.totalCents,
      previousTotalCents: previous!.totalCents,
      debitsCents: acc.debits,
      creditsCents: acc.credits,
    });
    const result = classifyResidue(residueCents);
    if (result === "balanced") out.balanced++;
    else if (result === "residue_positive") out.residuePositive++;
    else out.residueNegative++;
    out.bills.push({ ...base, residueCents, result, reason: null });
  });

  return out;
}

export type CoverageStatus = "complete" | "truncated" | "empty";

export interface CoverageCheck {
  status: CoverageStatus;
  /** A partir de quando a leitura cobre o intervalo (para contar registros sumidos). */
  coveredFrom: string;
}

/**
 * Cobertura da leitura completa de uma conta: o histórico devolvido começa
 * depois do corte = coverage_truncated. Leitura vazia não prova nada.
 */
export function checkCoverage(input: { syncFromDay: string; minDate: string | null; total: number }): CoverageCheck {
  if (input.total === 0 || input.minDate === null) return { status: "empty", coveredFrom: input.syncFromDay };
  if (input.minDate > input.syncFromDay) return { status: "truncated", coveredFrom: input.minDate };
  return { status: "complete", coveredFrom: input.syncFromDay };
}

