// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildExport, DEFAULT_EXPORT_LIMIT, historyWhere, MAX_EXPORT_LIMIT, normalizeLimit, selectionWhere } from "./export";
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

describe("historyWhere", () => {
  it("só despesas pessoais do dono, não apagadas, já ocorridas, com categoria que não veio da rotina", () => {
    expect(historyWhere(OWNER, NOW)).toEqual({
      userId: OWNER,
      spaceId: null,
      deletedAt: null,
      type: "EXPENSE",
      date: { lte: NOW },
      categoryId: { not: null },
      OR: [{ categorySource: null }, { categorySource: { not: "ai" } }],
    });
  });
});

describe("buildExport", () => {
  it("payload da rotina tem chaves efêmeras, descrição minimizada, valor, data, conta e histórico, sem ids", async () => {
    const { db, findMany } = fakeDb();
    const { pending, map, counts } = await buildExport(db, { ownerUserId: OWNER, now: NOW, exportId: "exp_test" });

    expect(findMany.mock.calls[0][0]).toMatchObject({ where: selectionWhere(OWNER), orderBy: [{ date: "desc" }, { id: "asc" }] });
    expect(findMany.mock.calls[1][0]).toMatchObject({ where: historyWhere(OWNER, NOW) });
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(pending).toEqual({
      geradoEm: NOW.toISOString(),
      exportacao: "exp_test",
      categorias: [
        { chave: "c1", nome: "Alimentação" },
        { chave: "c2", nome: "Transporte" },
        { chave: "c3", nome: "Saúde" },
      ],
      itens: [
        { chave: "i1", descricao: "MERCADO EXEMPLO", valor: 37.42, faixaDeValor: "até 50", data: "2026-03-10", conta: "cartao", historico: [] },
        { chave: "i2", descricao: "POSTO FICTICIO", valor: 187.65, faixaDeValor: "50 a 200", data: "2026-03-10", conta: "cartao", historico: [] },
        { chave: "i3", descricao: "FARMACIA TESTE", valor: 1234.56, faixaDeValor: "acima de 1000", data: "2026-03-10", conta: "cartao", historico: [] },
      ],
    });
    const text = JSON.stringify(pending);
    for (const forbidden of ["tx_test", "cat_test", OWNER, "12/03"]) {
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
    expect(counts).toEqual({
      elegiveis: 3,
      tentadasRecentes: 0,
      naoMinimizaveis: 0,
      exportadas: 3,
      foraDoLimite: 0,
      semCategorias: 0,
      categorias: 3,
      comHistorico: 0,
    });
  });

  it("valor exato positivo com 2 casas, dia no fuso de negócio e tipo de conta", async () => {
    const txs: FakeTx[] = [
      // 01:30 UTC ainda é o dia anterior em São Paulo.
      { id: "tx_test_a", description: "PADARIA EXEMPLO", amount: -230, updatedAt: NOW, date: new Date("2026-03-11T01:30:00.000Z"), accountType: "BANK" },
      { id: "tx_test_b", description: "LOJA EXEMPLO", amount: -0.1 - 0.2, updatedAt: NOW },
    ];
    const { db } = fakeDb({ txs });
    const { pending } = await buildExport(db, { ownerUserId: OWNER, includeBank: true, now: NOW });
    expect(pending.itens.map((i) => [i.valor, i.data, i.conta])).toEqual([
      [230, "2026-03-10", "conta"],
      [0.3, "2026-03-10", "cartao"],
    ]);
  });

  it("histórico: categorias já usadas para a mesma descrição normalizada, pela descrição ou pela da fonte", async () => {
    const txs: FakeTx[] = [
      { id: "tx_test_h1", description: "Café Exemplo", amount: -20, updatedAt: NOW },
      { id: "tx_test_h2", description: "APELIDO DO DONO", sourceDescription: "LOJA FONTE*EXEMPLO", amount: -20, updatedAt: NOW },
      { id: "tx_test_h3", description: "SEM HISTORICO", amount: -20, updatedAt: NOW },
    ];
    const history = [
      // Mesma descrição com acento, caixa e marcador de parcela diferentes.
      { description: "CAFE EXEMPLO 2/10", categoryId: "cat_test_food" },
      { description: "cafe exemplo", categoryId: "cat_test_food" },
      // Casa pelas duas descrições: conta uma vez só.
      { description: "CAFE EXEMPLO", categoryId: "cat_test_car", sourceDescriptions: ["CAFÉ EXEMPLO - Parcela 1/3"] },
      // Casa só pela descrição da fonte do histórico.
      { description: "OUTRO NOME", categoryId: "cat_test_health", sourceDescriptions: ["CAFÉ   exemplo"] },
      // Categoria que não está na lista pessoal (espaço compartilhado ou de outro usuário).
      { description: "CAFE EXEMPLO", categoryId: "cat_test_shared" },
      // A fonte do item casa com a descrição do histórico.
      { description: "Loja Fonte*Exemplo", categoryId: "cat_test_car" },
      { description: "CAFE EXEMPLO DIFERENTE", categoryId: "cat_test_food" },
    ];
    const { db } = fakeDb({ txs, history });
    const { pending, counts } = await buildExport(db, { ownerUserId: OWNER, now: NOW });
    expect(pending.itens.map((i) => i.historico)).toEqual([
      [
        { categoria: "c1", vezes: 2 },
        { categoria: "c2", vezes: 1 },
        { categoria: "c3", vezes: 1 },
      ],
      [{ categoria: "c2", vezes: 1 }],
      [],
    ]);
    expect(counts.comHistorico).toBe(2);
    expect(JSON.stringify(pending)).not.toContain("cat_test");
  });

  it("parcelas de uma compra e lançamentos de uma recorrência contam como uma decisão", async () => {
    const history = [
      ...Array.from({ length: 10 }, (_, i) => ({ description: "MERCADO EXEMPLO " + (i + 1) + "/10", categoryId: "cat_test_car", installmentId: "inst_test_1" })),
      ...Array.from({ length: 5 }, () => ({ description: "MERCADO EXEMPLO", categoryId: "cat_test_health", recurringExpenseId: "rec_test_1" })),
      { description: "MERCADO EXEMPLO", categoryId: "cat_test_food" },
      { description: "MERCADO EXEMPLO", categoryId: "cat_test_food" },
    ];
    const { db } = fakeDb({ history, txs: [baseTxs[0]] });
    const { pending } = await buildExport(db, { ownerUserId: OWNER, now: NOW });
    expect(pending.itens[0].historico).toEqual([
      { categoria: "c1", vezes: 2 },
      { categoria: "c2", vezes: 1 },
      { categoria: "c3", vezes: 1 },
    ]);
  });

  it("histórico limitado a 3 categorias, mais usadas primeiro", async () => {
    const categories = ["A", "B", "C", "D"].map((n) => ({ id: "cat_test_" + n, name: "Categoria " + n }));
    const history = [
      ...Array.from({ length: 1 }, () => ({ description: "MERCADO EXEMPLO", categoryId: "cat_test_A" })),
      ...Array.from({ length: 4 }, () => ({ description: "MERCADO EXEMPLO", categoryId: "cat_test_B" })),
      ...Array.from({ length: 2 }, () => ({ description: "MERCADO EXEMPLO", categoryId: "cat_test_C" })),
      ...Array.from({ length: 3 }, () => ({ description: "MERCADO EXEMPLO", categoryId: "cat_test_D" })),
    ];
    const { db } = fakeDb({ categories, history, txs: [baseTxs[0]] });
    const { pending } = await buildExport(db, { ownerUserId: OWNER, now: NOW });
    expect(pending.itens[0].historico).toEqual([
      { categoria: "c2", vezes: 4 },
      { categoria: "c4", vezes: 3 },
      { categoria: "c3", vezes: 2 },
    ]);
  });

  it("sem itens exportados não lê o histórico", async () => {
    const { db, findMany } = fakeDb({ categories: [] });
    await buildExport(db, { ownerUserId: OWNER, now: NOW });
    expect(findMany).toHaveBeenCalledTimes(1);
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

  it("com includePeople, a transferência entra sem documento, telefone, e-mail nem sequência longa de dígitos", async () => {
    const txs: FakeTx[] = [
      {
        id: "tx_test_pix",
        description: "PIX ENVIADO FULANO EXEMPLO 123.456.789-09 (11) 91234-5678 fulano@example.test 12345678",
        amount: -230,
        updatedAt: NOW,
        accountType: "BANK",
      },
      { id: "tx_test_picpay", description: "PICPAY*CICLANO TESTE", amount: -460, updatedAt: NOW },
    ];
    const { db } = fakeDb({ txs });
    const { pending, counts } = await buildExport(db, { ownerUserId: OWNER, includeBank: true, includePeople: true, now: NOW });
    expect(pending.itens.map((i) => [i.descricao, i.valor])).toEqual([
      ["PIX ENVIADO FULANO EXEMPLO", 230],
      ["PICPAY*CICLANO TESTE", 460],
    ]);
    expect(counts.naoMinimizaveis).toBe(0);
    const text = JSON.stringify(pending);
    for (const forbidden of ["123.456", "91234", "@example", "12345678", "tx_test"]) expect(text).not.toContain(forbidden);
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

  it("com retryAttempted, reexporta o que foi tentado nos últimos 30 dias", async () => {
    const attempts = JSON.stringify({ tx_test_1: "2026-03-20" });
    const { db } = fakeDb({ attempts });
    const { map, counts } = await buildExport(db, { ownerUserId: OWNER, retryAttempted: true, now: NOW });
    expect(Object.values(map.itens).map((i) => i.id)).toEqual(["tx_test_1", "tx_test_2", "tx_test_3"]);
    expect(counts.tentadasRecentes).toBe(0);
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
