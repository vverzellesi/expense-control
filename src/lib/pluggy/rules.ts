import { detectTransfer } from "@/lib/categorizer";
import { isCarryoverTransaction } from "@/lib/carryover-detector";
import type {
  ExcludePattern,
  MappedPluggyTransaction,
  PluggyAccountType,
  UserPatternAction,
} from "./types";

/**
 * Classificação pura de registros da Pluggy: tipo, natureza do crédito no cartão e
 * destino prévio (preDisposition), mais as regras de lote sobre a lista já mapeada.
 * Sem banco e sem padrões do usuário no código: os padrões chegam como argumento
 * (Settings, chave pluggy.excludePatterns).
 */

export const MAX_USER_PATTERN_LENGTH = 200;
/** Descrições são cortadas antes de testar padrões do usuário (limita custo de regex). */
const MAX_MATCH_INPUT_LENGTH = 500;

// Indicadores de crédito de detectTransactionType (src/lib/statement-parser.ts), onde
// estorno em fatura de cartão entra como INCOME, mais equivalentes em inglês.
const REFUND_PATTERNS: RegExp[] = [
  /ESTORNO/i,
  /DEVOLU[CÇ][AÃ]O/i,
  /REEMBOLSO/i,
  /CASHBACK/i,
  /\bREFUND/i,
  /\bREVERSAL\b/i,
  /CHARGEBACK/i,
];

// Crédito no cartão que representa o pagamento da própria fatura.
const CARD_BILL_PAYMENT_PATTERNS: RegExp[] = [
  /PAG(?:AMENTO|TO?)?\s*(?:DE\s*)?(?:FATURA|FAT\b|CART[AÃ]O)/i,
  /PAG(?:AMENTO|TO?)\s*(?:RECEBIDO|EFETUADO)/i,
  /INCLUS[AÃ]O\s*(?:DE\s*)?PAGAMENTO/i,
  /D[EÉ]BITO\s*AUTO(?:M[AÁ]TICO)?\s*(?:CART[AÃ]O|FATURA)/i,
];

// Crédito do tipo pagamento que na verdade é o parcelamento de uma compra.
const PURCHASE_INSTALLMENT_PLAN_PATTERNS: RegExp[] = [
  /PARCELAMENTO\s+(?:DE\s+)?COMPRAS?/i,
  /COMPRAS?\s+PARCELADAS?/i,
];

// Encargos são despesa, mesmo quando a descrição também cita rotativo.
const CHARGE_PATTERNS: RegExp[] = [/JUROS/i, /ENCARGO/i, /\bIOF\b/i, /MULTA/i, /TARIFA/i, /ANUIDADE/i];

// Débitos que podem ser estornados integralmente (regra de lote a).
const FEE_PATTERNS: RegExp[] = [/TARIFA/i, /ANUIDADE/i];

const FEE_REFUND_WINDOW_DAYS = 35;
const BILL_PAYMENT_WINDOW_DAYS = 4;

export interface CompiledExcludePattern {
  accountType?: PluggyAccountType;
  action: UserPatternAction;
  test: (normalizedDescription: string, rawDescription: string) => boolean;
}

export interface CompiledExcludePatterns {
  matchers: CompiledExcludePattern[];
  /** Quantos padrões foram ignorados por formato inválido ou regex arriscada. */
  rejected: number;
}

export interface ClassificationInput {
  accountType: PluggyAccountType;
  direction: "DEBIT" | "CREDIT";
  description: string;
  /** operationType da Pluggy (ex.: PAGAMENTO_FATURA, ESTORNO, OUTROS), quando vier. */
  operationType?: string | null;
}

export type Classification = Pick<MappedPluggyTransaction, "type" | "creditKind" | "preDisposition">;

const matchesAny = (patterns: RegExp[], value: string) => patterns.some((pattern) => pattern.test(value));

/** Maiúsculas, sem acentos e com espaços colapsados. */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Recusa regex com forma típica de retrocesso catastrófico: grupo quantificado por
 * *, + ou {n,m} (ex.: "(a+)+"), referência para trás, ou mais de um quantificador
 * ilimitado (*, +, {n,}) no padrão inteiro (ex.: ".*.*Z").
 */
