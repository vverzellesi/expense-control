import { vi } from "vitest";
import type { CategoryAssistDb } from "./export";

export const OWNER = "user_test_owner";

export interface FakeTx {
  id: string;
  description: string;
  amount: number;
  updatedAt: Date;
  /** Padrão: meio-dia UTC de 2026-03-10. */
  date?: Date;
  /** Descrição da fonte no vínculo (padrão: a própria descrição). */
  sourceDescription?: string;
  /** Padrão: CREDIT. */
  accountType?: "CREDIT" | "BANK";
}

/** Linha da leitura do histórico (o filtro do banco é coberto pela suíte de Postgres). */
export interface FakeHistory {
  description: string;
  categoryId: string;
  sourceDescriptions?: string[];
  installmentId?: string;
  recurringExpenseId?: string;
}

export const baseTxs: FakeTx[] = [
  { id: "tx_test_1", description: "MERCADO EXEMPLO 12/03", amount: -37.42, updatedAt: new Date("2026-03-10T12:00:00.000Z") },
  { id: "tx_test_2", description: "POSTO FICTICIO", amount: -187.65, updatedAt: new Date("2026-03-11T12:00:00.000Z") },
  { id: "tx_test_3", description: "FARMACIA TESTE", amount: -1234.56, updatedAt: new Date("2026-03-12T12:00:00.000Z") },
];

export const baseCategories = [
  { id: "cat_test_food", name: "Alimentação" },
  { id: "cat_test_car", name: "Transporte" },
  { id: "cat_test_health", name: "Saúde" },
];

/** Banco simulado: transações, categorias e Settings em memória. */
export function fakeDb(
  opts: {
    txs?: FakeTx[];
    categories?: Array<{ id: string; name: string }>;
    /** Categorias que ainda são pessoais no momento da aplicação (padrão: todas). */
    personalNow?: string[];
    attempts?: string | null;
    history?: FakeHistory[];
    updateCount?: (id: string) => number;
    updateError?: unknown;
  } = {}
) {
  let attemptsValue = opts.attempts ?? null;
  const txs = (opts.txs ?? baseTxs).map((t) => ({
    ...t,
    date: t.date ?? new Date("2026-03-10T12:00:00.000Z"),
    pluggyLinks: [{ sourceDescription: t.sourceDescription ?? t.description, accountLink: { accountType: t.accountType ?? "CREDIT" } }],
  }));
  const history = (opts.history ?? []).map((h) => ({
    description: h.description,
    categoryId: h.categoryId,
    installmentId: h.installmentId ?? null,
    recurringExpenseId: h.recurringExpenseId ?? null,
    pluggyLinks: (h.sourceDescriptions ?? []).map((sourceDescription) => ({ sourceDescription })),
  }));
  const categories = opts.categories ?? baseCategories;
  const findMany = vi.fn(async (args: { where: { id?: { in: string[] }; categoryId?: unknown } }) => {
    // Leitura do histórico: a única que pede categoryId não nulo.
    if (args.where.categoryId !== null && args.where.categoryId !== undefined) return history;
    const ids = args.where.id?.in;
    return ids ? txs.filter((t) => ids.includes(t.id)) : txs;
  });
  const updateMany = vi.fn(async (args: { where: { id: string } }) => {
    if (opts.updateError) throw opts.updateError;
    return { count: opts.updateCount ? opts.updateCount(args.where.id) : 1 };
  });
  const categoryFindMany = vi.fn(async (args: { where: { id?: { in: string[] } } }) => {
    const ids = args.where.id?.in;
    if (!ids) return categories;
    const personal = opts.personalNow ?? categories.map((c) => c.id);
    return ids.filter((id) => personal.includes(id)).map((id) => ({ id }));
  });
  const settingsFindFirst = vi.fn(async () => (attemptsValue === null ? null : { value: attemptsValue }));
  const settingsUpsert = vi.fn(async (args: { update: { value: string } }) => {
    attemptsValue = args.update.value;
    return {};
  });
  const db = {
    transaction: { findMany, updateMany },
    category: { findMany: categoryFindMany },
    settings: { findFirst: settingsFindFirst, upsert: settingsUpsert },
  } as unknown as CategoryAssistDb;
  return { db, findMany, updateMany, categoryFindMany, settingsUpsert, attempts: () => attemptsValue };
}
