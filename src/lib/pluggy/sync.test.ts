// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PluggyAccount, PluggyBill, PluggyItem, PluggyTransaction } from "./types";
import type { BatchResult, PluggyStoreRecord, ProcessPluggyRecordsInput, RecordOutcome } from "./store";

const leaseMocks = vi.hoisted(() => ({
  acquirePluggyLease: vi.fn(),
  renewPluggyLease: vi.fn(),
  releasePluggyLease: vi.fn(),
  lockUserForPluggy: vi.fn(),
  assertPluggyLeaseHeld: vi.fn(),
}));
const storeMocks = vi.hoisted(() => ({ processPluggyRecords: vi.fn(), reconcileUnseenLinks: vi.fn() }));

vi.mock("./lease", async (importOriginal) => ({ ...(await importOriginal<typeof import("./lease")>()), ...leaseMocks }));
vi.mock("./store", async (importOriginal) => ({ ...(await importOriginal<typeof import("./store")>()), ...storeMocks }));

import { describeSyncError, evaluateItemHealth, runPluggySync, triggerSyncFromWebhook } from "./sync";
import { PluggyLeaseLostError } from "./lease";
import { PluggyApiError } from "./client";

// ------------------------------------------------------------------ fixtures sintéticas

const OWNER = "user_test_owner";
const OTHER = "user_test_other";
const ITEM = "item_test_1";
const NOW = new Date("2026-11-22T12:00:00.000Z");

const env = {
  PLUGGY_SYNC_ENABLED: "true",
  PLUGGY_OWNER_USER_ID: OWNER,
  PLUGGY_CLIENT_ID: "client_test",
  PLUGGY_CLIENT_SECRET: "secret_test",
};

interface LinkFixture {
  id: string;
  userId: string;
  itemId: string;
  pluggyAccountId: string;
  accountType: "BANK" | "CREDIT";
  syncFrom: Date;
  enabled: boolean;
  origin: { name: string };
}

const bankLink: LinkFixture = {
  id: "link_test_bank",
  userId: OWNER,
  itemId: ITEM,
  pluggyAccountId: "acc_test_bank",
  accountType: "BANK",
  syncFrom: new Date("2026-10-01T12:00:00.000Z"),
  enabled: true,
  origin: { name: "Conta Teste" },
};
const cardLink: LinkFixture = {
  ...bankLink,
  id: "link_test_card",
  pluggyAccountId: "acc_test_card",
  accountType: "CREDIT",
  origin: { name: "Cartão Teste" },
};

function tx(partial: Partial<PluggyTransaction> & Pick<PluggyTransaction, "id" | "amount" | "type" | "date">): PluggyTransaction {
  return { description: "LOJA EXEMPLO", currencyCode: "BRL", status: "POSTED", ...partial } as PluggyTransaction;
}

const bankTxs: PluggyTransaction[] = [
  tx({ id: "tx_test_b1", amount: -100, type: "DEBIT", date: "2026-11-10T00:00:00.000Z" }),
  tx({ id: "tx_test_b2", amount: -500, type: "DEBIT", date: "2026-11-05T00:00:00.000Z", description: "PAGAMENTO FATURA CARTAO" }),
  tx({ id: "tx_test_b3", amount: -10, type: "DEBIT", date: "2026-09-01T00:00:00.000Z" }),
];
const cardTxs: PluggyTransaction[] = [
  tx({ id: "tx_test_c0", amount: 500, type: "DEBIT", date: "2026-09-05T00:00:00.000Z", creditCardMetadata: { billId: "bill_test_1" } }),
  tx({ id: "tx_test_c1", amount: 50, type: "DEBIT", date: "2026-10-20T00:00:00.000Z", creditCardMetadata: { billId: "bill_test_2" } }),
  tx({
    id: "tx_test_c2",
    amount: -500,
    type: "CREDIT",
    date: "2026-11-04T00:00:00.000Z",
    description: "PAGAMENTO RECEBIDO",
    operationType: "PAGAMENTO_FATURA",
    creditCardMetadata: { billId: "bill_test_2" },
  }),
  tx({ id: "tx_test_c3", amount: 30, type: "DEBIT", date: "2026-11-15T00:00:00.000Z", status: "PENDING", description: "MERCADO EXEMPLO" }),
];
const bills: PluggyBill[] = [
  { id: "bill_test_1", dueDate: "2026-10-10", totalAmount: 500, totalAmountCurrencyCode: "BRL" },
  { id: "bill_test_2", dueDate: "2026-11-10", totalAmount: 50, totalAmountCurrencyCode: "BRL" },
] as PluggyBill[];