function isRiskyRegex(body: string): boolean {
  if (/\\[1-9]|\\k</.test(body)) return true;
  let inClass = false;
  let unbounded = 0;
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === "\\") {
      i++;
      continue;
    }
    if (inClass) {
      if (char === "]") inClass = false;
      continue;
    }
    if (char === "[") {
      inClass = true;
      continue;
    }
    if (char === ")" && /[*+{]/.test(body[i + 1] ?? "")) return true;
    if (char === "*" || char === "+" || (char === "{" && /^\{\d*,\}/.test(body.slice(i)))) {
      unbounded++;
      if (unbounded > 1) return true;
    }
  }
  return false;
}

function compileOne(entry: unknown): CompiledExcludePattern | null {
  if (!entry || typeof entry !== "object") return null;
  const { pattern, accountType, action } = entry as Partial<ExcludePattern>;
  if (typeof pattern !== "string") return null;
  if (action !== "exclude" && action !== "transfer") return null;
  const trimmed = pattern.trim();
  if (trimmed === "" || trimmed.length > MAX_USER_PATTERN_LENGTH) return null;
  if (accountType !== undefined && accountType !== "BANK" && accountType !== "CREDIT") return null;

  const regexForm = /^\/(.+)\/(i?)$/.exec(trimmed);
  if (regexForm) {
    const body = regexForm[1];
    if (isRiskyRegex(body)) return null;
    let regex: RegExp;
    try {
      regex = new RegExp(body, "i");
    } catch {
      return null;
    }
    return { accountType, action, test: (_normalized, raw) => regex.test(raw) };
  }

  const literal = normalizeForMatch(trimmed);
  if (literal === "") return null;
  return { accountType, action, test: (normalized) => normalized.includes(literal) };
}

/**
 * Valida e compila os padrões do usuário ({ pattern, accountType?, action }).
 * Texto literal por padrão; "/expressão/" ou "/expressão/i" é regex. Entradas
 * inválidas são ignoradas e contadas em rejected.
 */
export function compileExcludePatterns(patterns: unknown): CompiledExcludePatterns {
  if (!Array.isArray(patterns)) return { matchers: [], rejected: 0 };
  const matchers: CompiledExcludePattern[] = [];
  let rejected = 0;
  for (const entry of patterns) {
    const compiled = compileOne(entry);
    if (compiled) matchers.push(compiled);
    else rejected++;
  }
  return { matchers, rejected };
}

/** Ação do primeiro padrão do usuário que casa, ou null. */
export function matchUserPattern(
  description: string,
  accountType: PluggyAccountType,
  patterns: CompiledExcludePatterns
): UserPatternAction | null {
  const raw = description.slice(0, MAX_MATCH_INPUT_LENGTH);
  const normalized = normalizeForMatch(raw);
  const matcher = patterns.matchers.find(
    (candidate) =>
      (candidate.accountType === undefined || candidate.accountType === accountType) &&
      candidate.test(normalized, raw)
  );
  return matcher ? matcher.action : null;
}

export function isRefundDescription(description: string): boolean {
  return matchesAny(REFUND_PATTERNS, description);
}

export function isCardBillPayment(description: string): boolean {
  return matchesAny(CARD_BILL_PAYMENT_PATTERNS, description);
}

export function isChargeDescription(description: string): boolean {
  return matchesAny(CHARGE_PATTERNS, description);
}

interface BaseClassification {
  type: Classification["type"];
  creditKind: Classification["creditKind"];
  reviewReason: string | null;
}

function classifyCardCredit(description: string, operationType: string | null): BaseClassification {
  if (operationType === "PAGAMENTO_FATURA") {
    if (matchesAny(PURCHASE_INSTALLMENT_PLAN_PATTERNS, description)) {
      return { type: "INCOME", creditKind: "other", reviewReason: "purchase_installment_plan" };
    }
    return { type: "TRANSFER", creditKind: "bill_payment", reviewReason: null };
  }
  if (operationType === "ESTORNO") return { type: "INCOME", creditKind: "refund", reviewReason: null };

  const refund = isRefundDescription(description);
  const billPayment = isCardBillPayment(description);
  // Os dois sinais juntos são ambíguos: fica para revisão.
  if (refund && !billPayment) return { type: "INCOME", creditKind: "refund", reviewReason: null };
  if (billPayment && !refund) return { type: "TRANSFER", creditKind: "bill_payment", reviewReason: null };
  return { type: "INCOME", creditKind: "unknown", reviewReason: "credit_unknown" };
}

