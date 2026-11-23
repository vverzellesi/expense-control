import { z } from "zod";
import { ABSTAIN_KEY, CONFIDENCE_LEVELS } from "./request";

/**
 * Validação da resposta do modelo no servidor. Nada que o modelo devolva é
 * aplicado sem passar por aqui: chave de item ou de categoria desconhecida,
 * resultado duplicado ou mal formado descarta o item; formato geral inválido
 * descarta o lote. Só confiança alta vira categoria.
 */

export type ItemVerdict =
  | { kind: "categorize"; categoryKey: string }
  | { kind: "abstain" }
  | { kind: "low_confidence" }
  | { kind: "discard" };

const envelopeSchema = z.object({ results: z.array(z.unknown()) });
const resultSchema = z.object({
  item: z.string(),
  category: z.string(),
  confidence: z.enum(CONFIDENCE_LEVELS),
});
type ParsedResult = z.infer<typeof resultSchema>;

function itemKeyOf(entry: unknown): string | null {
  if (entry === null || typeof entry !== "object") return null;
  const item = (entry as { item?: unknown }).item;
  return typeof item === "string" ? item : null;
}

/** Veredito por chave de item do lote, ou null quando o lote inteiro é inválido. */
export function validateOutput(
  raw: unknown,
  itemKeys: readonly string[],
  categoryKeys: ReadonlySet<string>
): Map<string, ItemVerdict> | null {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) return null;

  const known = new Set(itemKeys);
  const seen = new Map<string, Array<ParsedResult | null>>();
  for (const entry of envelope.data.results) {
    const itemKey = itemKeyOf(entry);
    if (itemKey === null || !known.has(itemKey)) continue;
    const parsed = resultSchema.safeParse(entry);
    const list = seen.get(itemKey) ?? [];
    list.push(parsed.success ? parsed.data : null);
    seen.set(itemKey, list);
  }

  const verdicts = new Map<string, ItemVerdict>();
  for (const key of itemKeys) {
    const results = seen.get(key);
    const only = results && results.length === 1 ? results[0] : null;
    if (!only) {
      verdicts.set(key, { kind: "discard" });
    } else if (only.category === ABSTAIN_KEY) {
      verdicts.set(key, { kind: "abstain" });
    } else if (!categoryKeys.has(only.category)) {
      verdicts.set(key, { kind: "discard" });
    } else if (only.confidence !== "high") {
      verdicts.set(key, { kind: "low_confidence" });
    } else {
      verdicts.set(key, { kind: "categorize", categoryKey: only.category });
    }
  }
  return verdicts;
}
