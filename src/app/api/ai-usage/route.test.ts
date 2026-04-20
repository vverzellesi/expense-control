import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";
import * as authUtils from "@/lib/auth-utils";
import * as aiQuota from "@/lib/rate-limit/ai-quota";

vi.mock("@/lib/auth-utils");
vi.mock("@/lib/rate-limit/ai-quota");

describe("GET /api/ai-usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 se usuário não autenticado", async () => {
    vi.mocked(authUtils.getAuthContext).mockRejectedValue(new Error("Unauthorized"));
    vi.mocked(authUtils.unauthorizedResponse).mockReturnValue(
      new Response(null, { status: 401 }) as never
    );
    const req = new NextRequest("http://localhost/api/ai-usage");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("retorna JSON com used/remaining/limit/yearMonth para usuário autenticado", async () => {
    vi.mocked(authUtils.getAuthContext).mockResolvedValue({
      userId: "u1",
      ownerFilter: { userId: "u1" },
    } as never);
    vi.mocked(aiQuota.getUsage).mockResolvedValue({
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
