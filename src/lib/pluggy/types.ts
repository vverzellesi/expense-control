import { z } from "zod";

/**
 * Schemas das respostas da API da Pluggy usadas pelo app.
 *
 * Tolerantes a campos extras (looseObject preserva o que vier além) e rígidos
 * nos campos que o mapeamento lê: um registro sem eles invalida a resposta
 * inteira, em vez de virar dado parcial.
 */

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

export const authResponseSchema = z.looseObject({
  apiKey: z.string().min(1),
});

export const itemSchema = z.looseObject({
  id: z.string().min(1),
  status: z.string(),
  executionStatus: nullableString,
  lastUpdatedAt: nullableString,
  updatedAt: nullableString,
  createdAt: nullableString,
  consentExpiresAt: nullableString,
});
export type PluggyItem = z.infer<typeof itemSchema>;

export const accountSchema = z.looseObject({
  id: z.string().min(1),
  itemId: z.string().optional(),
  type: z.string(),
  subtype: nullableString,
  currencyCode: z.string().min(1),
});
export type PluggyAccount = z.infer<typeof accountSchema>;

export const creditCardMetadataSchema = z.looseObject({
  installmentNumber: nullableNumber,
  totalInstallments: nullableNumber,
  totalAmount: nullableNumber,
  purchaseDate: nullableString,
  billId: nullableString,
});

export const transactionSchema = z.looseObject({
  id: z.string().min(1),
  accountId: z.string().optional(),
  description: z.string(),
  currencyCode: z.string().min(1),
  amount: z.number().finite(),
  amountInAccountCurrency: nullableNumber,
  date: z.string().min(1),
  type: z.enum(["DEBIT", "CREDIT"]),
  status: z.enum(["PENDING", "POSTED"]),
  providerId: nullableString,
  /** Classificação do provedor (ex.: PAGAMENTO_FATURA, ESTORNO, OUTROS). */
  operationType: nullableString,
  createdAt: nullableString,
  creditCardMetadata: creditCardMetadataSchema.nullable().optional(),
});
export type PluggyTransaction = z.infer<typeof transactionSchema>;

export const billSchema = z.looseObject({
  id: z.string().min(1),
  dueDate: z.string().min(1),
  totalAmount: z.number().finite(),
  totalAmountCurrencyCode: nullableString,
});
export type PluggyBill = z.infer<typeof billSchema>;

/** Listas paginadas por número de página (/accounts, /bills); sem totalPages a resposta é recusada. */
export function pagedResponseSchema<T extends z.ZodTypeAny>(item: T) {
  return z.looseObject({
    results: z.array(item),
    page: z.number().int().optional(),
    totalPages: z.number().int().min(0),
    total: z.number().int().optional(),
  });
}

/** Lista paginada por cursor (/v2/transactions). */
export const transactionCursorPageSchema = z.looseObject({
  results: z.array(transactionSchema),
  next: z.string().nullable().optional(),
});

export type PluggyAccountType = "BANK" | "CREDIT";

/** O que a leitura completa de uma conta cobriu, para detectar histórico truncado. */
export interface TransactionCoverage {
  total: number;
  /** Menor e maior data (YYYY-MM-DD, fuso de São Paulo) vistas; null se não houve registro. */
  minDate: string | null;
  maxDate: string | null;
}

export interface TransactionListResult {
  transactions: PluggyTransaction[];
  coverage: TransactionCoverage;
}

export type UserPatternAction = "exclude" | "transfer";

/**
 * Padrão do usuário (vem de Settings, chave pluggy.excludePatterns).
 * Texto literal por padrão, comparado sem diferenciar maiúsculas nem acentos;
 * "/expressão/" ou "/expressão/i" é tratado como regex (com limites, ver rules.ts).
 * action: "exclude" → excluded/user_pattern; "transfer" → tipo TRANSFER.
 */
export interface ExcludePattern {
  pattern: string;
  accountType?: PluggyAccountType;
  action: UserPatternAction;
}

/** Fronteira entre mapeamento e persistência (contrato v2). Não mudar nomes nem tipos. */
export interface MappedPluggyTransaction {
  externalId: string;
  providerId: string | null;
  accountType: "BANK" | "CREDIT";
  sourceStatus: "PENDING" | "POSTED";
  sourceDate: string; // YYYY-MM-DD no fuso America/Sao_Paulo
  purchaseDate: string | null; // YYYY-MM-DD
  ledgerDate: string; // data que vai para Transaction.date
  description: string; // texto do banco, só com trim
  amountCents: number; // inteiro positivo, na moeda da conta
  currencyCode: string;
  direction: "DEBIT" | "CREDIT";
  type: "EXPENSE" | "INCOME" | "TRANSFER";
  creditKind: "refund" | "bill_payment" | "other" | "unknown" | null;
  billId: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  preDisposition: null | {
    disposition: "excluded" | "needs_review" | "pending";
    reasonCode: string;
  };
}
