import { describe, expect, it } from "vitest";
import { validateOutput } from "./validate";

const items = ["i1", "i2", "i3"];
const cats = new Set(["c1", "c2"]);

describe("validateOutput", () => {
  it("aceita categoria permitida com confiança alta", () => {
    const v = validateOutput({ results: [{ item: "i1", category: "c2", confidence: "high" }] }, ["i1"], cats);
    expect(v!.get("i1")).toEqual({ kind: "categorize", categoryKey: "c2" });
  });

  it("confiança média ou baixa não categoriza", () => {
    const v = validateOutput(
      { results: [{ item: "i1", category: "c1", confidence: "medium" }, { item: "i2", category: "c1", confidence: "low" }] },
      ["i1", "i2"],
      cats
    );
    expect(v!.get("i1")).toEqual({ kind: "low_confidence" });
    expect(v!.get("i2")).toEqual({ kind: "low_confidence" });
  });

  it("abstenção é contada como abstenção", () => {
    const v = validateOutput({ results: [{ item: "i1", category: "abstain", confidence: "high" }] }, ["i1"], cats);
    expect(v!.get("i1")).toEqual({ kind: "abstain" });
  });

  it("chave de categoria inventada é descartada", () => {
    const v = validateOutput({ results: [{ item: "i1", category: "c99", confidence: "high" }] }, ["i1"], cats);
    expect(v!.get("i1")).toEqual({ kind: "discard" });
  });

  it("item desconhecido é ignorado e item ausente é descartado", () => {
    const v = validateOutput({ results: [{ item: "i9", category: "c1", confidence: "high" }] }, items, cats);
    expect(Array.from(v!.keys())).toEqual(items);
    expect(Array.from(v!.values()).every((x) => x.kind === "discard")).toBe(true);
  });

  it("resultado duplicado para o mesmo item descarta o item", () => {
    const v = validateOutput(
      { results: [{ item: "i1", category: "c1", confidence: "high" }, { item: "i1", category: "c2", confidence: "high" }] },
      ["i1"],
      cats
    );
    expect(v!.get("i1")).toEqual({ kind: "discard" });
  });

  it("elemento mal formado descarta só aquele item", () => {
    const v = validateOutput(
      { results: [{ item: "i1", category: "c1", confidence: "certeza" }, { item: "i2", category: "c1", confidence: "high" }] },
      ["i1", "i2"],
      cats
    );
    expect(v!.get("i1")).toEqual({ kind: "discard" });
    expect(v!.get("i2")).toEqual({ kind: "categorize", categoryKey: "c1" });
  });

  it("formato geral inválido descarta o lote", () => {
    expect(validateOutput(null, items, cats)).toBeNull();
    expect(validateOutput("c1", items, cats)).toBeNull();
    expect(validateOutput({ resultados: [] }, items, cats)).toBeNull();
    expect(validateOutput({ results: "c1" }, items, cats)).toBeNull();
  });
});
