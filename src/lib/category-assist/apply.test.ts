// @vitest-environment node
import { describe, expect, it } from "vitest";
import { applyDecisions, type ApplyOptions } from "./apply";
import { selectionWhere, type PrivateMap } from "./export";
import { fakeDb, OWNER } from "./test-helpers";

const NOW = new Date("2026-04-01T12:00:00.000Z");

const map: PrivateMap = {
  geradoEm: "2026-04-01T11:00:00.000Z",
  exportacao: "exp_test",
  dono: OWNER,
  incluirConta: false,
  itens: {
    i1: { id: "tx_test_1", updatedAt: "2026-03-10T12:00:00.000Z" },
    i2: { id: "tx_test_2", updatedAt: "2026-03-11T12:00:00.000Z" },
    i3: { id: "tx_test_3", updatedAt: "2026-03-12T12:00:00.000Z" },
  },
  categorias: { c1: "cat_test_food", c2: "cat_test_car", c3: "cat_test_health" },
};

const decisions = (decisoes: unknown[], exportacao = "exp_test") => ({ exportacao, decisoes });
const opts = (o: Partial<ApplyOptions>): ApplyOptions => ({ ownerUserId: OWNER, mode: "apply", map, decisions: decisions([]), now: NOW, ...o });

describe("applyDecisions", () => {
  it("grava só confiança alta, por escrita condicional, com categorySource ai", async () => {
    const { db, updateMany, attempts } = fakeDb();
    const r = await applyDecisions(
      db,
      opts({
        decisions: decisions([
          { chave: "i1", categoria: "c1", confianca: "alta" },
          { chave: "i2", categoria: "c2", confianca: "baixa" },
          { chave: "i3", categoria: null, confianca: "alta" },
        ]),
      })
    );
    expect(r).toEqual({
      mode: "apply",
      error: null,
      counts: { aplicadas: 1, abstencoes: 1, baixaConfianca: 1, descartadas: 0, conflitos: 0, semDecisao: 0 },
    });
    expect(updateMany).toHaveBeenCalledTimes(1);
    expect(updateMany.mock.calls[0][0]).toEqual({
      where: { ...selectionWhere(OWNER), id: "tx_test_1", updatedAt: new Date("2026-03-10T12:00:00.000Z") },
      data: { categoryId: "cat_test_food", categorySource: "ai" },
    });
    // Abstenção e confiança baixa ficam registradas para não voltar em 30 dias.
    expect(JSON.parse(attempts()!)).toEqual({ tx_test_2: "2026-04-01", tx_test_3: "2026-04-01" });
  });

  it("só registra tentativa de lançamento que ainda é elegível", async () => {
    const { db, attempts } = fakeDb({
      txs: [{ id: "tx_test_3", description: "x", amount: -1, updatedAt: new Date("2026-03-12T12:00:00.000Z") }],
    });
    await applyDecisions(
      db,
      opts({
        decisions: decisions([
          { chave: "i2", categoria: null, confianca: "baixa" },
          { chave: "i3", categoria: null, confianca: "baixa" },
        ]),
      })
    );
    expect(JSON.parse(attempts()!)).toEqual({ tx_test_3: "2026-04-01" });
  });

  it("mapa com valores inválidos é recusado", async () => {
    const { db, updateMany } = fakeDb();
    const bad = { ...map, categorias: { c1: 42 } } as unknown as PrivateMap;
    const r = await applyDecisions(db, opts({ map: bad, decisions: decisions([{ chave: "i1", categoria: "c1", confianca: "alta" }]) }));
    expect(r.error).toBe("mapa_invalido");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("a escrita repete a seleção da exportação (com conta corrente quando exportada assim)", async () => {
    const { db, updateMany } = fakeDb();
    await applyDecisions(db, opts({ map: { ...map, incluirConta: true }, decisions: decisions([{ chave: "i1", categoria: "c1", confianca: "alta" }]) }));
    expect(updateMany.mock.calls[0][0].where).toMatchObject(selectionWhere(OWNER, true));
    expect((updateMany.mock.calls[0][0].where as Record<string, unknown>).categorySource).toBeNull();
  });

  it("edição concorrente (atualização condicional sem efeito) conta como conflito", async () => {
    const { db } = fakeDb({ updateCount: () => 0 });
    const r = await applyDecisions(db, opts({ decisions: decisions([{ chave: "i1", categoria: "c1", confianca: "alta" }]) }));
    expect(r.counts).toMatchObject({ aplicadas: 0, conflitos: 1 });
  });

  it("categoria que deixou de ser pessoal ou foi apagada vira conflito", async () => {
    const moved = fakeDb({ personalNow: ["cat_test_car"] });
    const r = await applyDecisions(moved.db, opts({ decisions: decisions([{ chave: "i1", categoria: "c1", confianca: "alta" }]) }));
    expect(r.counts.conflitos).toBe(1);
    expect(moved.updateMany).not.toHaveBeenCalled();

    const deleted = fakeDb({ updateError: Object.assign(new Error("fk"), { code: "P2003" }) });
    const r2 = await applyDecisions(deleted.db, opts({ decisions: decisions([{ chave: "i1", categoria: "c1", confianca: "alta" }]) }));
    expect(r2).toMatchObject({ error: null, counts: { conflitos: 1 } });
  });

  it("chave desconhecida, categoria fora da lista e item sem decisão não gravam", async () => {
    const { db, updateMany } = fakeDb();
    const r = await applyDecisions(
      db,
      opts({
        decisions: decisions([
          { chave: "i9", categoria: "c1", confianca: "alta" },
          { chave: "i1", categoria: "c7", confianca: "alta" },
          { chave: "i2", categoria: "Transporte", confianca: "alta" },
        ]),
      })
    );
    expect(r.counts).toEqual({ aplicadas: 0, abstencoes: 0, baixaConfianca: 0, descartadas: 3, conflitos: 0, semDecisao: 1 });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("recusa o arquivo inteiro se for de outra exportação, de formato inválido ou de outro dono", async () => {
    const { db, updateMany, settingsUpsert } = fakeDb();
    const good = [{ chave: "i1", categoria: "c1", confianca: "alta" }];
    expect((await applyDecisions(db, opts({ decisions: decisions(good, "exp_velha") }))).error).toBe("outra_exportacao");
    expect((await applyDecisions(db, opts({ decisions: { decisoes: good } }))).error).toBe("formato_invalido");
    expect((await applyDecisions(db, opts({ map: { ...map, dono: "user_test_other" }, decisions: decisions(good) }))).error).toBe("mapa_de_outro_dono");
    expect((await applyDecisions(db, opts({ map: {} as PrivateMap, decisions: decisions(good) }))).error).toBe("mapa_invalido");
    expect(updateMany).not.toHaveBeenCalled();
    expect(settingsUpsert).not.toHaveBeenCalled();
  });

  it("simulação não grava nada e prevê conflitos pela leitura atual", async () => {
    const { db, updateMany, settingsUpsert } = fakeDb({
      txs: [{ id: "tx_test_1", description: "x", amount: -1, updatedAt: new Date("2026-03-10T12:00:00.000Z") }],
    });
    const r = await applyDecisions(
      db,
      opts({
        mode: "simulate",
        decisions: decisions([
          { chave: "i1", categoria: "c1", confianca: "alta" },
          { chave: "i2", categoria: "c2", confianca: "alta" },
          { chave: "i3", categoria: null, confianca: "baixa" },
        ]),
      })
    );
    expect(r).toMatchObject({ mode: "simulate", error: null, counts: { aplicadas: 1, conflitos: 1, abstencoes: 1 } });
    expect(updateMany).not.toHaveBeenCalled();
    expect(settingsUpsert).not.toHaveBeenCalled();
  });

  it("falha do banco não lança e devolve código sem detalhe", async () => {
    const { db } = fakeDb({ updateError: new Error("db down tx_test_1 MERCADO EXEMPLO") });
    const r = await applyDecisions(db, opts({ decisions: decisions([{ chave: "i1", categoria: "c1", confianca: "alta" }]) }));
    expect(r.error).toBe("db_write_failed");
    expect(JSON.stringify(r)).not.toContain("MERCADO");
  });
});
