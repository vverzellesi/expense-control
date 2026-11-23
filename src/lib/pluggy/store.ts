import type { Prisma } from "@prisma/client";
import { normalizeDescription } from "@/lib/dedup";
import { matchesRecurring, replaceInstallmentNumber } from "@/lib/import-service";
import {
  assertPluggyLeaseHeld,
  lockUserForPluggy,
  type PluggyDbClient,
  type PluggyTxClient,
} from "./lease";
import type { MappedPluggyTransaction } from "./types";

/**
 * Persistência e decisão da integração Pluggy.
 *
 * Para cada registro já mapeado decide o destino (criar, adotar, excluir,
 * pendente, revisão, antes do corte) e grava tudo de forma atômica e
 * idempotente: um registro por transação curta de banco, sob o advisory lock
 * do usuário e com o lease conferido. O modo simulação calcula as mesmas
 * decisões só com leituras, aplicando os efeitos em memória.
 *
 * Especificação: contrato v2 + Emenda 1 do plano da integração Pluggy.
 */

// ---------------------------------------------------------------------------
// Tipos de entrada
// ---------------------------------------------------------------------------

/** Registro mapeado (fronteira mapeamento → persistência), definido em ./types. */
export type PluggyStoreRecord = MappedPluggyTransaction;

export type LinkDisposition =
  | "created"
  | "adopted"
  | "excluded"
  | "pending"
  | "needs_review"
  | "before_cutoff"
  | "superseded";

/**
 * Destino do registro nesta execução. "unchanged" = já contabilizado antes;
 * "updated" = já contabilizado e a transação local foi atualizada a partir da fonte;
 * "restored" = provisório que tinha sumido voltou e o lançamento foi restaurado.
 */
export type RecordOutcome = Exclude<LinkDisposition, "superseded"> | "unchanged" | "updated" | "restored";

export class PluggyStoreError extends Error {
  // A mensagem é só o código: nunca ids, descrições ou valores.
  constructor(public readonly code: string) {
    super("pluggy_store:" + code);
    this.name = "PluggyStoreError";
  }
}

// ---------------------------------------------------------------------------
// Datas (dia de negócio em America/Sao_Paulo; armazenamento às 12:00 UTC)
// ---------------------------------------------------------------------------

const BUSINESS_TIME_ZONE = "America/Sao_Paulo";
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Dia (YYYY-MM-DD) de um instante no fuso de negócio. */
export function businessDayKey(date: Date): string {
  return dayFormatter.format(date);
}

function parseDay(day: string): [number, number, number] {
  const m = DAY_RE.exec(day);
  if (!m) throw new PluggyStoreError("invalid_date");
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) {
    throw new PluggyStoreError("invalid_date");
  }
  return [y, mo, d];
}

