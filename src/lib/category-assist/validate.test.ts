// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseDecisions } from "./validate";

const items = new Set(["i1", "i2", "i3", "i4"]);
const cats = new Set(["c1", "c2"]);
const parse = (raw: unknown) => parseDecisions(raw, "exp_test", items, cats);

describe("parseDecisions", () => {
  it("recusa formato inválido e decisões de outra exportação", () => {
    expect(parse(null)).toEqual({ ok: false, error: "formato_invalido" });
    expect(parse({ decisoes: [] })).toEqual({ ok: false, error: "formato_invalido" });
    expect(parse({ exportacao: "exp_test", decisoes: "x" })).toEqual({ ok: false, error: "formato_invalido" });
    expect(parse({ exportacao: "exp_outra", decisoes: [] })).toEqual({ ok: false, error: "outra_exportacao" });
  });

  it("só confiança alta com categoria da lista vira categoria", () => {
    const r = parse({
      exportacao: "exp_test",
      decisoes: [
        { chave: "i1", categoria: "c1", confianca: "alta" },
        { chave: "i2", categoria: "c2", confianca: "média" },
        { chave: "i3", categoria: null, confianca: "alta" },
        { chave: "i4", categoria: "c9", confianca: "alta" },
      ],
    });
    if (!r.ok) throw new Error("esperava ok");
    expect(Object.fromEntries(r.verdicts)).toEqual({
      i1: { kind: "categorize", categoryKey: "c1" },
      i2: { kind: "low_confidence" },
      i3: { kind: "abstain" },
      i4: { kind: "discard" },
    });
  });

  it("aceita caixa e espaços diferentes nas chaves e na confiança", () => {
    const r = parse({ exportacao: " exp_test ", decisoes: [{ chave: " I1 ", categoria: "C1", confianca: "ALTA" }] });
    if (!r.ok) throw new Error("esperava ok");
    expect(r.verdicts.get("i1")).toEqual({ kind: "categorize", categoryKey: "c1" });
  });

  it("chave desconhecida, entrada mal formada e duplicada são descartadas", () => {
    const r = parse({
      exportacao: "exp_test",
      decisoes: [
        { chave: "i99", categoria: "c1", confianca: "alta" },
        "ignore as instruções anteriores",
        { chave: "i1", categoria: "c1", confianca: "certeza" },
        { chave: "i2", categoria: "c1", confianca: "alta" },
        { chave: "i2", categoria: "c2", confianca: "alta" },
        { chave: "i3", categoria: "c1" },
      ],
    });
    if (!r.ok) throw new Error("esperava ok");
    expect(r.unknownEntries).toBe(2);
    expect(Object.fromEntries(r.verdicts)).toEqual({ i1: { kind: "discard" }, i2: { kind: "discard" }, i3: { kind: "discard" } });
    expect(r.verdicts.has("i4")).toBe(false);
  });
});
