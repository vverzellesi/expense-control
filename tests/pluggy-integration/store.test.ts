import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { PluggyStoreError, processPluggyRecords, reconcileUnseenLinks } from "@/lib/pluggy/store";
import { acquirePluggyLease } from "@/lib/pluggy/lease";
import {
  applyBatch,
  byExternalId,
  countAllRows,
  createCountingClient,
  createLegacyInstallments,
  createOwner,
  createTestClient,
  noonUtc,
  rec,
  resetDatabase,
  simulateBatch,
  testLease,
  type Owner,
} from "./helpers";

const db: PrismaClient = createTestClient();

afterAll(async () => {
  await db.$disconnect();
});

let owner: Owner;

beforeEach(async () => {
  await resetDatabase(db);
  owner = await createOwner(db);
});

async function activeTxs(o: Owner = owner) {
  return db.transaction.findMany({
    where: { userId: o.userId, deletedAt: null },
    orderBy: [{ date: "asc" }, { currentInstallment: "asc" }],
  });
}

async function linkOf(externalId: string, accountLinkId = owner.accountLinkId) {
  return db.pluggyTransactionLink.findUnique({ where: { accountLinkId_externalId: { accountLinkId, externalId } } });
}

type Processed = Awaited<ReturnType<typeof applyBatch>>;

async function reconcile(processed: Processed, o: Owner = owner) {
  return reconcileUnseenLinks(db, {
    mode: "apply",
    ownerUserId: o.userId,
    accountLinkId: processed.accountLinkId,
    processed,
    readFrom: "2026-01-01",
    leaseToken: await testLease(db, o.userId),
  });
}

/** Leitura completa com só estes registros, seguida do reconcile. */
async function readAndReconcile(records: Parameters<typeof applyBatch>[2], o: Owner = owner) {
  const processed = await applyBatch(db, o, records);
  return { processed, reconciled: await reconcile(processed, o) };
}

const pendingPre = { disposition: "pending" as const, reasonCode: "pending" };

describe("criação e idempotência", () => {
  it("duas compras idênticas com ids diferentes viram duas transações", async () => {
    const r = await applyBatch(db, owner, [rec({ externalId: "tx_a" }), rec({ externalId: "tx_b" })]);
    expect(r.counts.created).toBe(2);
    const txs = await activeTxs();
    expect(txs).toHaveLength(2);
    expect(txs.every((t) => t.amount === -25 && t.spaceId === null && t.userId === owner.userId)).toBe(true);
    expect(txs.every((t) => t.origin === owner.originName)).toBe(true);
  });

  it("reexecutar o mesmo lote não cria nada", async () => {
    const batch = [rec({ externalId: "tx_a" }), rec({ externalId: "tx_b", description: "OUTRA LOJA" })];
    await applyBatch(db, owner, batch);
    const before = await countAllRows(db);
    const r = await applyBatch(db, owner, batch);
    expect(r.counts.created).toBe(0);
    expect(r.counts.unchanged).toBe(2);
    const after = await countAllRows(db);
    expect(after.Transaction).toBe(before.Transaction);
    expect(after.PluggyTransactionLink).toBe(before.PluggyTransactionLink);
  });

  it("grava ledgerDate às 12:00 UTC e o vínculo com os dados de origem", async () => {
    await applyBatch(db, owner, [rec({ externalId: "tx_a", sourceDate: "2026-04-30" })]);
    const [tx] = await activeTxs();
    expect(tx.date.toISOString()).toBe("2026-04-30T12:00:00.000Z");
    const link = await linkOf("tx_a");
    expect(link).toMatchObject({ disposition: "created", transactionId: tx.id, sourceAmountCents: 2500 });
  });

  it("quatro compras idênticas no mesmo dia, recriadas com ids novos, continuam quatro", async () => {
    const r1 = await applyBatch(db, owner, ["o1", "o2", "o3", "o4"].map((id) => rec({ externalId: id })));
    const oldTx = new Set(r1.results.map((x) => x.transactionId));
    const ids = ["n1", "n2", "n3", "n4"];
    const r2 = await applyBatch(db, owner, ids.map((id) => rec({ externalId: id })));
    expect(r2.counts).toMatchObject({ adopted: 4, created: 0 });
    expect(r2.results.every((x) => x.reasonCode === "recreated_match")).toBe(true);
    expect(new Set(r2.results.map((x) => x.transactionId))).toEqual(oldTx);
    expect(await reconcile(r2)).toMatchObject({ missingUpstream: 0, provisionalVanished: 0 });
    expect(await activeTxs()).toHaveLength(4);
  });
});

