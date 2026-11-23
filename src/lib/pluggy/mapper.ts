import { addMonthsToDate, toBusinessDate } from "./dates";
import {
  classifyPluggyTransaction,
  compileExcludePatterns,
  type CompiledExcludePatterns,
} from "./rules";
import type {
  ExcludePattern,
  MappedPluggyTransaction,
  PluggyAccountType,
  PluggyTransaction,
} from "./types";

/**
 * Tradução pura de um registro da Pluggy para a forma MappedPluggyTransaction
 * (contrato v2 + emendas). Sem banco, sem relógio e sem depender do fuso do processo.
 */

export interface MapperAccount {
  type: PluggyAccountType;
  /** Moeda da conta na Pluggy (ex.: "BRL"). */
  currencyCode: string;
}

export interface MapperOptions {
  excludePatterns?: ExcludePattern[] | CompiledExcludePatterns;
  /**
   * Pendentes (no cartão: ainda não faturados) entram como lançamento provisório.
   * Padrão true. Com false, PENDING vira preDisposition pending.
   */
  importPending?: boolean;
}

export class PluggyMappingError extends Error {
  constructor(reason: string) {
    // Só o motivo; nunca id, descrição ou valor.
    super("Mapeamento Pluggy: " + reason);
    this.name = "PluggyMappingError";
  }
}

const LEDGER_CURRENCY = "BRL";
const MAX_INSTALLMENTS = 48;

// Fallback de parcela pela descrição: só com marcador explícito ("PARCELA 2/5",
// "PARC 3 DE 4"). Números soltos ("10/12") não contam.
const EXPLICIT_INSTALLMENT = /\bPARC(?:ELA)?\.?\s*(\d{1,2})\s*(?:\/|DE\b)\s*(\d{1,2})\b/i;

function isCompiled(value: MapperOptions["excludePatterns"]): value is CompiledExcludePatterns {
  return !!value && !Array.isArray(value) && Array.isArray((value as CompiledExcludePatterns).matchers);
}

function cleanId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Única escolha da data do razão (Transaction.date). Parcela com data de compra:
 * data da compra + (N−1) meses, sem transbordo de fim de mês (mesma convenção das
 * projeções e do histórico). Demais casos: data do registro.
 */
export function resolveLedgerDate(input: {
  sourceDate: string;
  purchaseDate: string | null;
  installmentNumber: number | null;
}): string {
  if (input.purchaseDate && input.installmentNumber !== null && input.installmentNumber >= 1) {
    return addMonthsToDate(input.purchaseDate, input.installmentNumber - 1);
  }
  return input.sourceDate;
}

function resolveAmount(
  tx: PluggyTransaction,
  account: MapperAccount
): { amount: number; currencyCode: string; inLedgerCurrency: boolean } {
  const accountCurrency = account.currencyCode.trim().toUpperCase();
  const txCurrency = tx.currencyCode.trim().toUpperCase();
  if (accountCurrency === LEDGER_CURRENCY) {
    if (txCurrency === LEDGER_CURRENCY) {
      return { amount: tx.amount, currencyCode: LEDGER_CURRENCY, inLedgerCurrency: true };
    }
    const converted = tx.amountInAccountCurrency;
    if (typeof converted === "number" && Number.isFinite(converted)) {
      return { amount: converted, currencyCode: LEDGER_CURRENCY, inLedgerCurrency: true };
    }
  }
  return { amount: tx.amount, currencyCode: txCurrency, inLedgerCurrency: false };
}

function validInstallment(n: number, t: number): boolean {
  return Number.isInteger(n) && Number.isInteger(t) && t >= 2 && t <= MAX_INSTALLMENTS && n >= 1 && n <= t;
}

/**
 * Parcelas: com creditCardMetadata presente, vale só o metadado (sem números = à vista;
 * números inconsistentes = revisão). Sem metadado, e só em cartão, a descrição conta
 * apenas com marcador explícito de parcela.
 */
function resolveInstallment(
  tx: PluggyTransaction,
  accountType: PluggyAccountType,
  description: string
): { installmentNumber: number | null; totalInstallments: number | null; invalid: boolean } {
  const none = { installmentNumber: null, totalInstallments: null, invalid: false };
  const meta = tx.creditCardMetadata;
  if (meta) {
    const n = meta.installmentNumber;
    const t = meta.totalInstallments;
    const hasN = n !== null && n !== undefined;
    const hasT = t !== null && t !== undefined;
    if (!hasN && !hasT) return none;
    if (hasN && hasT) {
      if (validInstallment(n!, t!)) return { installmentNumber: n!, totalInstallments: t!, invalid: false };
      if (t === 1 && n === 1) return none;
    }
    return { ...none, invalid: true };
  }
  if (accountType === "CREDIT") {
    const match = EXPLICIT_INSTALLMENT.exec(description);
    if (match) {
      const n = Number(match[1]);
      const t = Number(match[2]);
      if (validInstallment(n, t)) return { installmentNumber: n, totalInstallments: t, invalid: false };
    }
  }
  return none;
}

export function mapPluggyTransaction(
  tx: PluggyTransaction,
  account: MapperAccount,
  options: MapperOptions = {}
): MappedPluggyTransaction {
  if (account.type !== "BANK" && account.type !== "CREDIT") {
    throw new PluggyMappingError("tipo de conta não suportado");
  }
  const sourceDate = toBusinessDate(tx.date);
  if (!sourceDate) throw new PluggyMappingError("data do registro inválida");

  const importPending = options.importPending ?? true;
  const meta = tx.creditCardMetadata ?? null;
  const purchaseDate = meta?.purchaseDate ? toBusinessDate(meta.purchaseDate) : null;
  const description = tx.description.trim();
  // Sinal varia por tipo de conta (conta: débito negativo; cartão: débito positivo):
  // a direção vem só de type e o valor é sempre absoluto.
  const { amount, currencyCode, inLedgerCurrency } = resolveAmount(tx, account);
  const amountCents = Math.round(Math.abs(amount) * 100);
  const installment = resolveInstallment(tx, account.type, description);
  const { installmentNumber, totalInstallments } = installment;

  const patterns = isCompiled(options.excludePatterns)
    ? options.excludePatterns
    : compileExcludePatterns(options.excludePatterns ?? []);
  const classification = classifyPluggyTransaction(
    { accountType: account.type, direction: tx.type, description, operationType: tx.operationType },
    patterns
  );

  let preDisposition = classification.preDisposition;
  if (tx.status === "PENDING" && !importPending) {
    preDisposition = { disposition: "pending", reasonCode: "pending" };
  } else if (!inLedgerCurrency) {
    preDisposition = { disposition: "needs_review", reasonCode: "foreign_currency" };
  } else if (amountCents === 0) {
    preDisposition = { disposition: "needs_review", reasonCode: "zero_amount" };
  } else if (!preDisposition && installment.invalid) {
    preDisposition = { disposition: "needs_review", reasonCode: "invalid_installment" };
  }

  return {
    externalId: tx.id,
    providerId: cleanId(tx.providerId),
    accountType: account.type,
    sourceStatus: tx.status,
    sourceDate,
    purchaseDate,
    ledgerDate: resolveLedgerDate({ sourceDate, purchaseDate, installmentNumber }),
    description,
    amountCents,
    currencyCode,
    direction: tx.type,
    type: classification.type,
    creditKind: classification.creditKind,
    billId: cleanId(meta?.billId),
    installmentNumber,
    totalInstallments,
    preDisposition,
  };
}
