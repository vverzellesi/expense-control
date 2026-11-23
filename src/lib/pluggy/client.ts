import { z } from "zod";
import { toBusinessDate } from "./dates";
import {
  accountSchema,
  authResponseSchema,
  billSchema,
  itemSchema,
  pagedResponseSchema,
  transactionCursorPageSchema,
  transactionSchema,
  type PluggyAccount,
  type PluggyBill,
  type PluggyItem,
  type PluggyTransaction,
  type TransactionListResult,
} from "./types";

/**
 * Cliente mínimo da API da Pluggy, com fetch nativo e host fixo.
 *
 * Regras de segurança:
 * - credenciais só do servidor (PLUGGY_CLIENT_ID / PLUGGY_CLIENT_SECRET);
 *   a apiKey fica só em memória e é renovada antes de expirar ou num 401;
 * - URLs montadas apenas com o host fixo, caminhos conhecidos e ids validados por formato;
 * - erros carregam só método, caminho como template (ex.: /items/{id}) e status,
 *   nunca corpo, cabeçalhos, apiKey, clientId, ids ou descrições;
 * - o cliente não escreve nada no console.
 */

export const PLUGGY_BASE_URL = "https://api.pluggy.ai";
export const PLUGGY_ENV_VARS = ["PLUGGY_CLIENT_ID", "PLUGGY_CLIENT_SECRET"] as const;

/** A apiKey vale 2 horas; renovamos com folga de 15 minutos. */
const API_KEY_TTL_MS = 2 * 60 * 60 * 1000;
const API_KEY_REFRESH_MARGIN_MS = 15 * 60 * 1000;

const ID_FORMAT = /^[A-Za-z0-9_-]{1,128}$/;
const CURSOR_FORMAT = /^[\x21-\x7E]{1,4096}$/;
const DATE_FILTER_FORMAT = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

export type PluggyErrorKind =
  | "config"
  | "input"
  | "http"
  | "timeout"
  | "network"
  | "schema"
  | "pagination";

type HttpMethod = "GET" | "POST" | "DELETE";

export class PluggyApiError extends Error {
  readonly kind: PluggyErrorKind;
  readonly method: HttpMethod | null;
  readonly path: string | null;
  readonly status: number | null;

  constructor(
    kind: PluggyErrorKind,
    method: HttpMethod | null,
    path: string | null,
    status: number | null,
    detail?: string
  ) {
    const where = method && path ? " " + method + " " + path : "";
    const statusText = status !== null ? " status " + status : "";
    super("Pluggy" + where + ": " + kind + statusText + (detail ? " (" + detail + ")" : ""));
    this.name = "PluggyApiError";
    this.kind = kind;
    this.method = method;
    this.path = path;
    this.status = status;
  }
}

export interface PluggyClientOptions {
  clientId: string;
  clientSecret: string;
  fetch?: typeof fetch;
  /** Tempo máximo por tentativa, incluindo a leitura do corpo. */
  timeoutMs?: number;
  /** Novas tentativas em 429/5xx (além da primeira). */
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  /** Teto de páginas por leitura, contra laço infinito do provedor. */
  maxPages?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

interface RequestSpec<S extends z.ZodTypeAny> {
  method: HttpMethod;
  /** Caminho como template; "{id}" é substituído pelo id validado. */
  path: string;
  id?: string;
  query?: Record<string, string | undefined>;
  body?: unknown;
  schema: S;
  authenticated?: boolean;
  allowNotFound?: boolean;
}

interface RawResponse {
  status: number;
  retryAfter: string | null;
  body: unknown;
  bodyUnreadable: boolean;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function missingPluggyEnv(
  names: readonly string[],
  env: Record<string, string | undefined> = process.env
): string[] {
  return names.filter((name) => !env[name] || env[name]!.trim() === "");
}

export class PluggyClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxPages: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  private apiKey: string | null = null;
  private apiKeyObtainedAt = 0;
  private pendingAuth: Promise<string> | null = null;

