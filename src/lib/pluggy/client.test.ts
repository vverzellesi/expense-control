// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PluggyApiError,
  PluggyClient,
  createPluggyClientFromEnv,
  extractAfterCursor,
} from "./client";

// Dados 100% sintéticos. Os marcadores servem para provar que nada vaza em erros/logs.
const CLIENT_ID = "test-client-id-MARK1";
const CLIENT_SECRET = "test-client-secret-MARK2";
const API_KEY = "sess-MARK3";
const ITEM_ID = "item_test_MARK4";
const ACCOUNT_ID = "acc_test_MARK5";
const DESCRIPTION = "LOJA EXEMPLO MARK6";
const MARKERS = ["MARK1", "MARK2", "MARK3", "MARK4", "MARK5", "MARK6", "MARK7"];

type Handler = (url: URL, init: RequestInit) => Response | Promise<Response>;

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function tx(id: string, date: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    accountId: ACCOUNT_ID,
    description: DESCRIPTION,
    currencyCode: "BRL",
    amount: -10.5,
    date,
    type: "DEBIT",
    status: "POSTED",
    extraFieldFromProvider: { nested: true },
    ...overrides,
  };
}

function setup(handler: Handler, options: Partial<ConstructorParameters<typeof PluggyClient>[0]> = {}) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const sleeps: number[] = [];
  let authCount = 0;
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname === "/auth") {
      authCount++;
      return json(200, { apiKey: API_KEY + "-" + authCount });
    }
    return handler(url, init);
  });
  const client = new PluggyClient({
    clientId: CLIENT_ID,
    clientSecret: CLIENT_SECRET,
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    ...options,
  });
  return {
    client,
    calls,
    sleeps,
    fetchMock,
    get authCount() {
      return authCount;
    },
    apiCalls: () => calls.filter((c) => c.url.pathname !== "/auth"),
  };
}

const itemBody = { id: ITEM_ID, status: "UPDATED", lastUpdatedAt: "2026-01-10T12:00:00.000Z" };

async function captureError(promise: Promise<unknown>): Promise<PluggyApiError> {
  try {
    await promise;
  } catch (error) {
    expect(error).toBeInstanceOf(PluggyApiError);
    return error as PluggyApiError;
  }
  throw new Error("esperava erro");
}

