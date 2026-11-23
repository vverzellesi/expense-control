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
/** Regex testa só o começo da descrição: mesmo com um quantificador o custo fica pequeno. */
const MAX_REGEX_INPUT_LENGTH = 200;

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
 * Recusa regex com risco de retrocesso caro: grupo quantificado (ex.: "(a+)+"),
 * referência para trás, ou mais de um quantificador no padrão inteiro (*, +, ?,
 * {n,} e {n,m}; repetição exata {n} não conta). Com no máximo um quantificador e a
 * descrição cortada em 500 caracteres, o custo fica limitado.
 */
function isRiskyRegex(body: string): boolean {
  if (/\\[1-9]|\\k</.test(body)) return true;
  let inClass = false;
  let quantifiers = 0;
  // O que veio antes: "open" = "(" sem escape, "quant" = quantificador, "atom" = qualquer outro.
  let previous: "open" | "quant" | "atom" = "atom";
  for (let i = 0; i < body.length; i++) {
    const char = body[i];
    if (char === "\\") {
      i++;
      previous = "atom";
      continue;
    }
    if (inClass) {
      if (char === "]") {
        inClass = false;
        previous = "atom";
      }
      continue;
    }
    if (char === "[") {
      inClass = true;
      continue;
    }
    if (char === ")" && /[*+?{]/.test(body[i + 1] ?? "")) return true;
    let isQuantifier = false;
    if (char === "*" || char === "+") isQuantifier = true;
    // "?" logo depois de "(" sem escape é sintaxe de grupo; depois de quantificador é modo preguiçoso.
    else if (char === "?") isQuantifier = previous === "atom";
    else if (char === "{") isQuantifier = /^\{\d*,\d*\}/.test(body.slice(i));
    if (isQuantifier) {
      if (++quantifiers > 1) return true;
      if (char === "{") i = body.indexOf("}", i);
      previous = "quant";
    } else {
      // "?" que não é quantificador (sintaxe de grupo ou modo preguiçoso) mantém o estado anterior.
      if (char !== "?") previous = char === "(" ? "open" : "atom";
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
    return { accountType, action, test: (_normalized, raw) => regex.test(raw.slice(0, MAX_REGEX_INPUT_LENGTH)) };
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
 * destino prévio) → parcelamento de compra → pagamento por operationType → saldo
 * transportado no cartão (encargos ficam como despesa) → pagamento pela descrição →
 * crédito desconhecido no cartão.
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

  const operationType = input.operationType ? input.operationType.trim().toUpperCase() : null;
  // Saldo transportado só existe no cartão; encargos continuam despesa.
  const carryover =
    input.accountType === "CREDIT" &&
    isCarryoverTransaction(input.description) &&
    !isChargeDescription(input.description);

  let preDisposition: Classification["preDisposition"] = null;
  if (base.reviewReason === "purchase_installment_plan") {
    preDisposition = { disposition: "needs_review", reasonCode: "purchase_installment_plan" };
  } else if (base.creditKind === "bill_payment" && operationType === "PAGAMENTO_FATURA") {
    preDisposition = { disposition: "excluded", reasonCode: "bill_payment_credit" };
  } else if (carryover) {
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
  itemId: string;
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

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

interface CandidatePair {
  left: number;
  right: number;
  preferred: boolean;
  distance: number;
}

/**
 * Atribuição um para um sobre todos os pares válidos, do mais próximo para o mais
 * distante (com preferência, se houver), desempatando por data e id. Assim um registro
 * não "rouba" o par de outro que está mais perto dele.
 */
function assignPairs(pairs: CandidatePair[], entries: BatchEntry[]): CandidatePair[] {
  const key = (index: number) => entries[index].mapped;
  const sorted = [...pairs].sort(
    (a, b) =>
      Number(b.preferred) - Number(a.preferred) ||
      a.distance - b.distance ||
      compareText(key(a.left).sourceDate, key(b.left).sourceDate) ||
      compareText(key(a.left).externalId, key(b.left).externalId) ||
      compareText(key(a.right).sourceDate, key(b.right).sourceDate) ||
      compareText(key(a.right).externalId, key(b.right).externalId)
  );
  const usedLeft = new Set<number>();
  const usedRight = new Set<number>();
  const chosen: CandidatePair[] = [];
  for (const pair of sorted) {
    if (usedLeft.has(pair.left) || usedRight.has(pair.right)) continue;
    usedLeft.add(pair.left);
    usedRight.add(pair.right);
    chosen.push(pair);
  }
  return chosen;
}

/**
 * Estorno elegível para anular uma tarifa: operationType ESTORNO; na conta corrente,
 * também a palavra ESTORNO na descrição; no cartão, a descrição só vale sem operationType.
 * Cashback, devolução etc. não contam.
 */
function isFeeRefundEntry(entry: BatchEntry): boolean {
  const { mapped } = entry;
  if (mapped.direction !== "CREDIT") return false;
  const operationType = entry.operationType ? entry.operationType.trim().toUpperCase() : null;
  if (operationType === "ESTORNO") return true;
  if (!/ESTORNO/i.test(mapped.description)) return false;
  return mapped.accountType === "BANK" || !operationType;
}

/**
 * Regras sobre a lista mapeada (puras, determinísticas, um para um):
 * (a) estorno integral de tarifa: crédito de estorno com o mesmo valor de um débito de
 *     tarifa na mesma conta e na mesma fatura (ou até 35 dias) → os dois
 *     excluded/offsetting_refund; tarifa sem par continua despesa.
 * (b) pagamento de fatura: débito na conta corrente com o mesmo valor de um crédito de
 *     pagamento no cartão do mesmo item, até 4 dias de diferença → o débito vira
 *     excluded/bill_payment_debit. O crédito é reconhecido pelo creditKind, mesmo que
 *     esteja pendente.
 * Só registros ainda sem destino prévio são marcados. Devolve uma lista nova, na mesma ordem.
 */
export function applyBatchRules(entries: BatchEntry[]): MappedPluggyTransaction[] {
  const result = entries.map((entry) => ({ ...entry.mapped }));
  const indexes = entries.map((_entry, index) => index);

  // (a) tarifa estornada
  const fees = indexes.filter((index) => {
    const { mapped } = entries[index];
    return (
      mapped.preDisposition === null &&
      mapped.direction === "DEBIT" &&
      matchesAny(FEE_PATTERNS, mapped.description) &&
      !isRefundDescription(mapped.description)
    );
  });
  const refunds = indexes.filter((index) => entries[index].mapped.preDisposition === null && isFeeRefundEntry(entries[index]));
  const feePairs: CandidatePair[] = [];
  for (const feeIndex of fees) {
    const fee = entries[feeIndex];
    for (const refundIndex of refunds) {
      const refund = entries[refundIndex];
      if (refund.accountId !== fee.accountId) continue;
      if (refund.mapped.amountCents !== fee.mapped.amountCents) continue;
      if (refund.mapped.currencyCode !== fee.mapped.currencyCode) continue;
      const distance = daysApart(fee.mapped.sourceDate, refund.mapped.sourceDate);
      const sameBill = fee.mapped.billId && refund.mapped.billId ? fee.mapped.billId === refund.mapped.billId : null;
      if (sameBill === false) continue;
      if (sameBill === null && distance > FEE_REFUND_WINDOW_DAYS) continue;
      feePairs.push({ left: feeIndex, right: refundIndex, preferred: sameBill === true, distance });
    }
  }
  for (const pair of assignPairs(feePairs, entries)) {
    result[pair.left] = { ...result[pair.left], preDisposition: { disposition: "excluded", reasonCode: "offsetting_refund" } };
    result[pair.right] = { ...result[pair.right], preDisposition: { disposition: "excluded", reasonCode: "offsetting_refund" } };
  }

  // (b) débito do pagamento de fatura na conta corrente
  const billCredits = indexes.filter((index) => {
    const { mapped } = entries[index];
    return mapped.accountType === "CREDIT" && mapped.direction === "CREDIT" && mapped.creditKind === "bill_payment";
  });
  const bankDebits = indexes.filter((index) => {
    const mapped = result[index]; // já considera o que a regra (a) marcou
    return mapped.accountType === "BANK" && mapped.direction === "DEBIT" && mapped.preDisposition === null;
  });
  const paymentPairs: CandidatePair[] = [];
  for (const creditIndex of billCredits) {
    const credit = entries[creditIndex];
    for (const debitIndex of bankDebits) {
      const debit = entries[debitIndex];
      if (!credit.itemId || credit.itemId !== debit.itemId) continue;
      if (debit.mapped.amountCents !== credit.mapped.amountCents) continue;
      if (debit.mapped.currencyCode !== credit.mapped.currencyCode) continue;
      const distance = daysApart(debit.mapped.sourceDate, credit.mapped.sourceDate);
      if (distance > BILL_PAYMENT_WINDOW_DAYS) continue;
      const preferred = isCardBillPayment(debit.mapped.description) || detectTransfer(debit.mapped.description);
      paymentPairs.push({ left: creditIndex, right: debitIndex, preferred, distance });
    }
  }
  for (const pair of assignPairs(paymentPairs, entries)) {
    result[pair.right] = { ...result[pair.right], preDisposition: { disposition: "excluded", reasonCode: "bill_payment_debit" } };
  }

  return result;
}