  constructor(options: PluggyClientOptions) {
    if (typeof window !== "undefined") {
      throw new PluggyApiError("config", null, null, null, "uso permitido só no servidor");
    }
    if (!options.clientId || !options.clientSecret) {
      throw new PluggyApiError("config", null, null, null, "credenciais ausentes");
    }
    this.clientId = options.clientId;
    this.clientSecret = options.clientSecret;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 30_000;
    this.maxPages = options.maxPages ?? 2_000;
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? Date.now;
  }

  // ---------------------------------------------------------------- endpoints

  async getItem(itemId: string): Promise<PluggyItem> {
    const item = await this.request({ method: "GET", path: "/items/{id}", id: itemId, schema: itemSchema });
    return item as PluggyItem;
  }

  async listAccounts(itemId: string): Promise<PluggyAccount[]> {
    assertId(itemId, "GET", "/accounts");
    return this.readAllPages("/accounts", { itemId }, accountSchema) as Promise<PluggyAccount[]>;
  }

  /**
   * Lê TODAS as páginas de /v2/transactions da conta. Falha em qualquer página
   * (ou cursor repetido) rejeita a leitura inteira: nunca devolve lista parcial.
   * createdAtFrom filtra pela criação do registro na Pluggy, não pela data financeira,
   * e não serve para delimitar cobertura. O filtro por data financeira fica com quem chama.
   */
  async listTransactions(
    accountId: string,
    options: { createdAtFrom?: string } = {}
  ): Promise<TransactionListResult> {
    const path = "/v2/transactions";
    assertId(accountId, "GET", path);
    if (options.createdAtFrom !== undefined && !DATE_FILTER_FORMAT.test(options.createdAtFrom)) {
      throw new PluggyApiError("input", "GET", path, null, "createdAtFrom inválido");
    }

    const transactions: PluggyTransaction[] = [];
    const seenCursors = new Set<string>();
    let after: string | undefined;

    for (let pageCount = 1; ; pageCount++) {
      if (pageCount > this.maxPages) {
        throw new PluggyApiError("pagination", "GET", path, null, "limite de páginas excedido");
      }
      const page = (await this.request({
        method: "GET",
        path,
        query: { accountId, createdAtFrom: options.createdAtFrom, after },
        schema: transactionCursorPageSchema,
      })) as z.infer<typeof transactionCursorPageSchema>;
      transactions.push(...(page.results as PluggyTransaction[]));

      if (!page.next) break;
      const nextCursor = extractAfterCursor(page.next);
      if (!nextCursor) {
        throw new PluggyApiError("pagination", "GET", path, null, "cursor ausente em next");
      }
      if (seenCursors.has(nextCursor)) {
        throw new PluggyApiError("pagination", "GET", path, null, "cursor repetido");
      }
      seenCursors.add(nextCursor);
      after = nextCursor;
    }

    return { transactions, coverage: computeCoverage(transactions, path) };
  }

  /** Um registro por id; null se a Pluggy responder 404. */
  async getTransaction(transactionId: string): Promise<PluggyTransaction | null> {
    const tx = await this.request({
      method: "GET",
      path: "/transactions/{id}",
      id: transactionId,
      schema: transactionSchema,
      allowNotFound: true,
    });
    return tx as PluggyTransaction | null;
  }

  /** Todas as faturas da conta; falha em qualquer página rejeita a leitura inteira. */
  async listBills(accountId: string): Promise<PluggyBill[]> {
    assertId(accountId, "GET", "/bills");
    return this.readAllPages("/bills", { accountId }, billSchema) as Promise<PluggyBill[]>;
  }

  /** Apaga o item na Pluggy (dados e consentimento). */
  async deleteItem(itemId: string): Promise<void> {
    await this.request({ method: "DELETE", path: "/items/{id}", id: itemId, schema: z.unknown() });
  }

  // ---------------------------------------------------------------- internos

