import { detectTransfer } from "@/lib/categorizer";
import { isCarryoverTransaction } from "@/lib/carryover-detector";
import type { ExcludePattern, MappedPluggyTransaction, PluggyAccountType } from "./types";

/**
 * Classificação pura de um registro da Pluggy: tipo, natureza do crédito no cartão
 * e destino prévio (preDisposition). Sem banco e sem padrões do usuário no código:
 * os padrões de exclusão chegam como argumento (Settings, chave pluggy.excludePatterns).
 */

export const MAX_USER_PATTERN_LENGTH = 200;
/** Descrições são cortadas antes de testar padrões do usuário (limita custo de regex). */
const MAX_MATCH_INPUT_LENGTH = 500;

// Mesmos indicadores de crédito de detectTransactionType (src/lib/statement-parser.ts),
// onde estorno em fatura de cartão entra como INCOME.
const REFUND_PATTERNS: RegExp[] = [/ESTORNO/i, /DEVOLU[CÇ][AÃ]O/i, /REEMBOLSO/i, /CASHBACK/i];

// Crédito no cartão que representa o pagamento da própria fatura.
const CARD_BILL_PAYMENT_PATTERNS: RegExp[] = [
  /PAG(?:AMENTO|TO?)?\s*(?:DE\s*)?(?:FATURA|FAT\b|CART[AÃ]O)/i,
  /PAG(?:AMENTO|TO?)\s*(?:RECEBIDO|EFETUADO)/i,
  /INCLUS[AÃ]O\s*(?:DE\s*)?PAGAMENTO/i,
  /D[EÉ]BITO\s*AUTO(?:M[AÁ]TICO)?\s*(?:CART[AÃ]O|FATURA)/i,
];

export interface CompiledExcludePattern {
  accountType?: PluggyAccountType;
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
}

export type Classification = Pick<MappedPluggyTransaction, "type" | "creditKind" | "preDisposition">;

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
 * Regex com grupo quantificado por *, + ou {n,m} (ex.: "(a+)+") é recusada:
 * é a forma típica de retrocesso catastrófico. Referências para trás também.
 */
function isRiskyRegex(body: string): boolean {
  if (/\\[1-9]|\\k</.test(body)) return true;
  let inClass = false;
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
  }
  return false;
}

function compileOne(entry: unknown): CompiledExcludePattern | null {
  if (!entry || typeof entry !== "object") return null;
  const { pattern, accountType } = entry as Partial<ExcludePattern>;
  if (typeof pattern !== "string") return null;
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
    return { accountType, test: (_normalized, raw) => regex.test(raw) };
  }

  const literal = normalizeForMatch(trimmed);
  if (literal === "") return null;
  return { accountType, test: (normalized) => normalized.includes(literal) };
}

/** Valida e compila a lista de padrões do usuário; entradas inválidas são ignoradas e contadas. */
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

export function matchesUserExclusion(
  description: string,
  accountType: PluggyAccountType,
  patterns: CompiledExcludePatterns
): boolean {
  const raw = description.slice(0, MAX_MATCH_INPUT_LENGTH);
  const normalized = normalizeForMatch(raw);
  return patterns.matchers.some(
    (matcher) =>
      (matcher.accountType === undefined || matcher.accountType === accountType) &&
      matcher.test(normalized, raw)
  );
}

export function isCardRefund(description: string): boolean {
  return REFUND_PATTERNS.some((pattern) => pattern.test(description));
}

export function isCardBillPayment(description: string): boolean {
  return CARD_BILL_PAYMENT_PATTERNS.some((pattern) => pattern.test(description));
}

function baseClassification(input: ClassificationInput): Pick<Classification, "type" | "creditKind"> {
  const { accountType, direction, description } = input;
  if (accountType === "BANK") {
    if (detectTransfer(description)) return { type: "TRANSFER", creditKind: null };
    return { type: direction === "DEBIT" ? "EXPENSE" : "INCOME", creditKind: null };
  }
  if (direction === "DEBIT") return { type: "EXPENSE", creditKind: null };

  const refund = isCardRefund(description);
  const billPayment = isCardBillPayment(description);
  // Os dois sinais juntos são ambíguos: fica para revisão.
  if (refund && !billPayment) return { type: "INCOME", creditKind: "refund" };
  if (billPayment && !refund) return { type: "TRANSFER", creditKind: "bill_payment" };
  return { type: "INCOME", creditKind: "unknown" };
}

/**
 * Ordem do destino prévio: padrão do usuário → rotativo → pagamento de fatura no cartão
 * → crédito desconhecido no cartão. Estorno reconhecido segue sem destino prévio (INCOME).
 */
export function classifyPluggyTransaction(
  input: ClassificationInput,
  patterns: CompiledExcludePatterns = { matchers: [], rejected: 0 }
): Classification {
  const base = baseClassification(input);
  let preDisposition: Classification["preDisposition"] = null;

  if (matchesUserExclusion(input.description, input.accountType, patterns)) {
    preDisposition = { disposition: "excluded", reasonCode: "user_pattern" };
  } else if (isCarryoverTransaction(input.description)) {
    preDisposition = { disposition: "needs_review", reasonCode: "carryover" };
  } else if (base.creditKind === "bill_payment") {
    preDisposition = { disposition: "excluded", reasonCode: "bill_payment_credit" };
  } else if (base.creditKind === "unknown") {
    preDisposition = { disposition: "needs_review", reasonCode: "credit_unknown" };
  }

  return { ...base, preDisposition };
}
