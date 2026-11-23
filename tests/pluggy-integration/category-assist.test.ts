import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { applyDecisions, ATTEMPTS_SETTING_KEY, buildExport, type PendingFile, type PrivateMap } from "@/lib/category-assist";
import { applyBatch, createOwner, createTestClient, noonUtc, rec, resetDatabase, syncFromDate, type Owner } from "./helpers";

// Exportação, aplicação condicional e tentativas da categorização assistida em Postgres real.
// Nenhum provedor externo: as decisões são escritas pelo próprio teste, como faria a rotina.

const db: PrismaClient = createTestClient();

afterAll(async () => {
  await db.$disconnect();
});

let owner: Owner;
let foodId: string;
let leisureId: string;

async function tx(description: string) {
  return db.transaction.findFirstOrThrow({ where: { userId: owner.userId, description } });
}

async function exportNow(includeBank = false): Promise<{ pending: PendingFile; map: PrivateMap }> {
  return buildExport(db, { ownerUserId: owner.userId, includeBank });
}

/** Decide todos os itens exportados como a categoria de nome dado. */
function decideAll(pending: PendingFile, categoryName: string, confianca: "alta" | "media" | "baixa" = "alta") {
  const categoria = pending.categorias.find((c) => c.nome === categoryName)!.chave;
  return { exportacao: pending.exportacao, decisoes: pending.itens.map((i) => ({ chave: i.chave, categoria, confianca })) };
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

  // Conta corrente do mesmo dono: só entra com --incluir-conta.
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

  // Cartão desativado (desligamento em andamento): fora.
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

describe("categorização assistida em Postgres real", () => {
  it("exporta só a despesa de cartão Pluggy sem categoria e sem origem de categoria", async () => {
    const { pending, counts } = await exportNow();
    expect(counts).toMatchObject({ elegiveis: 1, exportadas: 1 });
    expect(pending.itens).toEqual([{ chave: "i1", descricao: "MERCADO EXEMPLO", faixaDeValor: "até 50" }]);
    expect(pending.categorias.map((c) => c.nome)).toEqual(["Alimentação", "Lazer"]);
  });

  it("com a conta corrente, inclui a despesa da conta", async () => {
    const { pending } = await exportNow(true);
    expect(pending.itens.map((i) => i.descricao).sort()).toEqual(["MERCADO EXEMPLO", "PADARIA DA CONTA"]);
  });

  it("grava categoria e categorySource ai sem tocar no resto", async () => {
    const before = await db.transaction.findMany({ where: { userId: owner.userId }, orderBy: { id: "asc" } });
    const { pending, map } = await exportNow();
    const r = await applyDecisions(db, { ownerUserId: owner.userId, mode: "apply", map, decisions: decideAll(pending, "Alimentação") });
    expect(r).toMatchObject({ error: null, counts: { aplicadas: 1, conflitos: 0 } });

    const ok = await tx("MERCADO EXEMPLO");
    expect(ok.categoryId).toBe(foodId);
    expect(ok.categorySource).toBe("ai");

    const after = await db.transaction.findMany({ where: { userId: owner.userId }, orderBy: { id: "asc" } });
    const changed = after.filter((t, i) => JSON.stringify(t) !== JSON.stringify(before[i]));
    expect(changed.map((t) => t.description)).toEqual(["MERCADO EXEMPLO"]);
    expect((await tx("POSTO FICTICIO")).categoryId).toBeNull();

    // Nova exportação não encontra mais nada; reaplicar o mesmo arquivo só gera conflito.
    expect((await exportNow()).counts.elegiveis).toBe(0);
    const again = await applyDecisions(db, { ownerUserId: owner.userId, mode: "apply", map, decisions: decideAll(pending, "Alimentação") });
    expect(again.counts).toMatchObject({ aplicadas: 0, conflitos: 1 });
  });

  it("simulação não grava", async () => {
    const { pending, map } = await exportNow();
    const r = await applyDecisions(db, { ownerUserId: owner.userId, mode: "simulate", map, decisions: decideAll(pending, "Alimentação") });
    expect(r.counts).toMatchObject({ aplicadas: 1, conflitos: 0 });
    expect((await tx("MERCADO EXEMPLO")).categoryId).toBeNull();
  });

  it("edição humana entre a exportação e a aplicação não é sobrescrita", async () => {
    const { pending, map } = await exportNow();
    const target = await tx("MERCADO EXEMPLO");
    await db.transaction.update({ where: { id: target.id }, data: { categoryId: leisureId, categorySource: "manual" } });
    const r = await applyDecisions(db, { ownerUserId: owner.userId, mode: "apply", map, decisions: decideAll(pending, "Alimentação") });
    expect(r.counts).toMatchObject({ aplicadas: 0, conflitos: 1 });
    const after = await tx("MERCADO EXEMPLO");
    expect(after.categoryId).toBe(leisureId);
    expect(after.categorySource).toBe("manual");
  });

  it("qualquer edição concorrente (updatedAt mudou) impede a escrita", async () => {
    const { pending, map } = await exportNow();
    await db.transaction.update({ where: { id: (await tx("MERCADO EXEMPLO")).id }, data: { isFixed: true } });
    const r = await applyDecisions(db, { ownerUserId: owner.userId, mode: "apply", map, decisions: decideAll(pending, "Alimentação") });
    expect(r.counts.conflitos).toBe(1);
    expect((await tx("MERCADO EXEMPLO")).categoryId).toBeNull();
  });

  it("cartão desativado depois da exportação não recebe escrita (a escrita repete a seleção)", async () => {
    const { pending, map } = await exportNow();
    await db.pluggyAccountLink.update({ where: { id: owner.accountLinkId }, data: { enabled: false } });
    const r = await applyDecisions(db, { ownerUserId: owner.userId, mode: "apply", map, decisions: decideAll(pending, "Alimentação") });
    expect(r.counts).toMatchObject({ aplicadas: 0, conflitos: 1 });
    expect((await tx("MERCADO EXEMPLO")).categoryId).toBeNull();
  });

  it("categoria apagada depois da exportação vira conflito, sem derrubar a execução", async () => {
    const { pending, map } = await exportNow();
    await db.category.delete({ where: { id: foodId } });
    const r = await applyDecisions(db, { ownerUserId: owner.userId, mode: "apply", map, decisions: decideAll(pending, "Alimentação") });
    expect(r).toMatchObject({ error: null, counts: { aplicadas: 0, conflitos: 1 } });
  });

  it("confiança baixa fica registrada em Settings e não volta na próxima exportação", async () => {
    const { pending, map } = await exportNow();
    const r = await applyDecisions(db, {
      ownerUserId: owner.userId,
      mode: "apply",
      map,
      decisions: decideAll(pending, "Alimentação", "baixa"),
    });
    expect(r.counts).toMatchObject({ aplicadas: 0, baixaConfianca: 1 });
    expect((await tx("MERCADO EXEMPLO")).categoryId).toBeNull();
    const setting = await db.settings.findFirstOrThrow({ where: { key: ATTEMPTS_SETTING_KEY, userId: owner.userId } });
    expect(Object.keys(JSON.parse(setting.value))).toEqual([(await tx("MERCADO EXEMPLO")).id]);

    const next = await exportNow();
    expect(next.pending.itens).toEqual([]);
    expect(next.counts).toMatchObject({ elegiveis: 1, tentadasRecentes: 1 });
  });
});
