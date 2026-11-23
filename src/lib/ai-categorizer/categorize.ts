import type { PrismaClient } from "@prisma/client";
import { AnthropicCallError, callAnthropic, DEFAULT_TIMEOUT_MS } from "./anthropic";
import { amountRange, minimizeDescription, type AmountRange } from "./redact";
import {
  buildAnthropicRequest,
  buildCategoryOptions,
  chunkItems,
  type AiBatchPayload,
} from "./request";
import { validateOutput } from "./validate";

/**
 * Categorização por IA do que as regras não resolveram.
 *
 * Só toca lançamentos de cartão vindos da Pluggy do dono: transação pessoal
 * (spaceId null), não apagada, EXPENSE, sem categoria e sem origem de
 * categoria (nunca "manual", nem quando o usuário limpou a categoria), com
 * vínculo created/adopted numa conta CREDIT ativa do dono. A escrita é
 * condicional (categoria ainda vazia e updatedAt igual ao lido) e grava
 * categorySource = "ai". Nunca lança: devolve estado, contagens e um código
 * de erro sanitizado.
 */

export const DEFAULT_AI_CATEGORIZER_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_MAX_CALLS_PER_RUN = 3;
export const MAX_BATCH_SIZE = 40;
const MAX_CALLS_CEILING = 50;

export type AiCategorizerDb = Pick<PrismaClient, "transaction" | "category">;
export type CategorizerState = "desligado" | "ok" | "erro";
export type CategorizerMode = "simulate" | "apply";

export interface CategorizeOptions {
  ownerUserId: string;
  mode: CategorizerMode;
  /** Sem chave a função não faz nada (estado "desligado"), exceto em simulação. */
  apiKey?: string | null;
  model?: string;
  maxCalls?: number;
  batchSize?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface CategorizeCounts {
  /** Transações elegíveis encontradas. */
  selected: number;
  /** Elegíveis que ficaram fora porque a descrição não pôde ser minimizada. */
  unminimizable: number;
  /** Itens nos lotes que cabem no teto de chamadas (enviados ou, em simulação, a enviar). */
  planned: number;
  /** Itens efetivamente enviados ao provedor. */
  sent: number;
  categorized: number;
  abstained: number;
  lowConfidence: number;
  discarded: number;
  /** Categoria válida, mas a transação mudou entre a leitura e a escrita. */
  conflicts: number;
  /** Itens que excederam o teto de chamadas desta execução. */
  notSent: number;
  calls: number;
}

export interface CategorizeResult {
  state: CategorizerState;
  mode: CategorizerMode;
  model: string;
  counts: CategorizeCounts;
  /** Código sanitizado: nunca descrições, ids, corpo de resposta ou chave. */
  error: string | null;
  /** Só em simulação: exatamente o que seria enviado, lote a lote. */
  preview?: AiBatchPayload[];
}

function emptyCounts(): CategorizeCounts {
  return {
    selected: 0,
    unminimizable: 0,
    planned: 0,
    sent: 0,
    categorized: 0,
    abstained: 0,
    lowConfidence: 0,
    discarded: 0,
    conflicts: 0,
    notSent: 0,
    calls: 0,
  };
}

function parseMaxCalls(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw.trim())) return DEFAULT_MAX_CALLS_PER_RUN;
  return Math.min(Number(raw.trim()), MAX_CALLS_CEILING);
}

/** Configuração a partir do ambiente (ANTHROPIC_API_KEY, AI_CATEGORIZER_MODEL, AI_CATEGORIZER_MAX_CALLS_PER_RUN). */
export function categorizerConfigFromEnv(
  env: Record<string, string | undefined> = process.env
): Pick<CategorizeOptions, "apiKey" | "model" | "maxCalls"> {
  return {
    apiKey: env.ANTHROPIC_API_KEY?.trim() || null,
    model: env.AI_CATEGORIZER_MODEL?.trim() || DEFAULT_AI_CATEGORIZER_MODEL,
    maxCalls: parseMaxCalls(env.AI_CATEGORIZER_MAX_CALLS_PER_RUN),
  };
}

interface Candidate {
  id: string;
  updatedAt: Date;
  description: string;
  amountRange: AmountRange;
}

/** Filtro de seleção (exportado para teste). */
export function selectionWhere(ownerUserId: string) {
  return {
    userId: ownerUserId,
    spaceId: null,
    deletedAt: null,
    type: "EXPENSE",
    categoryId: null,
    categorySource: null,
    pluggyLinks: {
      some: {
        disposition: { in: ["created", "adopted"] },
        accountLink: { userId: ownerUserId, accountType: "CREDIT", enabled: true },
      },
    },
  };
}