const healthyItem: PluggyItem = {
  id: ITEM,
  status: "UPDATED",
  executionStatus: "SUCCESS",
  lastUpdatedAt: "2026-11-22T06:00:00.000Z",
  consentExpiresAt: "2027-06-01T00:00:00.000Z",
} as PluggyItem;

function coverageOf(list: PluggyTransaction[]) {
  const dates = list.map((t) => t.date.slice(0, 10)).sort();
  return { total: list.length, minDate: dates[0] ?? null, maxDate: dates[dates.length - 1] ?? null };
}

function fakeClient(overrides: Partial<Record<"getItem" | "listAccounts" | "listTransactions" | "listBills", unknown>> = {}) {
  const accounts: PluggyAccount[] = [
    { id: "acc_test_bank", type: "BANK", currencyCode: "BRL" } as PluggyAccount,
    { id: "acc_test_card", type: "CREDIT", currencyCode: "BRL" } as PluggyAccount,
  ];
  return {
    getItem: vi.fn().mockResolvedValue(healthyItem),
    listAccounts: vi.fn().mockResolvedValue(accounts),
    listTransactions: vi.fn(async (accountId: string) => {
      const list = accountId === "acc_test_bank" ? bankTxs : cardTxs;
      return { transactions: list, coverage: coverageOf(list) };
    }),
    listBills: vi.fn().mockResolvedValue(bills),
    ...overrides,
  };
}

function fakeDb(options: { links?: LinkFixture[]; patterns?: string | null; reviewIds?: string[] } = {}) {
  const links = options.links ?? [bankLink, cardLink];
  const txClient = { pluggyAccountLink: { update: vi.fn() } };
  const db = {
    pluggyAccountLink: {
      findMany: vi.fn(async (args: { where: { userId: string; enabled: boolean } }) =>
        links.filter((l) => l.userId === args.where.userId && l.enabled === args.where.enabled)
      ),
      findFirst: vi.fn(async (args: { where: { userId: string; itemId: string } }) =>
        links.find((l) => l.userId === args.where.userId && l.itemId === args.where.itemId && l.enabled) ?? null
      ),
    },
    settings: {
      findFirst: vi.fn().mockResolvedValue(options.patterns === undefined || options.patterns === null ? null : { value: options.patterns }),
    },
    pluggySyncRun: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: "run_test_1" }),
      update: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    pluggySyncLease: { findUnique: vi.fn().mockResolvedValue(null) },
    pluggyTransactionLink: {
      findMany: vi.fn().mockResolvedValue((options.reviewIds ?? []).map((externalId) => ({ externalId }))),
    },
    telegramLink: { findUnique: vi.fn().mockResolvedValue(null) },
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(txClient)),
  };
  return { db, txClient };
}

function outcomeOf(record: PluggyStoreRecord): RecordOutcome {
  if (!record.preDisposition) return "created";
  return record.preDisposition.disposition;
}

function batchFor(records: PluggyStoreRecord[], mode: "apply" | "simulate", outcome = outcomeOf): BatchResult {
  const counts = { created: 0, adopted: 0, excluded: 0, pending: 0, needs_review: 0, before_cutoff: 0, unchanged: 0, updated: 0 };
  const reasons: Record<string, number> = {};
  const results = records.map((r) => {
    const o = outcome(r);
    counts[o]++;
    const reasonCode = r.preDisposition?.reasonCode ?? null;
    if (reasonCode) reasons[reasonCode] = (reasons[reasonCode] ?? 0) + 1;
    return {
      externalId: r.externalId,
      outcome: o,
      disposition: (o === "unchanged" || o === "updated" ? "created" : o) as never,
      reasonCode,
      divergence: false,
      transactionId: o === "created" ? "sim_tx_" + r.externalId : null,
      projectionsCreated: 0,
      groupCreated: false,
      projectionAmountCorrected: false,
    };
  });
  return { mode, results, counts, reasons, divergences: 0, superseded: 0, projectionsCreated: 0, groupsCreated: 0, projectionAmountCorrected: 0 };
}

