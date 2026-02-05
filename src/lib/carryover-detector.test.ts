import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isCarryoverTransaction,
  CARRYOVER_PATTERNS,
  getPreviousMonth,
  findMatchingBillPayment,
  calculateInterest,
} from "./carryover-detector";

// Mock the database module
vi.mock("./db", () => ({
  default: {
    billPayment: {
      findMany: vi.fn(),
    },
  },
}));

import prisma from "./db";

describe("CARRYOVER_PATTERNS", () => {
  it("should have all expected patterns", () => {
    expect(CARRYOVER_PATTERNS).toHaveLength(8);
  });
});

describe("isCarryoverTransaction", () => {
  describe("SALDO ANTERIOR patterns", () => {
    it("should detect SALDO ANTERIOR", () => {
      expect(isCarryoverTransaction("SALDO ANTERIOR")).toBe(true);
      expect(isCarryoverTransaction("SALDO  ANTERIOR")).toBe(true);
      expect(isCarryoverTransaction("SALDOANTERIOR")).toBe(true);
    });

    it("should detect SALDO FATURA ANT", () => {
      expect(isCarryoverTransaction("SALDO FATURA ANT")).toBe(true);
      expect(isCarryoverTransaction("SALDO FATURA ANTERIOR")).toBe(true);
    });
  });

  describe("ROTATIVO patterns", () => {
    it("should detect SALDO ROTATIVO", () => {
      expect(isCarryoverTransaction("SALDO ROTATIVO")).toBe(true);
      expect(isCarryoverTransaction("SALDO  ROTATIVO")).toBe(true);
    });

    it("should detect ROTATIVO standalone", () => {
      expect(isCarryoverTransaction("ROTATIVO")).toBe(true);
      expect(isCarryoverTransaction("CREDITO ROTATIVO")).toBe(true);
      expect(isCarryoverTransaction("JUROS ROTATIVO")).toBe(true);
    });
  });

  describe("FINANCIAMENTO patterns", () => {
    it("should detect FINANCIAMENTO FATURA", () => {
      expect(isCarryoverTransaction("FINANCIAMENTO FATURA")).toBe(true);
      expect(isCarryoverTransaction("FINANC FATURA")).toBe(true);
    });

    it("should detect PARCELAMENTO FATURA", () => {
      expect(isCarryoverTransaction("PARCELAMENTO FATURA")).toBe(true);
      expect(isCarryoverTransaction("PARCELAMENTO DE FATURA")).toBe(true);
    });
  });

  describe("PAGAMENTO MINIMO patterns", () => {
    it("should detect PGTO MINIMO", () => {
      expect(isCarryoverTransaction("PGTO MINIMO")).toBe(true);
      expect(isCarryoverTransaction("PGTO  MINIMO")).toBe(true);
    });

    it("should detect PAGAMENTO MINIMO", () => {
      expect(isCarryoverTransaction("PAGAMENTO MINIMO")).toBe(true);
      expect(isCarryoverTransaction("PAGAMENTO  MINIMO")).toBe(true);
    });
  });

  describe("case insensitivity", () => {
    it("should match regardless of case", () => {
      expect(isCarryoverTransaction("saldo rotativo")).toBe(true);
      expect(isCarryoverTransaction("SALDO ROTATIVO")).toBe(true);
      expect(isCarryoverTransaction("Saldo Rotativo")).toBe(true);
      expect(isCarryoverTransaction("SaLdO rOtAtIvO")).toBe(true);
    });
  });

  describe("non-carryover transactions", () => {
    it("should not detect regular purchases", () => {
      expect(isCarryoverTransaction("NETFLIX")).toBe(false);
      expect(isCarryoverTransaction("SUPERMERCADO")).toBe(false);
      expect(isCarryoverTransaction("RESTAURANTE ABC")).toBe(false);
    });

    it("should not detect regular card payments", () => {
      expect(isCarryoverTransaction("PAGAMENTO CARTAO")).toBe(false);
      expect(isCarryoverTransaction("PAGTO FATURA")).toBe(false);
    });

    it("should not detect installments", () => {
      expect(isCarryoverTransaction("PARCELA 3/10")).toBe(false);
      expect(isCarryoverTransaction("PARCELAMENTO LOJA")).toBe(false);
    });
  });

  describe("real-world examples", () => {
    it("should detect common bank carryover descriptions", () => {
      // Nubank
      expect(isCarryoverTransaction("SALDO ROTATIVO - R$ 2.150,00")).toBe(true);
      // Itau
      expect(isCarryoverTransaction("SALDO ANTERIOR FATURA")).toBe(true);
      // C6
      expect(isCarryoverTransaction("FINANC FATURA ANTERIOR")).toBe(true);
      // BTG
      expect(isCarryoverTransaction("PARCELAMENTO FATURA 01/04")).toBe(true);
    });
  });
});

