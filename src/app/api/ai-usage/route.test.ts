import { describe, it, expect, beforeEach, vi } from "vitest";

// vi.hoisted ensures mocks are available when vi.mock factories run (they are hoisted)
const { mockGetAuthContext, mockGetUsage } = vi.hoisted(() => ({
  mockGetAuthContext: vi.fn(),
  mockGetUsage: vi.fn(),
}));

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: mockGetAuthContext,
  unauthorizedResponse: () => {
    const { NextResponse } = require("next/server");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  },
}));

vi.mock("@/lib/rate-limit/ai-quota", () => ({
  getUsage: mockGetUsage,
  currentYearMonth: () => {
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  },
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

describe("GET /api/ai-usage", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  it("retorna 401 se usuário não autenticado", async () => {
    mockGetAuthContext.mockRejectedValue(new Error("Unauthorized"));
    const req = new NextRequest("http://localhost/api/ai-usage");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("retorna JSON com enabled=true + used/remaining/limit/yearMonth quando AI configurada", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.AI_MONTHLY_QUOTA = "5";
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      ownerFilter: { userId: "u1" },
    });
    mockGetUsage.mockResolvedValue({
      used: 2,
      remaining: 3,
      limit: 5,
    });

    const req = new NextRequest("http://localhost/api/ai-usage");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      enabled: true,
      used: 2,
      remaining: 3,
      limit: 5,
      yearMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
    });
  });

  it("retorna enabled=false quando GEMINI_API_KEY ausente (sem bater no getUsage)", async () => {
    delete process.env.GEMINI_API_KEY;
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      ownerFilter: { userId: "u1" },
    });

    const req = new NextRequest("http://localhost/api/ai-usage");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ enabled: false });
    expect(mockGetUsage).not.toHaveBeenCalled();
  });

  it("retorna enabled=false quando AI_MONTHLY_QUOTA=0 (feature flag off)", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    process.env.AI_MONTHLY_QUOTA = "0";
    mockGetAuthContext.mockResolvedValue({
      userId: "u1",
      ownerFilter: { userId: "u1" },
    });

    const req = new NextRequest("http://localhost/api/ai-usage");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ enabled: false });
    expect(mockGetUsage).not.toHaveBeenCalled();
  });
});
