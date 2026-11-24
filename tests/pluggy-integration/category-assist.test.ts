import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  applyDecisions,
  ATTEMPTS_SETTING_KEY,
  buildExport,
  type ExportCounts,
  type PendingFile,
  type PrivateMap,
} from "@/lib/category-assist";
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

async function exportNow(
  includeBank = false,
  extra: { includePeople?: boolean; retryAttempted?: boolean } = {}
): Promise<{ pending: PendingFile; map: PrivateMap; counts: ExportCounts }> {
  return buildExport(db, { ownerUserId: owner.userId, includeBank, ...extra });
}

/** Lançamento pessoal já categorizado, como histórico. */
async function historyTx(
  description: string,
  data: { categoryId: string; categorySource?: string | null; deletedAt?: Date; spaceId?: string; date?: Date; installmentId?: string }
) {
  return db.transaction.create({
    data: {
      userId: owner.userId,
      description,
      amount: -30,
      date: noonUtc("2026-02-10"),
      type: "EXPENSE",
      origin: owner.originName,
      categorySource: "manual",
      ...data,
    },
  });
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
    expect(pending.itens).toEqual([
      { chave: "i1", descricao: "MERCADO EXEMPLO", valor: 25, faixaDeValor: "até 50", data: "2026-03-10", conta: "cartao", historico: [] },
    ]);
    expect(pending.categorias.map((c) => c.nome)).toEqual(["Alimentação", "Lazer"]);
  });

  it("com a conta corrente, inclui a despesa da conta", async () => {
    const { pending } = await exportNow(true);
    expect(pending.itens.map((i) => i.descricao).sort()).toEqual(["MERCADO EXEMPLO", "PADARIA DA CONTA"]);
    expect(pending.itens.find((i) => i.descricao === "PADARIA DA CONTA")!.conta).toBe("conta");
  });

  it("histórico: mesma descrição normalizada, pela descrição ou pela da fonte; fora ai, apagados, espaço e outro dono", async () => {
    await historyTx("Mercado Exemplo 1/3", { categoryId: foodId });
    await historyTx("MERCADO  EXEMPLO", { categoryId: foodId, categorySource: null });
    await historyTx("MERCADO EXEMPLO", { categoryId: leisureId, categorySource: "ai" });
    await historyTx("MERCADO EXEMPLO", { categoryId: leisureId, deletedAt: new Date() });
    const space = await db.space.create({ data: { name: "Espaço Histórico", createdBy: owner.userId } });
    await historyTx("MERCADO EXEMPLO", { categoryId: leisureId, spaceId: space.id });
    await historyTx("MERCADO EXEMPLO DIFERENTE", { categoryId: leisureId });
    // Receita com a mesma descrição e despesa futura: fora.
    await db.transaction.create({
      data: { userId: owner.userId, description: "MERCADO EXEMPLO", amount: 30, date: noonUtc("2026-02-10"), type: "INCOME", origin: owner.originName, categoryId: leisureId },
    });
    await historyTx("MERCADO EXEMPLO", { categoryId: leisureId, date: new Date(Date.now() + 40 * 24 * 60 * 60 * 1000) });
    // Categoria dada por regra conta.
    await historyTx("MERCADO EXEMPLO", { categoryId: foodId, categorySource: "rule" });
    // Outro dono, com a mesma descrição e categoria própria.
    const stranger = await db.user.create({ data: { email: "estranho@example.test" } });
    const strangerCat = await db.category.create({ data: { name: "Lazer", color: "#000000", userId: stranger.id } });
    await db.transaction.create({
      data: { userId: stranger.id, description: "MERCADO EXEMPLO", amount: -30, date: noonUtc("2026-02-10"), type: "EXPENSE", origin: "X", categoryId: strangerCat.id },
    });
    // Renomeado pelo dono: casa pela descrição da fonte no vínculo.
    await applyBatch(db, owner, [rec({ externalId: "h_src", description: "MERCADO EXEMPLO", sourceDate: "2026-02-01" })]);
    const renamed = await db.pluggyTransactionLink.findFirstOrThrow({ where: { externalId: "h_src" } });
    await db.transaction.update({
      where: { id: renamed.transactionId! },
      data: { description: "APELIDO DO DONO", categoryId: leisureId, categorySource: "manual" },
    });

    const { pending, counts } = await exportNow();
    expect(pending.itens).toHaveLength(1);
    expect(pending.itens[0].historico).toEqual([
      { categoria: "c1", vezes: 3 },
      { categoria: "c2", vezes: 1 },
    ]);
    expect(counts.comHistorico).toBe(1);
  });

  it("parcelas de uma compra contam como uma decisão", async () => {
    const group = await db.installment.create({
      data: { description: "MERCADO EXEMPLO", totalAmount: 90, totalInstallments: 3, installmentAmount: 30, startDate: noonUtc("2026-01-10"), origin: owner.originName, userId: owner.userId },
    });
    for (const n of [1, 2, 3]) {
      await historyTx("MERCADO EXEMPLO " + n + "/3", { categoryId: leisureId, installmentId: group.id, date: noonUtc("2026-0" + n + "-10") });
    }
    const { pending } = await exportNow();
    expect(pending.itens[0].historico).toEqual([{ categoria: "c2", vezes: 1 }]);
  });

  it("item com vínculo de cartão e de conta sai como cartão", async () => {
    const bank = await db.pluggyAccountLink.findFirstOrThrow({ where: { userId: owner.userId, accountType: "BANK" } });
    const item = await tx("MERCADO EXEMPLO");
    await db.pluggyTransactionLink.create({
      data: {
        accountLinkId: bank.id,
        externalId: "b_same",
        transactionId: item.id,
        disposition: "adopted",
        sourceStatus: "POSTED",
        sourceDate: noonUtc("2026-03-10"),
        ledgerDate: noonUtc("2026-03-10"),
        sourceAmountCents: 2500,
        currencyCode: "BRL",
        direction: "DEBIT",
        sourceDescription: "MERCADO EXEMPLO",
        lastSeenAt: new Date(),
      },
    });
    const { pending } = await exportNow(true);
    expect(pending.itens.find((i) => i.descricao === "MERCADO EXEMPLO")!.conta).toBe("cartao");
  });

  it("histórico tem no máximo 3 categorias, mais usadas primeiro", async () => {
    const healthId = (await db.category.create({ data: { name: "Saúde", color: "#000000", userId: owner.userId } })).id;
    const carId = (await db.category.create({ data: { name: "Transporte", color: "#000000", userId: owner.userId } })).id;
    const plan: Array<[string, number]> = [[foodId, 1], [leisureId, 4], [healthId, 2], [carId, 3]];
    for (const [categoryId, n] of plan) for (let i = 0; i < n; i++) await historyTx("MERCADO EXEMPLO", { categoryId });

    const { pending } = await exportNow();
    const name = (chave: string) => pending.categorias.find((c) => c.chave === chave)!.nome;
    expect(pending.itens[0].historico.map((h) => [name(h.categoria), h.vezes])).toEqual([
      ["Lazer", 4],
      ["Transporte", 3],
      ["Saúde", 2],
    ]);
  });

  it("transferência entre pessoas só entra com includePeople, com valor exato e sem documento", async () => {
    const bank = await db.pluggyAccountLink.findFirstOrThrow({ where: { userId: owner.userId, accountType: "BANK" } });
    await applyBatch(
      db,
      owner,
      [rec({ externalId: "b_pix", accountType: "BANK", description: "PIX ENVIADO FULANO EXEMPLO 123.456.789-09", amountCents: 23000, sourceDate: "2026-03-12" })],
      { accountLinkId: bank.id }
    );

    const without = await exportNow(true);
    expect(without.pending.itens.map((i) => i.descricao)).not.toContain("PIX ENVIADO FULANO EXEMPLO");
    expect(without.counts.naoMinimizaveis).toBe(1);

    const withPeople = await exportNow(true, { includePeople: true });
    const pix = withPeople.pending.itens.find((i) => i.descricao === "PIX ENVIADO FULANO EXEMPLO");
    expect(pix).toMatchObject({ valor: 230, data: "2026-03-12", conta: "conta" });
    expect(JSON.stringify(withPeople.pending)).not.toContain("123.456");
  });

  it("nenhum id do banco aparece no arquivo de pendentes", async () => {
    await historyTx("MERCADO EXEMPLO", { categoryId: foodId });
    const { pending } = await exportNow(true, { includePeople: true });
    expect(pending.itens.length).toBeGreaterThan(0);
    const text = JSON.stringify(pending);
    const ids = [
      ...(await db.transaction.findMany({ select: { id: true } })),
      ...(await db.category.findMany({ select: { id: true } })),
      ...(await db.user.findMany({ select: { id: true } })),
      ...(await db.pluggyAccountLink.findMany({ select: { id: true } })),
      ...(await db.pluggyTransactionLink.findMany({ select: { id: true } })),
    ].map((r) => r.id);
    expect(ids.length).toBeGreaterThan(10);
    for (const id of ids) expect(text).not.toContain(id);
    for (const externalId of ["c_ok", "b_1", "item_test", "acc_test"]) expect(text).not.toContain(externalId);
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

    // Com retryAttempted (--refazer-tentadas), volta.
    const retry = await exportNow(false, { retryAttempted: true });
    expect(retry.pending.itens.map((i) => i.descricao)).toEqual(["MERCADO EXEMPLO"]);
    expect(retry.counts.tentadasRecentes).toBe(0);
  });
});
