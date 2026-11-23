import { describe, expect, it } from "vitest";
import { buildAnthropicRequest, buildCategoryOptions, chunkItems, SYSTEM_PROMPT } from "./request";

describe("montagem do pedido", () => {
  it("categorias recebem chaves efêmeras e o id fica só no mapa do servidor", () => {
    const { options, keyToId } = buildCategoryOptions([
      { id: "cat_db_1", name: "Alimentação" },
      { id: "cat_db_2", name: "Transporte" },
    ]);
    expect(options).toEqual([
      { key: "c1", name: "Alimentação" },
      { key: "c2", name: "Transporte" },
    ]);
    expect(keyToId.get("c2")).toBe("cat_db_2");
  });

  it("lotes têm chaves de item pela posição", () => {
    const batches = chunkItems([1, 2, 3, 4, 5], 2);
    expect(batches.map((b) => b.map((i) => i.key))).toEqual([["i1", "i2"], ["i1", "i2"], ["i1"]]);
  });

  it("pedido usa saída estruturada, sem ferramentas, com descrição só na mensagem do usuário", () => {
    const payload = {
      categories: [{ key: "c1", name: "Alimentação" }],
      items: [{ key: "i1", description: "LOJA EXEMPLO", amountRange: "até 50" as const }],
    };
    const body = buildAnthropicRequest(payload, "modelo-teste");
    expect(body.model).toBe("modelo-teste");
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");
    expect(body.system).toBe(SYSTEM_PROMPT);
    expect(SYSTEM_PROMPT).not.toContain("LOJA EXEMPLO");
    const messages = body.messages as Array<{ role: string; content: Array<{ type: string; text: string }> }>;
    expect(messages).toHaveLength(1);
    expect(JSON.parse(messages[0].content[0].text)).toEqual(payload);
    const format = (body.output_config as { format: { type: string; schema: Record<string, unknown> } }).format;
    expect(format.type).toBe("json_schema");
    const item = (format.schema as any).properties.results.items;
    expect(item.properties.item.enum).toEqual(["i1"]);
    expect(item.properties.category.enum).toEqual(["c1", "abstain"]);
    expect(item.additionalProperties).toBe(false);
  });
});
