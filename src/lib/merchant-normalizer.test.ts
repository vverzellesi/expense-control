import { describe, it, expect } from "vitest";
import { normalizeMerchant, groupByMerchant } from "./merchant-normalizer";

describe("normalizeMerchant", () => {
  it("removes IFD* prefix and applies title case", () => {
    expect(normalizeMerchant("IFD*ESFIHARIA O SULTAO")).toBe("Esfiharia O Sultao");
  });

  it("removes PAG* prefix", () => {
    expect(normalizeMerchant("PAG*JoseDaSilva")).toBe("Josedasilva");
  });

  it("removes PIX QR prefix", () => {
    expect(normalizeMerchant("PIX QR - MERCADO LIVRE")).toBe("Mercado Livre");
  });

  it("removes MP* prefix", () => {
    expect(normalizeMerchant("MP*SHOPEE")).toBe("Shopee");
  });

  it("removes PAGAMENTO prefix", () => {
    expect(normalizeMerchant("PAGAMENTO*NETFLIX")).toBe("Netflix");
  });

  it("handles plain descriptions", () => {
    expect(normalizeMerchant("RESTAURANTE DO ZE")).toBe("Restaurante Do Ze");
  });

  it("handles empty result after prefix removal", () => {
    expect(normalizeMerchant("PIX ")).toBe("Pix");
  });

  it("trims whitespace", () => {
    expect(normalizeMerchant("  IFD*LOJA  ")).toBe("Loja");
  });
});

describe("groupByMerchant", () => {
  it("groups transactions by normalized merchant", () => {
    const txs = [
      { id: "1", description: "IFD*LOJA ABC", amount: -100, date: new Date("2026-01-05") },
      { id: "2", description: "IFD*LOJA ABC", amount: -200, date: new Date("2026-01-10") },
      { id: "3", description: "PAG*OUTRO", amount: -50, date: new Date("2026-01-15") },
    ];

    const groups = groupByMerchant(txs);

    expect(groups).toHaveLength(2);
    expect(groups[0].merchant).toBe("Loja Abc");
    expect(groups[0].total).toBe(300);
    expect(groups[0].count).toBe(2);
    expect(groups[0].average).toBe(150);
  });

  it("sorts by total descending", () => {
    const txs = [
      { id: "1", description: "SMALL", amount: -10, date: new Date() },
      { id: "2", description: "BIG", amount: -500, date: new Date() },
    ];

    const groups = groupByMerchant(txs);
    expect(groups[0].merchant).toBe("Big");
    expect(groups[1].merchant).toBe("Small");
  });

  it("handles empty array", () => {
    expect(groupByMerchant([])).toEqual([]);
  });

  it("uses absolute values for amounts", () => {
    const txs = [
      { id: "1", description: "LOJA", amount: -100, date: new Date() },
    ];
    const groups = groupByMerchant(txs);
    expect(groups[0].total).toBe(100);
  });
});
