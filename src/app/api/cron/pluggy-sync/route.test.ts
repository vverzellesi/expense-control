// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRun } = vi.hoisted(() => ({ mockRun: vi.fn() }));

vi.mock("@/lib/db", () => ({ default: {}, prisma: {} }));
// Sessão autenticada disponível: a rota não pode aceitá-la no lugar do segredo.
vi.mock("@/auth", () => ({ auth: vi.fn().mockResolvedValue({ user: { id: "user_test_1" } }) }));
vi.mock("@/lib/pluggy/sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pluggy/sync")>()),
  runPluggySync: mockRun,
}));

import { GET, dynamic, maxDuration, runtime } from "./route";
import { emptyCounts } from "@/lib/pluggy/sync";

const SECRET = "cron_secret_test_value";

function request(headers: Record<string, string> = {}, url = "http://localhost/api/cron/pluggy-sync") {
  return new Request(url, { method: "GET", headers });
}

const configured = () => {
  vi.stubEnv("CRON_SECRET", SECRET);
  vi.stubEnv("PLUGGY_SYNC_ENABLED", "true");
  vi.stubEnv("PLUGGY_OWNER_USER_ID", "user_test_owner");
  vi.stubEnv("PLUGGY_CLIENT_ID", "client_test");
  vi.stubEnv("PLUGGY_CLIENT_SECRET", "secret_test");
};

function report(status: "ok" | "warning" | "error" | "skipped") {
  const counts = emptyCounts();
  counts.read = 3;
  counts.destinations.created = 2;
  counts.destinations.excluded = 1;
  return {
    status,
    skippedReason: status === "skipped" ? "lease_busy" : null,
    counts,
    checks: { alerts: {}, items: [], accounts: [], userPatterns: { configured: 0, rejected: 0, invalid: false } },
    error: null,
    decisions: [{ record: { description: "LOJA EXEMPLO", amountCents: 12345, externalId: "tx_test_1" }, result: {} }],
    accounts: [{ accountLinkId: "link_test_1", originName: "Cartão Teste" }],
  };
}

beforeEach(() => {
  vi.unstubAllEnvs();
  mockRun.mockReset();
});

describe("GET /api/cron/pluggy-sync", () => {
  it("declara runtime Node, rota dinâmica e maxDuration", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
  });

  it("503 sem CRON_SECRET", async () => {
    configured();
    vi.stubEnv("CRON_SECRET", "");
    const res = await GET(request({ authorization: "Bearer " + SECRET }));
    expect(res.status).toBe(503);
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("503 com a integração desligada", async () => {
    configured();
    vi.stubEnv("PLUGGY_SYNC_ENABLED", "false");
    const res = await GET(request({ authorization: "Bearer " + SECRET }));
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("sem o segredo, não revela se a integração está ligada", async () => {
    configured();
    vi.stubEnv("PLUGGY_SYNC_ENABLED", "false");
    expect((await GET(request({ authorization: "Bearer errado" }))).status).toBe(401);
  });

  it("401 com sessão autenticada e sem o segredo", async () => {
    configured();
    const res = await GET(request({ cookie: "authjs.session-token=sessao_test" }));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({});
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("401 com segredo errado, de outro tamanho ou sem o prefixo Bearer", async () => {
    configured();
    for (const header of ["Bearer errado", "Bearer " + SECRET + "x", SECRET, "bearer " + SECRET]) {
      const res = await GET(request({ authorization: header }));
      expect(res.status).toBe(401);
    }
    expect(mockRun).not.toHaveBeenCalled();
  });

  it("200 com o segredo certo; query não escolhe usuário; resposta só com status e contagens", async () => {
    configured();
    mockRun.mockResolvedValue(report("ok"));
    const res = await GET(request({ authorization: "Bearer " + SECRET }, "http://localhost/api/cron/pluggy-sync?userId=user_test_other"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockRun).toHaveBeenCalledWith({ db: expect.anything() }, { mode: "apply", trigger: "cron" });
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["counts", "status"]);
    expect(body.status).toBe("ok");
    expect(body.counts).toMatchObject({ read: 3, created: 2, excluded: 1 });
    expect(Object.values(body.counts).every((v) => typeof v === "number")).toBe(true);
    const text = JSON.stringify(body);
    for (const value of ["LOJA EXEMPLO", "12345", "tx_test_1", "link_test_1", "Cartão Teste", "user_test_other"]) {
      expect(text).not.toContain(value);
    }
  });

  it("execução pulada (lease ocupado) é 200 com o motivo", async () => {
    configured();
    mockRun.mockResolvedValue(report("skipped"));
    const res = await GET(request({ authorization: "Bearer " + SECRET }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "skipped", reason: "lease_busy" });
  });

  it("500 quando o run termina em erro ou a sincronização lança", async () => {
    configured();
    mockRun.mockResolvedValue(report("error"));
    expect((await GET(request({ authorization: "Bearer " + SECRET }))).status).toBe(500);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockRun.mockRejectedValue(new Error("falhou com acc_test_1"));
    const res = await GET(request({ authorization: "Bearer " + SECRET }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ status: "error" });
    expect(String(errorSpy.mock.calls[0][0])).not.toContain("acc_test_1");
    errorSpy.mockRestore();
  });
});