  private async readAllPages<S extends z.ZodTypeAny>(
    path: string,
    query: Record<string, string>,
    itemSchemaForPage: S
  ): Promise<z.infer<S>[]> {
    const schema = pagedResponseSchema(itemSchemaForPage);
    const results: z.infer<S>[] = [];
    const seenIds = new Set<string>();
    let expectedTotal: number | undefined;
    for (let page = 1; ; page++) {
      if (page > this.maxPages) {
        throw new PluggyApiError("pagination", "GET", path, null, "limite de páginas excedido");
      }
      const response = (await this.request({
        method: "GET",
        path,
        query: { ...query, page: page > 1 ? String(page) : undefined },
        schema,
      })) as { results: Array<z.infer<S> & { id: string }>; totalPages: number; total?: number };
      for (const entry of response.results) {
        // Paginação por posição: item repetido indica que a lista mudou durante a leitura.
        if (seenIds.has(entry.id)) {
          throw new PluggyApiError("pagination", "GET", path, null, "item repetido entre páginas");
        }
        seenIds.add(entry.id);
        results.push(entry);
      }
      if (response.total !== undefined) expectedTotal = response.total;
      if (page >= response.totalPages) break;
    }
    if (expectedTotal !== undefined && results.length !== expectedTotal) {
      throw new PluggyApiError("pagination", "GET", path, null, "contagem divergente do total informado");
    }
    return results;
  }

  private async getApiKey(): Promise<string> {
    const fresh =
      this.apiKey !== null &&
      this.now() - this.apiKeyObtainedAt < API_KEY_TTL_MS - API_KEY_REFRESH_MARGIN_MS;
    if (fresh) return this.apiKey!;
    if (!this.pendingAuth) {
      this.pendingAuth = this.authenticate().finally(() => {
        this.pendingAuth = null;
      });
    }
    return this.pendingAuth;
  }

  private async authenticate(): Promise<string> {
    const obtainedAt = this.now();
    const response = (await this.request({
      method: "POST",
      path: "/auth",
      body: { clientId: this.clientId, clientSecret: this.clientSecret },
      schema: authResponseSchema,
      authenticated: false,
    })) as { apiKey: string };
    this.apiKey = response.apiKey;
    this.apiKeyObtainedAt = obtainedAt;
    return response.apiKey;
  }

  private invalidateApiKey(): void {
    this.apiKey = null;
    this.apiKeyObtainedAt = 0;
  }

  private async request<S extends z.ZodTypeAny>(spec: RequestSpec<S>): Promise<z.infer<S> | null> {
    const { method, path } = spec;
    const authenticated = spec.authenticated ?? true;
    const url = buildUrl(spec);

    let retries = 0;
    let reauthenticated = false;

    for (;;) {
      const headers: Record<string, string> = { Accept: "application/json" };
      if (spec.body !== undefined) headers["Content-Type"] = "application/json";
      const sentKey = authenticated ? await this.getApiKey() : null;
      if (sentKey !== null) headers["X-API-KEY"] = sentKey;

      const response = await this.send(url, method, path, headers, spec.body);

      if (response.status === 401 && authenticated && !reauthenticated) {
        reauthenticated = true;
        // Só invalida se ninguém renovou a chave enquanto esta requisição estava em voo.
        if (this.apiKey === sentKey) this.invalidateApiKey();
        continue;
      }

      if (isRetryable(response.status) && retries < this.maxRetries) {
        const delay = this.retryDelay(retries, response.retryAfter);
        retries++;
        await this.sleep(delay);
        continue;
      }

      if (response.status === 404 && spec.allowNotFound) return null;

      if (response.status < 200 || response.status >= 300) {
        throw new PluggyApiError("http", method, path, response.status);
      }

      if (response.bodyUnreadable) {
        throw new PluggyApiError("schema", method, path, response.status, "corpo não é JSON");
      }
      const parsed = spec.schema.safeParse(response.body);
      if (!parsed.success) {
        throw new PluggyApiError("schema", method, path, response.status, describeIssue(parsed.error));
      }
      return parsed.data;
    }
  }

