// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockWaitUntil, mockTrigger } = vi.hoisted(() => ({ mockWaitUntil: vi.fn(), mockTrigger: vi.fn() }));

vi.mock("@vercel/functions", () => ({ waitUntil: mockWaitUntil }));
vi.mock("@/lib/db", () => ({ default: {}, prisma: {} }));
vi.mock("@/lib/pluggy/sync", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/pluggy/sync")>()),
  triggerSyncFromWebhook: mockTrigger,
}));

import { POST, dynamic, maxDuration, runtime } from "./route";
import { computeSignature, MAX_WEBHOOK_BODY_BYTES } from "./verify";

const SECRET = "whsec_test_segredo";
const OLD_SECRET = "whsec_test_antigo";
const ITEM = "item_test_1";
const CLIENT = "client_test";

function event(overrides: Record<string, unknown> = {}) {
  return { event: "item/updated", eventId: "evt_test_1", clientId: CLIENT, itemId: ITEM, triggeredBy: "SYNC", ...overrides };
}

function signedRequest(
  body: string,
  options: { secret?: string; timestamp?: number; header?: string | null } = {}
) {
  const timestamp = options.timestamp ?? Math.floor(Date.now() / 1000);
  const signature = computeSignature(options.secret ?? SECRET, timestamp, Buffer.from(body)).toString("hex");
  const headers: Record<string, string> = { "content-type": "application/json" };
  const header = options.header === undefined ? "t=" + timestamp + ",v1=" + signature : options.header;
  if (header !== null) headers["x-pluggy-signature"] = header;
  return new Request("http://localhost/webhooks/pluggy", { method: "POST", headers, body });
}

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("PLUGGY_SYNC_ENABLED", "true");
  vi.stubEnv("PLUGGY_WEBHOOK_SECRET", SECRET);
  vi.stubEnv("PLUGGY_CLIENT_ID", CLIENT);
  vi.stubEnv("PLUGGY_ITEM_ID", ITEM);
  mockWaitUntil.mockReset();
  mockTrigger.mockReset();
  mockTrigger.mockResolvedValue({ started: true, status: "ok" });
});

describe("POST /webhooks/pluggy", () => {
  it("declara runtime Node, rota dinâmica e maxDuration", () => {
    expect(runtime).toBe("nodejs");
    expect(dynamic).toBe("force-dynamic");
    expect(maxDuration).toBe(300);
  });

  it("assinatura válida: responde 200 antes de a sincronização terminar", async () => {
    mockTrigger.mockReturnValue(new Promise(() => undefined)); // nunca termina
    const res = await POST(signedRequest(JSON.stringify(event())));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(mockTrigger).toHaveBeenCalledWith({ db: expect.anything() }, { itemId: ITEM });
    expect(mockWaitUntil).toHaveBeenCalledTimes(1);
    expect(mockWaitUntil.mock.calls[0][0]).toBeInstanceOf(Promise);
  });

  it("eventos de transações também disparam", async () => {
    for (const name of ["transactions/created", "transactions/updated", "transactions/deleted"]) {
      const res = await POST(signedRequest(JSON.stringify(event({ event: name, accountId: "acc_test_1" }))));
      expect(res.status).toBe(200);
    }
    expect(mockWaitUntil).toHaveBeenCalledTimes(3);
  });

  it("aceita o segredo antigo durante a troca", async () => {
    vi.stubEnv("PLUGGY_WEBHOOK_SECRET", SECRET + "," + OLD_SECRET);
    const res = await POST(signedRequest(JSON.stringify(event()), { secret: OLD_SECRET }));
    expect(res.status).toBe(200);
    expect(mockWaitUntil).toHaveBeenCalledTimes(1);
  });

  it("assinatura inválida, ausente ou malformada: 401 sem detalhe", async () => {
    const body = JSON.stringify(event());
    for (const req of [
      signedRequest(body, { secret: "whsec_test_errado" }),
      signedRequest(body, { header: null }),
      signedRequest(body, { header: "v1=abc" }),
      signedRequest(body, { header: "t=123,v1=" + "0".repeat(64) }),
    ]) {
      const res = await POST(req);
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({});
    }
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it("corpo alterado depois de assinado: 401", async () => {
    const original = JSON.stringify(event());
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = computeSignature(SECRET, timestamp, Buffer.from(original)).toString("hex");
    const tampered = new Request("http://localhost/webhooks/pluggy", {
      method: "POST",
      headers: { "x-pluggy-signature": "t=" + timestamp + ",v1=" + signature },
      body: JSON.stringify(event({ itemId: "item_test_outro" })),
    });
    expect((await POST(tampered)).status).toBe(401);
  });

  it("entrega antiga ou adiantada em mais de 5 minutos: 401", async () => {
    const now = Math.floor(Date.now() / 1000);
    const body = JSON.stringify(event());
    expect((await POST(signedRequest(body, { timestamp: now - 301 }))).status).toBe(401);
    expect((await POST(signedRequest(body, { timestamp: now + 301 }))).status).toBe(401);
    expect((await POST(signedRequest(body, { timestamp: now - 290 }))).status).toBe(200);
  });

  it("corpo acima do limite: 413 sem processar", async () => {
    const big = JSON.stringify(event({ padding: "x".repeat(MAX_WEBHOOK_BODY_BYTES) }));
    const res = await POST(signedRequest(big));
    expect(res.status).toBe(413);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it("evento de outro item, de outro cliente ou irrelevante: 200 sem processar", async () => {
    for (const payload of [
      event({ itemId: "item_test_outro" }),
      event({ clientId: "client_test_outro" }),
      event({ clientId: undefined }),
      event({ event: "connector/status_updated" }),
      { foo: "bar" },
    ]) {
      const res = await POST(signedRequest(JSON.stringify(payload)));
      expect(res.status).toBe(200);
    }
    const notJson = await POST(signedRequest("isto não é json"));
    expect(notJson.status).toBe(200);
    expect(mockWaitUntil).not.toHaveBeenCalled();
    expect(mockTrigger).not.toHaveBeenCalled();
  });

  it("integração desligada: 200 sem ler nem processar", async () => {
    vi.stubEnv("PLUGGY_SYNC_ENABLED", "");
    const res = await POST(signedRequest(JSON.stringify(event()), { secret: "whsec_test_errado" }));
    expect(res.status).toBe(200);
    expect(mockWaitUntil).not.toHaveBeenCalled();
  });

  it("sem segredo configurado: 503", async () => {
    vi.stubEnv("PLUGGY_WEBHOOK_SECRET", "");
    expect((await POST(signedRequest(JSON.stringify(event())))).status).toBe(503);
  });

  it("nada do corpo vai para o log quando a sincronização falha", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockTrigger.mockRejectedValue(new Error("falhou LOJA EXEMPLO acc_test_1"));
    await POST(signedRequest(JSON.stringify(event({ secretInfo: "LOJA EXEMPLO" }))));
    await mockWaitUntil.mock.calls[0][0];
    const logged = errorSpy.mock.calls.map((c) => c.join(" ")).join("\n");
    expect(logged).not.toContain("LOJA EXEMPLO");
    expect(logged).not.toContain("acc_test_1");
    expect(logged).not.toContain(ITEM);
    errorSpy.mockRestore();
  });
});

