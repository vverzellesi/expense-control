import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verificação das entregas de webhook da Pluggy
 * (https://docs.pluggy.ai/en/docs/developer-tools/webhook-security):
 * cabeçalho X-Pluggy-Signature no formato "t=<unix>,v1=<hex>", HMAC-SHA256 com o
 * segredo inteiro (inclusive o prefixo whsec_) sobre "<t>.<corpo cru>", comparação
 * em tempo constante e recusa de entregas a mais de 5 minutos do relógio, nos dois
 * sentidos. Durante a troca de segredo, até dois segredos são aceitos.
 */

export const SIGNATURE_HEADER = "x-pluggy-signature";
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;
export const MAX_WEBHOOK_BODY_BYTES = 64 * 1024;
const MAX_SECRETS = 2;

/** Eventos que disparam sincronização; os demais são ignorados com 2xx. */
export const SYNC_TRIGGER_EVENTS: ReadonlySet<string> = new Set([
  "item/updated",
  "transactions/created",
  "transactions/updated",
  "transactions/deleted",
]);

/** PLUGGY_WEBHOOK_SECRET aceita um segredo, ou dois separados por vírgula durante a troca. */
export function parseWebhookSecrets(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_SECRETS);
}

export function parseSignatureHeader(header: string | null): { timestamp: number; signatures: string[] } | null {
  if (!header || header.length > 1024) return null;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t" && /^\d{1,12}$/.test(value)) timestamp = Number(value);
    else if (key === "v1" && /^[0-9a-f]{64}$/.test(value)) signatures.push(value);
  }
  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

export function computeSignature(secret: string, timestamp: number, body: Buffer): Buffer {
  return createHmac("sha256", secret).update(String(timestamp) + ".").update(body).digest();
}

export type SignatureVerdict = { ok: true } | { ok: false; reason: "missing" | "malformed" | "expired" | "mismatch" };

export function verifyPluggySignature(input: {
  header: string | null;
  body: Buffer;
  secrets: string[];
  nowMs: number;
}): SignatureVerdict {
  if (!input.header) return { ok: false, reason: "missing" };
  const parsed = parseSignatureHeader(input.header);
  if (!parsed) return { ok: false, reason: "malformed" };
  const nowSeconds = Math.floor(input.nowMs / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > SIGNATURE_TOLERANCE_SECONDS) return { ok: false, reason: "expired" };
  let matched = false;
  for (const secret of input.secrets) {
    const expected = computeSignature(secret, parsed.timestamp, input.body);
    for (const candidate of parsed.signatures) {
      const provided = Buffer.from(candidate, "hex");
      // Sem retorno antecipado: todas as combinações são comparadas.
      if (provided.length === expected.length && timingSafeEqual(provided, expected)) matched = true;
    }
  }
  return matched ? { ok: true } : { ok: false, reason: "mismatch" };
}

/**
 * Lê o corpo cru com limite de tamanho, sem confiar só no content-length.
 * Devolve null se passar do limite.
 */
export async function readBodyWithLimit(request: Request, maxBytes: number): Promise<Buffer | null> {
  const declared = request.headers.get("content-length");
  if (declared !== null && /^\d+$/.test(declared) && Number(declared) > maxBytes) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

export type WebhookEventDecision =
  | { trigger: true; itemId: string }
  | { trigger: false; reason: "malformed" | "foreign_client" | "foreign_item" | "irrelevant_event" };

/**
 * O conteúdo do webhook só serve de gatilho: daqui sai no máximo o itemId, para
 * conferir que a entrega é deste cliente e deste item. Tudo é relido da API.
 */
export function classifyWebhookEvent(
  payload: unknown,
  expected: { clientId: string | undefined; itemId: string | undefined }
): WebhookEventDecision {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { trigger: false, reason: "malformed" };
  const { event, clientId, itemId } = payload as Record<string, unknown>;
  if (typeof event !== "string" || typeof itemId !== "string" || itemId === "") {
    return { trigger: false, reason: "malformed" };
  }
  const expectedClient = expected.clientId?.trim();
  if (!expectedClient || typeof clientId !== "string" || !sameText(clientId, expectedClient)) {
    return { trigger: false, reason: "foreign_client" };
  }
  const expectedItem = expected.itemId?.trim();
  if (expectedItem && !sameText(itemId, expectedItem)) return { trigger: false, reason: "foreign_item" };
  if (!SYNC_TRIGGER_EVENTS.has(event)) return { trigger: false, reason: "irrelevant_event" };
  return { trigger: true, itemId };
}

function sameText(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