describe("getPreviousMonth", () => {
  it("should return previous month for months 2-12", () => {
    expect(getPreviousMonth(2, 2026)).toEqual({ month: 1, year: 2026 });
    expect(getPreviousMonth(6, 2026)).toEqual({ month: 5, year: 2026 });
    expect(getPreviousMonth(12, 2026)).toEqual({ month: 11, year: 2026 });
  });

  it("should handle January by returning December of previous year", () => {
    expect(getPreviousMonth(1, 2026)).toEqual({ month: 12, year: 2025 });
    expect(getPreviousMonth(1, 2024)).toEqual({ month: 12, year: 2023 });
  });
});

describe("findMatchingBillPayment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockBillPayment = {
    id: "bp_123",
    billMonth: 1,
    billYear: 2026,
    origin: "Nubank",
    totalBillAmount: 12000,
    amountPaid: 10000,
    amountCarried: 2000,
    paymentType: "PARTIAL",
    installmentId: null,
    interestRate: null,
    interestAmount: null,
    entryTransactionId: "tx_entry",
    carryoverTransactionId: "tx_carryover",
    linkedTransactionId: null,
    userId: "user_123",
    createdAt: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"),
  };

  it("should find matching bill payment from previous month", async () => {
    vi.mocked(prisma.billPayment.findMany).mockResolvedValue([mockBillPayment]);

    const result = await findMatchingBillPayment({
      origin: "Nubank",
      month: 2, // February
      year: 2026,
      amount: 2150, // With interest
      userId: "user_123",
    });

    expect(result).not.toBeNull();
    expect(result?.id).toBe("bp_123");
    expect(result?.origin).toBe("Nubank");
    expect(result?.billMonth).toBe(1);
    expect(result?.billYear).toBe(2026);

    // Verify the query used the correct previous month
    expect(prisma.billPayment.findMany).toHaveBeenCalledWith({
      where: {
        userId: "user_123",
        origin: "Nubank",
        billMonth: 1, // Previous month
        billYear: 2026,
        linkedTransactionId: null,
        amountCarried: {
          gte: 1075, // 2150 * 0.5
          lte: 3225, // 2150 * 1.5
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
  });

  it("should handle January edge case (previous month = December previous year)", async () => {
    const decemberPayment = {
      ...mockBillPayment,
      billMonth: 12,
      billYear: 2025,
    };
    vi.mocked(prisma.billPayment.findMany).mockResolvedValue([decemberPayment]);

    const result = await findMatchingBillPayment({
      origin: "Nubank",
      month: 1, // January
      year: 2026,
      amount: 2000,
      userId: "user_123",
    });

    expect(result).not.toBeNull();
    expect(result?.billMonth).toBe(12);
    expect(result?.billYear).toBe(2025);

    expect(prisma.billPayment.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        billMonth: 12,
        billYear: 2025,
      }),
      orderBy: expect.any(Object),
    });
  });

  it("should return null when no matching bill payment found", async () => {
    vi.mocked(prisma.billPayment.findMany).mockResolvedValue([]);

    const result = await findMatchingBillPayment({
      origin: "Nubank",
      month: 2,
      year: 2026,
      amount: 2000,
      userId: "user_123",
    });

    expect(result).toBeNull();
  });

  it("should return the most recent match when multiple found", async () => {
    const olderPayment = {
      ...mockBillPayment,
      id: "bp_old",
      createdAt: new Date("2026-01-10"),
    };
    const newerPayment = {
      ...mockBillPayment,
      id: "bp_new",
      createdAt: new Date("2026-01-15"),
    };

    // The findMany is ordered by createdAt desc, so newer should be first
    vi.mocked(prisma.billPayment.findMany).mockResolvedValue([
      newerPayment,
      olderPayment,
    ]);

    const result = await findMatchingBillPayment({
      origin: "Nubank",
      month: 2,
      year: 2026,
      amount: 2000,
      userId: "user_123",
    });

    expect(result?.id).toBe("bp_new");
  });

  it("should only find unlinked bill payments", async () => {
    vi.mocked(prisma.billPayment.findMany).mockResolvedValue([mockBillPayment]);

    await findMatchingBillPayment({
      origin: "Nubank",
      month: 2,
      year: 2026,
      amount: 2000,
      userId: "user_123",
    });

    expect(prisma.billPayment.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        linkedTransactionId: null,
      }),
      orderBy: expect.any(Object),
    });
  });

  it("should use 50% tolerance for amount matching", async () => {
    vi.mocked(prisma.billPayment.findMany).mockResolvedValue([]);

    await findMatchingBillPayment({
      origin: "Nubank",
      month: 2,
      year: 2026,
      amount: 1000, // Test amount
      userId: "user_123",
    });

    expect(prisma.billPayment.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        amountCarried: {
          gte: 500, // 1000 * 0.5
          lte: 1500, // 1000 * 1.5
        },
      }),
      orderBy: expect.any(Object),
    });
  });

  it("should convert optional fields to undefined in result", async () => {
    vi.mocked(prisma.billPayment.findMany).mockResolvedValue([mockBillPayment]);

    const result = await findMatchingBillPayment({
      origin: "Nubank",
      month: 2,
      year: 2026,
      amount: 2000,
      userId: "user_123",
    });

    // Null values should be converted to undefined for the interface
    expect(result?.installmentId).toBeUndefined();
    expect(result?.interestRate).toBeUndefined();
    expect(result?.interestAmount).toBeUndefined();
    expect(result?.linkedTransactionId).toBeUndefined();
  });
});

