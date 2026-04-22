import { describe, it, expect, beforeEach, vi } from "vitest";

const { mockBudget, mockTransaction, mockGetAuthContext } = vi.hoisted(() => ({
  mockBudget: { findMany: vi.fn() },
  mockTransaction: { groupBy: vi.fn() },
  mockGetAuthContext: vi.fn(),
}));

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: mockGetAuthContext,
  handleApiError: (error: unknown) => {
    const { NextResponse } = require("next/server");
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ error: "Erro" }, { status: 500 });
  },
}));

vi.mock("@/lib/db", () => ({
  default: {
    budget: mockBudget,
    transaction: mockTransaction,
  },
}));

import { GET } from "./route";

const defaultCtx = {
  userId: "u1",
  spaceId: null,
  permissions: null,
  ownerFilter: { userId: "u1" },
};

describe("GET /api/alerts/count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthContext.mockResolvedValue(defaultCtx);
  });

  it("returns 401 when unauthenticated", async () => {
    mockGetAuthContext.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 0 when there are no budgets", async () => {
    mockBudget.findMany.mockResolvedValue([]);
    mockTransaction.groupBy.mockResolvedValue([]);

    const res = await GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ alertCount: 0 });
  });

  it("counts budgets that crossed the 80% threshold", async () => {
    mockBudget.findMany.mockResolvedValue([
      { categoryId: "cat-1", amount: 100 }, // 85% spent → alert
      { categoryId: "cat-2", amount: 200 }, // 50% spent → no alert
      { categoryId: "cat-3", amount: 50 }, // 100% spent → alert
    ]);
    mockTransaction.groupBy.mockResolvedValue([
      { categoryId: "cat-1", _sum: { amount: 85 } },
      { categoryId: "cat-2", _sum: { amount: 100 } },
      { categoryId: "cat-3", _sum: { amount: 50 } },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ alertCount: 2 });
  });

  it("handles negative amounts as absolute values (EXPENSE transactions stored negative)", async () => {
    mockBudget.findMany.mockResolvedValue([
      { categoryId: "cat-1", amount: 100 },
    ]);
    mockTransaction.groupBy.mockResolvedValue([
      { categoryId: "cat-1", _sum: { amount: -90 } },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ alertCount: 1 });
  });

  it("ignores categories with no spending (no matching groupBy row)", async () => {
    mockBudget.findMany.mockResolvedValue([
      { categoryId: "cat-1", amount: 100 },
      { categoryId: "cat-2", amount: 100 },
    ]);
    mockTransaction.groupBy.mockResolvedValue([
      { categoryId: "cat-1", _sum: { amount: 90 } }, // only cat-1 has spending
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ alertCount: 1 });
  });

  it("skips budgets with zero or negative amount to avoid divide-by-zero", async () => {
    mockBudget.findMany.mockResolvedValue([
      { categoryId: "cat-1", amount: 0 },
      { categoryId: "cat-2", amount: 100 },
    ]);
    mockTransaction.groupBy.mockResolvedValue([
      { categoryId: "cat-1", _sum: { amount: 500 } },
      { categoryId: "cat-2", _sum: { amount: 85 } },
    ]);

    const res = await GET();
    const body = await res.json();
    expect(body).toEqual({ alertCount: 1 });
  });
});
