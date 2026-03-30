import { describe, it, expect } from "vitest";
import { calculateCardScore } from "./card-score";

const baseCard = {
  origin: "Test Card",
  creditLimit: 10000,
  currentMonthTotal: 0,
  installmentTotal: 0,
  billPayments: [] as Array<{
    billMonth: number;
    billYear: number;
    paymentType: string;
    amountCarried: number;
    totalBillAmount: number;
  }>,
  previousMonthTotal: 0,
};

describe("calculateCardScore", () => {
  it("returns 100 for zero usage card", () => {
    const result = calculateCardScore(baseCard, 3, 2026);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.level).toBe("healthy");
  });

  it("penalizes high limit usage", () => {
    const card = { ...baseCard, currentMonthTotal: 8500 };
    const result = calculateCardScore(card, 3, 2026);
    expect(result.score).toBeLessThan(70);
  });

  it("penalizes high installment ratio", () => {
    const card = {
      ...baseCard,
      currentMonthTotal: 5000,
      installmentTotal: 4000,
    };
    const result = calculateCardScore(card, 3, 2026);
    expect(result.factors.installmentRatio.score).toBeLessThanOrEqual(25);
  });

  it("critical for financed 3+ months with high usage", () => {
    const card = {
      ...baseCard,
      currentMonthTotal: 9000,
      installmentTotal: 7000,
      previousMonthTotal: 5000,
      billPayments: [
        {
          billMonth: 1,
          billYear: 2026,
          paymentType: "FINANCED",
          amountCarried: 2000,
          totalBillAmount: 5000,
        },
        {
          billMonth: 2,
          billYear: 2026,
          paymentType: "FINANCED",
          amountCarried: 2500,
          totalBillAmount: 5000,
        },
        {
          billMonth: 3,
          billYear: 2026,
          paymentType: "FINANCED",
          amountCarried: 3000,
          totalBillAmount: 5000,
        },
      ],
    };
    const result = calculateCardScore(card, 3, 2026);
    expect(result.factors.financedHistory.score).toBeLessThanOrEqual(10);
    expect(result.level).toBe("critical");
  });

  it("handles null credit limit gracefully", () => {
    const card = { ...baseCard, creditLimit: null, currentMonthTotal: 5000 };
    const result = calculateCardScore(card, 3, 2026);
    expect(result.factors.limitUsage.score).toBe(70); // Neutral
  });

  it("rewards declining trend", () => {
    const card = {
      ...baseCard,
      currentMonthTotal: 3000,
      previousMonthTotal: 5000,
    };
    const result = calculateCardScore(card, 3, 2026);
    expect(result.factors.trend.score).toBe(100);
  });

  it("penalizes growing trend", () => {
    const card = {
      ...baseCard,
      currentMonthTotal: 6000,
      previousMonthTotal: 3000,
    };
    const result = calculateCardScore(card, 3, 2026);
    expect(result.factors.trend.score).toBe(40);
  });

  it("includes recommendation text", () => {
    const result = calculateCardScore(baseCard, 3, 2026);
    expect(result.recommendation).toBeTruthy();
    expect(typeof result.recommendation).toBe("string");
  });
});
