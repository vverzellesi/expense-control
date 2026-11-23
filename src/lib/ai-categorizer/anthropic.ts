import { z } from "zod";

/**
 * Cliente mínimo da API de mensagens da Anthropic, com fetch nativo.
 *
 * Sem retry: o que sobrar é tentado na próxima execução. Erros carregam só um
 * código e o status HTTP; nunca o corpo da resposta, cabeçalhos ou a chave.
 */

export const ANTHROPIC_MESSAGES_URL = "https://api.anthropic.com/v1/messages";
export const ANTHROPIC_VERSION = "2023-06-01";
export const DEFAULT_TIMEOUT_MS = 30_000;

export type AnthropicErrorCode =
  | "timeout"
  | "network"
  | "http_error"
  | "invalid_response"
  | "refusal"
  | "truncated"
  | "invalid_output";

export class AnthropicCallError extends Error {
  constructor(
    public readonly code: AnthropicErrorCode,
    public readonly status: number | null = null
  ) {
    super("anthropic:" + code + (status === null ? "" : ":" + status));
    this.name = "AnthropicCallError";
  }

  /** Falhas de transporte/HTTP interrompem a execução; as demais só descartam o lote. */
  get fatal(): boolean {
    return this.code === "timeout" || this.code === "network" || this.code === "http_error";
  }
}

export interface AnthropicCallOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const messageSchema = z.object({
  stop_reason: z.string().nullish(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

/** Envia o pedido e devolve o JSON da saída estruturada (ainda não validado). */
export async function callAnthropic(body: Record<string, unknown>, options: AnthropicCallOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  try {
    let response: Response;
    try {
      response = await fetchImpl(ANTHROPIC_MESSAGES_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": options.apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      throw new AnthropicCallError(isAbort(error) ? "timeout" : "network");
    }

    if (!response.ok) {
      // O corpo do erro não é lido: pode ecoar o pedido.
      await response.body?.cancel().catch(() => undefined);
      throw new AnthropicCallError("http_error", response.status);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch (error) {
      throw new AnthropicCallError(isAbort(error) ? "timeout" : "invalid_response");
    }

    const message = messageSchema.safeParse(json);
    if (!message.success) throw new AnthropicCallError("invalid_response");
    if (message.data.stop_reason === "refusal") throw new AnthropicCallError("refusal");
    if (message.data.stop_reason === "max_tokens") throw new AnthropicCallError("truncated");

    const text = message.data.content.find((block) => block.type === "text" && typeof block.text === "string")?.text;
    if (text === undefined) throw new AnthropicCallError("invalid_output");
    try {
      return JSON.parse(text);
    } catch {
      throw new AnthropicCallError("invalid_output");
    }
  } finally {
    clearTimeout(timer);
  }
}