describe("calculateInterest", () => {
  describe("positive interest (actual > expected)", () => {
    it("should calculate interest rate and amount correctly", () => {
      const result = calculateInterest(2000, 2150);

      expect(result.rate).toBe(7.5); // (150 / 2000) * 100 = 7.5%
      expect(result.amount).toBe(150); // 2150 - 2000 = 150
    });

    it("should handle larger interest amounts", () => {
      const result = calculateInterest(1000, 1500);

      expect(result.rate).toBe(50); // (500 / 1000) * 100 = 50%
      expect(result.amount).toBe(500);
    });

    it("should round to 2 decimal places", () => {
      const result = calculateInterest(3000, 3333);

      // (333 / 3000) * 100 = 11.1%
      expect(result.rate).toBe(11.1);
      expect(result.amount).toBe(333);
    });
  });

  describe("zero or negative interest (actual <= expected)", () => {
    it("should handle zero interest (exact match)", () => {
      const result = calculateInterest(2000, 2000);

      expect(result.rate).toBe(0);
      expect(result.amount).toBe(0);
    });

    it("should handle negative interest (discount/partial payment)", () => {
      const result = calculateInterest(2000, 1800);

      expect(result.rate).toBe(-10); // (-200 / 2000) * 100 = -10%
      expect(result.amount).toBe(-200);
    });
  });

  describe("edge cases", () => {
    it("should handle zero expected amount", () => {
      const result = calculateInterest(0, 100);

      expect(result.rate).toBe(0); // Avoid division by zero
      expect(result.amount).toBe(100);
    });

    it("should handle negative amounts (uses absolute values)", () => {
      // Credit card amounts are often negative
      const result = calculateInterest(-2000, -2150);

      expect(result.rate).toBe(7.5);
      expect(result.amount).toBe(150);
    });

    it("should handle mixed signs", () => {
      const result = calculateInterest(2000, -2150);

      expect(result.rate).toBe(7.5);
      expect(result.amount).toBe(150);
    });

    it("should handle very small amounts", () => {
      const result = calculateInterest(100, 107.5);

      expect(result.rate).toBe(7.5);
      expect(result.amount).toBe(7.5);
    });

    it("should handle very large amounts", () => {
      const result = calculateInterest(100000, 115000);

      expect(result.rate).toBe(15);
      expect(result.amount).toBe(15000);
    });
  });

  describe("real-world examples", () => {
    it("should calculate typical Brazilian credit card interest", () => {
      // Common rotativo rates in Brazil are high (10-15% per month)
      const result = calculateInterest(2000, 2300);

      expect(result.rate).toBe(15);
      expect(result.amount).toBe(300);
    });

    it("should calculate with centavos precision", () => {
      const result = calculateInterest(1234.56, 1358.02);

      // ~10% interest
      expect(result.amount).toBe(123.46);
      expect(result.rate).toBeCloseTo(10, 0);
    });
  });
});