  private async send(
    url: string,
    method: HttpMethod,
    path: string,
    headers: Record<string, string>,
    body: unknown
  ): Promise<RawResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetchImpl(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
        cache: "no-store",
        redirect: "error",
      });
      const text = await response.text();
      let parsedBody: unknown = undefined;
      let bodyUnreadable = false;
      if (text.trim() !== "") {
        try {
          parsedBody = JSON.parse(text);
        } catch {
          bodyUnreadable = true;
        }
      }
      return {
        status: response.status,
        retryAfter: response.headers.get("retry-after"),
        body: parsedBody,
        bodyUnreadable,
      };
    } catch {
      // A mensagem original pode conter a URL (com ids); não é propagada.
      if (controller.signal.aborted) {
        throw new PluggyApiError("timeout", method, path, null);
      }
      throw new PluggyApiError("network", method, path, null);
    } finally {
      clearTimeout(timer);
    }
  }

  private retryDelay(retryIndex: number, retryAfter: string | null): number {
    const fromHeader = parseRetryAfter(retryAfter, this.now());
    const delay = fromHeader ?? this.baseDelayMs * 2 ** retryIndex;
    return Math.min(Math.max(delay, 0), this.maxDelayMs);
  }
}

/** Cliente com credenciais do ambiente do servidor. Nunca use variáveis NEXT_PUBLIC_*. */
export function createPluggyClientFromEnv(
  overrides: Omit<PluggyClientOptions, "clientId" | "clientSecret"> = {},
  env: Record<string, string | undefined> = process.env
): PluggyClient {
  const missing = missingPluggyEnv(PLUGGY_ENV_VARS, env);
  if (missing.length > 0) {
    throw new PluggyApiError("config", null, null, null, "faltam variáveis: " + missing.join(", "));
  }
  return new PluggyClient({
    ...overrides,
    clientId: env.PLUGGY_CLIENT_ID!.trim(),
    clientSecret: env.PLUGGY_CLIENT_SECRET!.trim(),
  });
}

// ------------------------------------------------------------------ helpers

function assertId(id: string, method: HttpMethod, path: string): void {
  if (typeof id !== "string" || !ID_FORMAT.test(id)) {
    throw new PluggyApiError("input", method, path, null, "id com formato inválido");
  }
}

function buildUrl(spec: RequestSpec<z.ZodTypeAny>): string {
  let pathname = spec.path;
  if (pathname.includes("{id}")) {
    assertId(spec.id ?? "", spec.method, spec.path);
    pathname = pathname.replace("{id}", encodeURIComponent(spec.id!));
  }
  const url = new URL(pathname, PLUGGY_BASE_URL);
  for (const [key, value] of Object.entries(spec.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Do campo next (ex.: "?accountId=...&after=CURSOR") aproveita só o valor de after;
 * a URL seguinte é remontada com host fixo e o accountId já validado.
 */
export function extractAfterCursor(next: string): string | null {
  const queryStart = next.indexOf("?");
  const query = queryStart >= 0 ? next.slice(queryStart + 1) : next;
  const cursor = new URLSearchParams(query).get("after");
  if (!cursor || !CURSOR_FORMAT.test(cursor)) return null;
  return cursor;
}

function computeCoverage(transactions: PluggyTransaction[], path: string) {
  let minDate: string | null = null;
  let maxDate: string | null = null;
  for (const tx of transactions) {
    const date = toBusinessDate(tx.date);
    if (!date) throw new PluggyApiError("schema", "GET", path, null, "data de transação inválida");
    if (minDate === null || date < minDate) minDate = date;
    if (maxDate === null || date > maxDate) maxDate = date;
  }
  return { total: transactions.length, minDate, maxDate };
}

function isRetryable(status: number): boolean {
  return status === 429 || (status >= 500 && status <= 599);
}

function parseRetryAfter(value: string | null, nowMs: number): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return null;
  return Math.max(0, at - nowMs);
}

/** Só nomes de campos (nunca valores) do primeiro problema de schema. */
function describeIssue(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "resposta fora do formato";
  const fieldPath = issue.path
    .map((segment) => (typeof segment === "number" ? "[]" : String(segment)))
    .join(".");
  return "resposta fora do formato em " + (fieldPath || "raiz");
}
