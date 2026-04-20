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
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

describe("GET /api/ai-usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 se usuário não autenticado", async () => {
    mockGetAuthContext.mockRejectedValue(new Error("Unauthorized"));
    const req = new NextRequest("http://localhost/api/ai-usage");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("retorna JSON com used/remaining/limit/yearMonth para usuário autenticado", async () => {
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
      used: 2,
      remaining: 3,
      limit: 5,
      yearMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
    });
  });
});
