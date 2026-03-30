import { describe, it, expect } from "vitest";
import { calculateProjection } from "./projection";

describe("calculateProjection", () => {
  it("calculates projection with pending recurring and installments", () => {
    const result = calculateProjection({
      currentExpenses: 5000,
      income: 10000,
      pendingRecurring: [
        { description: "Aluguel", defaultAmount: 2000, categoryName: "Moradia" },
      ],
      pendingInstallments: [
        { description: "TV 3/10", installmentAmount: 500, categoryName: "Compras" },
      ],
    });

    expect(result.currentExpenses).toBe(5000);
    expect(result.pendingTotal).toBe(2500);
    expect(result.projectedTotal).toBe(7500);
    expect(result.projectedPercentage).toBe(75);
    expect(result.pendingItems).toHaveLength(2);
  });

  it("returns zero pending when no pending items", () => {
    const result = calculateProjection({
      currentExpenses: 3000,
      income: 10000,
      pendingRecurring: [],
      pendingInstallments: [],
    });

    expect(result.pendingTotal).toBe(0);
    expect(result.projectedTotal).toBe(3000);
    expect(result.pendingItems).toHaveLength(0);
  });

  it("handles zero income without division error", () => {
    const result = calculateProjection({
      currentExpenses: 1000,
      income: 0,
      pendingRecurring: [],
      pendingInstallments: [],
    });

    expect(result.projectedPercentage).toBe(0);
  });

  it("classifies pending items by type", () => {
    const result = calculateProjection({
      currentExpenses: 0,
      income: 5000,
      pendingRecurring: [{ description: "Netflix", defaultAmount: 55 }],
      pendingInstallments: [{ description: "Celular 2/12", installmentAmount: 200 }],
    });

    expect(result.pendingItems[0].type).toBe("recurring");
    expect(result.pendingItems[1].type).toBe("installment");
  });
});
