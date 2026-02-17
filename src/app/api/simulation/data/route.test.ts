import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use vi.hoisted so these are available in vi.mock factories (which are hoisted)
const { mockTransaction, mockRecurringExpense, mockGetAuth } = vi.hoisted(
  () => ({
    mockTransaction: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    mockRecurringExpense: {
      findMany: vi.fn(),
    },
    mockGetAuth: vi.fn(),
  })
);

vi.mock("@/lib/auth-utils", () => ({
  getAuthenticatedUserId: mockGetAuth,
  unauthorizedResponse: () => {
    const { NextResponse } = require("next/server");
    return NextResponse.json(
      { error: "Nao autorizado. Faca login para continuar." },
      { status: 401 }
    );
  },
}));

vi.mock("@/lib/db", () => ({
  default: {
    transaction: mockTransaction,
    recurringExpense: mockRecurringExpense,
  },
}));

import { GET } from "./route";

describe("GET /api/simulation/data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 1, 17)); // Feb 17, 2026
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 for unauthenticated requests", async () => {
    mockGetAuth.mockRejectedValue(new Error("Unauthorized"));

    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("returns averageIncome calculated from last 3 months of income", async () => {
    mockGetAuth.mockResolvedValue("user-1");

    // Income: Nov 2025 = 5000, Dec 2025 = 6000, Jan 2026 = 7000
    mockTransaction.findMany.mockImplementation(
      async (args: { where: { type?: string; isInstallment?: boolean } }) => {
        if (args.where.type === "INCOME") {
          return [
            { amount: 5000, date: new Date(2025, 10, 5) }, // Nov
            { amount: 6000, date: new Date(2025, 11, 5) }, // Dec
            { amount: 7000, date: new Date(2026, 0, 5) }, // Jan
          ];
        }
        return [];
      }
    );

    mockRecurringExpense.findMany.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // Average of 5000 + 6000 + 7000 = 18000 / 3 = 6000
    expect(data.averageIncome).toBe(6000);
  });

  it("returns 12 months of baseline data starting from current month", async () => {
    mockGetAuth.mockResolvedValue("user-1");

    mockTransaction.findMany.mockResolvedValue([]);
    mockRecurringExpense.findMany.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(data.months).toHaveLength(12);
    // First month should be Feb 2026
    expect(data.months[0].month).toBe(2);
    expect(data.months[0].year).toBe(2026);
    expect(data.months[0].label).toBe("fev/26");
    // Last month should be Jan 2027
    expect(data.months[11].month).toBe(1);
    expect(data.months[11].year).toBe(2027);
    expect(data.months[11].label).toBe("jan/27");
  });

  it("includes recurring expenses in each month's currentExpenses", async () => {
    mockGetAuth.mockResolvedValue("user-1");

    mockTransaction.findMany.mockResolvedValue([]);
    mockRecurringExpense.findMany.mockResolvedValue([
      {
        id: "rec-1",
        description: "Netflix",
        defaultAmount: -55.9,
        type: "EXPENSE",
        isActive: true,
      },
      {
        id: "rec-2",
        description: "Gym",
        defaultAmount: -120,
        type: "EXPENSE",
        isActive: true,
      },
    ]);

    // No latest transaction found for any recurring
    mockTransaction.findFirst.mockResolvedValue(null);

    const response = await GET();
    const data = await response.json();

    // Each month should have recurring = 55.9 + 120 = 175.9
    expect(data.months[0].recurringExpenses).toBeCloseTo(175.9, 1);
    expect(data.months[0].currentExpenses).toBeCloseTo(175.9, 1);
  });

  it("includes installments in correct months", async () => {
    mockGetAuth.mockResolvedValue("user-1");

    mockTransaction.findMany.mockImplementation(
      async (args: { where: { type?: string; isInstallment?: boolean; installmentId?: unknown } }) => {
        if (args.where.type === "INCOME") {
          return [];
        }
        // Grouped installments
        if (
          args.where.isInstallment === true &&
          args.where.installmentId !== undefined
        ) {
          return [
            { amount: -500, date: new Date(2026, 1, 10) }, // Feb
            { amount: -500, date: new Date(2026, 2, 10) }, // Mar
          ];
        }
        // Standalone installments
        if (args.where.isInstallment === true) {
          return [];
        }
        return [];
      }
    );

    mockRecurringExpense.findMany.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    // Feb should have 500 installments
    expect(data.months[0].installmentsTotal).toBe(500);
    // Mar should have 500
    expect(data.months[1].installmentsTotal).toBe(500);
    // Apr should have 0
    expect(data.months[2].installmentsTotal).toBe(0);
  });

  it("returns averageIncome 0 when no income exists", async () => {
    mockGetAuth.mockResolvedValue("user-1");

    mockTransaction.findMany.mockResolvedValue([]);
    mockRecurringExpense.findMany.mockResolvedValue([]);

    const response = await GET();
    const data = await response.json();

    expect(data.averageIncome).toBe(0);
  });
});
