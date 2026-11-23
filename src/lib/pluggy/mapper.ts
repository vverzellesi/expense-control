import { detectInstallment } from "@/lib/categorizer";
import { toBusinessDate } from "./dates";
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
 * (contrato v2). Sem banco, sem relógio e sem depender do fuso do processo.
 */

export interface MapperAccount {
  type: PluggyAccountType;
  /** Moeda da conta na Pluggy (ex.: "BRL"). */
  currencyCode: string;
}

export interface MapperOptions {
  excludePatterns?: ExcludePattern[] | CompiledExcludePatterns;
}

export class PluggyMappingError extends Error {
  constructor(reason: string) {
    // Só o motivo; nunca id, descrição ou valor.
    super("Mapeamento Pluggy: " + reason);
    this.name = "PluggyMappingError";
  }
}

const LEDGER_CURRENCY = "BRL";

function isCompiled(value: MapperOptions["excludePatterns"]): value is CompiledExcludePatterns {
  return !!value && !Array.isArray(value) && Array.isArray((value as CompiledExcludePatterns).matchers);
}

function cleanId(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Única escolha da data do razão (Transaction.date). Hoje = data do registro;
 * fica isolada para ser ajustada depois da sonda com dados reais.
 */
export function resolveLedgerDate(input: {
  sourceDate: string;
  purchaseDate: string | null;
  accountType: PluggyAccountType;
  installmentNumber: number | null;
}): string {
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

function resolveInstallment(
  tx: PluggyTransaction,
  accountType: PluggyAccountType,
  description: string
): { installmentNumber: number | null; totalInstallments: number | null } {
  const meta = tx.creditCardMetadata;
  const n = meta?.installmentNumber;
  const t = meta?.totalInstallments;
  if (Number.isInteger(n) && Number.isInteger(t)) {
    if (t! >= 2 && n! >= 1 && n! <= t!) return { installmentNumber: n!, totalInstallments: t! };
    if (t === 1 && n === 1) return { installmentNumber: null, totalInstallments: null };
  }
  if (accountType === "CREDIT") {
    const detected = detectInstallment(description);
    if (detected.isInstallment && detected.currentInstallment && detected.totalInstallments) {
      return {
        installmentNumber: detected.currentInstallment,
        totalInstallments: detected.totalInstallments,
      };
    }
  }
  return { installmentNumber: null, totalInstallments: null };
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

  const meta = tx.creditCardMetadata ?? null;
  const purchaseDate = meta?.purchaseDate ? toBusinessDate(meta.purchaseDate) : null;
  const description = tx.description.trim();
  const { amount, currencyCode, inLedgerCurrency } = resolveAmount(tx, account);
  const amountCents = Math.round(Math.abs(amount) * 100);
  const { installmentNumber, totalInstallments } = resolveInstallment(tx, account.type, description);

  const patterns = isCompiled(options.excludePatterns)
    ? options.excludePatterns
    : compileExcludePatterns(options.excludePatterns ?? []);
  const classification = classifyPluggyTransaction(
    { accountType: account.type, direction: tx.type, description },
    patterns
  );

  let preDisposition = classification.preDisposition;
  if (tx.status === "PENDING") {
    preDisposition = { disposition: "pending", reasonCode: "pending" };
  } else if (!inLedgerCurrency) {
    preDisposition = { disposition: "needs_review", reasonCode: "foreign_currency" };
  } else if (amountCents === 0) {
    preDisposition = { disposition: "needs_review", reasonCode: "zero_amount" };
  }

  return {
    externalId: tx.id,
    providerId: cleanId(tx.providerId),
    accountType: account.type,
    sourceStatus: tx.status,
    sourceDate,
    purchaseDate,
    ledgerDate: resolveLedgerDate({ sourceDate, purchaseDate, accountType: account.type, installmentNumber }),
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