function baseClassification(input: ClassificationInput): BaseClassification {
  const { accountType, direction, description } = input;
  if (accountType === "BANK") {
    if (detectTransfer(description)) return { type: "TRANSFER", creditKind: null, reviewReason: null };
    return { type: direction === "DEBIT" ? "EXPENSE" : "INCOME", creditKind: null, reviewReason: null };
  }
  if (direction === "DEBIT") return { type: "EXPENSE", creditKind: null, reviewReason: null };
  const operationType = input.operationType ? input.operationType.trim().toUpperCase() : null;
  return classifyCardCredit(description, operationType);
}

/**
 * Ordem: padrão do usuário (exclude → excluded/user_pattern; transfer → TRANSFER sem
 * destino prévio) → parcelamento de compra → saldo transportado (encargos ficam como
 * despesa) → pagamento de fatura no cartão → crédito desconhecido no cartão.
 * Estorno reconhecido segue sem destino prévio (INCOME).
 */
export function classifyPluggyTransaction(
  input: ClassificationInput,
  patterns: CompiledExcludePatterns = { matchers: [], rejected: 0 }
): Classification {
  const base = baseClassification(input);
  const userAction = matchUserPattern(input.description, input.accountType, patterns);

  if (userAction === "exclude") {
    return {
      type: base.type,
      creditKind: base.creditKind,
      preDisposition: { disposition: "excluded", reasonCode: "user_pattern" },
    };
  }
  if (userAction === "transfer") {
    const cardCredit = input.accountType === "CREDIT" && input.direction === "CREDIT";
    return { type: "TRANSFER", creditKind: cardCredit ? "other" : null, preDisposition: null };
  }

  let preDisposition: Classification["preDisposition"] = null;
  if (base.reviewReason === "purchase_installment_plan") {
    preDisposition = { disposition: "needs_review", reasonCode: "purchase_installment_plan" };
  } else if (isCarryoverTransaction(input.description) && !isChargeDescription(input.description)) {
    preDisposition = { disposition: "needs_review", reasonCode: "carryover" };
  } else if (base.creditKind === "bill_payment") {
    preDisposition = { disposition: "excluded", reasonCode: "bill_payment_credit" };
  } else if (base.reviewReason === "credit_unknown") {
    preDisposition = { disposition: "needs_review", reasonCode: "credit_unknown" };
  }
  return { type: base.type, creditKind: base.creditKind, preDisposition };
}

// ------------------------------------------------------------- regras de lote

export interface BatchEntry {
  /** Conta da Pluggy de onde o registro veio (só para agrupar; nunca é registrado). */
  accountId: string;
  /** Item (conexão) da conta; o pareamento de pagamento de fatura exige o mesmo item. */
  itemId?: string | null;
  operationType?: string | null;
  mapped: MappedPluggyTransaction;
}

