import { z } from "zod";

/**
 * Validação do arquivo de decisões escrito pela rotina. Nada dele é aplicado
 * sem passar por aqui: exportação diferente ou formato geral inválido recusa
 * o arquivo inteiro; chave desconhecida, categoria fora da lista, entrada mal
 * formada ou duplicada descarta o item. Só confiança "alta" vira categoria.
 */

export const CONFIDENCE_LEVELS = ["alta", "media", "baixa"] as const;

export type ItemVerdict =
  | { kind: "categorize"; categoryKey: string }
  | { kind: "abstain" }
  | { kind: "low_confidence" }
  | { kind: "discard" };

export type ParsedDecisions =
  | { ok: false; error: "formato_invalido" | "outra_exportacao" }
  | { ok: true; verdicts: Map<string, ItemVerdict>; unknownEntries: number };

const envelopeSchema = z.object({ exportacao: z.string(), decisoes: z.array(z.unknown()) });
const entrySchema = z.object({
  chave: z.string(),
  categoria: z.string().nullable(),
  confianca: z.enum(CONFIDENCE_LEVELS),
});
type Entry = z.infer<typeof entrySchema>;

/** Caixa, espaços e acento ("média") não são garantidos; as chaves são minúsculas. */
function normalize(value: unknown): unknown {
  return typeof value === "string" ? value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") : value;
}

function normalizeEntry(entry: unknown): unknown {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return entry;
  const out: Record<string, unknown> = { ...(entry as Record<string, unknown>) };
  for (const field of ["chave", "categoria", "confianca"]) out[field] = normalize(out[field]);
  return out;
}

export function parseDecisions(
  raw: unknown,
  exportacao: string,
  itemKeys: ReadonlySet<string>,
  categoryKeys: ReadonlySet<string>
): ParsedDecisions {
  const envelope = envelopeSchema.safeParse(raw);
  if (!envelope.success) return { ok: false, error: "formato_invalido" };
  if (envelope.data.exportacao.trim() !== exportacao) return { ok: false, error: "outra_exportacao" };

  let unknownEntries = 0;
  const seen = new Map<string, Array<Entry | null>>();
  for (const rawEntry of envelope.data.decisoes) {
    const entry = normalizeEntry(rawEntry) as { chave?: unknown } | null;
    const key = entry && typeof entry === "object" && typeof entry.chave === "string" ? entry.chave : null;
    if (key === null || !itemKeys.has(key)) {
      unknownEntries++;
      continue;
    }
    const parsed = entrySchema.safeParse(entry);
    const list = seen.get(key) ?? [];
    list.push(parsed.success ? parsed.data : null);
    seen.set(key, list);
  }

  const verdicts = new Map<string, ItemVerdict>();
  seen.forEach((list, key) => {
    const only = list.length === 1 ? list[0] : null;
    if (!only) verdicts.set(key, { kind: "discard" });
    else if (only.categoria === null) verdicts.set(key, { kind: "abstain" });
    else if (!categoryKeys.has(only.categoria)) verdicts.set(key, { kind: "discard" });
    else if (only.confianca !== "alta") verdicts.set(key, { kind: "low_confidence" });
    else verdicts.set(key, { kind: "categorize", categoryKey: only.categoria });
  });
  return { ok: true, verdicts, unknownEntries };
}