const noUnseen = { missingUpstream: 0, missingByDisposition: {}, provisionalVanished: 0, provisionalTransactionsDeleted: 0, pendingVanished: 0 };

function storeInput(accountLinkId: string): ProcessPluggyRecordsInput & { billDueDates?: Map<string, string> } {
  const call = storeMocks.processPluggyRecords.mock.calls.find((c) => c[1].accountLinkId === accountLinkId);
  return call![1];
}

beforeEach(() => {
  vi.clearAllMocks();
  leaseMocks.acquirePluggyLease.mockResolvedValue("lease_test_token");
  leaseMocks.renewPluggyLease.mockResolvedValue(true);
  leaseMocks.releasePluggyLease.mockResolvedValue(true);
  storeMocks.processPluggyRecords.mockImplementation(async (_db, input: ProcessPluggyRecordsInput) => batchFor(input.records, input.mode));
  storeMocks.reconcileUnseenLinks.mockResolvedValue(noUnseen);
});

const run = (db: unknown, extra: Partial<Parameters<typeof runPluggySync>[0]> = {}, mode: "apply" | "simulate" = "apply") =>
  runPluggySync({ db: db as never, client: fakeClient() as never, env, now: () => NOW, alert: vi.fn().mockResolvedValue(undefined), ...extra }, { mode, trigger: "cron" });

// ------------------------------------------------------------------ testes

describe("runPluggySync — caminho feliz", () => {
  it("lê as duas contas, aplica as regras de lote juntas, grava pelo store e fecha o run ok", async () => {
    const { db, txClient } = fakeDb();
    const alert = vi.fn();
    const report = await run(db, { alert });

    expect(report.status).toBe("ok");
    expect(leaseMocks.acquirePluggyLease).toHaveBeenCalledWith(db, OWNER, expect.any(Number));
    expect(db.pluggySyncRun.updateMany).toHaveBeenCalledWith({
      where: { userId: OWNER, status: "running" },
      data: { status: "interrupted", finishedAt: NOW },
    });
    expect(db.pluggySyncRun.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "running", trigger: "cron" }) }));

    // Janela [syncFrom, hoje]: o registro de setembro fica fora, mas conta como lido.
    const bank = storeInput("link_test_bank");
    expect(bank.mode).toBe("apply");
    expect(bank.leaseToken).toBe("lease_test_token");
    expect(bank.records.map((r) => r.externalId)).toEqual(["tx_test_b1", "tx_test_b2"]);
    // Débito do pagamento de fatura casado com o crédito do cartão (regra de lote b).
    expect(bank.records[1].preDisposition).toEqual({ disposition: "excluded", reasonCode: "bill_payment_debit" });

    // Cartão: corte por fatura com o vencimento de cada fatura da mesma leitura.
    const card = storeInput("link_test_card");
    expect(card.billDueDates).toEqual(new Map([["bill_test_1", "2026-10-10"], ["bill_test_2", "2026-11-10"]]));
    expect(card.records.find((r) => r.externalId === "tx_test_c3")?.sourceStatus).toBe("PENDING");

    expect(report.counts.read).toBe(7);
    expect(report.counts.outsideWindow).toBe(2);
    expect(report.counts.destinations.created).toBe(3);
    expect(report.counts.destinations.excluded).toBe(2);
    expect(report.counts.reasons).toEqual({ bill_payment_debit: 1, bill_payment_credit: 1 });

    // Fatura 2: 50 = 500 + 50 − 500 + 0 → equilibrada; a primeira não é avaliável.
    const cardCheck = report.checks.accounts.find((a) => a.accountType === "CREDIT")!;
    expect(cardCheck.bills).toMatchObject({ balanced: 1, notEvaluable: 1, residueNegative: 0 });

    expect(txClient.pluggyAccountLink.update).toHaveBeenCalledTimes(2);
    expect(db.pluggySyncRun.update).toHaveBeenCalledWith({
      where: { id: "run_test_1" },
      data: expect.objectContaining({ status: "ok", error: null }),
    });
    expect(leaseMocks.releasePluggyLease).toHaveBeenCalledWith(db, OWNER, "lease_test_token");
    expect(alert).not.toHaveBeenCalled();
  });

  it("todo registro lido termina com um destino (lidos = destinos + fora da janela)", async () => {
    const { db } = fakeDb();
    const report = await run(db);
    const destinations = Object.values(report.counts.destinations).reduce((a, b) => a + b, 0);
    expect(destinations + report.counts.outsideWindow).toBe(report.counts.read);
    expect(report.decisions).toHaveLength(destinations);
  });

  it("o run persistido não leva ids de conta, descrições nem nomes de origin", async () => {
    const { db } = fakeDb();
    await run(db);
    const data = JSON.stringify(db.pluggySyncRun.update.mock.calls[0][0].data);
    for (const value of ["acc_test_bank", "acc_test_card", "tx_test_b1", "LOJA EXEMPLO", "Cartão Teste", "Conta Teste", ITEM, "bill_test_1"]) {
      expect(data).not.toContain(value);
    }
  });
});