function dayNumber(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function daysApart(a: string, b: string): number {
  return Math.abs(dayNumber(a) - dayNumber(b));
}

function compareEntries(a: BatchEntry, b: BatchEntry): number {
  if (a.mapped.sourceDate !== b.mapped.sourceDate) return a.mapped.sourceDate < b.mapped.sourceDate ? -1 : 1;
  if (a.mapped.externalId !== b.mapped.externalId) return a.mapped.externalId < b.mapped.externalId ? -1 : 1;
  return 0;
}

/** Escolhe, entre candidatos livres, o mais próximo em data (desempate por data e id). */
function pickClosest(
  target: BatchEntry,
  candidates: number[],
  entries: BatchEntry[],
  used: Set<number>,
  preferred?: (entry: BatchEntry) => boolean
): number | null {
  let best: number | null = null;
  for (const index of candidates) {
    if (used.has(index)) continue;
    if (best === null) {
      best = index;
      continue;
    }
    const current = entries[index];
    const incumbent = entries[best];
    if (preferred) {
      const p1 = preferred(current);
      const p2 = preferred(incumbent);
      if (p1 !== p2) {
        if (p1) best = index;
        continue;
      }
    }
    const d1 = daysApart(current.mapped.sourceDate, target.mapped.sourceDate);
    const d2 = daysApart(incumbent.mapped.sourceDate, target.mapped.sourceDate);
    if (d1 < d2 || (d1 === d2 && compareEntries(current, entries[best]) < 0)) best = index;
  }
  return best;
}

function isRefundEntry(entry: BatchEntry): boolean {
  const { mapped } = entry;
  if (mapped.direction !== "CREDIT") return false;
  if (mapped.creditKind === "refund") return true;
  if (entry.operationType && entry.operationType.trim().toUpperCase() === "ESTORNO") return true;
  return mapped.accountType === "BANK" && isRefundDescription(mapped.description);
}

/**
 * Regras sobre a lista mapeada de um item (puras, determinísticas, um para um):
 * (a) estorno integral de tarifa: crédito de estorno com o mesmo valor de um débito de
 *     tarifa na mesma conta e na mesma fatura (ou até 35 dias) → os dois
 *     excluded/offsetting_refund; tarifa sem par continua despesa.
 * (b) pagamento de fatura: débito na conta corrente com o mesmo valor de um crédito de
 *     pagamento no cartão do mesmo item, até 4 dias de diferença → o débito vira
 *     excluded/bill_payment_debit.
 * Só registros ainda sem destino prévio participam como lado a ser marcado.
 * Devolve uma lista nova, na mesma ordem.
 */
export function applyBatchRules(entries: BatchEntry[]): MappedPluggyTransaction[] {
  const result = entries.map((entry) => ({ ...entry.mapped }));
  const order = entries.map((_entry, index) => index).sort((a, b) => compareEntries(entries[a], entries[b]));

  // (a) tarifa estornada
  const fees = order.filter((index) => {
    const { mapped } = entries[index];
    return (
      mapped.preDisposition === null &&
      mapped.direction === "DEBIT" &&
      matchesAny(FEE_PATTERNS, mapped.description) &&
      !isRefundDescription(mapped.description)
    );
  });
  const refunds = order.filter((index) => entries[index].mapped.preDisposition === null && isRefundEntry(entries[index]));
  const usedRefunds = new Set<number>();
  for (const feeIndex of fees) {
    const fee = entries[feeIndex];
    const candidates = refunds.filter((refundIndex) => {
      const refund = entries[refundIndex];
      if (refund.accountId !== fee.accountId) return false;
      if (refund.mapped.amountCents !== fee.mapped.amountCents) return false;
      if (refund.mapped.currencyCode !== fee.mapped.currencyCode) return false;
      if (fee.mapped.billId && refund.mapped.billId) return fee.mapped.billId === refund.mapped.billId;
      return daysApart(fee.mapped.sourceDate, refund.mapped.sourceDate) <= FEE_REFUND_WINDOW_DAYS;
    });
    const match = pickClosest(fee, candidates, entries, usedRefunds);
    if (match === null) continue;
    usedRefunds.add(match);
    const offsetting = { disposition: "excluded" as const, reasonCode: "offsetting_refund" };
    result[feeIndex] = { ...result[feeIndex], preDisposition: offsetting };
    result[match] = { ...result[match], preDisposition: offsetting };
  }

  // (b) débito do pagamento de fatura na conta corrente
  const billCredits = order.filter((index) => {
    const { mapped } = entries[index];
    return (
      mapped.accountType === "CREDIT" &&
      mapped.direction === "CREDIT" &&
      mapped.creditKind === "bill_payment" &&
      mapped.preDisposition?.reasonCode === "bill_payment_credit"
    );
  });
  const bankDebits = order.filter((index) => {
    const mapped = result[index]; // já considera o que a regra (a) marcou
    return mapped.accountType === "BANK" && mapped.direction === "DEBIT" && mapped.preDisposition === null;
  });
  const usedDebits = new Set<number>();
  const looksLikePayment = (entry: BatchEntry) =>
    isCardBillPayment(entry.mapped.description) || detectTransfer(entry.mapped.description);
  for (const creditIndex of billCredits) {
    const credit = entries[creditIndex];
    const candidates = bankDebits.filter((debitIndex) => {
      const debit = entries[debitIndex];
      if (credit.itemId && debit.itemId && credit.itemId !== debit.itemId) return false;
      if (debit.mapped.amountCents !== credit.mapped.amountCents) return false;
      if (debit.mapped.currencyCode !== credit.mapped.currencyCode) return false;
      return daysApart(debit.mapped.sourceDate, credit.mapped.sourceDate) <= BILL_PAYMENT_WINDOW_DAYS;
    });
    const match = pickClosest(credit, candidates, entries, usedDebits, looksLikePayment);
    if (match === null) continue;
    usedDebits.add(match);
    result[match] = {
      ...result[match],
      preDisposition: { disposition: "excluded", reasonCode: "bill_payment_debit" },
    };
  }

  return result;
}
