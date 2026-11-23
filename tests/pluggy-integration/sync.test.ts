import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { runPluggySync, type SyncDeps } from "@/lib/pluggy/sync";
import type { PluggyAccount, PluggyBill, PluggyItem, PluggyTransaction } from "@/lib/pluggy/types";
import { countAllRows, createOwner, createTestClient, resetDatabase, syncFromDate, type Owner } from "./helpers";

// Fluxo completo da sincronização (sync.ts → store → Postgres real) com a Pluggy simulada.
// Dados 100% sintéticos.

const db: PrismaClient = createTestClient();
const NOW = new Date("2026-11-22T12:00:00.000Z");

afterAll(async () => {
  await db.$disconnect();
});

interface Fixture {
  owner: Owner;
  bankLinkId: string;
  itemId: string;
  cardAccountId: string;
  bankAccountId: string;
}

let fx: Fixture;

beforeEach(async () => {
  await resetDatabase(db);
  const owner = await createOwner(db, { syncFrom: "2026-10-01" });
  // Cartão com corte por fatura: a fatura que vence em 10/10 (e as anteriores) já foi importada.
  const card = await db.pluggyAccountLink.update({
    where: { id: owner.accountLinkId },
    data: { cutoffBillDueDate: new Date("2026-10-10T12:00:00.000Z") },
  });
  const bankOrigin = await db.origin.create({ data: { name: "Conta Teste", userId: owner.userId, type: "OTHER" } });
  const bank = await db.pluggyAccountLink.create({
    data: {
      userId: owner.userId,
      itemId: card.itemId,
      pluggyAccountId: card.pluggyAccountId + "_bank",
      accountType: "BANK",
      originId: bankOrigin.id,
      syncFrom: syncFromDate("2026-10-01"),
    },
  });
  fx = { owner, bankLinkId: bank.id, itemId: card.itemId, cardAccountId: card.pluggyAccountId, bankAccountId: bank.pluggyAccountId };
});

function tx(partial: Partial<PluggyTransaction> & Pick<PluggyTransaction, "id" | "amount" | "type" | "date">): PluggyTransaction {
  return { description: "LOJA EXEMPLO", currencyCode: "BRL", status: "POSTED", ...partial } as PluggyTransaction;
}

function cardTransactions(options: { withPending?: boolean } = {}): PluggyTransaction[] {
  const list = [
    tx({ id: "tx_test_c0", amount: 500, type: "DEBIT", date: "2026-09-05T00:00:00.000Z", creditCardMetadata: { billId: "bill_test_1" } }),
    // Dentro da janela por data, mas da fatura já importada: corte por fatura.
    tx({ id: "tx_test_c6", amount: 70, type: "DEBIT", date: "2026-10-02T00:00:00.000Z", creditCardMetadata: { billId: "bill_test_1" } }),
    tx({ id: "tx_test_c1", amount: 50, type: "DEBIT", date: "2026-10-20T00:00:00.000Z", creditCardMetadata: { billId: "bill_test_2" } }),
    // Antes de syncFrom, mas de fatura posterior ao corte (compra do fechamento): entra.
    tx({ id: "tx_test_c7", amount: 20, type: "DEBIT", date: "2026-09-30T00:00:00.000Z", creditCardMetadata: { billId: "bill_test_2" } }),
    tx({
      id: "tx_test_c2",
      amount: -500,
      type: "CREDIT",
      date: "2026-11-04T00:00:00.000Z",
      description: "PAGAMENTO RECEBIDO",
      operationType: "PAGAMENTO_FATURA",
      creditCardMetadata: { billId: "bill_test_2" },
    }),
    tx({ id: "tx_test_c4", amount: -7, type: "CREDIT", date: "2026-11-08T00:00:00.000Z", description: "CREDITO EXEMPLO" }),
    tx({
      id: "tx_test_c5",
      amount: 100,
      type: "DEBIT",
      date: "2026-11-01T00:00:00.000Z",
      status: "PENDING",
      description: "LOJA PARCELADA EXEMPLO",
      creditCardMetadata: { installmentNumber: 1, totalInstallments: 3, purchaseDate: "2026-11-01" },
    }),
  ];
  if (options.withPending ?? true) {
    list.push(tx({ id: "tx_test_c3", amount: 30, type: "DEBIT", date: "2026-11-15T00:00:00.000Z", status: "PENDING", description: "MERCADO EXEMPLO" }));
  }
  return list;
}

const bankTransactions = (): PluggyTransaction[] => [
  tx({ id: "tx_test_b0", amount: -20, type: "DEBIT", date: "2026-09-20T00:00:00.000Z" }),
  tx({ id: "tx_test_b1", amount: -100, type: "DEBIT", date: "2026-11-10T00:00:00.000Z" }),
  tx({ id: "tx_test_b2", amount: -500, type: "DEBIT", date: "2026-11-05T00:00:00.000Z", description: "PAGAMENTO FATURA CARTAO" }),
];

const bills: PluggyBill[] = [
  { id: "bill_test_1", dueDate: "2026-10-10", totalAmount: 500, totalAmountCurrencyCode: "BRL" },
  { id: "bill_test_2", dueDate: "2026-11-10", totalAmount: 70, totalAmountCurrencyCode: "BRL" },
] as PluggyBill[];