describe("PluggyClient - autenticação", () => {
  it("autentica com POST /auth e envia a apiKey em X-API-KEY", async () => {
    const env = setup(() => json(200, itemBody));
    await env.client.getItem(ITEM_ID);

    const auth = env.calls[0];
    expect(auth.url.origin + auth.url.pathname).toBe("https://api.pluggy.ai/auth");
    expect(auth.init.method).toBe("POST");
    expect(JSON.parse(String(auth.init.body))).toEqual({ clientId: CLIENT_ID, clientSecret: CLIENT_SECRET });

    const call = env.apiCalls()[0];
    expect(call.url.pathname).toBe("/items/" + ITEM_ID);
    expect((call.init.headers as Record<string, string>)["X-API-KEY"]).toBe(API_KEY + "-1");
  });

  it("reaproveita a apiKey e renova antes de expirar (2h)", async () => {
    let clock = 0;
    const env = setup(() => json(200, itemBody), { now: () => clock });
    await env.client.getItem(ITEM_ID);
    clock = 60 * 60 * 1000; // 1h
    await env.client.getItem(ITEM_ID);
    expect(env.authCount).toBe(1);

    clock = 110 * 60 * 1000; // 1h50: dentro da folga de renovação
    await env.client.getItem(ITEM_ID);
    expect(env.authCount).toBe(2);
    const last = env.apiCalls().at(-1)!;
    expect((last.init.headers as Record<string, string>)["X-API-KEY"]).toBe(API_KEY + "-2");
  });

  it("em 401 renova a apiKey uma vez e repete a chamada", async () => {
    let attempts = 0;
    const env = setup(() => (++attempts === 1 ? json(401, { message: "expired" }) : json(200, itemBody)));
    const item = await env.client.getItem(ITEM_ID);
    expect(item.status).toBe("UPDATED");
    expect(env.authCount).toBe(2);
    expect(attempts).toBe(2);
  });

  it("401 persistente vira erro sem laço infinito", async () => {
    const env = setup(() => json(401, { message: "nope" }));
    const error = await captureError(env.client.getItem(ITEM_ID));
    expect(error.status).toBe(401);
    expect(error.path).toBe("/items/{id}");
    expect(env.authCount).toBe(2);
  });

  it("credenciais recusadas no /auth viram erro http sem retry", async () => {
    const fetchMock = vi.fn(async () => json(401, { message: "invalid" }));
    const client = new PluggyClient({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      fetch: fetchMock as unknown as typeof fetch,
      sleep: async () => {},
    });
    const error = await captureError(client.getItem(ITEM_ID));
    expect(error.path).toBe("/auth");
    expect(error.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("PluggyClient - paginação por cursor", () => {
  it("lê todas as páginas, remonta a URL com host fixo e devolve a cobertura", async () => {
    const pages: Record<string, unknown> = {
      first: {
        results: [tx("tx_1", "2026-01-05T00:00:00.000Z"), tx("tx_2", "2026-01-20T15:00:00.000Z")],
        next: "?accountId=" + ACCOUNT_ID + "&after=cursor_2",
      },
      cursor_2: {
        results: [tx("tx_3", "2025-12-31T02:00:00.000Z")],
        // host e accountId de next são ignorados: só o after é aproveitado
        next: "https://outro-host.example/v2/transactions?accountId=acc_outro&after=cursor_3",
      },
      cursor_3: { results: [tx("tx_4", "2026-02-01T10:00:00.000Z")], next: null },
    };
    const env = setup((url) => json(200, pages[url.searchParams.get("after") ?? "first"]));

    const result = await env.client.listTransactions(ACCOUNT_ID, { createdAtFrom: "2026-01-01" });

    expect(result.transactions.map((t) => t.id)).toEqual(["tx_1", "tx_2", "tx_3", "tx_4"]);
    // 2025-12-31T02:00Z é 30/12 23h em São Paulo
    expect(result.coverage).toEqual({ total: 4, minDate: "2025-12-30", maxDate: "2026-02-01" });

    const urls = env.apiCalls().map((c) => c.url);
    expect(urls).toHaveLength(3);
    for (const url of urls) {
      expect(url.origin).toBe("https://api.pluggy.ai");
      expect(url.pathname).toBe("/v2/transactions");
      expect(url.searchParams.get("accountId")).toBe(ACCOUNT_ID);
      expect(url.searchParams.get("createdAtFrom")).toBe("2026-01-01");
      expect(url.searchParams.has("pageSize")).toBe(false);
    }
    expect(urls.map((u) => u.searchParams.get("after"))).toEqual([null, "cursor_2", "cursor_3"]);
    // campos extras do provedor são tolerados
    expect((result.transactions[0] as Record<string, unknown>).extraFieldFromProvider).toEqual({ nested: true });
  });

  it("conta sem registros devolve cobertura vazia", async () => {
    const env = setup(() => json(200, { results: [], next: null }));
    const result = await env.client.listTransactions(ACCOUNT_ID);
    expect(result).toEqual({ transactions: [], coverage: { total: 0, minDate: null, maxDate: null } });
  });

  it("falha na página 2 rejeita a leitura inteira (nada parcial)", async () => {
    const env = setup((url) =>
      url.searchParams.get("after")
        ? json(400, { message: "bad" })
        : json(200, { results: [tx("tx_1", "2026-01-05")], next: "?after=cursor_2" })
    );
    const error = await captureError(env.client.listTransactions(ACCOUNT_ID));
    expect(error.kind).toBe("http");
    expect(error.status).toBe(400);
    expect(error.path).toBe("/v2/transactions");
  });

  it("5xx esgotando as tentativas na página 2 também rejeita tudo", async () => {
    const env = setup((url) =>
      url.searchParams.get("after")
        ? json(503, {})
        : json(200, { results: [tx("tx_1", "2026-01-05")], next: "?after=cursor_2" })
    );
    const error = await captureError(env.client.listTransactions(ACCOUNT_ID));
    expect(error.status).toBe(503);
    expect(env.sleeps).toEqual([500, 1000, 2000]);
  });

  it("cursor repetido é erro", async () => {
    const env = setup(() => json(200, { results: [tx("tx_1", "2026-01-05")], next: "?after=same" }));
    const error = await captureError(env.client.listTransactions(ACCOUNT_ID));
    expect(error.kind).toBe("pagination");
    expect(error.message).toContain("cursor repetido");
  });

  it("next sem after é erro", async () => {
    const env = setup(() => json(200, { results: [], next: "?accountId=x" }));
    const error = await captureError(env.client.listTransactions(ACCOUNT_ID));
    expect(error.kind).toBe("pagination");
  });

  it("limite de páginas evita laço infinito", async () => {
    let n = 0;
    const env = setup(() => json(200, { results: [], next: "?after=c" + ++n }), { maxPages: 3 });
    const error = await captureError(env.client.listTransactions(ACCOUNT_ID));
    expect(error.kind).toBe("pagination");
    expect(env.apiCalls()).toHaveLength(3);
  });

  it("extractAfterCursor aceita query ou URL completa e recusa cursor com espaço", () => {
    expect(extractAfterCursor("?accountId=a&after=abc%3D%3D")).toBe("abc==");
    expect(extractAfterCursor("https://x.example/v2/transactions?after=xyz")).toBe("xyz");
    expect(extractAfterCursor("?after=a%20b")).toBeNull();
    expect(extractAfterCursor("?foo=bar")).toBeNull();
  });
});

describe("PluggyClient - faturas paginadas por página", () => {
  const bill = (id: string) => ({ id, dueDate: "2026-02-10T00:00:00", totalAmount: 100, totalAmountCurrencyCode: "BRL" });

  it("lê todas as páginas de /bills", async () => {
    const env = setup((url) => {
      const page = Number(url.searchParams.get("page") ?? "1");
      return json(200, { page, totalPages: 2, total: 2, results: [bill("bill_" + page)] });
    });
    const bills = await env.client.listBills(ACCOUNT_ID);
    expect(bills.map((b) => b.id)).toEqual(["bill_1", "bill_2"]);
    expect(env.apiCalls().map((c) => c.url.searchParams.get("accountId"))).toEqual([ACCOUNT_ID, ACCOUNT_ID]);
  });

  it("falha numa página de /bills rejeita a leitura inteira", async () => {
    const env = setup((url) =>
      url.searchParams.get("page") === "2"
        ? json(404, {})
        : json(200, { page: 1, totalPages: 2, total: 2, results: [bill("bill_1")] })
    );
    const error = await captureError(env.client.listBills(ACCOUNT_ID));
    expect(error.path).toBe("/bills");
    expect(error.status).toBe(404);
  });
});

describe("PluggyClient - retry, timeout e schema", () => {
  it("429 respeita Retry-After e depois tem sucesso", async () => {
    let attempts = 0;
    const env = setup(() => (++attempts === 1 ? json(429, {}, { "retry-after": "2" }) : json(200, itemBody)));
    await env.client.getItem(ITEM_ID);
    expect(env.sleeps).toEqual([2000]);
  });

  it("Retry-After é limitado pelo teto de espera", async () => {
    let attempts = 0;
    const env = setup(() => (++attempts === 1 ? json(429, {}, { "retry-after": "3600" }) : json(200, itemBody)), {
      maxDelayMs: 5000,
    });
    await env.client.getItem(ITEM_ID);
    expect(env.sleeps).toEqual([5000]);
  });

  it("5xx usa backoff exponencial", async () => {
    let attempts = 0;
    const env = setup(() => (++attempts <= 2 ? json(502, {}) : json(200, itemBody)));
    await env.client.getItem(ITEM_ID);
    expect(env.sleeps).toEqual([500, 1000]);
  });

  it.each([400, 403, 404, 422])("%i não é repetido", async (status) => {
    const env = setup(() => json(status, {}));
    const error = await captureError(env.client.getItem(ITEM_ID));
    expect(error.status).toBe(status);
    expect(env.apiCalls()).toHaveLength(1);
    expect(env.sleeps).toEqual([]);
  });

  it("getTransaction devolve null em 404", async () => {
    const env = setup(() => json(404, {}));
    await expect(env.client.getTransaction("tx_test_1")).resolves.toBeNull();
  });

  it("timeout aborta a requisição e vira erro de timeout sem retry", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
      if (new URL(String(input)).pathname === "/auth") return json(200, { apiKey: API_KEY });
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new Error("aborted " + String(input))));
      });
    });
    const client = new PluggyClient({
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      fetch: fetchMock as unknown as typeof fetch,
      timeoutMs: 10,
      sleep: async () => {},
    });
    const error = await captureError(client.getItem(ITEM_ID));
    expect(error.kind).toBe("timeout");
    expect(error.path).toBe("/items/{id}");
    expect(fetchMock).toHaveBeenCalledTimes(2); // auth + uma tentativa
  });

  it("erro de rede não propaga a mensagem original", async () => {
    const env = setup(() => {
      throw new Error("connect failed https://api.pluggy.ai/items/" + ITEM_ID);
    });
    const error = await captureError(env.client.getItem(ITEM_ID));
    expect(error.kind).toBe("network");
    expect(error.message).not.toContain(ITEM_ID);
  });

  it("resposta fora do schema é erro com só o nome do campo", async () => {
    const env = setup(() => json(200, { results: [tx("tx_1", "2026-01-05", { amount: "MARK7" })], next: null }));
    const error = await captureError(env.client.listTransactions(ACCOUNT_ID));
    expect(error.kind).toBe("schema");
    expect(error.message).toContain("results.[].amount");
    expect(error.message).not.toContain("MARK7");
  });

  it("tipo de transação desconhecido é recusado", async () => {
    const env = setup(() => json(200, { results: [tx("tx_1", "2026-01-05", { type: "OTHER" })], next: null }));
    const error = await captureError(env.client.listTransactions(ACCOUNT_ID));
    expect(error.kind).toBe("schema");
  });

  it("corpo que não é JSON é erro de schema", async () => {
    const env = setup(() => new Response("<html>MARK7</html>", { status: 200 }));
    const error = await captureError(env.client.getItem(ITEM_ID));
    expect(error.kind).toBe("schema");
    expect(error.message).not.toContain("MARK7");
  });

  it("id com formato inválido é recusado antes de qualquer chamada", async () => {
    const env = setup(() => json(200, itemBody));
    for (const bad of ["../auth", "a?b=c", "a/b", "", "x".repeat(200)]) {
      const error = await captureError(env.client.getItem(bad));
      expect(error.kind).toBe("input");
    }
    await captureError(env.client.listTransactions("acc test"));
    await captureError(env.client.listTransactions(ACCOUNT_ID, { createdAtFrom: "ontem&x=1" }));
    expect(env.fetchMock).not.toHaveBeenCalled();
  });

  it("deleteItem usa DELETE /items/{id} e aceita corpo vazio", async () => {
    const env = setup(() => new Response(null, { status: 204 }));
    await env.client.deleteItem(ITEM_ID);
    const call = env.apiCalls()[0];
    expect(call.init.method).toBe("DELETE");
    expect(call.url.pathname).toBe("/items/" + ITEM_ID);
  });
});

