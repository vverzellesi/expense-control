import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", () => ({ default: {}, prisma: {} }));

import {
  addMonthsToDay,
  assertValidRecord,
  businessDayKey,
  createDecisionView,
  createOverlay,
  cutoffDecision,
  dayDiff,
  dayToStoredDate,
  decideRecord,
  effectivePreDisposition,
  evaluateInstallmentCandidates,
  evaluateLegacyCandidates,
  hasInstallmentEvidence,
  installmentAmountTolerance,
  installmentBaseDescription,
  isNoopPlan,
  pairRecreated,
  projectionDay,
  recreationKey,
  signedCents,
  snapshotSource,
  sortRecordsForProcessing,
  suggestPersonalCategory,
  type AccountContext,
  type BatchFacts,
  type BatchSnapshot,
  type LinkRow,
  type PluggyStoreRecord,
  type TxRow,
} from "./store";

function rec(o: Partial<PluggyStoreRecord> & { externalId: string }): PluggyStoreRecord {
  const sourceDate = o.sourceDate ?? "2026-03-10";
  return {
    providerId: null,
    accountType: "CREDIT",
    sourceStatus: "POSTED",
    sourceDate,
    purchaseDate: null,
    ledgerDate: o.ledgerDate ?? sourceDate,
    description: "LOJA EXEMPLO",
    amountCents: 2500,
    currencyCode: "BRL",
    direction: "DEBIT",
    type: "EXPENSE",
    creditKind: null,
    billId: null,
    installmentNumber: null,
    totalInstallments: null,
    preDisposition: null,
    ...o,
  };
}

function tx(o: Partial<TxRow> & { id: string }): TxRow {
  return {
    description: "LOJA EXEMPLO",
    cents: -2500,
    amount: -25,
    date: new Date("2026-03-10T12:00:00Z"),
    day: "2026-03-10",
    categorySource: null,
    deletedAt: null,
    origin: "Cartão Teste",
    isInstallment: false,
    currentInstallment: null,
    totalInstallments: null,
    installmentId: null,
    groupStartDay: null,
    deleted: false,
    hasPluggyLink: false,
    recurringExpenseId: null,
    createdAt: new Date("2026-03-10T12:00:00Z"),
    ...o,
  };
}

function link(o: Partial<LinkRow> & { id: string; externalId: string }): LinkRow {
  return {
    accountLinkId: "acl_test_1",
    providerId: null,
    transactionId: null,
    disposition: "created",
    reasonCode: null,
    sourceStatus: "POSTED",
    sourceDate: "2026-03-10",
    ledgerDate: "2026-03-10",
    purchaseDate: null,
    sourceAmountCents: 2500,
    currencyCode: "BRL",
    direction: "DEBIT",
    sourceDescription: "LOJA EXEMPLO",
    billId: null,
    creditKind: null,
    installmentNumber: null,
    totalInstallments: null,
    systemDeletedAt: null,
    ...o,
  };
}

const ctx: AccountContext = {
  ownerUserId: "user_test_1",
  accountLinkId: "acl_test_1",
  accountType: "CREDIT",
  syncFromDay: "2026-01-01",
  cutoffBillDueDay: null,
  originName: "Cartão Teste",
  lineageIds: ["acl_test_1"],
  originNames: ["Cartão Teste"],
};

function decide(record: PluggyStoreRecord, snapshot: Partial<BatchSnapshot> = {}, facts: Partial<BatchFacts> = {}) {
  const snap: BatchSnapshot = { links: [], txs: [], recurrings: [], ...snapshot };
  const view = createDecisionView(snapshotSource(snap), createOverlay());
  return decideRecord(
    view,
    ctx,
    record,
    {
      seenExternalIds: new Set([record.externalId]),
      recreatedPairs: new Map(),
      importPending: true,
      billDueDates: new Map(),
      ...facts,
    },
    []
  );
}

