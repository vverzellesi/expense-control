import { describe, it, expect } from "vitest";
import { calculateFinancialScore } from "./financial-score";

describe("calculateFinancialScore", () => {
  it("healthy score for low commitment, no debt, no installments", () => {
    const result = calculateFinancialScore({
      income: 10000,
      fixedExpensesTotal: 4000,

      monthlyExpenses: [5000, 5000, 5000],
      activeInstallments: 0,
      totalRemainingMonths: 0,
      debtAlertCount: 0,
      hasCriticalDebt: false,
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe("healthy");
  });

  it("critical score for high commitment + debt", () => {
    const result = calculateFinancialScore({
      income: 10000,
      fixedExpensesTotal: 9000,

      monthlyExpenses: [7000, 8500, 10000],
      activeInstallments: 10,
      totalRemainingMonths: 60,
      debtAlertCount: 2,
      hasCriticalDebt: true,
    });
    expect(result.score).toBeLessThan(40);
    expect(result.level).toBe("critical");
  });

  it("warning score for moderate situation", () => {
    const result = calculateFinancialScore({
      income: 10000,
      fixedExpensesTotal: 6500,

      monthlyExpenses: [6000, 6500, 7000],
      activeInstallments: 6,
      totalRemainingMonths: 25,
      debtAlertCount: 0,
      hasCriticalDebt: false,
    });
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(70);
    expect(result.level).toBe("warning");
  });

  it("many installments lower debt score even without bill payment alerts", () => {
    const result = calculateFinancialScore({
      income: 10000,
      fixedExpensesTotal: 5000,
      monthlyExpenses: [5000, 5000, 5000],
      activeInstallments: 40,
      totalRemainingMonths: 200,
      debtAlertCount: 0,
      hasCriticalDebt: false,
    });
    expect(result.factors.debtStatus.score).toBeLessThanOrEqual(40);
    expect(result.factors.debtStatus.description).toContain("parcelas");
  });

  it("handles zero income gracefully", () => {
    const result = calculateFinancialScore({
      income: 0,
      fixedExpensesTotal: 0,

      monthlyExpenses: [],
      activeInstallments: 0,
      totalRemainingMonths: 0,
      debtAlertCount: 0,
      hasCriticalDebt: false,
    });
    expect(result.score).toBeGreaterThan(0);
  });

  it("includes factor descriptions in Portuguese", () => {
    const result = calculateFinancialScore({
      income: 10000,
      fixedExpensesTotal: 5000,

      monthlyExpenses: [5000],
      activeInstallments: 3,
      totalRemainingMonths: 15,
      debtAlertCount: 0,
      hasCriticalDebt: false,
    });
    expect(result.factors.fixedCommitment.description).toContain("% da renda");
    expect(result.factors.installmentLoad.description).toContain(
      "parcelas ativas"
    );
  });
});