describe("runPluggySync — simulação", () => {
  it("não grava nada (nem run, nem lease), não alerta e devolve as decisões", async () => {
    const { db, txClient } = fakeDb();
    const alert = vi.fn();
    const report = await run(db, { alert }, "simulate");

    expect(report.mode).toBe("simulate");
    expect(report.runId).toBeNull();
    expect(leaseMocks.acquirePluggyLease).not.toHaveBeenCalled();
    expect(leaseMocks.releasePluggyLease).not.toHaveBeenCalled();
    expect(db.pluggySyncRun.create).not.toHaveBeenCalled();
    expect(db.pluggySyncRun.update).not.toHaveBeenCalled();
    expect(db.pluggySyncRun.updateMany).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(txClient.pluggyAccountLink.update).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    expect(storeInput("link_test_bank").mode).toBe("simulate");
    expect(storeMocks.reconcileUnseenLinks.mock.calls.every((c) => c[1].mode === "simulate")).toBe(true);
    expect(report.decisions.map((d) => d.record.externalId).sort()).toEqual(["tx_test_b1", "tx_test_b2", "tx_test_c1", "tx_test_c2", "tx_test_c3"]);
  });
});

describe("runPluggySync — falhas de leitura", () => {
  it("falha numa conta invalida só ela; o erro sai sanitizado e o run vira error", async () => {
    const { db } = fakeDb();
    const client = fakeClient({
      listTransactions: vi.fn(async (accountId: string) => {
        if (accountId === "acc_test_bank") throw new Error("falhou acc_test_bank LOJA EXEMPLO 123,45");
        return { transactions: cardTxs, coverage: coverageOf(cardTxs) };
      }),
    });
    const alert = vi.fn().mockResolvedValue(undefined);
    const report = await run(db, { client: client as never, alert });

    expect(report.status).toBe("error");
    expect(storeMocks.processPluggyRecords).toHaveBeenCalledTimes(1);
    expect(storeInput("link_test_card")).toBeDefined();
    expect(report.checks.alerts).toEqual({ account_read_failed: 1 });
    expect(report.counts).toMatchObject({ accountsOk: 1, accountsFailed: 1 });
    expect(report.error).toBe("unexpected:Error");
    const persisted = JSON.stringify(db.pluggySyncRun.update.mock.calls[0][0].data);
    expect(persisted).not.toContain("acc_test_bank");
    expect(persisted).not.toContain("LOJA EXEMPLO");
    expect(alert).toHaveBeenCalledWith(db, OWNER, expect.objectContaining({ status: "error" }));
    expect(leaseMocks.releasePluggyLease).toHaveBeenCalled();
  });

  it("falha na leitura das faturas invalida o cartão e a conta corrente do mesmo item fica para a próxima", async () => {
    const { db } = fakeDb();
    const client = fakeClient({ listBills: vi.fn().mockRejectedValue(new PluggyApiError("http", "GET", "/bills", 500)) });
    const report = await run(db, { client: client as never });

    expect(storeMocks.processPluggyRecords).not.toHaveBeenCalled();
    expect(report.checks.alerts).toEqual({ bills_read_failed: 1, account_dependency_failed: 1 });
    expect(report.status).toBe("error");
    expect(report.error).toBe("Pluggy GET /bills: http status 500");
  });

  it("falha do store numa conta não derruba a outra", async () => {
    const { db } = fakeDb();
    storeMocks.processPluggyRecords.mockImplementation(async (_db, input: ProcessPluggyRecordsInput) => {
      if (input.accountLinkId === "link_test_bank") throw new Error("boom");
      return batchFor(input.records, input.mode);
    });
    const report = await run(db);
    expect(report.checks.alerts).toEqual({ account_processing_failed: 1 });
    expect(report.counts.accountsOk).toBe(1);
  });

  it("violação da invariante (registro sem destino) é erro", async () => {
    const { db } = fakeDb();
    storeMocks.processPluggyRecords.mockImplementation(async (_db, input: ProcessPluggyRecordsInput) =>
      batchFor(input.records.slice(1), input.mode)
    );
    const report = await run(db);
    expect(report.status).toBe("error");
    expect(report.checks.alerts.invariant_violation).toBe(2);
  });

  it("lease perdido entre contas para tudo", async () => {
    const { db } = fakeDb();
    leaseMocks.renewPluggyLease.mockResolvedValue(false);
    const report = await run(db);
    expect(storeMocks.processPluggyRecords).toHaveBeenCalledTimes(1);
    expect(report.checks.alerts.lease_lost).toBe(1);
    expect(report.status).toBe("error");
  });

  it("store que perde o lease também para tudo", async () => {
    const { db } = fakeDb();
    storeMocks.processPluggyRecords.mockRejectedValue(new PluggyLeaseLostError());
    const report = await run(db);
    expect(storeMocks.processPluggyRecords).toHaveBeenCalledTimes(1);
    expect(report.error).toBe("lease_lost");
  });
});