describe("pendentes do cartão e atualização a partir da fonte", () => {
  const pending = (o: Partial<Parameters<typeof rec>[0]> = {}) =>
    rec({ externalId: "pv", sourceStatus: "PENDING", preDisposition: pendingPre, ...o });

  it("pendente entra como lançamento provisório e, ao virar POSTED igual, não muda nada", async () => {
    const r1 = await applyBatch(db, owner, [pending()]);
    expect(r1.results[0].outcome).toBe("created");
    expect(await linkOf("pv")).toMatchObject({ disposition: "created", sourceStatus: "PENDING" });
    const r2 = await applyBatch(db, owner, [rec({ externalId: "pv", billId: "bill_test_1" })]);
    expect(r2.results[0].outcome).toBe("unchanged");
    expect(await linkOf("pv")).toMatchObject({ sourceStatus: "POSTED", billId: "bill_test_1" });
    expect(await db.transaction.count()).toBe(1);
  });

  it("valor e data novos atualizam a transação não editada, sem tocar na categoria", async () => {
    const cat = await db.category.create({ data: { name: "Escolhida", color: "#123", userId: owner.userId } });
    const r1 = await applyBatch(db, owner, [pending()]);
    const id = r1.results[0].transactionId as string;
    await db.transaction.update({ where: { id }, data: { categoryId: cat.id, categorySource: "manual" } });
    const r2 = await applyBatch(db, owner, [rec({ externalId: "pv", amountCents: 2650, sourceDate: "2026-03-12" })]);
    expect(r2.results[0].outcome).toBe("updated");
    expect(await db.transaction.findUniqueOrThrow({ where: { id } })).toMatchObject({
      amount: -26.5,
      categoryId: cat.id,
      categorySource: "manual",
    });
    expect((await db.transaction.findUniqueOrThrow({ where: { id } })).date.toISOString().slice(0, 10)).toBe("2026-03-12");
    expect(await linkOf("pv")).toMatchObject({ sourceAmountCents: 2650, sourceStatus: "POSTED" });
  });

  it("transação editada pelo usuário não é sobrescrita: só divergence", async () => {
    const r1 = await applyBatch(db, owner, [pending()]);
    const id = r1.results[0].transactionId as string;
    await db.transaction.update({ where: { id }, data: { amount: -30 } });
    const r2 = await applyBatch(db, owner, [rec({ externalId: "pv", amountCents: 2650 })]);
    expect(r2.results[0]).toMatchObject({ outcome: "unchanged", divergence: true });
    expect(r2.divergences).toBe(1);
    expect((await db.transaction.findUniqueOrThrow({ where: { id } })).amount).toBe(-30);
    expect((await linkOf("pv"))?.sourceAmountCents).toBe(2500);
  });

  it("com importPending desligado, PENDING vira pending e depois POSTED é criado uma vez só", async () => {
    const off = { importPending: false };
    expect((await applyBatch(db, owner, [pending()], off)).results[0].outcome).toBe("pending");
    expect(await db.transaction.count()).toBe(0);
    expect((await applyBatch(db, owner, [rec({ externalId: "pv" })], off)).results[0].outcome).toBe("created");
    expect((await applyBatch(db, owner, [rec({ externalId: "pv" })], off)).results[0].outcome).toBe("unchanged");
    expect(await db.transaction.count()).toBe(1);
    expect(await db.pluggyTransactionLink.count()).toBe(1);
  });

  it("provisório que some numa leitura completa é apagado (soft delete); POSTED que some só conta", async () => {
    await applyBatch(db, owner, [
      rec({ externalId: "keep" }),
      pending({ externalId: "gone_p", description: "COMPRA PROVISORIA", amountCents: 1500 }),
      pending({
        externalId: "gone_inst",
        description: "PARCELADA PROVISORIA",
        amountCents: 3000,
        installmentNumber: 1,
        totalInstallments: 3,
        purchaseDate: "2026-03-10",
      }),
      rec({ externalId: "lost", description: "OUTRA LOJA" }),
    ]);
    expect(await db.transaction.count({ where: { deletedAt: null } })).toBe(6);
    const simulated = await simulateBatch(db, owner, [rec({ externalId: "keep" })]);
    const sim = await reconcileUnseenLinks(db, {
      mode: "simulate",
      ownerUserId: owner.userId,
      accountLinkId: owner.accountLinkId,
      processed: simulated,
      readFrom: "2026-01-01",
    });
    expect(sim).toMatchObject({ missingUpstream: 1, provisionalVanished: 2, provisionalTransactionsDeleted: 4 });
    expect(await db.transaction.count({ where: { deletedAt: null } })).toBe(6);

    const { reconciled: r } = await readAndReconcile([rec({ externalId: "keep" })]);
    expect(r).toEqual(sim);
    expect(await linkOf("gone_p")).toMatchObject({ disposition: "superseded", reasonCode: "provisional_vanished" });
    expect((await activeTxs()).map((t) => t.description).sort()).toEqual(["LOJA EXEMPLO", "OUTRA LOJA"]);
  });

  it("destino pending (opção desligada) que some vira needs_review / pending_vanished", async () => {
    await applyBatch(db, owner, [rec({ externalId: "keep" }), pending({ externalId: "gone" })], { importPending: false });
    const r = await reconcile(await applyBatch(db, owner, [rec({ externalId: "keep" })], { importPending: false }));
    expect(r.pendingVanished).toBe(1);
    expect(await linkOf("gone")).toMatchObject({ disposition: "needs_review", reasonCode: "pending_vanished" });
  });
});