function fakeClient(cardList: () => PluggyTransaction[] = () => cardTransactions()) {
  const accounts = [
    { id: fx.cardAccountId, type: "CREDIT", currencyCode: "BRL" },
    { id: fx.bankAccountId, type: "BANK", currencyCode: "BRL" },
  ] as PluggyAccount[];
  const item = { id: fx.itemId, status: "UPDATED", lastUpdatedAt: "2026-11-22T06:00:00.000Z" } as PluggyItem;
  return {
    getItem: vi.fn().mockResolvedValue(item),
    listAccounts: vi.fn().mockResolvedValue(accounts),
    listTransactions: vi.fn(async (accountId: string) => {
      const list = accountId === fx.cardAccountId ? cardList() : bankTransactions();
      const dates = list.map((t) => t.date.slice(0, 10)).sort();
      return { transactions: list, coverage: { total: list.length, minDate: dates[0] ?? null, maxDate: dates[dates.length - 1] ?? null } };
    }),
    listBills: vi.fn().mockResolvedValue(bills),
  };
}

function deps(client = fakeClient(), alert = vi.fn().mockResolvedValue(undefined)): SyncDeps {
  return {
    db,
    client: client as never,
    env: { PLUGGY_SYNC_ENABLED: "true", PLUGGY_OWNER_USER_ID: fx.owner.userId },
    now: () => NOW,
    alert,
  };
}

describe("runPluggySync em Postgres real", () => {
  it("simulação não escreve nenhuma linha", async () => {
    const before = await countAllRows(db);
    const report = await runPluggySync(deps(), { mode: "simulate", trigger: "manual" });
    expect(report.status).toBe("ok");
    expect(report.counts.destinations.created).toBeGreaterThan(0);
    expect(await countAllRows(db)).toEqual(before);
  });

  it("grava, fecha o run, libera o lease e uma reexecução não cria nada", async () => {
    const alert = vi.fn().mockResolvedValue(undefined);
    const first = await runPluggySync(deps(fakeClient(), alert), { mode: "apply", trigger: "cron" });

    expect(first.checks.alerts).toEqual({});
    expect(first.status).toBe("ok");
    // Lidos 11: 3 da conta corrente + 8 do cartão, 2 deles fora da janela.
    expect(first.counts.read).toBe(11);
    expect(first.counts.outsideWindow).toBe(2);
    // b1, c1, c7, c3 (provisório) e c5 (parcela 1/3) criados; b2 e c2 excluídos; c4 em revisão; c6 antes do corte.
    expect(first.counts.destinations).toMatchObject({ created: 5, excluded: 2, needs_review: 1, before_cutoff: 1 });
    expect(first.counts.unknownBill).toBe(0);
    expect(first.counts.reasons).toMatchObject({
      bill_payment_debit: 1,
      bill_payment_credit: 1,
      credit_unknown: 1,
      before_cutoff_bill: 1,
    });
    expect(first.counts.newNeedsReview).toBe(1);
    expect(first.counts.projectionsCreated).toBe(2);
    expect(alert).toHaveBeenCalledTimes(1);

    const run = await db.pluggySyncRun.findFirstOrThrow({ where: { id: first.runId! } });
    expect(run.status).toBe("ok");
    expect(run.finishedAt).not.toBeNull();
    expect(await db.pluggySyncLease.count()).toBe(0);
    const links = await db.pluggyAccountLink.findMany({ where: { userId: fx.owner.userId } });
    expect(links.every((l) => l.lastSuccessfulSyncAt !== null)).toBe(true);
    const transactionsAfterFirst = await db.transaction.count({ where: { deletedAt: null } });
    expect(transactionsAfterFirst).toBe(7); // 5 criadas + 2 projeções

    const rerunAlert = vi.fn().mockResolvedValue(undefined);
    const second = await runPluggySync(deps(fakeClient(), rerunAlert), { mode: "apply", trigger: "cron" });
    expect(second.status).toBe("ok");
    expect(second.counts.destinations.created).toBe(0);
    expect(second.counts.newNeedsReview).toBe(0);
    expect(rerunAlert).not.toHaveBeenCalled();
    expect(await db.transaction.count({ where: { deletedAt: null } })).toBe(transactionsAfterFirst);
    expect(await db.pluggySyncRun.count({ where: { status: "ok" } })).toBe(2);
  });

  it("provisório que some da leitura completa é removido sem apagar o resto", async () => {
    await runPluggySync(deps(), { mode: "apply", trigger: "cron" });
    const report = await runPluggySync(deps(fakeClient(() => cardTransactions({ withPending: false }))), { mode: "apply", trigger: "cron" });
    expect(report.counts.provisionalVanished).toBe(1);
    expect(report.counts.missingUpstream).toBe(0);
    const vanished = await db.pluggyTransactionLink.findFirstOrThrow({ where: { externalId: "tx_test_c3" } });
    expect(vanished).toMatchObject({ disposition: "superseded", reasonCode: "provisional_vanished" });
    expect(await db.transaction.count({ where: { deletedAt: null } })).toBe(6);
  });

  it("run órfão em running é marcado interrupted pela execução seguinte", async () => {
    await db.pluggySyncRun.create({ data: { userId: fx.owner.userId, trigger: "cron", status: "running" } });
    await runPluggySync(deps(), { mode: "apply", trigger: "cron" });
    expect(await db.pluggySyncRun.count({ where: { status: "interrupted" } })).toBe(1);
    expect(await db.pluggySyncRun.count({ where: { status: "running" } })).toBe(0);
  });
});

