import { randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { readAttempts, recentAttemptIds } from "./attempts";
import { amountRange, minimizeDescription, type AmountRange } from "./redact";

/**
 * Exportação dos lançamentos da Pluggy que as regras não categorizaram, para
 * a rotina do Claude Code (assinatura do dono) decidir fora do app.
 *
 * Somente leitura no banco. Gera dois objetos:
 * - o arquivo de pendentes, que a rotina lê: chaves efêmeras ("iN", "cN"),
 *   descrição minimizada e faixa de valor; nunca ids, valores exatos ou datas;
 * - o mapa privado, que só o script lê: chave → id e updatedAt da transação,
 *   chave → id da categoria.
 */

export const DEFAULT_EXPORT_LIMIT = 150;
export const MAX_EXPORT_LIMIT = 500;
const MAX_CATEGORY_NAME_LENGTH = 60;

export type CategoryAssistDb = Pick<PrismaClient, "transaction" | "category" | "settings">;

export interface PendingFile {
  geradoEm: string;
  /** Identificador desta exportação; o arquivo de decisões precisa repeti-lo. */
  exportacao: string;
  categorias: Array<{ chave: string; nome: string }>;
  itens: Array<{ chave: string; descricao: string; faixaDeValor: AmountRange }>;
}

export interface PrivateMap {
  geradoEm: string;
  exportacao: string;
  dono: string;
  incluirConta: boolean;
  itens: Record<string, { id: string; updatedAt: string }>;
  categorias: Record<string, string>;
}

export interface ExportCounts {
  /** Despesas elegíveis encontradas. */
  elegiveis: number;
  /** Elegíveis tentadas nos últimos 30 dias sem resultado. */
  tentadasRecentes: number;
  /** Descrição que não pôde ser minimizada (transferência, pessoa, sem letras). */
  naoMinimizaveis: number;
  exportadas: number;
  /** Sobraram além do limite (vão na próxima exportação). */
  foraDoLimite: number;
  categorias: number;
}

export interface ExportOptions {
  ownerUserId: string;
  /** Inclui a conta corrente além do cartão. */
  includeBank?: boolean;
  limit?: number;
  now?: Date;
  exportId?: string;
}

/** Filtro de elegibilidade, repetido na escrita condicional. */
export function selectionWhere(ownerUserId: string, includeBank = false) {
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
        accountLink: {
          userId: ownerUserId,
          accountType: includeBank ? { in: ["CREDIT", "BANK"] } : "CREDIT",
          enabled: true,
        },
      },
    },
  };
}

export function normalizeLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return DEFAULT_EXPORT_LIMIT;
  return Math.min(Math.floor(value), MAX_EXPORT_LIMIT);
}

export async function buildExport(
  db: CategoryAssistDb,
  options: ExportOptions
): Promise<{ pending: PendingFile; map: PrivateMap; counts: ExportCounts }> {
  const ownerUserId = options.ownerUserId?.trim();
  if (!ownerUserId) throw new Error("missing_owner");
  const includeBank = options.includeBank === true;
  const limit = normalizeLimit(options.limit);
  const now = options.now ?? new Date();
  const geradoEm = now.toISOString();
  const exportacao = options.exportId ?? randomBytes(8).toString("hex");

  const rows = await db.transaction.findMany({
    where: selectionWhere(ownerUserId, includeBank),
    select: { id: true, description: true, amount: true, updatedAt: true },
    orderBy: [{ date: "desc" }, { id: "asc" }],
  });
  const recent = recentAttemptIds(await readAttempts(db, ownerUserId), now);
  const categories = await db.category.findMany({
    where: { userId: ownerUserId, spaceId: null },
    select: { id: true, name: true },
    orderBy: [{ name: "asc" }, { id: "asc" }],
  });

  const counts: ExportCounts = {
    elegiveis: rows.length,
    tentadasRecentes: 0,
    naoMinimizaveis: 0,
    exportadas: 0,
    foraDoLimite: 0,
    categorias: categories.length,
  };
  const pending: PendingFile = { geradoEm, exportacao, categorias: [], itens: [] };
  const map: PrivateMap = { geradoEm, exportacao, dono: ownerUserId, incluirConta: includeBank, itens: {}, categorias: {} };

  categories.forEach((category, index) => {
    const chave = "c" + (index + 1);
    pending.categorias.push({ chave, nome: Array.from(category.name.trim()).slice(0, MAX_CATEGORY_NAME_LENGTH).join("") });
    map.categorias[chave] = category.id;
  });

  for (const row of rows) {
    if (recent.has(row.id)) {
      counts.tentadasRecentes++;
      continue;
    }
    const descricao = minimizeDescription(row.description);
    if (descricao === null) {
      counts.naoMinimizaveis++;
      continue;
    }
    // Sem categoria para escolher, nada é exportado.
    if (categories.length === 0 || pending.itens.length >= limit) {
      counts.foraDoLimite++;
      continue;
    }
    const chave = "i" + (pending.itens.length + 1);
    pending.itens.push({ chave, descricao, faixaDeValor: amountRange(Math.round(Math.abs(row.amount) * 100)) });
    map.itens[chave] = { id: row.id, updatedAt: row.updatedAt.toISOString() };
  }
  counts.exportadas = pending.itens.length;
  return { pending, map, counts };
}