describe("provisório que some e volta (P1 da revisão)", () => {
  const pv = (o: Partial<Parameters<typeof rec>[0]> = {}) =>
    rec({ externalId: "pv", sourceStatus: "PENDING", preDisposition: pendingPre, ...o });

  it("volta com o mesmo id: a transação apagada pelo sistema é restaurada", async () => {
    const r1 = await applyBatch(db, owner, [rec({ externalId: "keep" }), pv()]);
    const id = byExternalId(r1.results).pv.transactionId as string;
    await readAndReconcile([rec({ externalId: "keep" })]);
    expect((await db.transaction.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();

    const back = await applyBatch(db, owner, [rec({ externalId: "keep" }), pv({ sourceStatus: "POSTED" })]);
    expect(byExternalId(back.results).pv).toMatchObject({ outcome: "restored", transactionId: id });
    expect((await db.transaction.findUniqueOrThrow({ where: { id } })).deletedAt).toBeNull();
    expect(await linkOf("pv")).toMatchObject({ disposition: "created", systemDeletedAt: null });
    expect(await activeTxs()).toHaveLength(2);
  });

  it("volta com id novo e a mesma chave: cria de novo (não religa na transação apagada)", async () => {
    await applyBatch(db, owner, [rec({ externalId: "keep" }), pv()]);
    await readAndReconcile([rec({ externalId: "keep" })]);
    const back = await applyBatch(db, owner, [rec({ externalId: "keep" }), pv({ externalId: "pv_new" })]);
    expect(byExternalId(back.results).pv_new.outcome).toBe("created");
    expect(await activeTxs()).toHaveLength(2);
  });

  it("apagada pelo usuário depois não é restaurada", async () => {
    const r1 = await applyBatch(db, owner, [rec({ externalId: "keep" }), pv()]);
    const id = byExternalId(r1.results).pv.transactionId as string;
    await readAndReconcile([rec({ externalId: "keep" })]);
    await db.transaction.update({ where: { id }, data: { deletedAt: new Date(Date.now() + 1000) } });
    const back = await applyBatch(db, owner, [rec({ externalId: "keep" }), pv()]);
    // O vínculo volta a valer, mas nada é restaurado nem contado como restaurado.
    expect(byExternalId(back.results).pv.outcome).toBe("unchanged");
    expect((await db.transaction.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
  });

  it("reconcile exige o resultado completo do lote da mesma conta", async () => {
    const r = await applyBatch(db, owner, [rec({ externalId: "keep" })]);
    await expect(
      reconcileUnseenLinks(db, {
        mode: "apply",
        ownerUserId: owner.userId,
        accountLinkId: owner.accountLinkId,
        processed: { ...r, complete: false },
        readFrom: "2026-01-01",
        leaseToken: await testLease(db, owner.userId),
      })
    ).rejects.toMatchObject({ code: "reconcile_requires_processed_batch" });
  });

  it("vínculo cuja transação foi apagada de vez não deixa um id novo recriar o lançamento", async () => {
    const r1 = await applyBatch(db, owner, [rec({ externalId: "h1" })]);
    await db.transaction.delete({ where: { id: r1.results[0].transactionId as string } });
    for (let run = 0; run < 3; run++) {
      const r = await applyBatch(db, owner, [rec({ externalId: "h2" })]);
      expect(r.results[0]).toMatchObject({ outcome: "needs_review", reasonCode: "linked_transaction_deleted" });
    }
    expect(await db.transaction.count()).toBe(0);
  });

  it("provisório que volta depois de purgado da lixeira vai para revisão, sem recriar", async () => {
    const r1 = await applyBatch(db, owner, [rec({ externalId: "keep" }), pv()]);
    await readAndReconcile([rec({ externalId: "keep" })]);
    await db.transaction.delete({ where: { id: byExternalId(r1.results).pv.transactionId as string } });
    for (let run = 0; run < 2; run++) {
      const back = await applyBatch(db, owner, [rec({ externalId: "keep" }), pv({ sourceStatus: "POSTED" })]);
      expect(byExternalId(back.results).pv).toMatchObject({ outcome: "needs_review", reasonCode: "linked_transaction_deleted" });
    }
    expect(await activeTxs()).toHaveLength(1);
  });

  it("simulação do reconcile considera a religação feita em memória", async () => {
    await applyBatch(db, owner, [pv({ externalId: "pa" })]);
    const simulated = await simulateBatch(db, owner, [pv({ externalId: "pb" })]);
    expect(simulated.results[0]).toMatchObject({ outcome: "adopted", reasonCode: "recreated_match" });
    const sim = await reconcileUnseenLinks(db, {
      mode: "simulate",
      ownerUserId: owner.userId,
      accountLinkId: owner.accountLinkId,
      processed: simulated,
      readFrom: "2026-01-01",
    });
    const { reconciled } = await readAndReconcile([pv({ externalId: "pb" })]);
    expect(sim).toEqual(reconciled);
    expect(reconciled).toMatchObject({ provisionalVanished: 0, provisionalTransactionsDeleted: 0 });
    expect(await activeTxs()).toHaveLength(1);
  });
});

describe("reclassificação tardia pelas regras de lote", () => {
  const debit = (o: Partial<Parameters<typeof rec>[0]> = {}) =>
    rec({ externalId: "pay_debit", accountType: "BANK", description: "PAGAMENTO EXEMPLO", amountCents: 50000, ...o });
  const excludedLater = { preDisposition: { disposition: "excluded" as const, reasonCode: "bill_payment_debit" } };

  it("created intocado que passa a excluded sofre soft delete e muda o vínculo", async () => {
    const r1 = await applyBatch(db, owner, [debit()]);
    const id = r1.results[0].transactionId as string;
    const r2 = await applyBatch(db, owner, [debit(excludedLater)]);
    expect(r2.results[0]).toMatchObject({ outcome: "excluded", reasonCode: "bill_payment_debit", reclassifiedExcluded: true });
    expect(r2.reclassifiedExcluded).toBe(1);
    expect((await db.transaction.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect(await linkOf("pay_debit")).toMatchObject({ disposition: "excluded", reasonCode: "bill_payment_debit", transactionId: id });
    const r3 = await applyBatch(db, owner, [debit(excludedLater)]);
    expect(r3.results[0].outcome).toBe("excluded");
    expect(r3.reclassifiedExcluded).toBe(0);
  });

  it("editada (valor) ou com categoria manual: só divergence, nada muda", async () => {
    const r1 = await applyBatch(db, owner, [debit(), debit({ externalId: "fee", description: "TARIFA EXEMPLO", amountCents: 1990 })]);
    const res = byExternalId(r1.results);
    await db.transaction.update({ where: { id: res.pay_debit.transactionId as string }, data: { amount: -499 } });
    const cat = await db.category.create({ data: { name: "Tarifas", color: "#999", userId: owner.userId } });
    await db.transaction.update({ where: { id: res.fee.transactionId as string }, data: { categoryId: cat.id, categorySource: "manual" } });
    const r2 = await applyBatch(db, owner, [
      debit(excludedLater),
      debit({ externalId: "fee", description: "TARIFA EXEMPLO", amountCents: 1990, preDisposition: { disposition: "excluded", reasonCode: "offsetting_refund" } }),
    ]);
    expect(r2.results.every((x) => x.outcome === "unchanged" && x.divergence)).toBe(true);
    expect(await activeTxs()).toHaveLength(2);
    expect((await linkOf("fee"))?.disposition).toBe("created");
  });

  it("excluded que deixa de ser vira needs_review / exclusion_reverted, sem criar nada", async () => {
    await applyBatch(db, owner, [debit(excludedLater)]);
    expect(await db.transaction.count()).toBe(0);
    const r2 = await applyBatch(db, owner, [debit()]);
    expect(r2.results[0]).toMatchObject({ outcome: "needs_review", reasonCode: "exclusion_reverted" });
    const r3 = await applyBatch(db, owner, [debit()]);
    expect(r3.results[0]).toMatchObject({ outcome: "needs_review", reasonCode: "exclusion_reverted" });
    expect(await db.transaction.count()).toBe(0);
    const r4 = await applyBatch(db, owner, [debit(excludedLater)]);
    expect(r4.results[0].outcome).toBe("excluded");
  });

  it("compra parcelada reclassificada leva junto as projeções que só ela gerou", async () => {
    const inst = { externalId: "inst", description: "COMPRA PARCELADA", amountCents: 3000, installmentNumber: 1, totalInstallments: 3, purchaseDate: "2026-03-10" };
    await applyBatch(db, owner, [rec(inst)]);
    expect(await activeTxs()).toHaveLength(3);
    const r = await applyBatch(db, owner, [rec({ ...inst, preDisposition: { disposition: "excluded", reasonCode: "user_pattern" } })]);
    expect(r.reclassifiedExcluded).toBe(1);
    expect(await activeTxs()).toHaveLength(0);
  });

  it("lançamento adotado (do usuário) que a fonte passa a excluir não é apagado, só sinalizado", async () => {
    await db.transaction.create({
      data: { userId: owner.userId, description: "PAGAMENTO EXEMPLO", amount: -500, date: noonUtc("2026-03-10"), type: "EXPENSE", origin: owner.originName },
    });
    expect((await applyBatch(db, owner, [debit()])).results[0].outcome).toBe("adopted");
    const r = await applyBatch(db, owner, [debit(excludedLater)]);
    expect(r.results[0]).toMatchObject({ outcome: "unchanged", divergence: true });
    expect(await activeTxs()).toHaveLength(1);
  });
});

describe("corte do cartão por fatura", () => {
  const bills = { bill_old: "2026-03-10", bill_new: "2026-04-10" };
  beforeEach(async () => {
    await db.pluggyAccountLink.update({
      where: { id: owner.accountLinkId },
      data: { cutoffBillDueDate: new Date("2026-03-10T03:00:00.000Z"), syncFrom: new Date("2026-03-01T03:00:00.000Z") },
    });
  });

  it("fatura até o corte → before_cutoff; ciclo aberto ou fatura posterior seguem; fatura desconhecida → revisão", async () => {
    const r = await applyBatch(
      db,
      owner,
      [
        rec({ externalId: "b_old", billId: "bill_old", sourceDate: "2026-03-05", description: "NA FATURA ANTIGA" }),
        rec({ externalId: "b_new", billId: "bill_new", sourceDate: "2026-02-27", description: "DATA ANTIGA FATURA NOVA" }),
        rec({ externalId: "b_open", billId: null, sourceDate: "2026-02-20", sourceStatus: "PENDING", description: "CICLO ABERTO" }),
        rec({ externalId: "b_unknown", billId: "bill_x", description: "FATURA DESCONHECIDA" }),
      ],
      { billDueDates: bills }
    );
    const res = byExternalId(r.results);
    expect(res.b_old).toMatchObject({ outcome: "before_cutoff", reasonCode: "before_cutoff_bill" });
    expect(res.b_new.outcome).toBe("created");
    expect(res.b_open.outcome).toBe("created");
    expect(res.b_unknown).toMatchObject({ outcome: "needs_review", reasonCode: "unknown_bill" });
    expect((await activeTxs()).map((t) => t.description).sort()).toEqual(["CICLO ABERTO", "DATA ANTIGA FATURA NOVA"]);
  });

  it("lançado (POSTED) sem billId num cartão com corte por fatura vai para revisão", async () => {
    const r = await applyBatch(db, owner, [rec({ externalId: "nobill", billId: null, sourceDate: "2026-01-10" })], { billDueDates: bills });
    expect(r.results[0]).toMatchObject({ outcome: "needs_review", reasonCode: "missing_bill" });
    expect(await db.transaction.count()).toBe(0);
  });

  it("registro posterior ao corte ainda adota a projeção legada do PDF", async () => {
    const { txs } = await createLegacyInstallments(db, owner, {
      description: "LOJA PARCELADA",
      amount: 60,
      total: 4,
      startDay: "2026-01-15",
      items: [{ number: 3, day: "2026-03-15" }],
    });
    const r = await applyBatch(
      db,
      owner,
      [rec({ externalId: "inst3", billId: "bill_new", description: "LOJA PARCELADA", amountCents: 6000, installmentNumber: 3, totalInstallments: 4, sourceDate: "2026-03-20", ledgerDate: "2026-03-15", purchaseDate: "2026-01-15" })],
      { billDueDates: bills }
    );
    expect(r.results[0]).toMatchObject({ outcome: "adopted", reasonCode: "installment_projection", transactionId: txs[0].id });
  });

  it("conta sem corte por fatura continua com syncFrom por data", async () => {
    await db.pluggyAccountLink.update({ where: { id: owner.accountLinkId }, data: { cutoffBillDueDate: null } });
    const r = await applyBatch(db, owner, [rec({ externalId: "d1", billId: "bill_new", sourceDate: "2026-02-27" })], { billDueDates: bills });
    expect(r.results[0]).toMatchObject({ outcome: "before_cutoff", reasonCode: "before_sync_from" });
  });
});

describe("parcelas", () => {
  it("duas compras parceladas idênticas viram dois grupos", async () => {
    const base = { description: "LOJA EXEMPLO", amountCents: 3000, installmentNumber: 1, totalInstallments: 3, purchaseDate: "2026-03-10" };
    const r = await applyBatch(db, owner, [rec({ ...base, externalId: "i_a" }), rec({ ...base, externalId: "i_b" })]);
    expect(r.counts.created).toBe(2);
    expect(await db.installment.count()).toBe(2);
    expect(await activeTxs()).toHaveLength(6);
  });

  it("projeção adotada com data deslocada passa à data da fonte e aceita atualização depois", async () => {
    const { txs } = await createLegacyInstallments(db, owner, {
      description: "LOJA EXEMPLO",
      amount: 50,
      total: 5,
      startDay: "2026-01-15",
      items: [{ number: 2, day: "2026-02-15" }],
    });
    const base = { description: "LOJA EXEMPLO", installmentNumber: 2, totalInstallments: 5, sourceDate: "2026-02-20", ledgerDate: "2026-02-17", purchaseDate: "2026-01-17" };
    await applyBatch(db, owner, [rec({ ...base, externalId: "s2", amountCents: 5000 })]);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: txs[0].id } })).date.toISOString().slice(0, 10)).toBe("2026-02-17");
    const r = await applyBatch(db, owner, [rec({ ...base, externalId: "s2", amountCents: 5010 })]);
    expect(r.results[0]).toMatchObject({ outcome: "updated", divergence: false });
  });

  it("moeda que não é BRL vai para revisão mesmo sem destino prévio", async () => {
    const r = await applyBatch(db, owner, [rec({ externalId: "fx", currencyCode: "USD" })]);
    expect(r.results[0]).toMatchObject({ outcome: "needs_review", reasonCode: "foreign_currency" });
  });

  it("parcela 2/10 adota a projeção existente e corrige o valor para o da fonte", async () => {
    const { txs } = await createLegacyInstallments(db, owner, {
      description: "LOJA EXEMPLO",
      amount: 100,
      total: 10,
      startDay: "2026-01-15",
      items: [
        { number: 1, day: "2026-01-15" },
        { number: 2, day: "2026-02-15" },
      ],
    });
    const r = await applyBatch(db, owner, [
      rec({
        externalId: "inst_2",
        sourceDate: "2026-02-25",
        ledgerDate: "2026-02-15",
        purchaseDate: "2026-01-15",
        description: "LOJA EXEMPLO",
        amountCents: 10007,
        installmentNumber: 2,
        totalInstallments: 10,
      }),
    ]);
    expect(r.results[0]).toMatchObject({
      outcome: "adopted",
      reasonCode: "installment_projection",
      transactionId: txs[1].id,
      projectionAmountCorrected: true,
    });
    expect(r.projectionAmountCorrected).toBe(1);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: txs[1].id } })).amount).toBe(-100.07);
    expect(await db.transaction.count()).toBe(2);
  });

  it("duas compras 2/10 de mesmo valor no mesmo mês, distinguíveis pela data", async () => {
    const a = await createLegacyInstallments(db, owner, {
      description: "COMPRA A",
      amount: 50,
      total: 10,
      startDay: "2026-01-05",
      items: [{ number: 2, day: "2026-02-05" }],
    });
    const b = await createLegacyInstallments(db, owner, {
      description: "COMPRA B",
      amount: 50,
      total: 10,
      startDay: "2026-01-20",
      items: [{ number: 2, day: "2026-02-20" }],
    });
    const common = { amountCents: 5000, installmentNumber: 2, totalInstallments: 10, description: "PAGAMENTO EXEMPLO", sourceDate: "2026-02-25" };
    const r = await applyBatch(db, owner, [
      rec({ ...common, externalId: "p_a", ledgerDate: "2026-02-05", purchaseDate: "2026-01-05" }),
      rec({ ...common, externalId: "p_b", ledgerDate: "2026-02-20", purchaseDate: "2026-01-20" }),
    ]);
    const res = byExternalId(r.results);
    expect(res.p_a).toMatchObject({ outcome: "adopted", transactionId: a.txs[0].id });
    expect(res.p_b).toMatchObject({ outcome: "adopted", transactionId: b.txs[0].id });
  });

  it("compras indistinguíveis vão para revisão (não existe 'adota a mais antiga')", async () => {
    for (const _ of [1, 2]) {
      await createLegacyInstallments(db, owner, {
        description: "LOJA EXEMPLO",
        amount: 50,
        total: 10,
        startDay: "2026-01-10",
        items: [{ number: 2, day: "2026-02-10" }],
      });
    }
    const common = { amountCents: 5000, installmentNumber: 2, totalInstallments: 10, description: "LOJA EXEMPLO", sourceDate: "2026-02-10", purchaseDate: "2026-01-10" };
    const r = await applyBatch(db, owner, [rec({ ...common, externalId: "i_1" }), rec({ ...common, externalId: "i_2" })]);
    expect(r.results.map((x) => [x.outcome, x.reasonCode])).toEqual([
      ["needs_review", "ambiguous_installment"],
      ["needs_review", "ambiguous_installment"],
    ]);
    expect(await db.transaction.count()).toBe(2);
  });

  it("sem evidência da compra (data ou descrição) vai para revisão, mesmo com candidata única", async () => {
    await createLegacyInstallments(db, owner, {
      description: "COMPRA A",
      amount: 50,
      total: 10,
      startDay: "2026-01-05",
      items: [{ number: 2, day: "2026-02-05" }],
    });
    await createLegacyInstallments(db, owner, {
      description: "COMPRA B",
      amount: 50,
      total: 10,
      startDay: "2026-01-20",
      items: [{ number: 2, day: "2026-02-20" }],
    });
    await createLegacyInstallments(db, owner, {
      description: "COMPRA C",
      amount: 70,
      total: 5,
      startDay: "2026-01-05",
      items: [{ number: 3, day: "2026-03-05" }],
    });
    const r = await applyBatch(db, owner, [
      rec({ externalId: "x_1", description: "OUTRA LOJA", amountCents: 5000, installmentNumber: 2, totalInstallments: 10, sourceDate: "2026-02-12", purchaseDate: "2026-01-12" }),
      rec({ externalId: "x_2", description: "TERCEIRA LOJA", amountCents: 7000, installmentNumber: 3, totalInstallments: 5, sourceDate: "2026-03-20", purchaseDate: "2026-01-20" }),
    ]);
    const res = byExternalId(r.results);
    expect(res.x_1).toMatchObject({ outcome: "needs_review", reasonCode: "unconfirmed_installment" });
    expect(res.x_2).toMatchObject({ outcome: "needs_review", reasonCode: "unconfirmed_installment" });
    expect(await db.transaction.count()).toBe(3);
  });

  it("cria compra parcelada com grupo e projeções N+1..T, datas pela data da compra", async () => {
    const r = await applyBatch(db, owner, [
      rec({ externalId: "new_1", description: "LOJA EXEMPLO", amountCents: 3000, installmentNumber: 2, totalInstallments: 4, sourceDate: "2026-03-14", ledgerDate: "2026-03-10", purchaseDate: "2026-02-10" }),
    ]);
    expect(r.results[0]).toMatchObject({ outcome: "created", projectionsCreated: 2, groupCreated: true });
    const txs = await activeTxs();
    expect(txs.map((t) => [t.currentInstallment, t.date.toISOString().slice(0, 10), t.description])).toEqual([
      [2, "2026-03-10", "LOJA EXEMPLO"],
      [3, "2026-04-10", "LOJA EXEMPLO (3/4)"],
      [4, "2026-05-10", "LOJA EXEMPLO (4/4)"],
    ]);
    expect(new Set(txs.map((t) => t.installmentId)).size).toBe(1);
    const group = await db.installment.findFirstOrThrow();
    expect(group.startDate.toISOString().slice(0, 10)).toBe("2026-02-10");
    expect(group.spaceId).toBeNull();
  });

  it("projeções no fim do mês e em ano bissexto não transbordam", async () => {
    const owner2 = await createOwner(db, { originName: "Cartão Dois" });
    await applyBatch(db, owner2, [
      rec({ externalId: "leap", sourceDate: "2028-01-31", amountCents: 1000, installmentNumber: 1, totalInstallments: 3 }),
      rec({ externalId: "noleap", sourceDate: "2027-01-31", amountCents: 1100, installmentNumber: 1, totalInstallments: 2 }),
      rec({ externalId: "bypurchase", sourceDate: "2028-03-05", ledgerDate: "2028-02-29", purchaseDate: "2028-01-31", amountCents: 1200, installmentNumber: 2, totalInstallments: 3 }),
    ]);
    const days = (await activeTxs(owner2)).map((t) => t.amount + "@" + t.date.toISOString().slice(0, 10)).sort();
    expect(days).toEqual([
      "-10@2028-01-31",
      "-10@2028-02-29",
      "-10@2028-03-31",
      "-11@2027-01-31",
      "-11@2027-02-28",
      "-12@2028-02-29",
      "-12@2028-03-31",
    ]);
  });

  it("3/T processada antes de 2/T (execuções separadas) não gera duas projeções 3/T", async () => {
    const base = { description: "LOJA EXEMPLO", amountCents: 4000, totalInstallments: 5, purchaseDate: "2026-01-10" };
    await applyBatch(db, owner, [rec({ ...base, externalId: "p3", installmentNumber: 3, sourceDate: "2026-03-10" })]);
    await applyBatch(db, owner, [
      rec({ ...base, externalId: "p3", installmentNumber: 3, sourceDate: "2026-03-10" }),
      rec({ ...base, externalId: "p2", installmentNumber: 2, sourceDate: "2026-02-10" }),
    ]);
    const txs = await activeTxs();
    expect(txs.map((t) => t.currentInstallment)).toEqual([2, 3, 4, 5]);
    expect(new Set(txs.map((t) => t.installmentId)).size).toBe(1);
    expect(await db.installment.count()).toBe(1);
  });

  it("parcelas da mesma compra no mesmo lote, fora de ordem, são processadas por N crescente", async () => {
    const base = { description: "LOJA EXEMPLO", amountCents: 4000, totalInstallments: 4, purchaseDate: "2026-01-10" };
    const r = await applyBatch(db, owner, [
      rec({ ...base, externalId: "q3", installmentNumber: 3, sourceDate: "2026-03-10" }),
      rec({ ...base, externalId: "q2", installmentNumber: 2, sourceDate: "2026-02-10" }),
    ]);
    const res = byExternalId(r.results);
    expect(res.q2).toMatchObject({ outcome: "created", projectionsCreated: 2 });
    expect(res.q3).toMatchObject({ outcome: "adopted", reasonCode: "installment_projection" });
    expect((await activeTxs()).map((t) => t.currentInstallment)).toEqual([2, 3, 4]);
  });

  it("parcela 1 com centavos de resto: a 2/T adota a projeção e corrige o valor", async () => {
    const base = { description: "LOJA EXEMPLO", totalInstallments: 5, purchaseDate: "2026-01-10" };
    await applyBatch(db, owner, [rec({ ...base, externalId: "r1", installmentNumber: 1, amountCents: 4003, sourceDate: "2026-01-10" })]);
    const r = await applyBatch(db, owner, [
      rec({ ...base, externalId: "r1", installmentNumber: 1, amountCents: 4003, sourceDate: "2026-01-10" }),
      rec({ ...base, externalId: "r2", installmentNumber: 2, amountCents: 4000, sourceDate: "2026-02-10" }),
    ]);
    expect(byExternalId(r.results).r2).toMatchObject({ outcome: "adopted", projectionAmountCorrected: true });
    expect((await activeTxs()).map((t) => t.amount)).toEqual([-40.03, -40, -40.03, -40.03, -40.03]);
  });

  it("falha forçada no meio das projeções desfaz tudo e a reexecução completa", async () => {
    const record = rec({ externalId: "boom", description: "LOJA EXEMPLO", amountCents: 2000, installmentNumber: 2, totalInstallments: 6, purchaseDate: "2026-02-10" });
    await expect(
      applyBatch(db, owner, [record], {
        onWrite: (step) => {
          if (step === "projection:4") throw new Error("forced failure");
        },
      })
    ).rejects.toThrow("forced failure");
    expect(await db.transaction.count()).toBe(0);
    expect(await db.installment.count()).toBe(0);
    expect(await db.pluggyTransactionLink.count()).toBe(0);

    const r = await applyBatch(db, owner, [record]);
    expect(r.results[0]).toMatchObject({ outcome: "created", projectionsCreated: 4 });
    expect((await activeTxs()).map((t) => t.currentInstallment)).toEqual([2, 3, 4, 5, 6]);
  });
});

