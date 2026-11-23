import { recordAttempts } from "./attempts";
import { selectionWhere, type CategoryAssistDb, type PrivateMap } from "./export";
import { parseDecisions } from "./validate";

/**
 * Aplicação das decisões da rotina. Simulação por padrão. A escrita é
 * condicional: repete o filtro de elegibilidade (categoria e origem de
 * categoria ainda vazias, vínculo ativo, escopo pessoal) e exige o mesmo
 * updatedAt lido na exportação; grava categorySource = "ai". Abstenções e
 * confianças não altas ficam registradas como tentativa (só ao gravar).
 */

export type ApplyMode = "simulate" | "apply";

export interface ApplyCounts {
  aplicadas: number;
  abstencoes: number;
  /** Confiança média ou baixa: não grava. */
  baixaConfianca: number;
  descartadas: number;
  conflitos: number;
  /** Itens exportados que vieram sem decisão. */
  semDecisao: number;
}

export interface ApplyResult {
  mode: ApplyMode;
  counts: ApplyCounts;
  /** Código sanitizado: nunca descrições, ids ou conteúdo do arquivo. */
  error: string | null;
}

export interface ApplyOptions {
  ownerUserId: string;
  mode: ApplyMode;
  map: PrivateMap;
  decisions: unknown;
  now?: Date;
}

function isValidMap(map: unknown): map is PrivateMap {
  if (map === null || typeof map !== "object") return false;
  const m = map as Partial<PrivateMap>;
  return (
    typeof m.exportacao === "string" &&
    typeof m.dono === "string" &&
    typeof m.incluirConta === "boolean" &&
    m.itens !== null && typeof m.itens === "object" &&
    m.categorias !== null && typeof m.categorias === "object"
  );
}

export async function applyDecisions(db: CategoryAssistDb, options: ApplyOptions): Promise<ApplyResult> {
  const mode = options.mode;
  const counts: ApplyCounts = { aplicadas: 0, abstencoes: 0, baixaConfianca: 0, descartadas: 0, conflitos: 0, semDecisao: 0 };
  const result = (error: string | null = null): ApplyResult => ({ mode, counts, error });

  const ownerUserId = options.ownerUserId?.trim();
  if (!ownerUserId) return result("missing_owner");
  if (mode !== "simulate" && mode !== "apply") return result("invalid_mode");
  if (!isValidMap(options.map)) return result("mapa_invalido");
  const map = options.map;
  if (map.dono !== ownerUserId) return result("mapa_de_outro_dono");

  const itemKeys = new Set(Object.keys(map.itens));
  const parsed = parseDecisions(options.decisions, map.exportacao, itemKeys, new Set(Object.keys(map.categorias)));
  if (!parsed.ok) return result(parsed.error);
  counts.descartadas += parsed.unknownEntries;

  const toWrite: Array<{ id: string; updatedAt: Date; categoryId: string }> = [];
  const attempted: string[] = [];
  for (const key of Array.from(itemKeys)) {
    const verdict = parsed.verdicts.get(key);
    const item = map.itens[key];
    const updatedAt = new Date(item?.updatedAt);
    if (!verdict) {
      counts.semDecisao++;
    } else if (verdict.kind === "discard" || typeof item?.id !== "string" || Number.isNaN(updatedAt.getTime())) {
      counts.descartadas++;
    } else if (verdict.kind === "abstain") {
      counts.abstencoes++;
      attempted.push(item.id);
    } else if (verdict.kind === "low_confidence") {
      counts.baixaConfianca++;
      attempted.push(item.id);
    } else {
      toWrite.push({ id: item.id, updatedAt, categoryId: map.categorias[verdict.categoryKey] });
    }
  }

  try {
    // A categoria pode ter sido apagada ou movida para um espaço depois da exportação.
    const chosen = Array.from(new Set(toWrite.map((w) => w.categoryId)));
    const personal = new Set<string>();
    if (chosen.length > 0) {
      const still = await db.category.findMany({
        where: { id: { in: chosen }, userId: ownerUserId, spaceId: null },
        select: { id: true },
      });
      still.forEach((c) => personal.add(c.id));
    }
    const where = selectionWhere(ownerUserId, map.incluirConta);

    if (mode === "simulate") {
      const ids = toWrite.map((w) => w.id);
      const current = ids.length
        ? await db.transaction.findMany({ where: { ...where, id: { in: ids } }, select: { id: true, updatedAt: true } })
        : [];
      const unchanged = new Map(current.map((t) => [t.id, t.updatedAt.getTime()]));
      for (const w of toWrite) {
        if (personal.has(w.categoryId) && unchanged.get(w.id) === w.updatedAt.getTime()) counts.aplicadas++;
        else counts.conflitos++;
      }
      return result();
    }

    for (const w of toWrite) {
      if (!personal.has(w.categoryId)) {
        counts.conflitos++;
        continue;
      }
      try {
        const updated = await db.transaction.updateMany({
          where: { ...where, id: w.id, updatedAt: w.updatedAt },
          data: { categoryId: w.categoryId, categorySource: "ai" },
        });
        if (updated.count === 1) counts.aplicadas++;
        else counts.conflitos++;
      } catch (error) {
        // Categoria apagada entre a leitura e a escrita (chave estrangeira): conflito do item.
        if ((error as { code?: unknown } | null)?.code === "P2003") {
          counts.conflitos++;
          continue;
        }
        return result("db_write_failed");
      }
    }
    if (attempted.length > 0) await recordAttempts(db, ownerUserId, attempted, options.now ?? new Date());
    return result();
  } catch {
    return result("unexpected_error");
  }
}
