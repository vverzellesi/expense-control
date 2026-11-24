import { randomBytes } from "crypto";
import type { PrismaClient } from "@prisma/client";
import { businessDayKey, installmentBaseDescription } from "@/lib/pluggy/store";
import { readAttempts, recentAttemptIds } from "./attempts";
import { amountRange, minimizeDescription, type AmountRange } from "./redact";

/**
 * Exportação dos lançamentos da Pluggy que as regras não categorizaram, para
 * a rotina do Claude Code (assinatura do dono) decidir fora do app.
 *
 * Somente leitura no banco. Gera dois objetos:
 * - o arquivo de pendentes, que a rotina lê: chaves efêmeras ("iN", "cN"),
 *   descrição minimizada, valor exato, faixa de valor, data, tipo de conta e o
 *   histórico de categorias que o dono já usou para a mesma descrição; nunca ids;
 * - o mapa privado, que só o script lê: chave → id e updatedAt da transação,
 *   chave → id da categoria.
 */

export const DEFAULT_EXPORT_LIMIT = 150;
export const MAX_EXPORT_LIMIT = 500;
/** Máximo de categorias no histórico de cada item. */
export const MAX_HISTORY_ENTRIES = 3;
const MAX_CATEGORY_NAME_LENGTH = 60;

export type CategoryAssistDb = Pick<PrismaClient, "transaction" | "category" | "settings">;

export interface HistoryEntry {
  /** Chave da categoria (cN) do arquivo de pendentes. */
  categoria: string;
  /** Lançamentos do dono com a mesma descrição e essa categoria. */
  vezes: number;
}

export interface PendingItem {
  chave: string;
  descricao: string;
  /** Valor exato em reais, positivo, 2 casas. */
  valor: number;
  faixaDeValor: AmountRange;
  /** Dia do lançamento (YYYY-MM-DD, fuso de negócio). */
  data: string;
  conta: "cartao" | "conta";
  historico: HistoryEntry[];
}

export interface PendingFile {
  geradoEm: string;
  /** Identificador desta exportação; o arquivo de decisões precisa repeti-lo. */
  exportacao: string;
  categorias: Array<{ chave: string; nome: string }>;
  itens: PendingItem[];
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
  /** Elegíveis tentadas nos últimos 30 dias sem resultado (0 com refazerTentadas). */
  tentadasRecentes: number;
  /** Descrição que não pôde ser minimizada (transferência, pessoa, sem letras). */
  naoMinimizaveis: number;
  exportadas: number;
  /** Sobraram além do limite (vão na próxima exportação). */
  foraDoLimite: number;
  /** Ficaram fora porque o dono não tem nenhuma categoria pessoal. */
  semCategorias: number;
  categorias: number;
  /** Exportadas com pelo menos uma entrada de histórico. */
  comHistorico: number;
}

export interface ExportOptions {
  ownerUserId: string;
  /** Inclui a conta corrente além do cartão. */
  includeBank?: boolean;
  /** Inclui transferências e carteiras entre pessoas (--incluir-pessoas). */
  includePeople?: boolean;
  /** Ignora a janela de 30 dias das tentativas sem resultado (--refazer-tentadas). */
  retryAttempted?: boolean;
  limit?: number;
  now?: Date;
  exportId?: string;
}

const ACTIVE_DISPOSITIONS = ["created", "adopted"];

function activeLinkWhere(ownerUserId: string, includeBank: boolean) {
  return {
    disposition: { in: ACTIVE_DISPOSITIONS },
    accountLink: {
      userId: ownerUserId,
      accountType: includeBank ? { in: ["CREDIT", "BANK"] } : "CREDIT",
      enabled: true,
    },
  };
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
    pluggyLinks: { some: activeLinkWhere(ownerUserId, includeBank) },
  };
}

/**
 * Despesas pessoais do dono, já ocorridas, que têm categoria dada por ele ou
 * pelas regras: a categoria escolhida pela própria rotina ("ai") não conta
 * como histórico, para a rotina não se reforçar sozinha. Receitas ficam fora
 * (alguns bancos usam o mesmo texto para PIX enviado e recebido), e parcelas
 * futuras também.
 */
export function historyWhere(ownerUserId: string, now: Date) {
  return {
    userId: ownerUserId,
    spaceId: null,
    deletedAt: null,
    type: "EXPENSE",
    date: { lte: now },
    categoryId: { not: null },
    OR: [{ categorySource: null }, { categorySource: { not: "ai" } }],
  };
}

export function normalizeLimit(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 1) return DEFAULT_EXPORT_LIMIT;
  return Math.min(Math.floor(value), MAX_EXPORT_LIMIT);
}

/** Chaves de comparação de uma descrição (normalização do dedup, sem marcador de parcela). */
function descriptionKeys(descriptions: Array<string | null | undefined>): string[] {
  const keys = new Set<string>();
  for (const d of descriptions) {
    if (typeof d !== "string") continue;
    const key = installmentBaseDescription(d);
    if (key) keys.add(key);
  }
  return Array.from(keys);
}