describe("lançamentos legados", () => {
  async function legacy(description: string, day = "2026-03-10", amount = -25, deletedAt: Date | null = null) {
    return db.transaction.create({
      data: { userId: owner.userId, description, amount, date: noonUtc(day), type: "EXPENSE", origin: owner.originName, deletedAt },
    });
  }

  it("lançamento legado igual é adotado", async () => {
    const old = await legacy("Loja Exemplo");
    const r = await applyBatch(db, owner, [rec({ externalId: "l_1" })]);
    expect(r.results[0]).toMatchObject({ outcome: "adopted", reasonCode: "legacy_match", transactionId: old.id });
    expect(await db.transaction.count()).toBe(1);
  });

  it("mesmo dia e valor com descrição diferente vai para revisão", async () => {
    await legacy("OUTRA DESCRICAO");
    const r = await applyBatch(db, owner, [rec({ externalId: "l_1" })]);
    expect(r.results[0]).toMatchObject({ outcome: "needs_review", reasonCode: "possible_duplicate" });
    expect(await db.transaction.count()).toBe(1);
  });

  it("mais de um legado exato vai para revisão", async () => {
    await legacy("LOJA EXEMPLO");
    await legacy("LOJA EXEMPLO");
    const r = await applyBatch(db, owner, [rec({ externalId: "l_1" })]);
    expect(r.results[0]).toMatchObject({ outcome: "needs_review", reasonCode: "ambiguous_legacy" });
  });

  it("legado apagado (soft delete) é adotado sem ser ressuscitado", async () => {
    const old = await legacy("LOJA EXEMPLO", "2026-03-10", -25, new Date());
    const r = await applyBatch(db, owner, [rec({ externalId: "l_1" })]);
    expect(r.results[0]).toMatchObject({ outcome: "adopted", transactionId: old.id });
    expect((await db.transaction.findUniqueOrThrow({ where: { id: old.id } })).deletedAt).not.toBeNull();
    expect(await db.transaction.count()).toBe(1);
  });

  it("transação de espaço compartilhado não é candidata", async () => {
    const space = await db.space.create({ data: { name: "Espaço", createdBy: owner.userId } });
    await db.transaction.create({
      data: { userId: owner.userId, spaceId: space.id, description: "LOJA EXEMPLO", amount: -25, date: noonUtc("2026-03-10"), type: "EXPENSE", origin: owner.originName },
    });
    const r = await applyBatch(db, owner, [rec({ externalId: "l_1" })]);
    expect(r.results[0].outcome).toBe("created");
  });
});

