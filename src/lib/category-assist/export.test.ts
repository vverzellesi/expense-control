// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildExport, DEFAULT_EXPORT_LIMIT, MAX_EXPORT_LIMIT, normalizeLimit, selectionWhere } from "./export";
import { baseTxs, fakeDb, OWNER, type FakeTx } from "./test-helpers";

const NOW = new Date("2026-04-01T12:00:00.000Z");

describe("selectionWhere", () => {
  it("só cartão por padrão; conta corrente só com a opção", () => {
    expect(selectionWhere(OWNER)).toMatchObject({
      userId: OWNER,
      spaceId: null,
      deletedAt: null,
      type: "EXPENSE",
      categoryId: null,
      categorySource: null,
      pluggyLinks: { some: { disposition: { in: ["created", "adopted"] }, accountLink: { userId: OWNER, accountType: "CREDIT", enabled: true } } },
    });
    expect(selectionWhere(OWNER, true).pluggyLinks.some.accountLink.accountType).toEqual({ in: ["CREDIT", "BANK"] });
  });

  it("categorySource manual nunca é selecionada (exige categorySource null)", () => {
    expect(selectionWhere(OWNER).categorySource).toBeNull();
  });
});

describe("buildExport", () => {
  it("payload da rotina tem só chaves efêmeras, descrição minimizada e faixa de valor", async () => {
    const { db, findMany } = fakeDb();
    const { pending, map, counts } = await buildExport(db, { ownerUserId: OWNER, now: NOW, exportId: "exp_test" });

    expect(findMany.mock.calls[0][0]).toMatchObject({ where: selectionWhere(OWNER), orderBy: [{ date: "desc" }, { id: "asc" }] });
    expect(pending).toEqual({
      geradoEm: NOW.toISOString(),
      exportacao: "exp_test",
      categorias: [
        { chave: "c1", nome: "Alimentação" },
        { chave: "c2", nome: "Transporte" },
        { chave: "c3", nome: "Saúde" },
      ],
      itens: [
        { chave: "i1", descricao: "MERCADO EXEMPLO", faixaDeValor: "até 50" },
        { chave: "i2", descricao: "POSTO FICTICIO", faixaDeValor: "50 a 200" },
        { chave: "i3", descricao: "FARMACIA TESTE", faixaDeValor: "acima de 1000" },
      ],
    });
    const text = JSON.stringify(pending);
    for (const forbidden of ["tx_test", "cat_test", OWNER, "37.42", "37,42", "187", "1234", "2026-03", "12/03"]) {
      expect(text).not.toContain(forbidden);
    }
    expect(map).toEqual({
      geradoEm: NOW.toISOString(),
      exportacao: "exp_test",
      dono: OWNER,
      incluirConta: false,
      itens: {
        i1: { id: "tx_test_1", updatedAt: "2026-03-10T12:00:00.000Z" },
        i2: { id: "tx_test_2", updatedAt: "2026-03-11T12:00:00.000Z" },
        i3: { id: "tx_test_3", updatedAt: "2026-03-12T12:00:00.000Z" },
      },
      categorias: { c1: "cat_test_food", c2: "cat_test_car", c3: "cat_test_health" },
    });
    expect(counts).toEqual({ elegiveis: 3, tentadasRecentes: 0, naoMinimizaveis: 0, exportadas: 3, foraDoLimite: 0, semCategorias: 0, categorias: 3 });
  });

  it("com a conta corrente, transferência com nome de pessoa fica fora", async () => {
    const txs: FakeTx[] = [...baseTxs, { id: "tx_test_pix", description: "PIX ENVIADO FULANO EXEMPLO", amount: -50, updatedAt: NOW }];
    const { db, findMany } = fakeDb({ txs });
    const { pending, map, counts } = await buildExport(db, { ownerUserId: OWNER, includeBank: true, now: NOW });
    expect(findMany.mock.calls[0][0].where).toEqual(selectionWhere(OWNER, true));
    expect(map.incluirConta).toBe(true);
    expect(JSON.stringify(pending)).not.toContain("FULANO");
    expect(counts).toMatchObject({ elegiveis: 4, naoMinimizaveis: 1, exportadas: 3 });
  });

  it("respeita o limite, mais recentes primeiro", async () => {
    const { db } = fakeDb();
    const { pending, counts } = await buildExport(db, { ownerUserId: OWNER, limit: 2, now: NOW });
    expect(pending.itens.map((i) => i.descricao)).toEqual(["MERCADO EXEMPLO", "POSTO FICTICIO"]);
    expect(counts).toMatchObject({ exportadas: 2, foraDoLimite: 1 });
  });

  it("não reexporta o que foi tentado nos últimos 30 dias", async () => {
    const attempts = JSON.stringify({ tx_test_1: "2026-03-20", tx_test_2: "2026-02-15" });
    const { db } = fakeDb({ attempts });
    const { pending, map, counts } = await buildExport(db, { ownerUserId: OWNER, now: NOW });
    expect(Object.values(map.itens).map((i) => i.id)).toEqual(["tx_test_2", "tx_test_3"]);
    expect(pending.itens).toHaveLength(2);
    expect(counts.tentadasRecentes).toBe(1);
  });

  it("sem categorias pessoais não exporta itens", async () => {
    const { db } = fakeDb({ categories: [] });
    const { pending, counts } = await buildExport(db, { ownerUserId: OWNER, now: NOW });
    expect(pending.itens).toEqual([]);
    expect(counts).toMatchObject({ exportadas: 0, foraDoLimite: 0, semCategorias: 3, categorias: 0 });
  });

  it("cada exportação tem identificador próprio", async () => {
    const { db } = fakeDb();
    const a = await buildExport(db, { ownerUserId: OWNER });
    const b = await buildExport(db, { ownerUserId: OWNER });
    expect(a.pending.exportacao).toMatch(/^[0-9a-f]{16}$/);
    expect(a.pending.exportacao).not.toBe(b.pending.exportacao);
    expect(a.map.exportacao).toBe(a.pending.exportacao);
  });

  it("limite inválido cai no padrão e o máximo é respeitado", () => {
    expect(normalizeLimit(undefined)).toBe(DEFAULT_EXPORT_LIMIT);
    expect(normalizeLimit(0)).toBe(DEFAULT_EXPORT_LIMIT);
    expect(normalizeLimit(Number.NaN)).toBe(DEFAULT_EXPORT_LIMIT);
    expect(normalizeLimit(10_000)).toBe(MAX_EXPORT_LIMIT);
  });

  it("sem dono não lê o banco", async () => {
    const { db, findMany } = fakeDb();
    await expect(buildExport(db, { ownerUserId: " " })).rejects.toThrow("missing_owner");
    expect(findMany).not.toHaveBeenCalled();
  });
});