describe("datas", () => {
  it("soma meses sem transbordar o fim do mês, inclusive em ano bissexto", () => {
    expect(addMonthsToDay("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonthsToDay("2028-01-31", 1)).toBe("2028-02-29");
    expect(addMonthsToDay("2028-01-31", 2)).toBe("2028-03-31");
    expect(addMonthsToDay("2026-12-15", 1)).toBe("2027-01-15");
    expect(addMonthsToDay("2026-03-31", -1)).toBe("2026-02-28");
  });

  it("dia de negócio em America/Sao_Paulo e armazenamento às 12:00 UTC", () => {
    expect(businessDayKey(new Date("2026-03-10T02:00:00Z"))).toBe("2026-03-09");
    expect(businessDayKey(new Date("2026-03-10T12:00:00Z"))).toBe("2026-03-10");
    expect(dayToStoredDate("2026-03-10").toISOString()).toBe("2026-03-10T12:00:00.000Z");
    expect(dayDiff("2026-03-01", "2026-02-27")).toBe(2);
    expect(() => dayToStoredDate("2026-02-30")).toThrow();
  });

  it("projeção usa data da compra + (K−1) meses, ou o lançamento quando não há data da compra", () => {
    expect(projectionDay({ purchaseDate: "2028-01-31", ledgerDate: "2028-02-29", installmentNumber: 2 }, 3)).toBe("2028-03-31");
    expect(projectionDay({ purchaseDate: null, ledgerDate: "2027-01-31", installmentNumber: 1 }, 2)).toBe("2027-02-28");
  });
});

describe("regras puras", () => {
  it("remove o marcador de parcela da descrição normalizada", () => {
    for (const d of ["LOJA EXEMPLO - Parcela 2/10", "LOJA EXEMPLO PARC 02/10", "Loja Exemplo (3/4)", "LOJA EXEMPLO 3/4", "LOJA EXEMPLO"]) {
      expect(installmentBaseDescription(d)).toBe("loja exemplo");
    }
  });

  it("sinal segue o tipo; transferência segue a direção", () => {
    expect(signedCents({ type: "EXPENSE", direction: "DEBIT", amountCents: 100 })).toBe(-100);
    expect(signedCents({ type: "INCOME", direction: "CREDIT", amountCents: 100 })).toBe(100);
    expect(signedCents({ type: "TRANSFER", direction: "DEBIT", amountCents: 100 })).toBe(-100);
  });

  it("recusa registro inválido sem expor dados", () => {
    expect(() => assertValidRecord(rec({ externalId: "x", amountCents: 0 }))).toThrow("pluggy_store:invalid_record");
    expect(() => assertValidRecord(rec({ externalId: "x", amountCents: 10.5 }))).toThrow();
    expect(() => assertValidRecord(rec({ externalId: "x", installmentNumber: 3, totalInstallments: 2 }))).toThrow();
    expect(() => assertValidRecord(rec({ externalId: "x", installmentNumber: 1, totalInstallments: null }))).toThrow();
    expect(() => assertValidRecord(rec({ externalId: "x", ledgerDate: "2026-13-01" }))).toThrow();
    expect(() => assertValidRecord(rec({ externalId: "x" }))).not.toThrow();
  });

  it("evidência da parcela: descrição sem marcador, ledgerDate ±3 dias ou início do grupo", () => {
    const r = { description: "OUTRA LOJA", ledgerDate: "2026-02-15", purchaseDate: "2026-01-15" };
    expect(hasInstallmentEvidence({ day: "2026-02-18", description: "X", groupStartDay: null }, r)).toBe(true);
    expect(hasInstallmentEvidence({ day: "2026-02-19", description: "X", groupStartDay: null }, r)).toBe(false);
    expect(hasInstallmentEvidence({ day: "2026-03-01", description: "X", groupStartDay: "2026-01-13" }, r)).toBe(true);
    expect(hasInstallmentEvidence({ day: "2026-03-01", description: "OUTRA LOJA - Parcela 2/5", groupStartDay: null }, r)).toBe(true);
  });

  it("parcelas: única com evidência adota; várias ou nenhuma com evidência vão para revisão", () => {
    const r = { description: "LOJA EXEMPLO", ledgerDate: "2026-02-15", purchaseDate: null };
    expect(evaluateInstallmentCandidates(r, [])).toEqual({ kind: "none" });
    expect(evaluateInstallmentCandidates(r, [tx({ id: "a" })])).toEqual({ kind: "adopt", transactionId: "a" });
    expect(evaluateInstallmentCandidates(r, [tx({ id: "a" }), tx({ id: "b" })])).toEqual({ kind: "review", reasonCode: "ambiguous_installment" });
    expect(evaluateInstallmentCandidates(r, [tx({ id: "a", description: "OUTRA", day: "2026-04-01" })])).toEqual({
      kind: "review",
      reasonCode: "unconfirmed_installment",
    });
    expect(installmentAmountTolerance(1)).toBe(1);
    expect(installmentAmountTolerance(12)).toBe(12);
  });

  it("legado: um exato adota, mais de um ou descrição diferente vão para revisão", () => {
    const r = { description: "Loja Exemplo" };
    expect(evaluateLegacyCandidates(r, [tx({ id: "a" })])).toEqual({ kind: "adopt", transactionId: "a" });
    expect(evaluateLegacyCandidates(r, [tx({ id: "a" }), tx({ id: "b" })])).toEqual({ kind: "review", reasonCode: "ambiguous_legacy" });
    expect(evaluateLegacyCandidates(r, [tx({ id: "a", description: "OUTRA" })])).toEqual({ kind: "review", reasonCode: "possible_duplicate" });
    expect(evaluateLegacyCandidates(r, [tx({ id: "a", description: "OUTRA", deleted: true })])).toEqual({ kind: "none" });
  });

  it("pareamento de recriados: chave idêntica é intercambiável, até o menor dos dois lados", () => {
    const key = recreationKey(rec({ externalId: "k" }));
    const olds = [1, 2, 3, 4].map((i) => ({ transactionId: "t" + i, key, createdAt: new Date(2026, 0, i) }));
    const four = pairRecreated(["n1", "n2", "n3", "n4"].map((id) => rec({ externalId: id })), olds);
    expect(Array.from(four.values()).sort()).toEqual(["t1", "t2", "t3", "t4"]);
    const fewer = pairRecreated([rec({ externalId: "n1" }), rec({ externalId: "n2" })], olds.slice(0, 1));
    expect(Array.from(fewer.entries())).toEqual([["n1", "t1"]]);
    expect(pairRecreated([rec({ externalId: "n1", amountCents: 1 })], olds).size).toBe(0);
  });

  it("ordena parcelas da mesma compra por N crescente", () => {
    const base = { purchaseDate: "2026-01-10", totalInstallments: 5 };
    const sorted = sortRecordsForProcessing([
      rec({ ...base, externalId: "c", installmentNumber: 3 }),
      rec({ ...base, externalId: "b", installmentNumber: 2 }),
    ]);
    expect(sorted.map((r) => r.externalId)).toEqual(["b", "c"]);
  });

  it("regra de categoria pessoal: primeira palavra-chave contida", () => {
    expect(suggestPersonalCategory("COMPRA MERCADO EXEMPLO", [{ keyword: "mercado", categoryId: "cat_1" }])).toBe("cat_1");
    expect(suggestPersonalCategory("OUTRA", [{ keyword: "mercado", categoryId: "cat_1" }])).toBeNull();
  });

  it("pendente vira provisório com importPending; outros destinos do mapeamento ficam", () => {
    const pending = { preDisposition: { disposition: "pending" as const, reasonCode: "pending" } };
    expect(effectivePreDisposition(pending, true)).toBeNull();
    expect(effectivePreDisposition(pending, false)).toEqual(pending.preDisposition);
    const excluded = { preDisposition: { disposition: "excluded" as const, reasonCode: "user_pattern" } };
    expect(effectivePreDisposition(excluded, true)).toEqual(excluded.preDisposition);
  });
});

describe("decisão em memória", () => {
  it("corte por fatura no cartão; por data nos demais", () => {
    const card = { accountType: "CREDIT", cutoffBillDueDay: "2026-03-10", syncFromDay: "2026-03-01" };
    const bills = new Map([
      ["bill_old", "2026-03-10"],
      ["bill_new", "2026-04-10"],
    ]);
    const posted = "POSTED" as const;
    expect(cutoffDecision({ billId: "bill_old", ledgerDate: "2026-03-20", sourceStatus: posted }, card, bills)?.disposition).toBe("before_cutoff");
    expect(cutoffDecision({ billId: "bill_new", ledgerDate: "2026-01-01", sourceStatus: posted }, card, bills)).toBeNull();
    expect(cutoffDecision({ billId: null, ledgerDate: "2025-01-01", sourceStatus: "PENDING" }, card, bills)).toBeNull();
    expect(cutoffDecision({ billId: null, ledgerDate: "2025-01-01", sourceStatus: posted }, card, bills)).toEqual({ disposition: "needs_review", reasonCode: "missing_bill" });
    expect(cutoffDecision({ billId: "bill_x", ledgerDate: "2026-03-20", sourceStatus: posted }, card, bills)).toEqual({ disposition: "needs_review", reasonCode: "unknown_bill" });
    const bank = { accountType: "BANK", cutoffBillDueDay: null, syncFromDay: "2026-03-01" };
    expect(cutoffDecision({ billId: null, ledgerDate: "2026-02-28", sourceStatus: posted }, bank, bills)?.reasonCode).toBe("before_sync_from");
  });

  it("reclassificação tardia: created intocado vira excluded com soft delete; editado só diverge", async () => {
    const l = link({ id: "l1", externalId: "x1", transactionId: "t1" });
    const excluded = rec({ externalId: "x1", preDisposition: { disposition: "excluded", reasonCode: "bill_payment_debit" } });
    const plan = await decide(excluded, { links: [l], txs: [tx({ id: "t1", hasPluggyLink: true })] });
    expect(plan).toMatchObject({ outcome: "excluded", reclassified: true, softDelete: { transactionId: "t1" } });
    const manual = await decide(excluded, { links: [l], txs: [tx({ id: "t1", hasPluggyLink: true, categorySource: "manual" })] });
    expect(manual).toMatchObject({ outcome: "unchanged", divergence: true, softDelete: null });
  });

  it("excluded que deixa de ser vira needs_review / exclusion_reverted sem criar", async () => {
    const l = link({ id: "l1", externalId: "x1", disposition: "excluded", reasonCode: "bill_payment_debit" });
    const plan = await decide(rec({ externalId: "x1" }), { links: [l] });
    expect(plan).toMatchObject({ outcome: "needs_review", reasonCode: "exclusion_reverted", create: null });
  });

  it("registro novo sem candidatas é criado no escopo pessoal", async () => {
    const plan = await decide(rec({ externalId: "n1" }));
    expect(plan).toMatchObject({ outcome: "created", create: { cents: -2500, day: "2026-03-10" } });
  });

  it("pendente: provisório com importPending, pending sem a opção", async () => {
    const r = rec({ externalId: "p1", sourceStatus: "PENDING", preDisposition: { disposition: "pending", reasonCode: "pending" } });
    expect((await decide(r)).outcome).toBe("created");
    expect((await decide(r, {}, { importPending: false })).outcome).toBe("pending");
  });

  it("antes do corte → before_cutoff", async () => {
    expect((await decide(rec({ externalId: "e", sourceDate: "2025-12-31" }))).outcome).toBe("before_cutoff");
  });

  it("registro inalterado é no-op; valor novo atualiza a transação não editada; editada só diverge", async () => {
    const l = link({ id: "l1", externalId: "x1", transactionId: "t1" });
    const t = tx({ id: "t1", hasPluggyLink: true });
    const same = rec({ externalId: "x1" });
    const planSame = await decide(same, { links: [l], txs: [t] });
    expect(isNoopPlan(planSame, l, same)).toBe(true);

    const changed = rec({ externalId: "x1", amountCents: 2600 });
    const planUpd = await decide(changed, { links: [l], txs: [t] });
    expect(planUpd).toMatchObject({ outcome: "updated", updateTransaction: { id: "t1", cents: -2600 } });
    expect(isNoopPlan(planUpd, l, changed)).toBe(false);

    const planDiv = await decide(changed, { links: [l], txs: [tx({ id: "t1", cents: -3000, amount: -30, hasPluggyLink: true })] });
    expect(planDiv).toMatchObject({ outcome: "unchanged", divergence: true, updateTransaction: null });
  });

  it("identidade por providerId sem lançamento segue os passos e cria, substituindo o vínculo antigo", async () => {
    const old = link({ id: "l_old", externalId: "old", providerId: "prov_1", disposition: "pending", sourceStatus: "PENDING", sourceAmountCents: 2400 });
    const plan = await decide(rec({ externalId: "new", providerId: "prov_1" }), { links: [old] }, { importPending: false });
    expect(plan).toMatchObject({ outcome: "created", supersedeLinkIds: ["l_old"] });
  });

  it("registro pareado como recriado religa à transação antiga ausente", async () => {
    const old = link({ id: "l_old", externalId: "old", transactionId: "t1" });
    const plan = await decide(
      rec({ externalId: "new" }),
      { links: [old], txs: [tx({ id: "t1", hasPluggyLink: true })] },
      { recreatedPairs: new Map([["new", "t1"]]) }
    );
    expect(plan).toMatchObject({ outcome: "adopted", reasonCode: "recreated_match", supersedeLinkIds: ["l_old"] });
  });
});