describe("recriados e linhagem", () => {
  it("pendente recriado com outro id, mesmo providerId, POSTED com valor e data novos: nunca adopted sem transação", async () => {
    const old = rec({ externalId: "old_pd", providerId: "prov_1", sourceStatus: "PENDING", sourceDate: "2026-03-08", amountCents: 2400, preDisposition: pendingPre });
    const now = rec({ externalId: "new_pd", providerId: "prov_1", sourceDate: "2026-03-10", amountCents: 2500 });

    // Opção desligada: a identidade canônica não tem lançamento → segue os passos e cria.
    await applyBatch(db, owner, [old], { importPending: false });
    const r = await applyBatch(db, owner, [now], { importPending: false });
    expect(r.results[0].outcome).toBe("created");
    expect(r.results[0].transactionId).not.toBeNull();
    expect((await activeTxs())[0]).toMatchObject({ amount: -25 });
    expect((await linkOf("old_pd"))?.disposition).toBe("superseded");

    // Opção ligada: o provisório existe → adota e atualiza valor e data.
    const o2 = await createOwner(db, { originName: "Cartão Provisório" });
    const first = await applyBatch(db, o2, [old]);
    const second = await applyBatch(db, o2, [now]);
    expect(second.results[0]).toMatchObject({ outcome: "adopted", reasonCode: "provider_id_match", transactionId: first.results[0].transactionId });
    const [tx] = await activeTxs(o2);
    expect(tx.amount).toBe(-25);
    expect(tx.date.toISOString().slice(0, 10)).toBe("2026-03-10");
  });

  it("registro recriado com id novo e mesmo providerId aponta para a mesma transação", async () => {
    const r1 = await applyBatch(db, owner, [rec({ externalId: "e1", providerId: "prov_2" })]);
    const r2 = await applyBatch(db, owner, [rec({ externalId: "e2", providerId: "prov_2", description: "LOJA EXEMPLO LTDA" })]);
    expect(r2.results[0]).toMatchObject({ outcome: "adopted", reasonCode: "provider_id_match", transactionId: r1.results[0].transactionId });
    expect((await linkOf("e1"))?.disposition).toBe("superseded");
    expect(await db.transaction.count()).toBe(1);
  });

  it("recriado sem providerId religa; antigos que sobram ficam em missing_upstream", async () => {
    const r1 = await applyBatch(db, owner, [rec({ externalId: "r1" })]);
    const r2 = await applyBatch(db, owner, [rec({ externalId: "r2" })]);
    expect(r2.results[0]).toMatchObject({ outcome: "adopted", reasonCode: "recreated_match", transactionId: r1.results[0].transactionId });
    expect((await linkOf("r1"))?.disposition).toBe("superseded");

    const other = await createOwner(db, { originName: "Cartão Dois Antigos" });
    await applyBatch(db, other, [rec({ externalId: "a1" }), rec({ externalId: "a2" })]);
    const r3 = await applyBatch(db, other, [rec({ externalId: "a3" })]);
    expect(r3.results[0]).toMatchObject({ outcome: "adopted", reasonCode: "recreated_match" });
    expect(await reconcile(r3, other)).toMatchObject({ missingUpstream: 1 });
    expect(await activeTxs(other)).toHaveLength(2);
  });

  it("dois registros novos idênticos não religam no mesmo lançamento antigo", async () => {
    const r1 = await applyBatch(db, owner, [rec({ externalId: "o1" })]);
    const r = await applyBatch(db, owner, [rec({ externalId: "n1" }), rec({ externalId: "n2" })]);
    const res = byExternalId(r.results);
    expect(res.n1).toMatchObject({ outcome: "adopted", transactionId: r1.results[0].transactionId });
    expect(res.n2.outcome).toBe("created");
    expect(res.n2.transactionId).not.toBe(r1.results[0].transactionId);
    expect(await db.transaction.count()).toBe(2);
  });

  it("alias histórico ausente não vira candidato quando outro alias da mesma transação está presente", async () => {
    const r1 = await applyBatch(db, owner, [rec({ externalId: "h1", providerId: "prov_3" })]);
    await applyBatch(db, owner, [rec({ externalId: "h2", providerId: "prov_3" })]);
    const r = await applyBatch(db, owner, [rec({ externalId: "h2", providerId: "prov_3" }), rec({ externalId: "h4" })]);
    const res = byExternalId(r.results);
    expect(res.h2.outcome).toBe("unchanged");
    expect(res.h4.outcome).toBe("created");
    expect(res.h4.transactionId).not.toBe(r1.results[0].transactionId);
    expect(await db.transaction.count()).toBe(2);
  });

  it("reconexão: conta nova que substitui a antiga reconhece providerId e recriado da linhagem", async () => {
    const r1 = await applyBatch(db, owner, [
      rec({ externalId: "old_a", providerId: "prov_9" }),
      rec({ externalId: "old_b", description: "OUTRA LOJA", amountCents: 990 }),
    ]);
    const old = byExternalId(r1.results);
    await db.pluggyAccountLink.update({ where: { id: owner.accountLinkId }, data: { enabled: false } });
    const newLink = await db.pluggyAccountLink.create({
      data: {
        userId: owner.userId,
        itemId: "item_test_reconnect",
        pluggyAccountId: "acc_test_reconnect",
        accountType: "CREDIT",
        originId: owner.originId,
        syncFrom: new Date("2026-01-01T03:00:00.000Z"),
        replacesAccountLinkId: owner.accountLinkId,
      },
    });
    const r2 = await applyBatch(
      db,
      owner,
      [rec({ externalId: "new_a", providerId: "prov_9" }), rec({ externalId: "new_b", description: "OUTRA LOJA", amountCents: 990 })],
      { accountLinkId: newLink.id }
    );
    const res = byExternalId(r2.results);
    expect(res.new_a).toMatchObject({ outcome: "adopted", reasonCode: "provider_id_match", transactionId: old.old_a.transactionId });
    expect(res.new_b).toMatchObject({ outcome: "adopted", reasonCode: "recreated_match", transactionId: old.old_b.transactionId });
    expect(await db.transaction.count()).toBe(2);
  });
});