/** Data gravada no banco para um dia: 12:00 UTC (mesmo padrão das rotas na Vercel). */
export function dayToStoredDate(day: string): Date {
  const [y, m, d] = parseDay(day);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

/** Soma meses sem transbordar o fim do mês (31/01 + 1 mês = 28/02 ou 29/02). */
export function addMonthsToDay(day: string, months: number): string {
  const [y, m, d] = parseDay(day);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const ty = target.getUTCFullYear();
  const tm = target.getUTCMonth();
  const lastDay = new Date(Date.UTC(ty, tm + 1, 0)).getUTCDate();
  const td = Math.min(d, lastDay);
  return ty + "-" + String(tm + 1).padStart(2, "0") + "-" + String(td).padStart(2, "0");
}

/** Diferença em dias entre dois dias (a − b). */
export function dayDiff(a: string, b: string): number {
  const [ay, am, ad] = parseDay(a);
  const [by, bm, bd] = parseDay(b);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

function monthKey(day: string): string {
  return day.slice(0, 7);
}

// ---------------------------------------------------------------------------
// Regras puras de comparação
// ---------------------------------------------------------------------------

const INSTALLMENT_MARKERS: RegExp[] = [
  /[-–]?\s*\(?\s*PARC(?:ELA)?\.?\s*\d+\s*(?:[\/\\]|DE)\s*\d+\s*\)?/gi,
  /\(\s*\d{1,2}\s*[\/\\]\s*\d{1,2}\s*\)/g,
  /\s\d{1,2}\s*[\/\\]\s*\d{1,2}\s*$/g,
  /[-–]\s*Parcela\s*$/gi,
];

/** Descrição normalizada sem o marcador de parcela ("LOJA - Parcela 2/10" → "loja"). */
export function installmentBaseDescription(description: string): string {
  let text = " " + description + " ";
  for (const re of INSTALLMENT_MARKERS) {
    text = text.replace(re, " ");
  }
  return normalizeDescription(text.replace(/[-–\s]+$/g, " "))
    .replace(/[-–]+$/g, "")
    .trim();
}

/** Valor com sinal em centavos, na convenção de Transaction.amount. */
export function signedCents(record: Pick<PluggyStoreRecord, "type" | "direction" | "amountCents">): number {
  if (record.type === "EXPENSE") return -record.amountCents;
  if (record.type === "INCOME") return record.amountCents;
  return record.direction === "DEBIT" ? -record.amountCents : record.amountCents;
}

function amountToCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Valida o registro antes de qualquer decisão. Mensagem sem dados do registro. */
export function assertValidRecord(r: PluggyStoreRecord): void {
  const fail = () => {
    throw new PluggyStoreError("invalid_record");
  };
  if (typeof r.externalId !== "string" || r.externalId.trim() === "") fail();
  if (r.providerId !== null && (typeof r.providerId !== "string" || r.providerId.trim() === "")) fail();
  if (!["BANK", "CREDIT"].includes(r.accountType)) fail();
  if (!["PENDING", "POSTED"].includes(r.sourceStatus)) fail();
  if (!["DEBIT", "CREDIT"].includes(r.direction)) fail();
  if (!["EXPENSE", "INCOME", "TRANSFER"].includes(r.type)) fail();
  if (!Number.isInteger(r.amountCents) || r.amountCents <= 0) fail();
  if (typeof r.description !== "string" || typeof r.currencyCode !== "string") fail();
  parseDay(r.sourceDate);
  parseDay(r.ledgerDate);
  if (r.purchaseDate !== null) parseDay(r.purchaseDate);
  const n = r.installmentNumber;
  const t = r.totalInstallments;
  if ((n === null) !== (t === null)) fail();
  if (n !== null && t !== null) {
    if (!Number.isInteger(n) || !Number.isInteger(t) || n < 1 || t < 2 || n > t) fail();
  }
  if (r.preDisposition !== null) {
    if (!["excluded", "needs_review", "pending"].includes(r.preDisposition.disposition)) fail();
    if (typeof r.preDisposition.reasonCode !== "string" || r.preDisposition.reasonCode === "") fail();
  }
}

// ---------------------------------------------------------------------------
// Linhas lidas (formato interno) e visão de leitura
// ---------------------------------------------------------------------------

export interface LinkRow {
  id: string;
  accountLinkId: string;
  externalId: string;
  providerId: string | null;
  transactionId: string | null;
  disposition: LinkDisposition;
  reasonCode: string | null;
  sourceStatus: string;
  sourceDate: string; // dia
  ledgerDate: string; // dia gravado na transação da última vez
  purchaseDate: string | null; // dia
  sourceAmountCents: number;
  currencyCode: string;
  direction: string;
  sourceDescription: string;
  billId: string | null;
  creditKind: string | null;
  installmentNumber: number | null;
  totalInstallments: number | null;
  /** Carimbo do soft delete feito pelo sistema na transação vinculada. */
  systemDeletedAt: Date | null;
}

export interface TxRow {
  id: string;
  description: string;
  cents: number; // com sinal
  /** Valor e data brutos gravados (para a atualização condicional). */
  amount: number;
  date: Date;
  day: string;
  categorySource: string | null;
  deletedAt: Date | null;
  origin: string;
  isInstallment: boolean;
  currentInstallment: number | null;
  totalInstallments: number | null;
  installmentId: string | null;
  /** Início do grupo de parcelas, só quando o grupo é pessoal do dono. */
  groupStartDay: string | null;
  deleted: boolean;
  hasPluggyLink: boolean;
  recurringExpenseId: string | null;
  createdAt: Date;
}

export interface RecurringRow {
  id: string;
  description: string;
  origin: string;
  categoryId: string | null;
  monthKeys: Set<string>;
}

export interface LinkFilter {
  lineageIds: string[];
  providerId?: string;
  amountCents?: number;
  amountTolerance?: number;
  totalInstallments?: number;
}

export interface TxFilter {
  origins: string[];
  cents: number;
  tolerance: number;
  installment?: { n: number; t: number };
  day?: string;
  includeDeleted: boolean;
  unlinkedOnly: boolean;
}

export function linkMatchesFilter(l: LinkRow, f: LinkFilter): boolean {
  if (!f.lineageIds.includes(l.accountLinkId)) return false;
  if (f.providerId !== undefined && l.providerId !== f.providerId) return false;
  if (f.amountCents !== undefined && Math.abs(l.sourceAmountCents - f.amountCents) > (f.amountTolerance ?? 0)) return false;
  if (f.totalInstallments !== undefined && l.totalInstallments !== f.totalInstallments) return false;
  return true;
}

export function txMatchesFilter(t: TxRow, f: TxFilter): boolean {
  if (!f.origins.includes(t.origin)) return false;
  if (Math.abs(t.cents - f.cents) > f.tolerance) return false;
  if (f.installment) {
    if (!t.isInstallment || t.currentInstallment !== f.installment.n || t.totalInstallments !== f.installment.t) return false;
  }
  if (f.day !== undefined && t.day !== f.day) return false;
  if (!f.includeDeleted && t.deleted) return false;
  if (f.unlinkedOnly && t.hasPluggyLink) return false;
  return true;
}

/** Leituras usadas pela decisão. A mesma interface serve à gravação e à simulação. */
export interface DecisionView {
  linkByExternalId(accountLinkId: string, externalId: string): Promise<LinkRow | null>;
  links(filter: LinkFilter): Promise<LinkRow[]>;
  linksOfTransactions(transactionIds: string[]): Promise<LinkRow[]>;
  ownerTransactions(filter: TxFilter): Promise<TxRow[]>;
  ownerTransactionsById(ids: string[]): Promise<TxRow[]>;
  groupMembers(installmentId: string): Promise<TxRow[]>;
  recurrings(): Promise<RecurringRow[]>;
}

/** Origem das linhas: o banco (consultas pontuais) ou um retrato carregado de uma vez. */
export type DecisionSource = {
  [K in keyof DecisionView]: K extends "linkByExternalId"
    ? (accountLinkId: string, externalId: string) => Promise<LinkRow[]>
    : DecisionView[K];
};

/** Efeitos já decididos/gravados nesta execução, aplicados por cima da origem. */
export interface SimulationOverlay {
  links: Map<string, LinkRow>;
  txs: Map<string, TxRow>;
  recurringMonths: Map<string, Set<string>>;
  seq: number;
}

export function createOverlay(): SimulationOverlay {
  return { links: new Map(), txs: new Map(), recurringMonths: new Map(), seq: 0 };
}

type ReadClient = PluggyDbClient | PluggyTxClient;

const TX_SELECT = {
  id: true,
  description: true,
  amount: true,
  date: true,
  origin: true,
  isInstallment: true,
  currentInstallment: true,
  totalInstallments: true,
  installmentId: true,
  deletedAt: true,
  categorySource: true,
  recurringExpenseId: true,
  createdAt: true,
  installment: { select: { startDate: true, userId: true, spaceId: true } },
  _count: { select: { pluggyLinks: true } },
} satisfies Prisma.TransactionSelect;

type TxSelected = Prisma.TransactionGetPayload<{ select: typeof TX_SELECT }>;

function toTxRow(t: TxSelected, ownerUserId: string): TxRow {
  const group = t.installment;
  return {
    id: t.id,
    description: t.description,
    cents: amountToCents(t.amount),
    amount: t.amount,
    date: t.date,
    day: businessDayKey(t.date),
    categorySource: t.categorySource,
    deletedAt: t.deletedAt,
    origin: t.origin,
    isInstallment: t.isInstallment,
    currentInstallment: t.currentInstallment,
    totalInstallments: t.totalInstallments,
    installmentId: t.installmentId,
    groupStartDay:
      group && group.userId === ownerUserId && group.spaceId === null ? businessDayKey(group.startDate) : null,
    deleted: t.deletedAt !== null,
    hasPluggyLink: t._count.pluggyLinks > 0,
    recurringExpenseId: t.recurringExpenseId,
    createdAt: t.createdAt,
  };
}

type LinkRecordDb = Prisma.PluggyTransactionLinkGetPayload<object>;

function toLinkRow(l: LinkRecordDb): LinkRow {
  return {
    id: l.id,
    accountLinkId: l.accountLinkId,
    externalId: l.externalId,
    providerId: l.providerId,
    transactionId: l.transactionId,
    disposition: l.disposition as LinkDisposition,
    reasonCode: l.reasonCode,
    sourceStatus: l.sourceStatus,
    sourceDate: businessDayKey(l.sourceDate),
    ledgerDate: businessDayKey(l.ledgerDate),
    purchaseDate: l.purchaseDate ? businessDayKey(l.purchaseDate) : null,
    sourceAmountCents: l.sourceAmountCents,
    currencyCode: l.currencyCode,
    direction: l.direction,
    sourceDescription: l.sourceDescription,
    billId: l.billId,
    creditKind: l.creditKind,
    installmentNumber: l.installmentNumber,
    totalInstallments: l.totalInstallments,
    systemDeletedAt: l.systemDeletedAt,
  };
}

function wideDayRange(day: string): { gte: Date; lte: Date } {
  const [y, m, d] = parseDay(day);
  return {
    gte: new Date(Date.UTC(y, m - 1, d - 1, 0, 0, 0)),
    lte: new Date(Date.UTC(y, m - 1, d + 1, 23, 59, 59, 999)),
  };
}

async function loadRecurrings(db: ReadClient, ownerUserId: string): Promise<RecurringRow[]> {
  return (
    await db.recurringExpense.findMany({
      where: { userId: ownerUserId, spaceId: null, isActive: true },
      select: {
        id: true,
        description: true,
        origin: true,
        categoryId: true,
        transactions: { where: { deletedAt: null }, select: { date: true } },
      },
      orderBy: { id: "asc" },
    })
  ).map((r) => ({
    id: r.id,
    description: r.description,
    origin: r.origin,
    categoryId: r.categoryId,
    monthKeys: new Set(r.transactions.map((t) => monthKey(businessDayKey(t.date)))),
  }));
}

/** Origem que consulta o banco (usada sob o lock, na gravação). */
export function dbSource(db: ReadClient, ownerUserId: string): DecisionSource {
  const personal = { userId: ownerUserId, spaceId: null };
  return {
    async linkByExternalId(accountLinkId, externalId) {
      const l = await db.pluggyTransactionLink.findUnique({
        where: { accountLinkId_externalId: { accountLinkId, externalId } },
      });
      return l ? [toLinkRow(l)] : [];
    },
    async links(filter) {
      return (
        await db.pluggyTransactionLink.findMany({
          where: {
            accountLinkId: { in: filter.lineageIds },
            ...(filter.providerId !== undefined ? { providerId: filter.providerId } : {}),
            ...(filter.amountCents !== undefined
              ? {
                  sourceAmountCents: {
                    gte: filter.amountCents - (filter.amountTolerance ?? 0),
                    lte: filter.amountCents + (filter.amountTolerance ?? 0),
                  },
                }
              : {}),
            ...(filter.totalInstallments !== undefined ? { totalInstallments: filter.totalInstallments } : {}),
          },
        })
      ).map(toLinkRow);
    },
    async linksOfTransactions(transactionIds) {
      if (transactionIds.length === 0) return [];
      return (await db.pluggyTransactionLink.findMany({ where: { transactionId: { in: transactionIds } } })).map(
        toLinkRow
      );
    },
    async ownerTransactions(filter) {
      return (
        await db.transaction.findMany({
          where: {
            ...personal,
            origin: { in: filter.origins },
            amount: {
              gte: (filter.cents - filter.tolerance) / 100 - 0.005,
              lte: (filter.cents + filter.tolerance) / 100 + 0.005,
            },
            ...(filter.installment
              ? {
                  isInstallment: true,
                  currentInstallment: filter.installment.n,
                  totalInstallments: filter.installment.t,
                }
              : {}),
            ...(filter.day !== undefined ? { date: wideDayRange(filter.day) } : {}),
            ...(filter.includeDeleted ? {} : { deletedAt: null }),
            ...(filter.unlinkedOnly ? { pluggyLinks: { none: {} } } : {}),
          },
          select: TX_SELECT,
        })
      ).map((t) => toTxRow(t, ownerUserId));
    },
    async ownerTransactionsById(ids) {
      if (ids.length === 0) return [];
      return (await db.transaction.findMany({ where: { ...personal, id: { in: ids } }, select: TX_SELECT })).map((t) =>
        toTxRow(t, ownerUserId)
      );
    },
    async groupMembers(installmentId) {
      return (
        await db.transaction.findMany({ where: { ...personal, installmentId }, select: TX_SELECT })
      ).map((t) => toTxRow(t, ownerUserId));
    },
    async recurrings() {
      return loadRecurrings(db, ownerUserId);
    },
  };
}

/** Retrato de uma conta carregado em poucas consultas (decisão em memória). */
export interface BatchSnapshot {
  links: LinkRow[];
  /** Transações pessoais do dono nos origins da linhagem ou vinculadas à linhagem. */
  txs: TxRow[];
  recurrings: RecurringRow[];
}

export async function loadBatchSnapshot(db: ReadClient, ctx: AccountContext): Promise<BatchSnapshot> {
  const links = (
    await db.pluggyTransactionLink.findMany({ where: { accountLinkId: { in: ctx.lineageIds } } })
  ).map(toLinkRow);
  const txs = (
    await db.transaction.findMany({
      where: {
        userId: ctx.ownerUserId,
        spaceId: null,
        OR: [
          { origin: { in: ctx.originNames } },
          { pluggyLinks: { some: { accountLinkId: { in: ctx.lineageIds } } } },
        ],
      },
      select: TX_SELECT,
    })
  ).map((t) => toTxRow(t, ctx.ownerUserId));
  const recurrings = await loadRecurrings(db, ctx.ownerUserId);
  return { links, txs, recurrings };
}

/** Origem em memória: mesmos filtros da origem do banco, sobre o retrato. */
export function snapshotSource(snapshot: BatchSnapshot): DecisionSource {
  return {
    async linkByExternalId(accountLinkId, externalId) {
      return snapshot.links.filter((l) => l.accountLinkId === accountLinkId && l.externalId === externalId);
    },
    async links(filter) {
      return snapshot.links.filter((l) => linkMatchesFilter(l, filter));
    },
    async linksOfTransactions(transactionIds) {
      return snapshot.links.filter((l) => l.transactionId !== null && transactionIds.includes(l.transactionId));
    },
    async ownerTransactions(filter) {
      return snapshot.txs.filter((t) => txMatchesFilter(t, filter));
    },
    async ownerTransactionsById(ids) {
      return snapshot.txs.filter((t) => ids.includes(t.id));
    },
    async groupMembers(installmentId) {
      return snapshot.txs.filter((t) => t.installmentId === installmentId);
    },
    async recurrings() {
      return snapshot.recurrings;
    },
  };
}

/** Visão = origem + efeitos já aplicados nesta execução (overlay). */
export function createDecisionView(source: DecisionSource, overlay: SimulationOverlay): DecisionView {
  const overlayLinkedTx = () => {
    const ids = new Set<string>();
    overlay.links.forEach((l) => {
      if (l.transactionId) ids.add(l.transactionId);
    });
    return ids;
  };
  const withOverlayLinks = (baseRows: LinkRow[], pred: (l: LinkRow) => boolean): LinkRow[] => {
    const out = new Map<string, LinkRow>();
    for (const l of baseRows) {
      const row = overlay.links.get(l.id) ?? l;
      if (pred(row)) out.set(row.id, row);
    }
    overlay.links.forEach((l) => {
      if (!out.has(l.id) && pred(l)) out.set(l.id, l);
    });
    return Array.from(out.values());
  };
  const withOverlayTxs = (baseRows: TxRow[], pred: (t: TxRow) => boolean): TxRow[] => {
    const linked = overlayLinkedTx();
    const out = new Map<string, TxRow>();
    for (const t of baseRows) {
      const src = overlay.txs.get(t.id) ?? t;
      const row = { ...src, hasPluggyLink: src.hasPluggyLink || t.hasPluggyLink || linked.has(t.id) };
      if (pred(row)) out.set(row.id, row);
    }
    overlay.txs.forEach((t) => {
      const row = { ...t, hasPluggyLink: t.hasPluggyLink || linked.has(t.id) };
      if (!out.has(row.id) && pred(row)) out.set(row.id, row);
    });
    return Array.from(out.values()).sort(
      (a, b) => a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  };

  return {
    async linkByExternalId(accountLinkId, externalId) {
      const rows = await source.linkByExternalId(accountLinkId, externalId);
      const merged = withOverlayLinks(rows, (l) => l.accountLinkId === accountLinkId && l.externalId === externalId);
      return merged[0] ?? null;
    },
    async links(filter) {
      return withOverlayLinks(await source.links(filter), (l) => linkMatchesFilter(l, filter));
    },
    async linksOfTransactions(transactionIds) {
      if (transactionIds.length === 0) return [];
      return withOverlayLinks(
        await source.linksOfTransactions(transactionIds),
        (l) => l.transactionId !== null && transactionIds.includes(l.transactionId)
      );
    },
    async ownerTransactions(filter) {
      return withOverlayTxs(await source.ownerTransactions(filter), (t) => txMatchesFilter(t, filter));
    },
    async ownerTransactionsById(ids) {
      if (ids.length === 0) return [];
      return withOverlayTxs(await source.ownerTransactionsById(ids), (t) => ids.includes(t.id));
    },
    async groupMembers(installmentId) {
      return withOverlayTxs(await source.groupMembers(installmentId), (t) => t.installmentId === installmentId);
    },
    async recurrings() {
      return (await source.recurrings()).map((r) => {
        const extra = overlay.recurringMonths.get(r.id);
        return extra ? { ...r, monthKeys: new Set([...Array.from(r.monthKeys), ...Array.from(extra)]) } : r;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Contexto da conta (linhagem, dono, origin pessoal)
// ---------------------------------------------------------------------------

export interface AccountContext {
  ownerUserId: string;
  accountLinkId: string;
  accountType: string;
  syncFromDay: string;
  /** Cartão: vencimento da última fatura importada por PDF (corte por fatura), ou null. */
  cutoffBillDueDay: string | null;
  originName: string;
  /** Conta atual primeiro, depois as que ela substitui. */
  lineageIds: string[];
  /** Nomes dos origins da linhagem (todos pessoais do dono). */
  originNames: string[];
}

const MAX_LINEAGE_DEPTH = 20;

/**
 * Resolve a conta e a linhagem, recusando qualquer link de outro usuário,
 * desativado ou com origin que não seja pessoal do dono.
 */
export async function loadAccountContext(
  db: ReadClient,
  ownerUserId: string,
  accountLinkId: string
): Promise<AccountContext> {
  if (!ownerUserId) throw new PluggyStoreError("owner_not_configured");
  const chain: Array<{
    id: string;
    syncFrom: Date;
    enabled: boolean;
    originName: string;
    accountType: string;
    cutoffBillDueDate: Date | null;
  }> = [];
  const visited = new Set<string>();
  let nextId: string | null = accountLinkId;
  while (nextId) {
    if (visited.has(nextId) || chain.length >= MAX_LINEAGE_DEPTH) throw new PluggyStoreError("invalid_lineage");
    visited.add(nextId);
    const link: Prisma.PluggyAccountLinkGetPayload<{ include: { origin: true } }> | null =
      await db.pluggyAccountLink.findUnique({ where: { id: nextId }, include: { origin: true } });
    if (!link) throw new PluggyStoreError(chain.length === 0 ? "account_link_not_found" : "invalid_lineage");
    if (link.userId !== ownerUserId) throw new PluggyStoreError("foreign_account_link");
    if (link.origin.userId !== ownerUserId || link.origin.spaceId !== null) {
      throw new PluggyStoreError("origin_not_personal");
    }
    chain.push({
      id: link.id,
      syncFrom: link.syncFrom,
      enabled: link.enabled,
      originName: link.origin.name,
      accountType: link.accountType,
      cutoffBillDueDate: link.cutoffBillDueDate,
    });
    nextId = link.replacesAccountLinkId;
  }
  const current = chain[0];
  if (!current.enabled) throw new PluggyStoreError("account_link_disabled");
  return {
    ownerUserId,
    accountLinkId: current.id,
    accountType: current.accountType,
    syncFromDay: businessDayKey(current.syncFrom),
    cutoffBillDueDay: current.cutoffBillDueDate ? businessDayKey(current.cutoffBillDueDate) : null,
    originName: current.originName,
    lineageIds: chain.map((c) => c.id),
    originNames: Array.from(new Set(chain.map((c) => c.originName))),
  };
}

export interface PersonalRule {
  keyword: string;
  categoryId: string;
}

/** Regras de categoria pessoais do dono (regra e categoria com spaceId null). */
export async function loadPersonalRules(db: ReadClient, ownerUserId: string): Promise<PersonalRule[]> {
  const rules = await db.categoryRule.findMany({
    where: { userId: ownerUserId, spaceId: null, category: { userId: ownerUserId, spaceId: null } },
    select: { keyword: true, categoryId: true },
    orderBy: { id: "asc" },
  });
  return rules;
}

/** Mesma regra de suggestCategory (palavra-chave contida, primeira que casar). */
export function suggestPersonalCategory(description: string, rules: PersonalRule[]): string | null {
  const upper = description.toUpperCase();
  for (const rule of rules) {
    if (upper.includes(rule.keyword.toUpperCase())) return rule.categoryId;
  }
  return null;
}

/** Mesma regra de importTransactions para recorrentes, restrita ao escopo pessoal. */
export function matchPersonalRecurring(
  record: Pick<PluggyStoreRecord, "description" | "ledgerDate">,
  originName: string,
  categoryId: string | null,
  recurrings: RecurringRow[]
): string | null {
  const month = monthKey(record.ledgerDate);
  const matches = recurrings.filter((r) => {
    if (r.origin !== originName) return false;
    if (r.categoryId && categoryId && r.categoryId !== categoryId) return false;
    if (!matchesRecurring(record.description, r.description)) return false;
    if (r.monthKeys.has(month)) return false;
    return true;
  });
  return matches.length === 1 ? matches[0].id : null;
}

// ---------------------------------------------------------------------------
// Decisão
// ---------------------------------------------------------------------------

export const NEW_TRANSACTION = "__new_transaction__";
/** Prefixo, no pareamento, de um vínculo cuja transação foi apagada de vez. */
export const TOMBSTONE_PREFIX = "tomb:";
export const INSTALLMENT_DATE_TOLERANCE_DAYS = 3;

export interface TransactionPlan {
  description: string;
  cents: number;
  day: string;
  categoryId: string | null;
  recurringExpenseId: string | null;
  installment: null | {
    n: number;
    t: number;
    /** Grupo existente a reutilizar, ou dados do grupo novo (null quando N = T sem grupo). */
    reuseGroupId: string | null;
    newGroupStartDay: string | null;
    /** Início do grupo (novo ou reutilizado), para a simulação. */
    groupStartDay: string | null;
    projections: Array<{ number: number; day: string; description: string }>;
  };
}

export interface DecisionPlan {
  outcome: RecordOutcome;
  disposition: LinkDisposition;
  reasonCode: string | null;
  divergence: boolean;
  /** Só atualiza lastSeenAt/sourceStatus/billId do vínculo existente. */
  touchLinkId: string | null;
  /** Transação já vinculada, quando touchLinkId. */
  touchTransactionId: string | null;
  /** No touch: grava também os novos valores da fonte no vínculo. */
  refreshSnapshot: boolean;
  /** Atualização condicional da transação local (só se ainda tiver expectAmount). */
  updateTransaction: TransactionUpdate | null;
  /** A adoção corrigiu o valor de uma projeção para o valor da fonte. */
  projectionAmountCorrected: boolean;
  /** Reclassificação tardia: soft delete (pelo sistema) da transação intocada e das projeções só dela. */
  softDelete: null | {
    transactionId: string;
    expectAmount: number;
    expectDate: Date;
    installmentId: string | null;
    installmentNumber: number | null;
  };
  /** Provisório que voltou: desfaz o soft delete feito pelo sistema (mesmo carimbo). */
  restore: null | { transactionId: string; systemDeletedAt: Date; installmentId: string | null };
  /** Registro antes "created" que a fonte passou a excluir (reclassified_excluded). */
  reclassified: boolean;
  /** Vínculo a gravar (novo, ou reaproveitado quando reuseLinkId). */
  link: null | { reuseLinkId: string | null; transactionId: string | null };
  supersedeLinkIds: string[];
  create: TransactionPlan | null;
}

export interface TransactionUpdate {
  id: string;
  cents: number;
  day: string;
  expectAmount: number;
  expectDate: Date;
  expectDay: string;
}

export interface BatchFacts {
  /** externalIds da leitura completa desta conta. */
  seenExternalIds: Set<string>;
  /** Pareamento de registros novos com transações canônicas ausentes (externalId → transactionId). */
  recreatedPairs: Map<string, string>;
  /** Pendentes do cartão entram como lançamento provisório (padrão ligado). */
  importPending: boolean;
  /** Cartão: billId → vencimento da fatura (YYYY-MM-DD), para o corte por fatura. */
  billDueDates: Map<string, string>;
}

/**
 * Corte (passo 4). Cartão com cutoffBillDueDate: vale a fatura — billId com
 * vencimento até o corte → before_cutoff; ciclo aberto (PENDING sem billId) ou
 * fatura posterior → segue, qualquer que seja a data; billId fora do mapa →
 * needs_review / unknown_bill; POSTED sem billId → needs_review / missing_bill. Sem corte por fatura: ledgerDate antes de syncFrom.
 */
export function cutoffDecision(
  record: Pick<PluggyStoreRecord, "billId" | "ledgerDate" | "sourceStatus">,
  ctx: Pick<AccountContext, "accountType" | "cutoffBillDueDay" | "syncFromDay">,
  billDueDates: Map<string, string>
): null | { disposition: "before_cutoff" | "needs_review"; reasonCode: string } {
  if (ctx.accountType === "CREDIT" && ctx.cutoffBillDueDay) {
    if (!record.billId) {
      // Sem billId só o ciclo aberto (PENDING) segue; lançado sem fatura não tem como ser cortado.
      return record.sourceStatus === "PENDING" ? null : { disposition: "needs_review", reasonCode: "missing_bill" };
    }
    const due = billDueDates.get(record.billId);
    if (!due) return { disposition: "needs_review", reasonCode: "unknown_bill" };
    return due <= ctx.cutoffBillDueDay ? { disposition: "before_cutoff", reasonCode: "before_cutoff_bill" } : null;
  }
  return record.ledgerDate < ctx.syncFromDay ? { disposition: "before_cutoff", reasonCode: "before_sync_from" } : null;
}

/** Chave de religação por campos: dia do lançamento + centavos + direção + descrição normalizada + N/T. */
export function recreationKey(
  r: Pick<PluggyStoreRecord, "ledgerDate" | "amountCents" | "direction" | "description" | "installmentNumber" | "totalInstallments">
): string {
  return [
    r.ledgerDate,
    r.amountCents,
    r.direction,
    normalizeDescription(r.description),
    r.installmentNumber ?? "",
    r.totalInstallments ?? "",
  ].join("|");
}

export function linkRecreationKey(l: LinkRow): string {
  return [
    l.ledgerDate,
    l.sourceAmountCents,
    l.direction,
    normalizeDescription(l.sourceDescription),
    l.installmentNumber ?? "",
    l.totalInstallments ?? "",
  ].join("|");
}

function linkOnly(
  outcome: Exclude<RecordOutcome, "unchanged" | "updated" | "restored">,
  reasonCode: string | null,
  reuseLinkId: string | null,
  supersedeLinkIds: string[],
  transactionId: string | null = null
): DecisionPlan {
  return {
    outcome,
    disposition: outcome,
    reasonCode,
    divergence: false,
    touchLinkId: null,
    touchTransactionId: null,
    refreshSnapshot: false,
    updateTransaction: null,
    projectionAmountCorrected: false,
    softDelete: null,
    restore: null,
    reclassified: false,
    link: { reuseLinkId, transactionId },
    supersedeLinkIds,
    create: null,
  };
}

/** Evidência de que a projeção é da mesma compra (Emenda 1, item 4). */
export function hasInstallmentEvidence(
  candidate: Pick<TxRow, "day" | "description" | "groupStartDay">,
  record: Pick<PluggyStoreRecord, "purchaseDate" | "description" | "ledgerDate">
): boolean {
  if (installmentBaseDescription(candidate.description) === installmentBaseDescription(record.description)) {
    return true;
  }
  // ledgerDate já é a data da compra + (N−1) meses quando há data da compra.
  if (Math.abs(dayDiff(candidate.day, record.ledgerDate)) <= INSTALLMENT_DATE_TOLERANCE_DAYS) return true;
  if (
    record.purchaseDate &&
    candidate.groupStartDay &&
    Math.abs(dayDiff(candidate.groupStartDay, record.purchaseDate)) <= INSTALLMENT_DATE_TOLERANCE_DAYS
  ) {
    return true;
  }
  return false;
}

/** Tolerância de valor das parcelas: até max(1, T) centavos (resto da divisão). */
export function installmentAmountTolerance(totalInstallments: number): number {
  return Math.max(1, totalInstallments);
}

/** Passo 6 (pura): escolhe a projeção a adotar, ou manda para revisão. */
export function evaluateInstallmentCandidates(
  record: Pick<PluggyStoreRecord, "purchaseDate" | "description" | "ledgerDate">,
  candidates: TxRow[]
): { kind: "none" } | { kind: "adopt"; transactionId: string } | { kind: "review"; reasonCode: string } {
  if (candidates.length === 0) return { kind: "none" };
  const evidenced = candidates.filter((c) => hasInstallmentEvidence(c, record));
  if (evidenced.length === 1) return { kind: "adopt", transactionId: evidenced[0].id };
  if (evidenced.length > 1) return { kind: "review", reasonCode: "ambiguous_installment" };
  return { kind: "review", reasonCode: "unconfirmed_installment" };
}

/** Passo 7 (pura): lançamento legado igual. */
export function evaluateLegacyCandidates(
  record: Pick<PluggyStoreRecord, "description">,
  candidates: TxRow[]
): { kind: "none" } | { kind: "adopt"; transactionId: string } | { kind: "review"; reasonCode: string } {
  const target = normalizeDescription(record.description);
  const exact = candidates.filter((c) => normalizeDescription(c.description) === target);
  if (exact.length === 1) return { kind: "adopt", transactionId: exact[0].id };
  if (exact.length > 1) return { kind: "review", reasonCode: "ambiguous_legacy" };
  if (candidates.some((c) => !c.deleted)) return { kind: "review", reasonCode: "possible_duplicate" };
  return { kind: "none" };
}

function purchaseKeyOfRecord(r: PluggyStoreRecord): string | null {
  if (r.purchaseDate) return r.purchaseDate;
  if (r.installmentNumber) return addMonthsToDay(r.sourceDate, -(r.installmentNumber - 1));
  return null;
}

function purchaseKeyOfLink(l: LinkRow): string | null {
  if (l.purchaseDate) return l.purchaseDate;
  if (l.installmentNumber) return addMonthsToDay(l.sourceDate, -(l.installmentNumber - 1));
  return null;
}

async function findPurchaseGroup(
  view: DecisionView,
  ctx: AccountContext,
  record: PluggyStoreRecord
): Promise<{ kind: "none" } | { kind: "ambiguous" } | { kind: "one"; groupId: string; members: TxRow[] }> {
  const t = record.totalInstallments as number;
  const purchaseKey = purchaseKeyOfRecord(record);
  if (!purchaseKey) return { kind: "none" };
  const base = installmentBaseDescription(record.description);
  const links = await view.links({
    lineageIds: ctx.lineageIds,
    totalInstallments: t,
    amountCents: record.amountCents,
    amountTolerance: installmentAmountTolerance(t),
  });
  const relevant = links.filter((l) => {
    if (!l.transactionId) return false;
    if (installmentBaseDescription(l.sourceDescription) !== base) return false;
    // Identidade do grupo: linhagem + data da compra + T + descrição normalizada.
    if (record.purchaseDate && l.purchaseDate) return l.purchaseDate === record.purchaseDate;
    const key = purchaseKeyOfLink(l);
    return key !== null && Math.abs(dayDiff(key, purchaseKey)) <= INSTALLMENT_DATE_TOLERANCE_DAYS;
  });
  const txIds = Array.from(new Set(relevant.map((l) => l.transactionId as string)));
  const txs = await view.ownerTransactionsById(txIds);
  // groupStartDay só é preenchido para grupos pessoais do dono.
  const groupIds = Array.from(
    new Set(txs.filter((x) => x.installmentId && x.groupStartDay !== null).map((x) => x.installmentId as string))
  );
  // Só serve um grupo da mesma compra que ainda não tenha a parcela N; com
  // todos já tendo N, é outra compra idêntica e ganha grupo próprio.
  const open: Array<{ groupId: string; members: TxRow[] }> = [];
  for (const groupId of groupIds) {
    const members = await view.groupMembers(groupId);
    if (!members.some((m) => m.currentInstallment === record.installmentNumber)) open.push({ groupId, members });
  }
  if (open.length === 0) return { kind: "none" };
  if (open.length > 1) return { kind: "ambiguous" };
  return { kind: "one", groupId: open[0].groupId, members: open[0].members };
}

async function evaluateFromStep3(
  view: DecisionView,
  ctx: AccountContext,
  record: PluggyStoreRecord,
  facts: BatchFacts,
  rules: PersonalRule[],
  reuseLinkId: string | null,
  supersede: LinkRow[]
): Promise<DecisionPlan> {
  const supersedeIds = () => supersede.map((l) => l.id);

  // 3. destino definido pelo mapeamento (pendente vira provisório com importPending)
  const pre = effectivePreDisposition(record, facts.importPending);
  if (pre) {
    return linkOnly(pre.disposition, pre.reasonCode, reuseLinkId, supersedeIds());
  }
  // Defesa em profundidade: só entra no razão valor em BRL.
  if (record.currencyCode !== "BRL") {
    return linkOnly("needs_review", "foreign_currency", reuseLinkId, supersedeIds());
  }
  // 4. corte (por fatura no cartão com cutoffBillDueDate; por data nos demais)
  const cut = cutoffDecision(record, ctx, facts.billDueDates);
  if (cut) {
    return linkOnly(cut.disposition, cut.reasonCode, reuseLinkId, supersedeIds());
  }

  const cents = signedCents(record);

  // 5. registro recriado: par calculado no início do lote, reconferido aqui
  const pairedTxId = facts.recreatedPairs.get(record.externalId);
  if (pairedTxId?.startsWith(TOMBSTONE_PREFIX)) {
    // O lançamento local de um registro igual foi apagado de vez: não recriar sozinho.
    const tombLinkId = pairedTxId.slice(TOMBSTONE_PREFIX.length);
    return linkOnly("needs_review", "linked_transaction_deleted", reuseLinkId, [...supersedeIds(), tombLinkId]);
  }
  if (pairedTxId) {
    const aliases = await view.linksOfTransactions([pairedTxId]);
    const present = aliases.some(
      (l) => l.accountLinkId === ctx.accountLinkId && facts.seenExternalIds.has(l.externalId)
    );
    const owned = await view.ownerTransactionsById([pairedTxId]);
    if (!present && owned.length === 1) {
      const old = aliases.filter((l) => l.disposition !== "superseded" && ctx.lineageIds.includes(l.accountLinkId));
      return linkOnly("adopted", "recreated_match", reuseLinkId, [...supersedeIds(), ...old.map((l) => l.id)], pairedTxId);
    }
  }

  // 6. parcela N/T: projeção existente, com evidência da compra
  const n = record.installmentNumber;
  const t = record.totalInstallments;
  if (n !== null && t !== null) {
    const candidates = await view.ownerTransactions({
      origins: ctx.originNames,
      cents,
      tolerance: installmentAmountTolerance(t),
      installment: { n, t },
      includeDeleted: false,
      unlinkedOnly: true,
    });
    const r6 = evaluateInstallmentCandidates(record, candidates);
    if (r6.kind === "adopt") {
      const plan = linkOnly("adopted", "installment_projection", reuseLinkId, supersedeIds(), r6.transactionId);
      const chosen = candidates.find((c) => c.id === r6.transactionId) as TxRow;
      // A projeção adotada passa a ter o valor e a data da fonte.
      if (chosen.cents !== cents || chosen.day !== record.ledgerDate) {
        plan.updateTransaction = {
          id: chosen.id,
          cents,
          day: record.ledgerDate,
          expectAmount: chosen.amount,
          expectDate: chosen.date,
          expectDay: chosen.day,
        };
        plan.projectionAmountCorrected = chosen.cents !== cents;
      }
      return plan;
    }
    if (r6.kind === "review") {
      return linkOnly("needs_review", r6.reasonCode, reuseLinkId, supersedeIds());
    }
  }

  // 7. lançamento legado igual (inclui apagados, que são adotados sem ressuscitar)
  const legacy = await view.ownerTransactions({
    origins: ctx.originNames,
    cents,
    tolerance: 0,
    day: record.ledgerDate,
    includeDeleted: true,
    unlinkedOnly: true,
  });
  const r7 = evaluateLegacyCandidates(record, legacy);
  if (r7.kind === "adopt") {
    return linkOnly("adopted", "legacy_match", reuseLinkId, supersedeIds(), r7.transactionId);
  }
  if (r7.kind === "review") {
    return linkOnly("needs_review", r7.reasonCode, reuseLinkId, supersedeIds());
  }

  // 8. criação (escopo pessoal do dono)
  const categoryId = suggestPersonalCategory(record.description, rules);
  const recurringExpenseId = matchPersonalRecurring(record, ctx.originName, categoryId, await view.recurrings());
  let installment: TransactionPlan["installment"] = null;
  if (n !== null && t !== null) {
    const group = await findPurchaseGroup(view, ctx, record);
    if (group.kind === "ambiguous") {
      return linkOnly("needs_review", "ambiguous_installment_group", reuseLinkId, supersedeIds());
    }
    const projectionNumbers: number[] = [];
    let reuseGroupId: string | null = null;
    let newGroupStartDay: string | null = null;
    let groupStartDay: string | null = null;
    if (group.kind === "one") {
      const existingNumbers = new Set(group.members.map((m) => m.currentInstallment));
      reuseGroupId = group.groupId;
      groupStartDay = group.members.find((m) => m.groupStartDay)?.groupStartDay ?? null;
      for (let k = n + 1; k <= t; k++) if (!existingNumbers.has(k)) projectionNumbers.push(k);
    } else if (n < t) {
      // Sem grupo da mesma compra ainda sem a parcela N: compra nova (inclusive idêntica a outra).
      newGroupStartDay = record.purchaseDate ?? record.ledgerDate;
      groupStartDay = newGroupStartDay;
      for (let k = n + 1; k <= t; k++) projectionNumbers.push(k);
    }
    installment = {
      n,
      t,
      reuseGroupId,
      newGroupStartDay,
      groupStartDay,
      projections: projectionNumbers.map((k) => ({
        number: k,
        day: projectionDay(record, k),
        description: replaceInstallmentNumber(record.description, k, t),
      })),
    };
  }
  return {
    outcome: "created",
    disposition: "created",
    reasonCode: null,
    divergence: false,
    touchLinkId: null,
    touchTransactionId: null,
    refreshSnapshot: false,
    updateTransaction: null,
    projectionAmountCorrected: false,
    softDelete: null,
    restore: null,
    reclassified: false,
    link: { reuseLinkId, transactionId: NEW_TRANSACTION },
    supersedeLinkIds: supersedeIds(),
    create: {
      description: record.description,
      cents,
      day: record.ledgerDate,
      categoryId,
      recurringExpenseId,
      installment,
    },
  };
}

/** Data da projeção K: data da compra + (K−1) meses; sem data da compra, a partir do lançamento. */
export function projectionDay(
  record: Pick<PluggyStoreRecord, "purchaseDate" | "ledgerDate" | "installmentNumber">,
  k: number
): string {
  if (record.purchaseDate) return addMonthsToDay(record.purchaseDate, k - 1);
  return addMonthsToDay(record.ledgerDate, k - (record.installmentNumber ?? 1));
}

/** Com importPending, o "pending" do mapeamento deixa de existir: vira lançamento provisório. */
export function effectivePreDisposition(
  record: Pick<PluggyStoreRecord, "preDisposition">,
  importPending: boolean
): PluggyStoreRecord["preDisposition"] {
  const pre = record.preDisposition;
  if (pre && importPending && pre.disposition === "pending") return null;
  return pre;
}

const REEVALUATED_DISPOSITIONS = new Set<LinkDisposition>(["pending", "needs_review", "before_cutoff"]);

function touchPlan(existing: LinkRow): DecisionPlan {
  return {
    outcome: "unchanged",
    disposition: existing.disposition,
    reasonCode: existing.reasonCode,
    divergence: false,
    touchLinkId: existing.id,
    touchTransactionId: existing.transactionId,
    refreshSnapshot: false,
    updateTransaction: null,
    projectionAmountCorrected: false,
    softDelete: null,
    restore: null,
    reclassified: false,
    link: null,
    supersedeLinkIds: [],
    create: null,
  };
}

/**
 * Transições de um registro já conhecido que não são "mesmo destino de antes":
 * - excluído que deixa de ser → needs_review / exclusion_reverted (nunca cria sozinho);
 * - created que a fonte passa a excluir (reclassificação tardia das regras de
 *   lote) → soft delete pelo sistema se a transação está intocada (valor e data
 *   iguais aos últimos vistos e categoria não manual); editada → divergence;
 * - provisório que tinha sumido e voltou → reativa o vínculo e desfaz o soft
 *   delete só se o carimbo ainda for o do sistema.
 */
async function decideKnownTransitions(
  view: DecisionView,
  record: PluggyStoreRecord,
  facts: BatchFacts,
  existing: LinkRow
): Promise<DecisionPlan | null> {
  const pre = effectivePreDisposition(record, facts.importPending);
  const excludedNow = pre?.disposition === "excluded" ? pre : null;

  if (existing.disposition === "excluded") {
    if (excludedNow) {
      return linkOnly("excluded", excludedNow.reasonCode, existing.id, [], existing.transactionId);
    }
    return linkOnly("needs_review", "exclusion_reverted", existing.id, [], existing.transactionId);
  }
  // Destino fixo: o lançamento local de um registro igual foi apagado de vez.
  // Nunca volta a ser criado sozinho (nem na execução seguinte).
  if (existing.disposition === "needs_review" && existing.reasonCode === "linked_transaction_deleted") {
    return linkOnly("needs_review", "linked_transaction_deleted", existing.id, [], existing.transactionId);
  }
  if (existing.disposition === "needs_review" && existing.reasonCode === "exclusion_reverted") {
    return excludedNow
      ? linkOnly("excluded", excludedNow.reasonCode, existing.id, [], existing.transactionId)
      : linkOnly("needs_review", "exclusion_reverted", existing.id, [], existing.transactionId);
  }

  if (existing.disposition === "created" && existing.transactionId && excludedNow) {
    const [tx] = await view.ownerTransactionsById([existing.transactionId]);
    const plan = linkOnly("excluded", excludedNow.reasonCode, existing.id, [], existing.transactionId);
    plan.reclassified = true;
    if (!tx || tx.deleted) return plan;
    const previousCents = signedCents({
      type: record.type,
      direction: existing.direction as PluggyStoreRecord["direction"],
      amountCents: existing.sourceAmountCents,
    });
    if (tx.cents === previousCents && tx.day === existing.ledgerDate && tx.categorySource !== "manual") {
      plan.softDelete = {
        transactionId: tx.id,
        expectAmount: tx.amount,
        expectDate: tx.date,
        installmentId: tx.installmentId,
        installmentNumber: existing.installmentNumber,
      };
      return plan;
    }
    return { ...touchPlan(existing), divergence: true };
  }
  // Lançamento adotado (era do usuário) que a fonte passa a excluir: não apaga, só sinaliza.
  if (existing.disposition === "adopted" && existing.transactionId && excludedNow) {
    return { ...touchPlan(existing), divergence: true };
  }

  if (
    existing.disposition === "superseded" &&
    !existing.transactionId &&
    (existing.reasonCode === "provisional_vanished" || existing.reasonCode === "provisional_vanished_adopted")
  ) {
    // O provisório voltou, mas o lançamento dele já foi purgado da lixeira.
    return linkOnly("needs_review", "linked_transaction_deleted", existing.id, []);
  }

  if (
    existing.disposition === "superseded" &&
    existing.transactionId &&
    (existing.reasonCode === "provisional_vanished" || existing.reasonCode === "provisional_vanished_adopted")
  ) {
    const [tx] = await view.ownerTransactionsById([existing.transactionId]);
    const plan = linkOnly(
      existing.reasonCode === "provisional_vanished" ? "created" : "adopted",
      "provisional_returned",
      existing.id,
      [],
      existing.transactionId
    );
    const systemDeleted =
      !!tx && !!existing.systemDeletedAt && !!tx.deletedAt && tx.deletedAt.getTime() === existing.systemDeletedAt.getTime();
    // "restored" só quando o lançamento volta a valer; apagado pelo usuário continua apagado.
    plan.outcome = systemDeleted || (tx && !tx.deleted) ? "restored" : "unchanged";
    if (tx && systemDeleted) {
      plan.restore = {
        transactionId: tx.id,
        systemDeletedAt: existing.systemDeletedAt as Date,
        installmentId: tx.installmentId,
      };
    }
    const su = await sourceUpdate(view, existing, record, systemDeleted);
    plan.updateTransaction = su.update;
    plan.divergence = su.divergence;
    return plan;
  }
  return null;
}

/**
 * Atualização a partir da fonte: se a transação local ainda tem exatamente o
 * valor e a data vistos da última vez, recebe os novos; se foi editada, só
 * registra divergência. Categoria e demais campos nunca são tocados.
 */
async function sourceUpdate(
  view: DecisionView,
  previous: LinkRow,
  record: PluggyStoreRecord,
  assumeRestored = false
): Promise<{ update: TransactionUpdate | null; divergence: boolean; refresh: boolean }> {
  const changed =
    previous.sourceAmountCents !== record.amountCents ||
    previous.ledgerDate !== record.ledgerDate ||
    previous.sourceDate !== record.sourceDate;
  if (!changed || !previous.transactionId) return { update: null, divergence: false, refresh: false };
  const [tx] = await view.ownerTransactionsById([previous.transactionId]);
  if (!tx || (tx.deleted && !assumeRestored)) return { update: null, divergence: false, refresh: false };
  const previousCents = signedCents({
    type: record.type,
    direction: previous.direction as PluggyStoreRecord["direction"],
    amountCents: previous.sourceAmountCents,
  });
  if (tx.cents !== previousCents || tx.day !== previous.ledgerDate) {
    return { update: null, divergence: true, refresh: false };
  }
  const cents = signedCents(record);
  const update =
    cents !== tx.cents || record.ledgerDate !== tx.day
      ? { id: tx.id, cents, day: record.ledgerDate, expectAmount: tx.amount, expectDate: tx.date, expectDay: tx.day }
      : null;
  return { update, divergence: false, refresh: true };
}

/**
 * Decide o destino de um registro (contrato v2 com as Emendas 1 e 2).
 * Só lê, através da visão; não grava nada.
 */
export async function decideRecord(
  view: DecisionView,
  ctx: AccountContext,
  record: PluggyStoreRecord,
  facts: BatchFacts,
  rules: PersonalRule[]
): Promise<DecisionPlan> {
  // 1. identidade canônica pelo externalId
  const existing = await view.linkByExternalId(ctx.accountLinkId, record.externalId);
  if (existing) {
    const special = await decideKnownTransitions(view, record, facts, existing);
    if (special) return special;
    if (existing.transactionId === null && REEVALUATED_DISPOSITIONS.has(existing.disposition)) {
      // Sem lançamento local: segue pelos passos 3 a 8 com os dados atuais.
      return evaluateFromStep3(view, ctx, record, facts, rules, existing.id, []);
    }
    const su =
      existing.disposition === "superseded"
        ? { update: null, divergence: false, refresh: false }
        : await sourceUpdate(view, existing, record);
    return { ...touchPlan(existing), outcome: su.update ? "updated" : "unchanged", divergence: su.divergence, refreshSnapshot: su.refresh, updateTransaction: su.update };
  }

  // 2. identidade canônica pelo providerId (não nulo) na linhagem da conta
  if (record.providerId !== null) {
    const sameProvider = await view.links({ lineageIds: ctx.lineageIds, providerId: record.providerId });
    if (sameProvider.length > 0) {
      const aliasPresent = sameProvider.some(
        (l) => l.accountLinkId === ctx.accountLinkId && facts.seenExternalIds.has(l.externalId)
      );
      const txIds = Array.from(new Set(sameProvider.map((l) => l.transactionId).filter((x): x is string => !!x)));
      const active = sameProvider.filter((l) => l.disposition !== "superseded");
      const lostTransaction = sameProvider.some(
        (l) => l.transactionId === null && (l.disposition === "created" || l.disposition === "adopted")
      );
      if (aliasPresent || txIds.length > 1) {
        return linkOnly("needs_review", "ambiguous_provider_id", null, []);
      }
      if (txIds.length === 1) {
        const owned = await view.ownerTransactionsById(txIds);
        if (owned.length !== 1) return linkOnly("needs_review", "provider_id_not_personal", null, []);
        const plan = linkOnly("adopted", "provider_id_match", null, active.map((l) => l.id), txIds[0]);
        const previous = (active.length > 0 ? active : sameProvider).find((l) => l.transactionId === txIds[0]);
        if (previous) {
          const su = await sourceUpdate(view, previous, record);
          plan.updateTransaction = su.update;
          plan.divergence = su.divergence;
        }
        return plan;
      }
      if (lostTransaction) {
        // O lançamento local foi apagado de vez: não recriar.
        return linkOnly("needs_review", "linked_transaction_deleted", null, []);
      }
      return evaluateFromStep3(view, ctx, record, facts, rules, null, active);
    }
  }

  return evaluateFromStep3(view, ctx, record, facts, rules, null, []);
}

// ---------------------------------------------------------------------------
// Execução do plano (gravação real) e aplicação em memória (simulação)
// ---------------------------------------------------------------------------

export type PluggyWriteHook = (step: string) => Promise<void> | void;

function linkSnapshot(record: PluggyStoreRecord) {
  return {
    providerId: record.providerId,
    sourceStatus: record.sourceStatus,
    sourceDate: dayToStoredDate(record.sourceDate),
    ledgerDate: dayToStoredDate(record.ledgerDate),
    purchaseDate: record.purchaseDate ? dayToStoredDate(record.purchaseDate) : null,
    sourceAmountCents: record.amountCents,
    currencyCode: record.currencyCode,
    direction: record.direction,
    sourceDescription: record.description,
    billId: record.billId,
    creditKind: record.creditKind,
    installmentNumber: record.installmentNumber,
    totalInstallments: record.totalInstallments,
  };
}

function linkRowFromRecord(
  id: string,
  accountLinkId: string,
  record: PluggyStoreRecord,
  disposition: LinkDisposition,
  reasonCode: string | null,
  transactionId: string | null
): LinkRow {
  return {
    id,
    accountLinkId,
    externalId: record.externalId,
    providerId: record.providerId,
    transactionId,
    disposition,
    reasonCode,
    sourceStatus: record.sourceStatus,
    sourceDate: record.sourceDate,
    ledgerDate: record.ledgerDate,
    purchaseDate: record.purchaseDate,
    sourceAmountCents: record.amountCents,
    currencyCode: record.currencyCode,
    direction: record.direction,
    sourceDescription: record.description,
    billId: record.billId,
    creditKind: record.creditKind,
    installmentNumber: record.installmentNumber,
    totalInstallments: record.totalInstallments,
    systemDeletedAt: null,
  };
}

/** O vínculo já guarda exatamente o que a fonte trouxe agora? */
export function linkSnapshotEquals(l: LinkRow, r: PluggyStoreRecord): boolean {
  return (
    l.providerId === r.providerId &&
    l.sourceStatus === r.sourceStatus &&
    l.sourceDate === r.sourceDate &&
    l.ledgerDate === r.ledgerDate &&
    l.purchaseDate === r.purchaseDate &&
    l.sourceAmountCents === r.amountCents &&
    l.currencyCode === r.currencyCode &&
    l.direction === r.direction &&
    l.sourceDescription === r.description &&
    l.billId === r.billId &&
    l.creditKind === r.creditKind &&
    l.installmentNumber === r.installmentNumber &&
    l.totalInstallments === r.totalInstallments
  );
}

interface AppliedEffect {
  transactionId: string | null;
  projectionsCreated: number;
  groupCreated: boolean;
}

/** Atualização condicional: só grava se a transação ainda tiver o valor lido sob o lock. */
async function applyTransactionUpdate(tx: PluggyTxClient, u: TransactionUpdate): Promise<void> {
  const res = await tx.transaction.updateMany({
    where: { id: u.id, amount: u.expectAmount, date: u.expectDate, deletedAt: null },
    data: { amount: u.cents / 100, ...(u.day !== u.expectDay ? { date: dayToStoredDate(u.day) } : {}) },
  });
  if (res.count !== 1) throw new PluggyStoreError("concurrent_edit");
}

async function executePlan(
  tx: PluggyTxClient,
  ctx: AccountContext,
  record: PluggyStoreRecord,
  plan: DecisionPlan,
  now: Date,
  hook?: PluggyWriteHook
): Promise<AppliedEffect> {
  if (plan.touchLinkId) {
    if (plan.updateTransaction) await applyTransactionUpdate(tx, plan.updateTransaction);
    // Com divergência, valor e datas vistos antes ficam no vínculo (o alerta se repete).
    const snap = linkSnapshot(record);
    await tx.pluggyTransactionLink.update({
      where: { id: plan.touchLinkId },
      data: plan.divergence
        ? { ...snap, sourceAmountCents: undefined, sourceDate: undefined, ledgerDate: undefined, lastSeenAt: now }
        : { ...snap, lastSeenAt: now },
    });
    await hook?.("touch");
    return { transactionId: plan.touchTransactionId, projectionsCreated: 0, groupCreated: false };
  }
  if (!plan.link) throw new PluggyStoreError("invalid_plan");

  if (plan.supersedeLinkIds.length > 0) {
    await tx.pluggyTransactionLink.updateMany({
      where: { id: { in: plan.supersedeLinkIds }, disposition: { not: "superseded" } },
      data: { disposition: "superseded" },
    });
  }
  if (plan.restore) {
    const r = plan.restore;
    const restored = await tx.transaction.updateMany({
      where: { id: r.transactionId, userId: ctx.ownerUserId, spaceId: null, deletedAt: r.systemDeletedAt },
      data: { deletedAt: null },
    });
    if (restored.count !== 1) throw new PluggyStoreError("concurrent_edit");
    if (r.installmentId) {
      await tx.transaction.updateMany({
        where: { installmentId: r.installmentId, userId: ctx.ownerUserId, spaceId: null, deletedAt: r.systemDeletedAt, pluggyLinks: { none: {} } },
        data: { deletedAt: null },
      });
    }
  }
  if (plan.updateTransaction) await applyTransactionUpdate(tx, plan.updateTransaction);
  let systemDeletedAt: Date | null | undefined = plan.restore ? null : undefined;
  if (plan.softDelete) {
    const d = plan.softDelete;
    const res = await tx.transaction.updateMany({
      where: { id: d.transactionId, amount: d.expectAmount, date: d.expectDate, deletedAt: null, OR: [{ categorySource: null }, { categorySource: { not: "manual" } }] },
      data: { deletedAt: now },
    });
    if (res.count !== 1) throw new PluggyStoreError("concurrent_edit");
    systemDeletedAt = now;
    if (d.installmentId && d.installmentNumber !== null) {
      const othersLinked = await tx.transaction.count({
        where: {
          installmentId: d.installmentId,
          id: { not: d.transactionId },
          pluggyLinks: { some: { disposition: { not: "superseded" } } },
        },
      });
      if (othersLinked === 0) {
        await tx.transaction.updateMany({
          where: {
            installmentId: d.installmentId,
            userId: ctx.ownerUserId,
            spaceId: null,
            currentInstallment: { gt: d.installmentNumber },
            deletedAt: null,
            pluggyLinks: { none: {} },
          },
          data: { deletedAt: now },
        });
      }
    }
  }

  let transactionId = plan.link.transactionId;
  let projectionsCreated = 0;
  let groupCreated = false;
  const c = plan.create;
  if (c) {
    let groupId: string | null = null;
    if (c.installment?.reuseGroupId) {
      groupId = c.installment.reuseGroupId;
    } else if (c.installment?.newGroupStartDay) {
      const unit = Math.abs(c.cents) / 100;
      const group = await tx.installment.create({
        data: {
          description: c.description,
          totalAmount: unit * c.installment.t,
          totalInstallments: c.installment.t,
          installmentAmount: unit,
          startDate: dayToStoredDate(c.installment.newGroupStartDay),
          origin: ctx.originName,
          userId: ctx.ownerUserId,
          spaceId: null,
        },
      });
      groupId = group.id;
      groupCreated = true;
      await hook?.("group");
    }
    const common = {
      userId: ctx.ownerUserId,
      spaceId: null,
      amount: c.cents / 100,
      type: record.type,
      origin: ctx.originName,
      categoryId: c.categoryId,
      categorySource: c.categoryId ? "rule" : null,
    };
    const created = await tx.transaction.create({
      data: {
        ...common,
        description: c.description,
        date: dayToStoredDate(c.day),
        isFixed: c.recurringExpenseId !== null,
        recurringExpenseId: c.recurringExpenseId,
        isInstallment: c.installment !== null,
        installmentId: groupId,
        currentInstallment: c.installment?.n ?? null,
        totalInstallments: c.installment?.t ?? null,
      },
      select: { id: true },
    });
    transactionId = created.id;
    await hook?.("transaction");
    for (const p of c.installment?.projections ?? []) {
      if (!groupId) break;
      // Conferência sob o lock: a projeção K deste grupo não pode existir.
      const exists = await tx.transaction.findFirst({
        where: { installmentId: groupId, currentInstallment: p.number },
        select: { id: true },
      });
      if (exists) continue;
      await tx.transaction.create({
        data: {
          ...common,
          description: p.description,
          date: dayToStoredDate(p.day),
          isFixed: false,
          isInstallment: true,
          installmentId: groupId,
          currentInstallment: p.number,
          totalInstallments: c.installment!.t,
        },
      });
      projectionsCreated++;
      await hook?.("projection:" + p.number);
    }
  }
  if (transactionId === NEW_TRANSACTION) throw new PluggyStoreError("invalid_plan");

  const data = {
    ...linkSnapshot(record),
    transactionId,
    disposition: plan.disposition,
    reasonCode: plan.reasonCode,
    lastSeenAt: now,
    ...(systemDeletedAt !== undefined ? { systemDeletedAt } : {}),
  };
  if (plan.link.reuseLinkId) {
    await tx.pluggyTransactionLink.update({ where: { id: plan.link.reuseLinkId }, data });
  } else {
    await tx.pluggyTransactionLink.create({
      data: { ...data, accountLinkId: ctx.accountLinkId, externalId: record.externalId },
    });
  }
  await hook?.("link");
  return { transactionId, projectionsCreated, groupCreated };
}

async function applyUpdateToOverlay(view: DecisionView, overlay: SimulationOverlay, u: TransactionUpdate) {
  const [row] = await view.ownerTransactionsById([u.id]);
  if (row) {
    overlay.txs.set(u.id, { ...row, cents: u.cents, amount: u.cents / 100, day: u.day, date: dayToStoredDate(u.day) });
  }
}

async function applyPlanToOverlay(
  view: DecisionView,
  overlay: SimulationOverlay,
  ctx: AccountContext,
  record: PluggyStoreRecord,
  plan: DecisionPlan,
  now: Date
): Promise<AppliedEffect> {
  if (plan.touchLinkId) {
    if (plan.updateTransaction) await applyUpdateToOverlay(view, overlay, plan.updateTransaction);
    const current = await view.linkByExternalId(ctx.accountLinkId, record.externalId);
    if (current) {
      const row = linkRowFromRecord(
        current.id,
        current.accountLinkId,
        record,
        current.disposition,
        current.reasonCode,
        current.transactionId
      );
      overlay.links.set(
        current.id,
        plan.divergence
          ? {
              ...row,
              sourceAmountCents: current.sourceAmountCents,
              sourceDate: current.sourceDate,
              ledgerDate: current.ledgerDate,
            }
          : row
      );
    }
    return { transactionId: plan.touchTransactionId, projectionsCreated: 0, groupCreated: false };
  }
  if (!plan.link) throw new PluggyStoreError("invalid_plan");
  const nextId = (prefix: string) => prefix + ++overlay.seq;
  const stamp = () => new Date(now.getTime() + overlay.seq);

  if (plan.supersedeLinkIds.length > 0) {
    const rows = await view.links({ lineageIds: ctx.lineageIds });
    for (const row of rows) {
      if (plan.supersedeLinkIds.includes(row.id) && row.disposition !== "superseded") {
        overlay.links.set(row.id, { ...row, disposition: "superseded" });
      }
    }
  }
  if (plan.restore) {
    const r = plan.restore;
    const affected = [
      ...(await view.ownerTransactionsById([r.transactionId])),
      ...(r.installmentId ? (await view.groupMembers(r.installmentId)).filter((m) => !m.hasPluggyLink) : []),
    ];
    for (const row of affected) {
      if (row.deletedAt && row.deletedAt.getTime() === r.systemDeletedAt.getTime()) {
        overlay.txs.set(row.id, { ...row, deleted: false, deletedAt: null });
      }
    }
  }
  if (plan.updateTransaction) await applyUpdateToOverlay(view, overlay, plan.updateTransaction);
  if (plan.softDelete) {
    const d = plan.softDelete;
    const [row] = await view.ownerTransactionsById([d.transactionId]);
    if (row) overlay.txs.set(row.id, { ...row, deleted: true, deletedAt: now });
    if (d.installmentId && d.installmentNumber !== null) {
      const members = await view.groupMembers(d.installmentId);
      const othersLinked = members.some((m) => m.id !== d.transactionId && m.hasPluggyLink);
      if (!othersLinked) {
        for (const m of members) {
          if (!m.hasPluggyLink && !m.deleted && (m.currentInstallment ?? 0) > d.installmentNumber) {
            overlay.txs.set(m.id, { ...m, deleted: true, deletedAt: now });
          }
        }
      }
    }
  }

  let transactionId = plan.link.transactionId;
  let projectionsCreated = 0;
  let groupCreated = false;
  const c = plan.create;
  if (c) {
    let groupId: string | null = null;
    if (c.installment?.reuseGroupId) groupId = c.installment.reuseGroupId;
    else if (c.installment?.newGroupStartDay) {
      groupId = nextId("sim_group_");
      groupCreated = true;
    }
    const base = {
      cents: c.cents,
      amount: c.cents / 100,
      origin: ctx.originName,
      categorySource: c.categoryId ? "rule" : null,
      deletedAt: null,
      deleted: false,
      groupStartDay: c.installment?.groupStartDay ?? null,
      recurringExpenseId: null as string | null,
    };
    const existing = groupId ? new Set((await view.groupMembers(groupId)).map((m) => m.currentInstallment)) : new Set();
    transactionId = nextId("sim_tx_");
    overlay.txs.set(transactionId, {
      ...base,
      id: transactionId,
      description: c.description,
      day: c.day,
      date: dayToStoredDate(c.day),
      isInstallment: c.installment !== null,
      currentInstallment: c.installment?.n ?? null,
      totalInstallments: c.installment?.t ?? null,
      installmentId: groupId,
      hasPluggyLink: true,
      recurringExpenseId: c.recurringExpenseId,
      createdAt: stamp(),
    });
    if (c.recurringExpenseId) {
      const months = overlay.recurringMonths.get(c.recurringExpenseId) ?? new Set<string>();
      months.add(monthKey(c.day));
      overlay.recurringMonths.set(c.recurringExpenseId, months);
    }
    if (groupId) {
      for (const p of c.installment?.projections ?? []) {
        if (existing.has(p.number)) continue;
        const id = nextId("sim_tx_");
        overlay.txs.set(id, {
          ...base,
          id,
          description: p.description,
          day: p.day,
          date: dayToStoredDate(p.day),
          isInstallment: true,
          currentInstallment: p.number,
          totalInstallments: c.installment!.t,
          installmentId: groupId,
          hasPluggyLink: false,
          createdAt: stamp(),
        });
        projectionsCreated++;
      }
    }
  }

  const linkId = plan.link.reuseLinkId ?? nextId("sim_link_");
  overlay.links.set(linkId, {
    ...linkRowFromRecord(linkId, ctx.accountLinkId, record, plan.disposition, plan.reasonCode, transactionId),
    systemDeletedAt: plan.softDelete ? now : null,
  });
  return { transactionId, projectionsCreated, groupCreated };
}

// ---------------------------------------------------------------------------
// Processamento de um lote (leitura completa de uma conta)
// ---------------------------------------------------------------------------

export interface RecordResult {
  externalId: string;
  outcome: RecordOutcome;
  disposition: LinkDisposition;
  reasonCode: string | null;
  divergence: boolean;
  /** Transação local vinculada (na simulação, ids "sim_tx_*" para as que seriam criadas). */
  transactionId: string | null;
  projectionsCreated: number;
  groupCreated: boolean;
  projectionAmountCorrected: boolean;
  /** Era "created" e a fonte passou a excluir (reclassified_excluded). */
  reclassifiedExcluded: boolean;
}

export interface BatchResult {
  mode: "apply" | "simulate";
  /** Conta processada; o reconcile só aceita o resultado da mesma conta. */
  accountLinkId: string;
  /** Lote processado até o fim (exigido pelo reconcile). */
  complete: boolean;
  results: RecordResult[];
  counts: Record<RecordOutcome, number>;
  reasons: Record<string, number>;
  divergences: number;
  superseded: number;
  projectionsCreated: number;
  groupsCreated: number;
  projectionAmountCorrected: number;
  reclassifiedExcluded: number;
}

export interface ProcessPluggyRecordsInput {
  mode: "apply" | "simulate";
  ownerUserId: string;
  accountLinkId: string;
  /** Leitura COMPLETA da conta nesta execução (mais os pendentes revisitados por id). */
  records: PluggyStoreRecord[];
  /** Obrigatório em "apply". */
  leaseToken?: string;
  /** Pendentes entram como lançamento provisório (padrão: true). */
  importPending?: boolean;
  /** Cartão: billId → vencimento da fatura (YYYY-MM-DD), para o corte por fatura. */
  billDueDates?: Record<string, string>;
  now?: Date;
  /** Ponto de observação para testes (falha forçada, pausa durante a escrita). */
  onWrite?: PluggyWriteHook;
  transactionTimeoutMs?: number;
}

/** Ordem determinística: por compra, parcelas em ordem crescente de N. */
export function sortRecordsForProcessing(records: PluggyStoreRecord[]): PluggyStoreRecord[] {
  return [...records].sort((a, b) => {
    const ka = purchaseKeyOfRecord(a) ?? a.ledgerDate;
    const kb = purchaseKeyOfRecord(b) ?? b.ledgerDate;
    if (ka !== kb) return ka < kb ? -1 : 1;
    const na = a.installmentNumber ?? 0;
    const nb = b.installmentNumber ?? 0;
    if (na !== nb) return na - nb;
    if (a.ledgerDate !== b.ledgerDate) return a.ledgerDate < b.ledgerDate ? -1 : 1;
    return a.externalId < b.externalId ? -1 : a.externalId > b.externalId ? 1 : 0;
  });
}

/**
 * Pareamento por chave (Emenda 2, regra 3): transações canônicas ausentes da
 * leitura completa × registros novos com a mesma chave, em ordem
 * determinística, até o menor dos dois tamanhos. Registros de chave idêntica
 * são intercambiáveis, então isso não é ambiguidade.
 */
export function pairRecreated(
  newRecords: PluggyStoreRecord[],
  absent: Array<{ transactionId: string; key: string; createdAt: Date }>
): Map<string, string> {
  const olds = new Map<string, typeof absent>();
  for (const a of [...absent].sort(
    (x, y) => x.createdAt.getTime() - y.createdAt.getTime() || (x.transactionId < y.transactionId ? -1 : 1)
  )) {
    const list = olds.get(a.key) ?? [];
    list.push(a);
    olds.set(a.key, list);
  }
  const pairs = new Map<string, string>();
  for (const r of newRecords) {
    const list = olds.get(recreationKey(r));
    const next = list?.shift();
    if (next) pairs.set(r.externalId, next.transactionId);
  }
  return pairs;
}

/** Fatos do lote calculados sobre o retrato (sem consultas). */
export function buildBatchFacts(
  snapshot: BatchSnapshot,
  ctx: AccountContext,
  records: PluggyStoreRecord[],
  importPending: boolean,
  billDueDates: Map<string, string> = new Map()
): BatchFacts {
  const seenExternalIds = new Set(records.map((r) => r.externalId));
  const withLink = new Set(
    snapshot.links.filter((l) => l.accountLinkId === ctx.accountLinkId).map((l) => l.externalId)
  );
  const takenProviders = new Set(snapshot.links.map((l) => l.providerId).filter((p): p is string => !!p));
  const newRecords = records.filter(
    (r) =>
      !withLink.has(r.externalId) &&
      !(r.providerId && takenProviders.has(r.providerId)) &&
      effectivePreDisposition(r, importPending) === null &&
      r.currencyCode === "BRL" &&
      cutoffDecision(r, ctx, billDueDates) === null
  );
  let recreatedPairs = new Map<string, string>();
  if (newRecords.length > 0) {
    const byTx = new Map<string, LinkRow[]>();
    const tombstones: Array<{ transactionId: string; key: string; createdAt: Date }> = [];
    for (const l of snapshot.links) {
      if (!l.transactionId) {
        // Vínculo cujo lançamento foi apagado de vez: lápide pareável pela chave gravada.
        if ((l.disposition === "created" || l.disposition === "adopted") && !seenExternalIds.has(l.externalId)) {
          tombstones.push({ transactionId: TOMBSTONE_PREFIX + l.id, key: linkRecreationKey(l), createdAt: new Date(8.64e15) });
        }
        continue;
      }
      const list = byTx.get(l.transactionId) ?? [];
      list.push(l);
      byTx.set(l.transactionId, list);
    }
    const owned = new Map(snapshot.txs.map((t) => [t.id, t]));
    const absent: Array<{ transactionId: string; key: string; createdAt: Date }> = [];
    byTx.forEach((ls, txId) => {
      const tx = owned.get(txId);
      if (!tx) return;
      if (ls.some((l) => l.accountLinkId === ctx.accountLinkId && seenExternalIds.has(l.externalId))) return;
      // Só transações ainda contabilizadas (vínculo ativo created/adopted) e não apagadas pelo sistema.
      const canonical = ls.find((l) => l.disposition === "created" || l.disposition === "adopted");
      if (!canonical || ls.some((l) => l.systemDeletedAt !== null)) return;
      absent.push({ transactionId: txId, key: linkRecreationKey(canonical), createdAt: tx.createdAt });
    });
    recreatedPairs = pairRecreated(newRecords, [...absent, ...tombstones]);
  }
  return { seenExternalIds, recreatedPairs, importPending, billDueDates };
}

function emptyCounts(): Record<RecordOutcome, number> {
  return {
    created: 0,
    adopted: 0,
    updated: 0,
    excluded: 0,
    pending: 0,
    needs_review: 0,
    before_cutoff: 0,
    unchanged: 0,
    restored: 0,
  };
}

/**
 * O plano não muda nada além de lastSeenAt? Esses registros não abrem
 * transação própria: entram no updateMany em lote da conta.
 */
export function isNoopPlan(plan: DecisionPlan, existing: LinkRow | null, record: PluggyStoreRecord): boolean {
  if (!existing || !linkSnapshotEquals(existing, record)) return false;
  if (
    plan.updateTransaction ||
    plan.refreshSnapshot ||
    plan.create ||
    plan.softDelete ||
    plan.restore ||
    plan.supersedeLinkIds.length > 0
  ) {
    return false;
  }
  if (plan.touchLinkId) return plan.touchLinkId === existing.id;
  return (
    plan.link !== null &&
    plan.link.reuseLinkId === existing.id &&
    plan.link.transactionId === existing.transactionId &&
    plan.disposition === existing.disposition &&
    plan.reasonCode === existing.reasonCode
  );
}

/** Depois de gravar, traz para o overlay o estado real das linhas afetadas. */
async function syncOverlayFromDb(
  tx: PluggyTxClient,
  overlay: SimulationOverlay,
  ctx: AccountContext,
  record: PluggyStoreRecord,
  plan: DecisionPlan,
  effect: AppliedEffect
): Promise<void> {
  const linkIds = new Set(plan.supersedeLinkIds);
  const links = await tx.pluggyTransactionLink.findMany({
    where: {
      OR: [
        { accountLinkId: ctx.accountLinkId, externalId: record.externalId },
        ...(linkIds.size > 0 ? [{ id: { in: Array.from(linkIds) } }] : []),
      ],
    },
  });
  links.forEach((l) => overlay.links.set(l.id, toLinkRow(l)));
  const txIds = [effect.transactionId, plan.updateTransaction?.id].filter((x): x is string => !!x);
  if (txIds.length === 0) return;
  const main = await tx.transaction.findMany({
    where: { userId: ctx.ownerUserId, spaceId: null, id: { in: txIds } },
    select: { installmentId: true },
  });
  const groupIds = main.map((m) => m.installmentId).filter((x): x is string => !!x);
  const rows = await tx.transaction.findMany({
    where: {
      userId: ctx.ownerUserId,
      spaceId: null,
      OR: [{ id: { in: txIds } }, ...(groupIds.length > 0 ? [{ installmentId: { in: groupIds } }] : [])],
    },
    select: TX_SELECT,
  });
  rows.forEach((t) => overlay.txs.set(t.id, toTxRow(t, ctx.ownerUserId)));
  const created = plan.create?.recurringExpenseId;
  if (created && plan.create) {
    const months = overlay.recurringMonths.get(created) ?? new Set<string>();
    months.add(monthKey(plan.create.day));
    overlay.recurringMonths.set(created, months);
  }
}

/**
 * Processa a leitura completa de uma conta.
 *
 * Custo: o retrato (vínculos, candidatas e recorrentes) é carregado em poucas
 * consultas e cada registro é pré-decidido em memória. Só registros novos ou
 * alterados abrem uma transação curta própria — advisory lock do usuário →
 * lease (token e validade, relógio do banco) → reconferência do link → decisão
 * refeita com leitura fresca → escrita, tudo ou nada. Os inalterados recebem
 * lastSeenAt num único updateMany, sob o mesmo lock e a mesma conferência.
 * Lança PluggyLeaseLostError e para se o lease for perdido. Em "simulate" não
 * grava nada e as decisões saem do mesmo retrato.
 */
export async function processPluggyRecords(
  db: PluggyDbClient,
  input: ProcessPluggyRecordsInput
): Promise<BatchResult> {
  const { mode, ownerUserId, accountLinkId } = input;
  if (mode === "apply" && !input.leaseToken) throw new PluggyStoreError("lease_token_required");
  const seen = new Set<string>();
  for (const r of input.records) {
    assertValidRecord(r);
    if (seen.has(r.externalId)) throw new PluggyStoreError("duplicate_external_id_in_batch");
    seen.add(r.externalId);
  }
  const records = sortRecordsForProcessing(input.records);
  const now = input.now ?? new Date();
  const importPending = input.importPending ?? true;
  const billDueDates = new Map<string, string>();
  for (const [billId, due] of Object.entries(input.billDueDates ?? {})) {
    parseDay(due);
    billDueDates.set(billId, due);
  }

  const ctx0 = await loadAccountContext(db, ownerUserId, accountLinkId);
  const rules = await loadPersonalRules(db, ownerUserId);
  const snapshot = await loadBatchSnapshot(db, ctx0);
  const facts = buildBatchFacts(snapshot, ctx0, records, importPending, billDueDates);
  const overlay = createOverlay();
  const memory = snapshotSource(snapshot);

  const result: BatchResult = {
    mode,
    accountLinkId: ctx0.accountLinkId,
    complete: false,
    results: [],
    counts: emptyCounts(),
    reasons: {},
    divergences: 0,
    superseded: 0,
    projectionsCreated: 0,
    groupsCreated: 0,
    projectionAmountCorrected: 0,
    reclassifiedExcluded: 0,
  };
  const noopLinkIds: string[] = [];

  const record_ = (record: PluggyStoreRecord, plan: DecisionPlan, effect: AppliedEffect) => {
    result.results.push({
      externalId: record.externalId,
      outcome: plan.outcome,
      disposition: plan.disposition,
      reasonCode: plan.reasonCode,
      divergence: plan.divergence,
      transactionId: effect.transactionId,
      projectionsCreated: effect.projectionsCreated,
      groupCreated: effect.groupCreated,
      projectionAmountCorrected: plan.projectionAmountCorrected,
      reclassifiedExcluded: plan.reclassified,
    });
    result.counts[plan.outcome]++;
    if (plan.reclassified) result.reclassifiedExcluded++;
    if (plan.reasonCode && plan.outcome !== "unchanged" && plan.outcome !== "updated" && plan.outcome !== "restored") {
      result.reasons[plan.reasonCode] = (result.reasons[plan.reasonCode] ?? 0) + 1;
    }
    if (plan.divergence) result.divergences++;
    if (plan.projectionAmountCorrected) result.projectionAmountCorrected++;
    result.superseded += plan.supersedeLinkIds.length;
    result.projectionsCreated += effect.projectionsCreated;
    if (effect.groupCreated) result.groupsCreated++;
  };

  for (const record of records) {
    const view = createDecisionView(memory, overlay);
    const existing = await view.linkByExternalId(ctx0.accountLinkId, record.externalId);
    const pre = await decideRecord(view, ctx0, record, facts, rules);

    if (isNoopPlan(pre, existing, record)) {
      if (existing) noopLinkIds.push(existing.id);
      record_(record, pre, {
        transactionId: existing?.transactionId ?? null,
        projectionsCreated: 0,
        groupCreated: false,
      });
      continue;
    }
    if (mode === "simulate") {
      const effect = await applyPlanToOverlay(view, overlay, ctx0, record, pre, now);
      record_(record, pre, effect);
      continue;
    }
    const out = await db.$transaction(
      async (tx) => {
        await lockUserForPluggy(tx, ownerUserId);
        await assertPluggyLeaseHeld(tx, ownerUserId, input.leaseToken as string);
        const ctx = await loadAccountContext(tx, ownerUserId, accountLinkId);
        // Leitura fresca sob o lock; recorrentes vêm do retrato + efeitos desta execução.
        const fresh = createDecisionView(
          { ...dbSource(tx, ownerUserId), recurrings: async () => snapshot.recurrings },
          { ...createOverlay(), recurringMonths: overlay.recurringMonths }
        );
        const p = await decideRecord(fresh, ctx, record, facts, rules);
        const e = await executePlan(tx, ctx, record, p, now, input.onWrite);
        await syncOverlayFromDb(tx, overlay, ctx, record, p, e);
        return { p, e };
      },
      { maxWait: 15_000, timeout: input.transactionTimeoutMs ?? 30_000 }
    );
    record_(record, out.p, out.e);
  }

  if (mode === "apply" && noopLinkIds.length > 0) {
    await db.$transaction(
      async (tx) => {
        await lockUserForPluggy(tx, ownerUserId);
        await assertPluggyLeaseHeld(tx, ownerUserId, input.leaseToken as string);
        const ctx = await loadAccountContext(tx, ownerUserId, accountLinkId);
        for (let i = 0; i < noopLinkIds.length; i += 5000) {
          await tx.pluggyTransactionLink.updateMany({
            where: { id: { in: noopLinkIds.slice(i, i + 5000) }, accountLinkId: ctx.accountLinkId },
            data: { lastSeenAt: now },
          });
        }
        await input.onWrite?.("touch_batch");
      },
      { maxWait: 15_000, timeout: input.transactionTimeoutMs ?? 30_000 }
    );
  }
  result.complete = true;
  return result;
}

// ---------------------------------------------------------------------------
// Vínculos não vistos numa leitura completa
// ---------------------------------------------------------------------------

export interface UnseenLinksResult {
  /** Vínculos POSTED não vistos e não religados (nada é apagado). */
  missingUpstream: number;
  missingByDisposition: Record<string, number>;
  /** Provisórios (PENDING) contabilizados que sumiram → superseded / provisional_vanished*. */
  provisionalVanished: number;
  /** Transações locais apagadas (soft delete pelo sistema) por causa desses provisórios, projeções incluídas. */
  provisionalTransactionsDeleted: number;
  /** Destino "pending" (importPending desligado) que sumiu → needs_review / pending_vanished. */
  pendingVanished: number;
}

interface ProvisionalVanish {
  link: LinkRow;
  /** Transações a apagar: a do provisório (se ele a criou) e as projeções só dele. */
  deleteIds: string[];
}

/**
 * Depois de processar a leitura completa (Emenda 2, regra 4). Exige o
 * BatchResult completo da mesma conta e do mesmo modo, para que nada seja
 * apagado antes de os registros recriados serem religados. Presença é por
 * transação canônica (basta um dos ids históricos ter sido visto).
 * - provisório (sourceStatus PENDING) que sumiu: o vínculo vira superseded /
 *   provisional_vanished; se ele criou a transação, ela e as projeções sem
 *   vínculo do grupo que só ele gerou sofrem soft delete com o carimbo
 *   systemDeletedAt (se o registro voltar, a exclusão é desfeita);
 * - destino "pending" que sumiu: needs_review / pending_vanished;
 * - POSTED que sumiu (a partir de readFrom): só conta em missing_upstream.
 * Em "simulate" só conta, com os mesmos critérios.
 */
export async function reconcileUnseenLinks(
  db: PluggyDbClient,
  input: {
    mode: "apply" | "simulate";
    ownerUserId: string;
    accountLinkId: string;
    processed: BatchResult;
    readFrom: string;
    leaseToken?: string;
    now?: Date;
  }
): Promise<UnseenLinksResult> {
  parseDay(input.readFrom);
  if (input.mode === "apply" && !input.leaseToken) throw new PluggyStoreError("lease_token_required");
  const p = input.processed;
  if (!p.complete || p.accountLinkId !== input.accountLinkId || p.mode !== input.mode) {
    throw new PluggyStoreError("reconcile_requires_processed_batch");
  }
  const seen = new Set(p.results.map((r) => r.externalId));
  const now = input.now ?? new Date();

  const compute = async (client: ReadClient) => {
    const ctx = await loadAccountContext(client, input.ownerUserId, input.accountLinkId);
    const links = (
      await client.pluggyTransactionLink.findMany({
        where: { accountLinkId: ctx.accountLinkId, disposition: { not: "superseded" } },
      })
    ).map(toLinkRow);
    // Presença por transação: inclui as religações do próprio lote (na simulação
    // elas só existem em memória, no BatchResult).
    const presentTx = new Set([
      ...links.filter((l) => l.transactionId && seen.has(l.externalId)).map((l) => l.transactionId as string),
      ...p.results.map((x) => x.transactionId).filter((x): x is string => !!x && !x.startsWith("sim_")),
    ]);
    const unseen = links.filter(
      (l) => !seen.has(l.externalId) && !(l.transactionId && presentTx.has(l.transactionId))
    );
    const pendingDisposition = unseen.filter((l) => l.disposition === "pending" && l.transactionId === null);
    const provisionalLinks = unseen.filter(
      (l) =>
        l.sourceStatus === "PENDING" &&
        l.transactionId !== null &&
        (l.disposition === "created" || l.disposition === "adopted")
    );
    const missing = unseen.filter(
      (l) => l.disposition !== "pending" && l.sourceStatus !== "PENDING" && l.sourceDate >= input.readFrom
    );
    const provisional: ProvisionalVanish[] = [];
    for (const l of provisionalLinks) {
      const deleteIds: string[] = [];
      // Só apaga o que o próprio provisório criou; lançamento adotado era do usuário.
      if (l.disposition === "created") {
        const local = await client.transaction.findFirst({
          where: { id: l.transactionId as string, userId: ctx.ownerUserId, spaceId: null },
          select: { id: true, installmentId: true, deletedAt: true },
        });
        if (local && local.deletedAt === null) deleteIds.push(local.id);
        if (local && local.installmentId && l.installmentNumber !== null) {
          const othersLinked = await client.transaction.count({
            where: {
              installmentId: local.installmentId,
              id: { not: local.id },
              pluggyLinks: { some: { disposition: { not: "superseded" } } },
            },
          });
          if (othersLinked === 0) {
            const projections = await client.transaction.findMany({
              where: {
                installmentId: local.installmentId,
                userId: ctx.ownerUserId,
                spaceId: null,
                currentInstallment: { gt: l.installmentNumber },
                deletedAt: null,
                pluggyLinks: { none: {} },
              },
              select: { id: true },
            });
            deleteIds.push(...projections.map((x) => x.id));
          }
        }
      }
      provisional.push({ link: l, deleteIds });
    }
    const missingByDisposition: Record<string, number> = {};
    for (const l of missing) missingByDisposition[l.disposition] = (missingByDisposition[l.disposition] ?? 0) + 1;
    return { pendingDisposition, provisional, missing, missingByDisposition };
  };

  const summarize = (r: Awaited<ReturnType<typeof compute>>, pendingVanished: number): UnseenLinksResult => ({
    missingUpstream: r.missing.length,
    missingByDisposition: r.missingByDisposition,
    provisionalVanished: r.provisional.length,
    provisionalTransactionsDeleted: r.provisional.reduce((n, v) => n + v.deleteIds.length, 0),
    pendingVanished,
  });

  if (input.mode === "simulate") {
    const r = await compute(db);
    return summarize(r, r.pendingDisposition.length);
  }
  return db.$transaction(async (tx) => {
    await lockUserForPluggy(tx, input.ownerUserId);
    await assertPluggyLeaseHeld(tx, input.ownerUserId, input.leaseToken as string);
    const r = await compute(tx);
    let pendingVanished = 0;
    if (r.pendingDisposition.length > 0) {
      pendingVanished = (
        await tx.pluggyTransactionLink.updateMany({
          where: { id: { in: r.pendingDisposition.map((l) => l.id) }, disposition: "pending", transactionId: null },
          data: { disposition: "needs_review", reasonCode: "pending_vanished" },
        })
      ).count;
    }
    for (const v of r.provisional) {
      const deleted = v.deleteIds.length > 0;
      if (deleted) {
        await tx.transaction.updateMany({
          where: { id: { in: v.deleteIds }, deletedAt: null },
          data: { deletedAt: now },
        });
      }
      await tx.pluggyTransactionLink.update({
        where: { id: v.link.id },
        data: {
          disposition: "superseded",
          reasonCode: v.link.disposition === "created" ? "provisional_vanished" : "provisional_vanished_adopted",
          systemDeletedAt: deleted && v.deleteIds[0] === v.link.transactionId ? now : null,
        },
      });
    }
    return summarize(r, pendingVanished);
  });
}


