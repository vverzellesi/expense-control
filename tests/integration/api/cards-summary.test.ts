import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import "../setup"; // Mocks auth (getAuthContext, etc.)

// Mock prisma with inline factory
vi.mock("@/lib/db", () => ({
  default: {
    origin: {
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
    recurringExpense: {
      findMany: vi.fn(),
    },
  },
}));

// Import route handler and prisma mock after mocking
import { GET } from "@/app/api/cards/summary/route";
import prisma from "@/lib/db";

// Type assertion for mocked prisma
const mockPrisma = prisma as unknown as {
  origin: { findMany: ReturnType<typeof vi.fn> };
  transaction: { findMany: ReturnType<typeof vi.fn> };
  recurringExpense: { findMany: ReturnType<typeof vi.fn> };
};

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("GET /api/cards/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty cards when no credit card origins exist", async () => {
    mockPrisma.origin.findMany.mockResolvedValue([]);

    const response = await GET(createRequest("/api/cards/summary?month=3&year=2026"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cards).toEqual([]);
    expect(data.totals.totalAllCards).toBe(0);
    expect(data.totals.projectedNextMonth).toBe(0);
  });

  it("returns card summary with breakdown for current month", async () => {
    mockPrisma.origin.findMany.mockResolvedValue([
      {
        id: "card-1",
        name: "Cartao C6",
        type: "CREDIT_CARD",
        creditLimit: 5000,
        billingCycleDay: 15,
        dueDateDay: 22,
        rotativoRateMonth: 14.5,
        parcelamentoRate: 4.49,
        cetAnual: 84.42,
      },
    ]);

    // Current month transactions
    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([
        // Current month transactions
        { origin: "Cartao C6", amount: -200, isInstallment: true, isFixed: false },
        { origin: "Cartao C6", amount: -150, isInstallment: false, isFixed: true },
        { origin: "Cartao C6", amount: -100, isInstallment: false, isFixed: false },
      ])
      .mockResolvedValueOnce([
        // Future installments for next month
        { origin: "Cartao C6", amount: -200 },
      ]);

    mockPrisma.recurringExpense.findMany.mockResolvedValue([
      { origin: "Cartao C6", defaultAmount: -150 },
    ]);

    const response = await GET(createRequest("/api/cards/summary?month=3&year=2026"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cards).toHaveLength(1);

    const card = data.cards[0];
    expect(card.name).toBe("Cartao C6");
    expect(card.currentMonth.total).toBe(450);
    expect(card.currentMonth.installmentTotal).toBe(200);
    expect(card.currentMonth.fixedTotal).toBe(150);
    expect(card.currentMonth.newExpenseTotal).toBe(100);
    expect(card.currentMonth.transactionCount).toBe(3);
    expect(card.currentMonth.limitUsedPercent).toBe(9);
    expect(card.currentMonth.status).toBe("healthy");

    // Projection
    expect(card.projection.installmentTotal).toBe(200);
    expect(card.projection.fixedTotal).toBe(150);
    expect(card.projection.estimatedTotal).toBe(350);

    // Rates
    expect(card.rates.rotativoRateMonth).toBe(14.5);
    expect(card.rates.parcelamentoRate).toBe(4.49);

    // Totals
    expect(data.totals.totalAllCards).toBe(450);
    expect(data.totals.projectedNextMonth).toBe(350);
  });

  it("returns critical status when limit is over 80%", async () => {
    mockPrisma.origin.findMany.mockResolvedValue([
      {
        id: "card-1",
        name: "Cartao C6",
        type: "CREDIT_CARD",
        creditLimit: 1000,
        billingCycleDay: null,
        dueDateDay: null,
        rotativoRateMonth: null,
        parcelamentoRate: null,
        cetAnual: null,
      },
    ]);

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([
        { origin: "Cartao C6", amount: -900, isInstallment: false, isFixed: false },
      ])
      .mockResolvedValueOnce([]);

    mockPrisma.recurringExpense.findMany.mockResolvedValue([]);

    const response = await GET(createRequest("/api/cards/summary?month=3&year=2026"));
    const data = await response.json();

    expect(data.cards[0].currentMonth.status).toBe("critical");
    expect(data.cards[0].currentMonth.limitUsedPercent).toBe(90);
  });

  it("handles card without credit limit", async () => {
    mockPrisma.origin.findMany.mockResolvedValue([
      {
        id: "card-1",
        name: "Cartao C6",
        type: "CREDIT_CARD",
        creditLimit: null,
        billingCycleDay: null,
        dueDateDay: null,
        rotativoRateMonth: null,
        parcelamentoRate: null,
        cetAnual: null,
      },
    ]);

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([
        { origin: "Cartao C6", amount: -500, isInstallment: false, isFixed: false },
      ])
      .mockResolvedValueOnce([]);

    mockPrisma.recurringExpense.findMany.mockResolvedValue([]);

    const response = await GET(createRequest("/api/cards/summary?month=3&year=2026"));
    const data = await response.json();

    expect(data.cards[0].currentMonth.limitUsedPercent).toBeNull();
    expect(data.cards[0].currentMonth.status).toBe("healthy");
  });

  it("uses current month when no params provided", async () => {
    mockPrisma.origin.findMany.mockResolvedValue([]);

    const response = await GET(createRequest("/api/cards/summary"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cards).toEqual([]);
  });
});