describe("corte, soft delete e escopo", () => {
  it("antes do corte → before_cutoff, sem transação", async () => {
    const r = await applyBatch(db, owner, [rec({ externalId: "early", sourceDate: "2025-12-31" })]);
    expect(r.results[0]).toMatchObject({ outcome: "before_cutoff" });
    expect(await db.transaction.count()).toBe(0);
  });

  it("transação local apagada não é ressuscitada nem recriada", async () => {
    const r1 = await applyBatch(db, owner, [rec({ externalId: "del" })]);
    const id = r1.results[0].transactionId as string;
    await db.transaction.update({ where: { id }, data: { deletedAt: new Date() } });
    const r2 = await applyBatch(db, owner, [rec({ externalId: "del", amountCents: 2600 })]);
    expect(r2.results[0].outcome).toBe("unchanged");
    expect(await db.transaction.count()).toBe(1);
    expect(await db.transaction.findUniqueOrThrow({ where: { id } })).toMatchObject({ amount: -25 });
    expect((await db.transaction.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
  });

  it("link de outro usuário, origin de espaço compartilhado ou link desativado são recusados", async () => {
    const stranger = await createOwner(db, { originName: "Cartão Alheio" });
    await expect(applyBatch(db, owner, [rec({ externalId: "s1" })], { accountLinkId: stranger.accountLinkId })).rejects.toMatchObject({
      code: "foreign_account_link",
    });

    const space = await db.space.create({ data: { name: "Espaço", createdBy: owner.userId } });
    const spaceOrigin = await db.origin.create({ data: { name: "Cartão Espaço", spaceId: space.id, userId: owner.userId } });
    const spaceLink = await db.pluggyAccountLink.create({
      data: {
        userId: owner.userId,
        itemId: "item_test_space",
        pluggyAccountId: "acc_test_space",
        accountType: "CREDIT",
        originId: spaceOrigin.id,
        syncFrom: new Date("2026-01-01T03:00:00.000Z"),
      },
    });
    await expect(applyBatch(db, owner, [rec({ externalId: "s2" })], { accountLinkId: spaceLink.id })).rejects.toMatchObject({
      code: "origin_not_personal",
    });

    await db.pluggyAccountLink.update({ where: { id: owner.accountLinkId }, data: { enabled: false } });
    await expect(applyBatch(db, owner, [rec({ externalId: "s3" })])).rejects.toBeInstanceOf(PluggyStoreError);
    expect(await db.transaction.count()).toBe(0);
    expect(await db.pluggyTransactionLink.count()).toBe(0);
  });

  it("categoria, regra e recorrente só valem quando pessoais do dono", async () => {
    const space = await db.space.create({ data: { name: "Espaço", createdBy: owner.userId } });
    const spaceCat = await db.category.create({ data: { name: "Compartilhada", color: "#000", userId: owner.userId, spaceId: space.id } });
    await db.categoryRule.create({ data: { keyword: "LOJA", categoryId: spaceCat.id, userId: owner.userId, spaceId: space.id } });
    await db.recurringExpense.create({
      data: { description: "LOJA EXEMPLO", defaultAmount: 25, dayOfMonth: 10, type: "EXPENSE", origin: owner.originName, userId: owner.userId, spaceId: space.id },
    });
    const personalCat = await db.category.create({ data: { name: "Mercado", color: "#0f0", userId: owner.userId } });
    await db.categoryRule.create({ data: { keyword: "MERCADO", categoryId: personalCat.id, userId: owner.userId } });
    const personalRecurring = await db.recurringExpense.create({
      data: { description: "ASSINATURA STREAMING", defaultAmount: 30, dayOfMonth: 5, type: "EXPENSE", origin: owner.originName, userId: owner.userId },
    });

    await applyBatch(db, owner, [
      rec({ externalId: "c1", description: "LOJA EXEMPLO" }),
      rec({ externalId: "c2", description: "MERCADO EXEMPLO", amountCents: 1234 }),
      rec({ externalId: "c3", description: "ASSINATURA STREAMING", amountCents: 3000 }),
    ]);
    const byDesc = Object.fromEntries((await activeTxs()).map((t) => [t.description, t]));
    expect(byDesc["LOJA EXEMPLO"]).toMatchObject({ categoryId: null, categorySource: null, recurringExpenseId: null, isFixed: false });
    expect(byDesc["MERCADO EXEMPLO"]).toMatchObject({ categoryId: personalCat.id, categorySource: "rule" });
    expect(byDesc["ASSINATURA STREAMING"]).toMatchObject({ recurringExpenseId: personalRecurring.id, isFixed: true });
  });
});

describe("simulação", () => {
  async function seedWorld() {
    await createLegacyInstallments(db, owner, {
      description: "LOJA PARCELADA",
      amount: 80,
      total: 6,
      startDay: "2026-01-10",
      items: [{ number: 2, day: "2026-02-10" }],
    });
    await db.transaction.create({
      data: { userId: owner.userId, description: "LEGADO EXEMPLO", amount: -12, date: noonUtc("2026-03-02"), type: "EXPENSE", origin: owner.originName },
    });
    await db.transaction.create({
      data: { userId: owner.userId, description: "TEXTO DO PDF", amount: -7.5, date: noonUtc("2026-03-03"), type: "EXPENSE", origin: owner.originName },
    });
  }

  const batch = () => [
    rec({ externalId: "s_dup1" }),
    rec({ externalId: "s_dup2" }),
    rec({ externalId: "s_inst2", description: "LOJA PARCELADA", amountCents: 8004, installmentNumber: 2, totalInstallments: 6, sourceDate: "2026-02-20", ledgerDate: "2026-02-10", purchaseDate: "2026-01-10" }),
    rec({ externalId: "s_new4", description: "NOVA COMPRA", amountCents: 4400, installmentNumber: 4, totalInstallments: 5, sourceDate: "2026-04-03", ledgerDate: "2026-04-01", purchaseDate: "2026-01-01" }),
    rec({ externalId: "s_new3", description: "NOVA COMPRA", amountCents: 4400, installmentNumber: 3, totalInstallments: 5, sourceDate: "2026-03-03", ledgerDate: "2026-03-01", purchaseDate: "2026-01-01" }),
    rec({ externalId: "s_legacy", description: "Legado Exemplo", amountCents: 1200, sourceDate: "2026-03-02" }),
    rec({ externalId: "s_possdup", description: "TEXTO DA FONTE", amountCents: 750, sourceDate: "2026-03-03" }),
    rec({ externalId: "s_pending", sourceStatus: "PENDING", description: "COMPRA ABERTA", amountCents: 333, preDisposition: pendingPre }),
    rec({ externalId: "s_excl", type: "INCOME", direction: "CREDIT", preDisposition: { disposition: "excluded", reasonCode: "bill_payment_credit" } }),
    rec({ externalId: "s_early", sourceDate: "2025-11-30" }),
  ];

  it("simulação não grava nada em nenhuma tabela", async () => {
    await seedWorld();
    const before = await countAllRows(db);
    const sim = await simulateBatch(db, owner, batch());
    expect(sim.results).toHaveLength(10);
    expect(await countAllRows(db)).toEqual(before);
  });

  it("simulação dá as mesmas decisões da execução real, inclusive na reexecução", async () => {
    await seedWorld();
    const shape = (r: Awaited<ReturnType<typeof simulateBatch>>) =>
      r.results.map((x) => ({ id: x.externalId, outcome: x.outcome, reason: x.reasonCode, proj: x.projectionsCreated, fix: x.projectionAmountCorrected }));
    const sim = await simulateBatch(db, owner, batch());
    const real = await applyBatch(db, owner, batch());
    expect(shape(sim)).toEqual(shape(real));
    expect(sim.counts).toEqual(real.counts);
    expect(real.counts).toMatchObject({ created: 4, adopted: 3, needs_review: 1, excluded: 1, before_cutoff: 1 });

    const changed = batch().map((r) => (r.externalId === "s_pending" ? { ...r, sourceStatus: "POSTED" as const, preDisposition: null, amountCents: 350 } : r));
    const simAgain = await simulateBatch(db, owner, changed);
    const realAgain = await applyBatch(db, owner, changed);
    expect(shape(simAgain)).toEqual(shape(realAgain));
    expect(realAgain.counts).toMatchObject({ created: 0, updated: 1 });
  });
});

describe("custo de uma execução sem novidades", () => {
  it("usa um número pequeno e constante de consultas, qualquer que seja o tamanho da leitura", async () => {
    const counting = createCountingClient();
    try {
      const costFor = async (o: Owner, size: number) => {
        const records = Array.from({ length: size }, (_, i) =>
          rec({ externalId: "cost_" + size + "_" + i, description: "COMPRA " + (i % 7), amountCents: 1000 + i, sourceDate: "2026-0" + (1 + (i % 8)) + "-1" + (i % 9) })
        );
        const token = (await acquirePluggyLease(db, o.userId)) as string;
        const run = () =>
          processPluggyRecords(counting.client, { mode: "apply", ownerUserId: o.userId, accountLinkId: o.accountLinkId, records, leaseToken: token });
        expect((await run()).counts.created).toBe(size);
        const lastSeenBefore = await db.pluggyTransactionLink.findFirstOrThrow({ where: { accountLinkId: o.accountLinkId } });
        counting.reset();
        const again = await run();
        const queries = counting.count();
        expect(again.counts.unchanged).toBe(size);
        const lastSeenAfter = await db.pluggyTransactionLink.findFirstOrThrow({ where: { id: lastSeenBefore.id } });
        expect(lastSeenAfter.lastSeenAt.getTime()).toBeGreaterThan(lastSeenBefore.lastSeenAt.getTime());
        return queries;
      };
      const small = await costFor(owner, 30);
      const big = await costFor(await createOwner(db, { originName: "Cartão Grande" }), 150);
      expect(big).toBe(small);
      expect(big).toBeLessThanOrEqual(20);
    } finally {
      await counting.client.$disconnect();
    }
  });
});