export async function buildExport(
  db: CategoryAssistDb,
  options: ExportOptions
): Promise<{ pending: PendingFile; map: PrivateMap; counts: ExportCounts }> {
  const ownerUserId = options.ownerUserId?.trim();
  if (!ownerUserId) throw new Error("missing_owner");
  const includeBank = options.includeBank === true;
  const includePeople = options.includePeople === true;
  const retryAttempted = options.retryAttempted === true;
  const limit = normalizeLimit(options.limit);
  const now = options.now ?? new Date();
  const geradoEm = now.toISOString();
  const exportacao = options.exportId ?? randomBytes(8).toString("hex");

  const rows = await db.transaction.findMany({
    where: selectionWhere(ownerUserId, includeBank),
    select: {
      id: true,
      description: true,
      amount: true,
      date: true,
      updatedAt: true,
      pluggyLinks: {
        where: activeLinkWhere(ownerUserId, includeBank),
        select: { sourceDescription: true, accountLink: { select: { accountType: true } } },
        orderBy: { id: "asc" },
      },
    },
    orderBy: [{ date: "desc" }, { id: "asc" }],
  });
  const recent = retryAttempted ? new Set<string>() : recentAttemptIds(await readAttempts(db, ownerUserId), now);
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
    semCategorias: 0,
    categorias: categories.length,
    comHistorico: 0,
  };
  const pending: PendingFile = { geradoEm, exportacao, categorias: [], itens: [] };
  const map: PrivateMap = { geradoEm, exportacao, dono: ownerUserId, incluirConta: includeBank, itens: {}, categorias: {} };

  const keyOfCategory = new Map<string, string>();
  const orderOfCategory = new Map<string, number>();
  categories.forEach((category, index) => {
    const chave = "c" + (index + 1);
    pending.categorias.push({ chave, nome: Array.from(category.name.trim()).slice(0, MAX_CATEGORY_NAME_LENGTH).join("") });
    map.categorias[chave] = category.id;
    keyOfCategory.set(category.id, chave);
    orderOfCategory.set(chave, index);
  });

  const selected: Array<{ item: PendingItem; keys: string[] }> = [];
  for (const row of rows) {
    if (recent.has(row.id)) {
      counts.tentadasRecentes++;
      continue;
    }
    const descricao = minimizeDescription(row.description, { includePeople });
    if (descricao === null) {
      counts.naoMinimizaveis++;
      continue;
    }
    // Sem categoria para escolher, nada é exportado.
    if (categories.length === 0) {
      counts.semCategorias++;
      continue;
    }
    if (selected.length >= limit) {
      counts.foraDoLimite++;
      continue;
    }
    const chave = "i" + (selected.length + 1);
    const cents = Math.round(Math.abs(row.amount) * 100);
    const links = row.pluggyLinks ?? [];
    const item: PendingItem = {
      chave,
      descricao,
      valor: cents / 100,
      faixaDeValor: amountRange(cents),
      data: businessDayKey(row.date),
      conta: links.some((l) => l.accountLink.accountType === "CREDIT") ? "cartao" : "conta",
      historico: [],
    };
    selected.push({ item, keys: descriptionKeys([row.description, ...links.map((l) => l.sourceDescription)]) });
    map.itens[chave] = { id: row.id, updatedAt: row.updatedAt.toISOString() };
  }

  if (selected.length > 0) {
    // Uma leitura do histórico; o agrupamento por descrição é feito em memória.
    const history = await db.transaction.findMany({
      where: historyWhere(ownerUserId, now),
      select: {
        categoryId: true,
        description: true,
        installmentId: true,
        recurringExpenseId: true,
        pluggyLinks: { select: { sourceDescription: true } },
      },
    });
    // Parcelas de uma compra e lançamentos de uma recorrência são uma decisão só do dono.
    const byKey = new Map<string, Array<{ decision: string; categoria: string }>>();
    history.forEach((h, index) => {
      const categoria = h.categoryId ? keyOfCategory.get(h.categoryId) : undefined;
      // Categoria de espaço compartilhado ou de outro usuário não entra.
      if (!categoria) return;
      const decision = h.installmentId
        ? "p:" + h.installmentId
        : h.recurringExpenseId
          ? "r:" + h.recurringExpenseId
          : "t:" + index;
      for (const key of descriptionKeys([h.description, ...(h.pluggyLinks ?? []).map((l) => l.sourceDescription)])) {
        const list = byKey.get(key) ?? [];
        list.push({ decision, categoria });
        byKey.set(key, list);
      }
    });
    for (const { item, keys } of selected) {
      // Cada decisão conta uma vez por categoria, mesmo casando pelas duas descrições.
      const seen = new Set<string>();
      const tally = new Map<string, number>();
      for (const key of keys) {
        for (const entry of byKey.get(key) ?? []) {
          const id = entry.decision + "|" + entry.categoria;
          if (seen.has(id)) continue;
          seen.add(id);
          tally.set(entry.categoria, (tally.get(entry.categoria) ?? 0) + 1);
        }
      }
      item.historico = Array.from(tally.entries())
        .map(([categoria, vezes]) => ({ categoria, vezes }))
        .sort((a, b) => b.vezes - a.vezes || orderOfCategory.get(a.categoria)! - orderOfCategory.get(b.categoria)!)
        .slice(0, MAX_HISTORY_ENTRIES);
      if (item.historico.length > 0) counts.comHistorico++;
    }
  }

  pending.itens = selected.map((s) => s.item);
  counts.exportadas = pending.itens.length;
  return { pending, map, counts };
}
