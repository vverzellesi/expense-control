import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { categorizeUncategorized, type AiBatchPayload } from "@/lib/ai-categorizer";
import { applyBatch, createOwner, createTestClient, noonUtc, rec, resetDatabase, syncFromDate, type Owner } from "./helpers";

// Seleção e atualização condicional da categorização por IA em Postgres real.
// O provedor é sempre simulado: nenhuma chamada sai da máquina.

const db: PrismaClient = createTestClient();
const KEY = "sk-test-not-a-real-key";

afterAll(async () => {
  await db.$disconnect();
});

let owner: Owner;
let foodId: string;
let leisureId: string;

/** Provedor simulado que categoriza tudo como a primeira categoria, com confiança alta. */
function provider(beforeRespond?: () => Promise<void>) {
  const payloads: AiBatchPayload[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const payload = JSON.parse(JSON.parse(String(init.body)).messages[0].content[0].text) as AiBatchPayload;
    payloads.push(payload);
    if (beforeRespond) await beforeRespond();
    const food = payload.categories.find((c) => c.name === "Alimentação")!.key;
    const output = { results: payload.items.map((i) => ({ item: i.key, category: food, confidence: "high" })) };
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(output) }], stop_reason: "end_turn" }), {
      status: 200,
    });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, payloads };
}

async function tx(description: string) {
  return db.transaction.findFirstOrThrow({ where: { userId: owner.userId, description } });
}

beforeEach(async () => {
  await resetDatabase(db);
  owner = await createOwner(db);
  foodId = (await db.category.create({ data: { name: "Alimentação", color: "#000000", userId: owner.userId } })).id;
  leisureId = (await db.category.create({ data: { name: "Lazer", color: "#000000", userId: owner.userId } })).id;

  const other = await db.user.create({ data: { email: "outro@example.test" } });
  await db.category.create({ data: { name: "Categoria De Outro", color: "#000000", userId: other.id } });

  await applyBatch(db, owner, [
    rec({ externalId: "c_ok", description: "MERCADO EXEMPLO" }),
    rec({ externalId: "c_manual", description: "POSTO FICTICIO" }),
    rec({ externalId: "c_deleted", description: "FARMACIA TESTE" }),
    rec({ externalId: "c_rule", description: "LIVRARIA EXEMPLO" }),
    rec({ externalId: "c_refund", description: "ESTORNO LOJA EXEMPLO", direction: "CREDIT", type: "INCOME", creditKind: "refund" }),
  ]);
  // Usuário limpou a categoria de propósito: manual, mesmo sem categoria.
  await db.transaction.update({ where: { id: (await tx("POSTO FICTICIO")).id }, data: { categorySource: "manual" } });
  await db.transaction.update({ where: { id: (await tx("FARMACIA TESTE")).id }, data: { deletedAt: new Date() } });
  await db.transaction.update({ where: { id: (await tx("LIVRARIA EXEMPLO")).id }, data: { categoryId: leisureId, categorySource: "rule" } });

  // Conta corrente do mesmo dono: fica só com as regras.
  const bankOrigin = await db.origin.create({ data: { name: "Conta Teste", userId: owner.userId, type: "DEBIT" } });
  const bank = await db.pluggyAccountLink.create({
    data: {
      userId: owner.userId,
      itemId: "item_test_bank",
      pluggyAccountId: "acc_test_bank",
      accountType: "BANK",
      originId: bankOrigin.id,
      syncFrom: syncFromDate("2026-01-01"),
    },
  });
  await applyBatch(db, owner, [rec({ externalId: "b_1", accountType: "BANK", description: "PADARIA DA CONTA" })], {
    accountLinkId: bank.id,
  });

  // Cartão desativado (desligamento em andamento): fora da IA.
  const offOrigin = await db.origin.create({ data: { name: "Cartão Desativado", userId: owner.userId, type: "CREDIT_CARD" } });
  const off = await db.pluggyAccountLink.create({
    data: {
      userId: owner.userId,
      itemId: "item_test_off",
      pluggyAccountId: "acc_test_off",
      accountType: "CREDIT",
      originId: offOrigin.id,
      syncFrom: syncFromDate("2026-01-01"),
    },
  });
  await applyBatch(db, owner, [rec({ externalId: "o_1", description: "LOJA DO CARTAO DESATIVADO" })], { accountLinkId: off.id });
  await db.pluggyAccountLink.update({ where: { id: off.id }, data: { enabled: false } });

  // Lançamento legado, sem vínculo Pluggy.
  await db.transaction.create({
    data: {
      userId: owner.userId,
      description: "LEGADO EXEMPLO",
      amount: -10,
      date: noonUtc("2026-03-10"),
      type: "EXPENSE",
      origin: owner.originName,
    },
  });

  // Lançamento movido para um espaço compartilhado.
  await applyBatch(db, owner, [rec({ externalId: "c_space", description: "LOJA DO ESPACO" })]);
  const space = await db.space.create({ data: { name: "Espaço Teste", createdBy: owner.userId } });
  await db.transaction.update({ where: { id: (await tx("LOJA DO ESPACO")).id }, data: { spaceId: space.id } });

  // Vínculo em revisão apontando para um lançamento: fora.
  const reviewTx = await db.transaction.create({
    data: {
      userId: owner.userId,
      description: "LOJA EM REVISAO",
      amount: -10,
      date: noonUtc("2026-03-10"),
      type: "EXPENSE",
      origin: owner.originName,
    },
  });
  await db.pluggyTransactionLink.create({
    data: {
      accountLinkId: owner.accountLinkId,
      externalId: "c_review",
      transactionId: reviewTx.id,
      disposition: "needs_review",
      reasonCode: "possible_duplicate",
      sourceStatus: "POSTED",
      sourceDate: noonUtc("2026-03-10"),
      ledgerDate: noonUtc("2026-03-10"),
      sourceAmountCents: 1000,
      currencyCode: "BRL",
      direction: "DEBIT",
      sourceDescription: "LOJA EM REVISAO",
      lastSeenAt: new Date(),
    },
  });

  // Outro dono com cartão Pluggy próprio.
  const otherOwner = await createOwner(db, { originName: "Cartão De Outro" });
  await applyBatch(db, otherOwner, [rec({ externalId: "x_1", description: "LOJA DE OUTRO DONO" })]);
});