describe("PluggyClient - nada sensível em erros ou logs", () => {
  const consoleMethods = ["log", "info", "warn", "error", "debug"] as const;
  let spies: Array<{ mockRestore: () => void }> = [];

  beforeEach(() => {
    spies = consoleMethods.map((method) => vi.spyOn(console, method).mockImplementation(() => {}));
  });
  afterEach(() => {
    spies.forEach((spy) => spy.mockRestore());
  });

  it("erros e console não contêm segredos, ids, descrições nem corpo", async () => {
    const sensitiveBody = { message: "erro " + DESCRIPTION + " " + ITEM_ID + " " + API_KEY + " MARK7" };
    const errors: PluggyApiError[] = [];

    const scenarios: Array<() => Promise<unknown>> = [
      () => setup(() => json(400, sensitiveBody)).client.getItem(ITEM_ID),
      () => setup(() => json(500, sensitiveBody)).client.listBills(ACCOUNT_ID),
      () => setup(() => json(401, sensitiveBody)).client.listAccounts(ITEM_ID),
      () =>
        setup(() => json(200, { results: [tx("tx_MARK7", "2026-01-05", { amount: DESCRIPTION })], next: null })).client
          .listTransactions(ACCOUNT_ID),
      () =>
        setup((url) =>
          url.searchParams.get("after")
            ? json(502, sensitiveBody)
            : json(200, { results: [tx("tx_1", "2026-01-05")], next: "?after=MARK7" })
        ).client.listTransactions(ACCOUNT_ID),
      () =>
        setup(() => {
          throw new Error(sensitiveBody.message);
        }).client.getTransaction("tx_MARK7"),
      () => setup(() => json(200, itemBody)).client.getItem("bad/MARK4"),
    ];

    for (const run of scenarios) errors.push(await captureError(run()));

    for (const error of errors) {
      const serialized = [error.message, error.stack ?? "", JSON.stringify(error), String(error.cause ?? "")].join("\n");
      for (const marker of MARKERS) expect(serialized).not.toContain(marker);
      expect(error.path === null || !/[?]/.test(error.path)).toBe(true);
    }
    for (const spy of spies) expect(spy as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });
});

describe("createPluggyClientFromEnv", () => {
  it("lista só os nomes das variáveis que faltam", () => {
    try {
      createPluggyClientFromEnv({}, { PLUGGY_CLIENT_ID: "valor-MARK1" });
      throw new Error("esperava erro");
    } catch (error) {
      expect(error).toBeInstanceOf(PluggyApiError);
      const message = (error as Error).message;
      expect(message).toContain("PLUGGY_CLIENT_SECRET");
      expect(message).not.toContain("PLUGGY_CLIENT_ID");
      expect(message).not.toContain("MARK1");
    }
  });

  it("cria o cliente quando as duas variáveis existem", () => {
    const client = createPluggyClientFromEnv({}, { PLUGGY_CLIENT_ID: "a", PLUGGY_CLIENT_SECRET: "b" });
    expect(client).toBeInstanceOf(PluggyClient);
  });
});
