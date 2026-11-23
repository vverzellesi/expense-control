// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { ANTHROPIC_MESSAGES_URL, ANTHROPIC_VERSION, AnthropicCallError, callAnthropic } from "./anthropic";

const KEY = "sk-test-not-a-real-key";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function message(text: string, stop = "end_turn") {
  return { content: [{ type: "text", text }], stop_reason: stop };
}

async function codeOf(p: Promise<unknown>): Promise<AnthropicCallError> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AnthropicCallError);
    return e as AnthropicCallError;
  }
  throw new Error("expected rejection");
}

describe("callAnthropic", () => {
  it("envia o pedido com a chave só no cabeçalho e devolve o JSON da saída", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse(message('{"results":[]}')));
    const out = await callAnthropic({ model: "m" }, { apiKey: KEY, fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(out).toEqual({ results: [] });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ANTHROPIC_MESSAGES_URL);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-api-key"]).toBe(KEY);
    expect(headers["anthropic-version"]).toBe(ANTHROPIC_VERSION);
    expect(String(init.body)).not.toContain(KEY);
  });

  it("erro HTTP vira código com status, sem corpo nem chave na mensagem", async () => {
    const body = { error: { message: "segredo ecoado LOJA EXEMPLO " + KEY } };
    const err = await codeOf(
      callAnthropic({}, { apiKey: KEY, fetchImpl: (async () => jsonResponse(body, 401)) as unknown as typeof fetch })
    );
    expect(err.code).toBe("http_error");
    expect(err.status).toBe(401);
    expect(err.fatal).toBe(true);
    expect(err.message).toBe("anthropic:http_error:401");
    expect(err.message).not.toContain("LOJA");
    expect(err.message).not.toContain(KEY);
  });

  it("timeout aborta a chamada e vira código", async () => {
    const fetchImpl = (_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
      });
    const err = await codeOf(
      callAnthropic({}, { apiKey: KEY, timeoutMs: 10, fetchImpl: fetchImpl as unknown as typeof fetch })
    );
    expect(err.code).toBe("timeout");
    expect(err.fatal).toBe(true);
  });

  it("timeout também cobre a leitura do corpo da resposta", async () => {
    const fetchImpl = async (_url: string, init: RequestInit) =>
      ({
        ok: true,
        status: 200,
        json: () =>
          new Promise((_resolve, reject) => {
            init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
          }),
      }) as unknown as Response;
    const err = await codeOf(
      callAnthropic({}, { apiKey: KEY, timeoutMs: 10, fetchImpl: fetchImpl as unknown as typeof fetch })
    );
    expect(err.code).toBe("timeout");
  });

  it("falha de rede vira código sem a mensagem original", async () => {
    const fetchImpl = async () => {
      throw new Error("connect failed to host with " + KEY);
    };
    const err = await codeOf(callAnthropic({}, { apiKey: KEY, fetchImpl: fetchImpl as unknown as typeof fetch }));
    expect(err.code).toBe("network");
    expect(err.message).not.toContain(KEY);
  });

  it("recusa, truncamento e saída que não é JSON descartam o lote sem interromper", async () => {
    const cases: Array<[unknown, string]> = [
      [message("{}", "refusal"), "refusal"],
      [message('{"results":[', "max_tokens"), "truncated"],
      [message("isto não é JSON"), "invalid_output"],
      [{ content: [{ type: "tool_use" }], stop_reason: "end_turn" }, "invalid_output"],
      [{ outra: "coisa" }, "invalid_response"],
    ];
    for (const [body, code] of cases) {
      const err = await codeOf(
        callAnthropic({}, { apiKey: KEY, fetchImpl: (async () => jsonResponse(body)) as unknown as typeof fetch })
      );
      expect(err.code).toBe(code);
      expect(err.fatal).toBe(false);
    }
  });
});