describe("categorização por IA em Postgres real", () => {
  it("seleciona só a despesa de cartão Pluggy sem categoria e sem origem de categoria", async () => {
    const r = await categorizeUncategorized(db, { ownerUserId: owner.userId, mode: "simulate" });
    expect(r.state).toBe("ok");
    expect(r.counts.selected).toBe(1);
    expect(r.preview).toHaveLength(1);
    expect(r.preview![0].items).toEqual([{ key: "i1", description: "MERCADO EXEMPLO", amountRange: "até 50" }]);
    expect(r.preview![0].categories.map((c) => c.name)).toEqual(["Alimentação", "Lazer"]);
  });

  it("grava categoria e categorySource ai sem tocar no resto", async () => {
    const before = await db.transaction.findMany({ where: { userId: owner.userId }, orderBy: { id: "asc" } });
    const p = provider();
    const r = await categorizeUncategorized(db, { ownerUserId: owner.userId, mode: "apply", apiKey: KEY, fetchImpl: p.fetchImpl });
    expect(r).toMatchObject({ state: "ok", error: null });
    expect(r.counts).toMatchObject({ selected: 1, sent: 1, categorized: 1, calls: 1 });

    const ok = await tx("MERCADO EXEMPLO");
    expect(ok.categoryId).toBe(foodId);
    expect(ok.categorySource).toBe("ai");

    const after = await db.transaction.findMany({ where: { userId: owner.userId }, orderBy: { id: "asc" } });
    const changed = after.filter((t, i) => JSON.stringify(t) !== JSON.stringify(before[i]));
    expect(changed.map((t) => t.description)).toEqual(["MERCADO EXEMPLO"]);
    expect((await tx("POSTO FICTICIO")).categoryId).toBeNull();

    // Reexecução não encontra mais nada.
    const again = await categorizeUncategorized(db, { ownerUserId: owner.userId, mode: "apply", apiKey: KEY, fetchImpl: p.fetchImpl });
    expect(again.counts.selected).toBe(0);
  });

  it("edição humana durante a chamada não é sobrescrita", async () => {
    const target = await tx("MERCADO EXEMPLO");
    const p = provider(async () => {
      await db.transaction.update({ where: { id: target.id }, data: { categoryId: leisureId, categorySource: "manual" } });
    });
    const r = await categorizeUncategorized(db, { ownerUserId: owner.userId, mode: "apply", apiKey: KEY, fetchImpl: p.fetchImpl });
    expect(r.counts).toMatchObject({ categorized: 0, conflicts: 1 });
    const after = await tx("MERCADO EXEMPLO");
    expect(after.categoryId).toBe(leisureId);
    expect(after.categorySource).toBe("manual");
  });

  it("qualquer edição concorrente (updatedAt mudou) impede a escrita", async () => {
    const target = await tx("MERCADO EXEMPLO");
    const p = provider(async () => {
      await db.transaction.update({ where: { id: target.id }, data: { isFixed: true } });
    });
    const r = await categorizeUncategorized(db, { ownerUserId: owner.userId, mode: "apply", apiKey: KEY, fetchImpl: p.fetchImpl });
    expect(r.counts.conflicts).toBe(1);
    expect((await tx("MERCADO EXEMPLO")).categoryId).toBeNull();
  });

  it("cartão desativado durante a chamada não recebe escrita (a escrita repete a seleção)", async () => {
    const p = provider(async () => {
      await db.pluggyAccountLink.update({ where: { id: owner.accountLinkId }, data: { enabled: false } });
    });
    const r = await categorizeUncategorized(db, { ownerUserId: owner.userId, mode: "apply", apiKey: KEY, fetchImpl: p.fetchImpl });
    expect(r.counts).toMatchObject({ categorized: 0, conflicts: 1 });
    expect((await tx("MERCADO EXEMPLO")).categoryId).toBeNull();
  });

  it("categoria apagada durante a chamada vira conflito, sem derrubar a execução", async () => {
    const p = provider(async () => {
      await db.category.delete({ where: { id: foodId } });
    });
    const r = await categorizeUncategorized(db, { ownerUserId: owner.userId, mode: "apply", apiKey: KEY, fetchImpl: p.fetchImpl });
    expect(r).toMatchObject({ state: "ok", error: null });
    expect(r.counts).toMatchObject({ categorized: 0, conflicts: 1 });
  });
});