describe("runPluggySync — guardas", () => {
  it("integração desligada não faz nada", async () => {
    const { db } = fakeDb();
    const report = await run(db, { env: { ...env, PLUGGY_SYNC_ENABLED: "false" } });
    expect(report).toMatchObject({ status: "skipped", skippedReason: "disabled" });
    expect(db.pluggyAccountLink.findMany).not.toHaveBeenCalled();
  });

  it("scripts podem rodar com a flag desligada", async () => {
    const { db } = fakeDb();
    const report = await runPluggySync(
      { db: db as never, client: fakeClient() as never, env: { ...env, PLUGGY_SYNC_ENABLED: undefined }, now: () => NOW },
      { mode: "simulate", trigger: "manual", ignoreEnabledFlag: true }
    );
    expect(report.status).toBe("ok");
  });

  it("sem dono configurado não faz nada", async () => {
    const { db } = fakeDb();
    const report = await run(db, { env: { ...env, PLUGGY_OWNER_USER_ID: " " } });
    expect(report.skippedReason).toBe("owner_not_configured");
  });

  it("vínculos de outro usuário nunca são lidos", async () => {
    const { db } = fakeDb({ links: [{ ...bankLink, userId: OTHER }, { ...cardLink, userId: OTHER }] });
    const client = fakeClient();
    const report = await run(db, { client: client as never });
    expect(report.skippedReason).toBe("no_links");
    expect(db.pluggyAccountLink.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: OWNER, enabled: true } }));
    expect(client.listTransactions).not.toHaveBeenCalled();
    expect(leaseMocks.acquirePluggyLease).not.toHaveBeenCalled();
  });

  it("lease ocupado: não cria run e não lê a Pluggy", async () => {
    const { db } = fakeDb();
    leaseMocks.acquirePluggyLease.mockResolvedValue(null);
    const client = fakeClient();
    const report = await run(db, { client: client as never });
    expect(report.skippedReason).toBe("lease_busy");
    expect(db.pluggySyncRun.create).not.toHaveBeenCalled();
    expect(client.getItem).not.toHaveBeenCalled();
  });

  it("padrões do usuário inválidos viram aviso e a sincronização segue", async () => {
    const { db } = fakeDb({ patterns: "{isto não é json" });
    const report = await run(db);
    expect(report.status).toBe("warning");
    expect(report.checks.alerts).toEqual({ user_patterns_invalid: 1 });
    expect(storeMocks.processPluggyRecords).toHaveBeenCalledTimes(2);
  });

  it("padrões válidos chegam ao mapeamento", async () => {
    const { db } = fakeDb({ patterns: JSON.stringify([{ pattern: "MERCADO EXEMPLO", action: "exclude" }, { pattern: 3 }]) });
    const report = await run(db);
    const c3 = storeInput("link_test_card").records.find((r) => r.externalId === "tx_test_c3")!;
    expect(c3.preDisposition).toEqual({ disposition: "excluded", reasonCode: "user_pattern" });
    expect(report.checks.userPatterns).toEqual({ configured: 2, rejected: 1, invalid: false });
    expect(report.checks.alerts.user_patterns_rejected).toBe(1);
  });
});

