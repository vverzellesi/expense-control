import { vi } from "vitest";
import type { CategoryAssistDb } from "./export";

export const OWNER = "user_test_owner";

export interface FakeTx {
  id: string;
  description: string;
  amount: number;
  updatedAt: Date;
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
    updateCount?: (id: string) => number;
    updateError?: unknown;
  } = {}
) {
  let attemptsValue = opts.attempts ?? null;
  const txs = opts.txs ?? baseTxs;
  const categories = opts.categories ?? baseCategories;
  const findMany = vi.fn(async (args: { where: { id?: { in: string[] } } }) => {
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