export async function categorizeUncategorized(
  db: AiCategorizerDb,
  options: CategorizeOptions
): Promise<CategorizeResult> {
  const mode = options.mode;
  const model = options.model?.trim() || DEFAULT_AI_CATEGORIZER_MODEL;
  const counts = emptyCounts();
  const result = (state: CategorizerState, error: string | null = null, preview?: AiBatchPayload[]): CategorizeResult => ({
    state,
    mode,
    model,
    counts,
    error,
    ...(preview ? { preview } : {}),
  });

  const ownerUserId = options.ownerUserId?.trim();
  if (!ownerUserId) return result("erro", "missing_owner");
  if (mode !== "simulate" && mode !== "apply") return result("erro", "invalid_mode");
  const apiKey = options.apiKey?.trim() || null;
  if (mode === "apply" && !apiKey) return result("desligado");

  const maxCalls = Math.max(0, Math.min(Math.floor(options.maxCalls ?? DEFAULT_MAX_CALLS_PER_RUN), MAX_CALLS_CEILING));
  const batchSize = Math.max(1, Math.min(Math.floor(options.batchSize ?? MAX_BATCH_SIZE), MAX_BATCH_SIZE));

  try {
    const rows = await db.transaction.findMany({
      where: selectionWhere(ownerUserId),
      select: { id: true, description: true, amount: true, updatedAt: true },
      orderBy: [{ date: "desc" }, { id: "asc" }],
    });
    counts.selected = rows.length;
    if (rows.length === 0) return result("ok", null, mode === "simulate" ? [] : undefined);

    const candidates: Candidate[] = [];
    for (const row of rows) {
      const description = minimizeDescription(row.description);
      if (description === null) {
        counts.unminimizable++;
        continue;
      }
      candidates.push({
        id: row.id,
        updatedAt: row.updatedAt,
        description,
        amountRange: amountRange(Math.round(Math.abs(row.amount) * 100)),
      });
    }

    const categories = await db.category.findMany({
      where: { userId: ownerUserId, spaceId: null },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    if (categories.length === 0) {
      counts.notSent = candidates.length;
      return result("ok", null, mode === "simulate" ? [] : undefined);
    }
    const { options: categoryOptions, keyToId } = buildCategoryOptions(categories);
    const categoryKeys = new Set(keyToId.keys());

    const batches = chunkItems(candidates, batchSize);
    const toSend = batches.slice(0, maxCalls);
    counts.planned = toSend.reduce((n, b) => n + b.length, 0);
    counts.notSent = candidates.length - counts.planned;
    const payloads: AiBatchPayload[] = toSend.map((batch) => ({
      categories: categoryOptions,
      items: batch.map(({ key, source }) => ({ key, description: source.description, amountRange: source.amountRange })),
    }));

    if (mode === "simulate") return result("ok", null, payloads);

    for (let b = 0; b < toSend.length; b++) {
      const batch = toSend[b];
      counts.calls++;
      counts.sent += batch.length;
      let output: unknown;
      try {
        output = await callAnthropic(buildAnthropicRequest(payloads[b], model), {
          apiKey: apiKey!,
          fetchImpl: options.fetchImpl,
          timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        });
      } catch (error) {
        if (error instanceof AnthropicCallError && !error.fatal) {
          counts.discarded += batch.length;
          continue;
        }
        const code = error instanceof AnthropicCallError ? error.message : "provider_unexpected";
        return result("erro", code);
      }

      const verdicts = validateOutput(output, batch.map((i) => i.key), categoryKeys);
      if (!verdicts) {
        counts.discarded += batch.length;
        continue;
      }

      for (const { key, source } of batch) {
        const verdict = verdicts.get(key);
        if (!verdict || verdict.kind === "discard") {
          counts.discarded++;
          continue;
        }
        if (verdict.kind === "abstain") {
          counts.abstained++;
          continue;
        }
        if (verdict.kind === "low_confidence") {
          counts.lowConfidence++;
          continue;
        }
        const categoryId = keyToId.get(verdict.categoryKey);
        if (!categoryId) {
          counts.discarded++;
          continue;
        }
        try {
          const updated = await db.transaction.updateMany({
            where: {
              id: source.id,
              userId: ownerUserId,
              spaceId: null,
              deletedAt: null,
              type: "EXPENSE",
              categoryId: null,
              categorySource: null,
              updatedAt: source.updatedAt,
            },
            data: { categoryId, categorySource: "ai" },
          });
          if (updated.count === 1) counts.categorized++;
          else counts.conflicts++;
        } catch {
          return result("erro", "db_write_failed");
        }
      }
    }
    return result("ok");
  } catch {
    return result("erro", "unexpected_error");
  }
}