describe("runPluggySync — conferências e alertas", () => {
  it("conta só os itens novos em revisão e alerta o dono; falha no alerta não muda o run", async () => {
    const { db } = fakeDb({ reviewIds: ["tx_test_b1"] });
    storeMocks.processPluggyRecords.mockImplementation(async (_db, input: ProcessPluggyRecordsInput) =>
      batchFor(input.records, input.mode, () => "needs_review")
    );
    const alert = vi.fn().mockRejectedValue(new Error("telegram fora"));
    const report = await run(db, { alert });
    expect(report.counts.destinations.needs_review).toBe(5);
    expect(report.counts.newNeedsReview).toBe(4);
    expect(alert).toHaveBeenCalledWith(db, OWNER, { status: "ok", newNeedsReview: 4, alerts: {} });
    expect(report.status).toBe("ok");
  });

  it("item parado e consentimento perto do fim viram warning", async () => {
    const { db } = fakeDb();
    const client = fakeClient({
      getItem: vi.fn().mockResolvedValue({ ...healthyItem, lastUpdatedAt: "2026-11-19T00:00:00.000Z", consentExpiresAt: "2026-12-10T00:00:00.000Z" }),
    });
    const report = await run(db, { client: client as never });
    expect(report.checks.alerts).toEqual({ item_stale: 1, consent_expiring: 1 });
    expect(report.status).toBe("warning");
  });

  it("registros sumidos e resíduo negativo de fatura viram warning", async () => {
    const { db } = fakeDb();
    storeMocks.reconcileUnseenLinks.mockResolvedValue({ ...noUnseen, missingUpstream: 2, provisionalVanished: 1, provisionalTransactionsDeleted: 1 });
    const client = fakeClient({ listBills: vi.fn().mockResolvedValue([bills[0], { ...bills[1], totalAmount: 40 }]) });
    const report = await run(db, { client: client as never });
    expect(report.checks.alerts).toEqual({ missing_upstream: 4, bill_residue_negative: 1 });
    expect(report.counts.provisionalVanished).toBe(2);
    expect(report.status).toBe("warning");
    expect(storeMocks.reconcileUnseenLinks.mock.calls[0][1]).toMatchObject({
      mode: "apply",
      readFrom: "2026-10-01",
      seenExternalIds: ["tx_test_b1", "tx_test_b2", "tx_test_b3"],
    });
  });

  it("leitura vazia não remove nada: só conta e avisa", async () => {
    const { db } = fakeDb({ links: [bankLink] });
    const client = fakeClient({ listTransactions: vi.fn().mockResolvedValue({ transactions: [], coverage: { total: 0, minDate: null, maxDate: null } }) });
    storeMocks.reconcileUnseenLinks.mockResolvedValue({ ...noUnseen, provisionalVanished: 3 });
    const report = await run(db, { client: client as never });
    expect(storeMocks.reconcileUnseenLinks).toHaveBeenCalledTimes(1);
    expect(storeMocks.reconcileUnseenLinks.mock.calls[0][1].mode).toBe("simulate");
    expect(report.checks.alerts).toEqual({ empty_read: 1 });
    expect(report.counts.provisionalVanished).toBe(0);
  });

  it("histórico que começa depois do corte é coverage_truncated", async () => {
    const { db } = fakeDb({ links: [{ ...bankLink, syncFrom: new Date("2026-06-01T12:00:00.000Z") }] });
    const report = await run(db);
    expect(report.checks.alerts).toEqual({ coverage_truncated: 1 });
    expect(storeMocks.reconcileUnseenLinks.mock.calls[0][1].readFrom).toBe("2026-09-01");
  });
});

describe("evaluateItemHealth", () => {
  it("status diferente de atualizado, sem data de atualização e consentimento vencido", () => {
    const health = evaluateItemHealth({ ...healthyItem, status: "LOGIN_ERROR", lastUpdatedAt: null, consentExpiresAt: "2026-11-01T00:00:00.000Z" }, NOW);
    expect(health.alerts).toEqual(["item_not_updated", "item_stale", "consent_expired"]);
  });
  it("item saudável não gera alerta", () => {
    expect(evaluateItemHealth(healthyItem, NOW).alerts).toEqual([]);
  });
});

describe("describeSyncError", () => {
  it("nunca repete a mensagem original de erros desconhecidos", () => {
    expect(describeSyncError(new Error("acc_test_1 LOJA EXEMPLO"))).toBe("unexpected:Error");
    expect(describeSyncError({ code: "P2002", message: "Unique constraint on acc_test_1" })).toBe("db:P2002");
    expect(describeSyncError("texto solto")).toBe("unexpected:string");
  });
});

describe("triggerSyncFromWebhook", () => {
  const deps = (db: unknown) => ({ db: db as never, client: fakeClient() as never, env, now: () => NOW, alert: vi.fn() });

  it("dispara para item dos vínculos do dono", async () => {
    const { db } = fakeDb();
    expect(await triggerSyncFromWebhook(deps(db), { itemId: ITEM })).toEqual({ started: true, status: "ok" });
    expect(db.pluggySyncRun.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ trigger: "webhook" }) }));
  });

  it("ignora item que não é de um vínculo ativo do dono", async () => {
    const { db } = fakeDb();
    expect(await triggerSyncFromWebhook(deps(db), { itemId: "item_test_outro" })).toEqual({ started: false, reason: "foreign_item" });
    expect(leaseMocks.acquirePluggyLease).not.toHaveBeenCalled();
  });

  it("não dispara se a última execução começou há menos de 10 minutos", async () => {
    const { db } = fakeDb();
    db.pluggySyncRun.findFirst.mockResolvedValue({ startedAt: new Date(NOW.getTime() - 9 * 60 * 1000) });
    expect(await triggerSyncFromWebhook(deps(db), { itemId: ITEM })).toEqual({ started: false, reason: "too_soon" });
    db.pluggySyncRun.findFirst.mockResolvedValue({ startedAt: new Date(NOW.getTime() - 11 * 60 * 1000) });
    expect((await triggerSyncFromWebhook(deps(db), { itemId: ITEM })).started).toBe(true);
  });

  it("não dispara com o lease tomado", async () => {
    const { db } = fakeDb();
    db.pluggySyncLease.findUnique.mockResolvedValue({ expiresAt: new Date(NOW.getTime() + 60_000) });
    expect(await triggerSyncFromWebhook(deps(db), { itemId: ITEM })).toEqual({ started: false, reason: "busy" });
    expect(leaseMocks.acquirePluggyLease).not.toHaveBeenCalled();
  });

  it("integração desligada não dispara", async () => {
    const { db } = fakeDb();
    expect(await triggerSyncFromWebhook({ ...deps(db), env: { ...env, PLUGGY_SYNC_ENABLED: "" } }, { itemId: ITEM })).toEqual({
      started: false,
      reason: "disabled",
    });
  });
});

