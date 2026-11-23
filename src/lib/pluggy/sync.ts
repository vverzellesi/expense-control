import type { Prisma, PrismaClient } from "@prisma/client";
import { sendSyncAlert, shouldAlert, type AlertSummary } from "./alerts";
import { createPluggyClientFromEnv, PluggyApiError, type PluggyClient } from "./client";
import { toBusinessDate } from "./dates";
import { acquirePluggyLease, assertPluggyLeaseHeld, lockUserForPluggy, PluggyLeaseLostError, releasePluggyLease, renewPluggyLease } from "./lease";
import { mapPluggyTransaction, PluggyMappingError } from "./mapper";
import { checkCoverage, reconcileBills, type BillReconciliation, type CoverageStatus } from "./reconcile";
import { applyBatchRules, compileExcludePatterns, type BatchEntry, type CompiledExcludePatterns } from "./rules";
import {
  businessDayKey,
  processPluggyRecords,
  PluggyStoreError,
  reconcileUnseenLinks,
  type BatchResult,
  type ProcessPluggyRecordsInput,
  type RecordOutcome,
  type RecordResult,
  type UnseenLinksResult,
} from "./store";
import type { MappedPluggyTransaction, PluggyAccount, PluggyBill, PluggyItem, PluggyTransaction } from "./types";

/**
 * Sincronização Pluggy: a única função usada pelo cron, pelo webhook e pelo script.
 *
 * Ordem: flag e dono → vínculos ativos do dono → lease → run "running" → saúde do item
 * → leitura completa de cada conta (limite superior fixado no início; falha em qualquer
 * página invalida a conta) → mapeamento com os padrões do usuário → regras de lote com as
 * contas juntas → decisão e gravação pelo store → registros que sumiram → conferência de
 * faturas e cobertura → fecha o run (ok, warning ou error) → libera o lease → alerta.
 *
 * Simulação: nenhuma escrita (nem run, nem lease), nenhum alerta; devolve o relatório
 * completo de decisões. Erros sempre sanitizados: nunca ids, descrições ou valores.
 */

export const EXCLUDE_PATTERNS_SETTING_KEY = "pluggy.excludePatterns";
export const SYNC_LEASE_TTL_MS = 10 * 60 * 1000;
export const WEBHOOK_MIN_INTERVAL_MS = 10 * 60 * 1000;
export const ITEM_STALE_MS = 48 * 60 * 60 * 1000;
export const CONSENT_WARNING_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type SyncMode = "apply" | "simulate";
export type SyncTrigger = "cron" | "webhook" | "manual";
export type SyncStatus = "ok" | "warning" | "error";
export type SkippedReason = "disabled" | "owner_not_configured" | "no_links" | "lease_busy";

/** Códigos que tornam o run "error"; os demais alertas tornam o run "warning". */
const ERROR_CODES = new Set([
  "config",
  "accounts_read_failed",
  "account_not_found",
  "account_type_mismatch",
  "account_read_failed",
  "bills_read_failed",
  "account_dependency_failed",
  "mapping_failed",
  "account_processing_failed",
  "invariant_violation",
  "lease_lost",
  "unexpected",
]);

export type PluggyReader = Pick<PluggyClient, "getItem" | "listAccounts" | "listTransactions" | "listBills">;

export interface SyncDeps {
  db: PrismaClient;
  /** Cliente da Pluggy; padrão: credenciais do ambiente do servidor. */
  client?: PluggyReader;
  env?: Record<string, string | undefined>;
  now?: () => Date;
  alert?: (db: PrismaClient, ownerUserId: string, summary: AlertSummary) => Promise<unknown>;
}

export interface RunSyncOptions {
  mode: SyncMode;
  trigger: SyncTrigger;
  /** Scripts rodam de propósito com a integração desligada (simulação e primeira gravação). */
  ignoreEnabledFlag?: boolean;
  /** Pendentes do cartão entram como lançamento provisório (padrão: true). */
  importPending?: boolean;
}

type DestinationKey = RecordOutcome;
const DESTINATIONS: DestinationKey[] = [
  "created",
  "adopted",
  "excluded",
  "pending",
  "needs_review",
  "before_cutoff",
  "unchanged",
  "updated",
];

export interface SyncCounts {
  accounts: number;
  accountsOk: number;
  accountsFailed: number;
  read: number;
  /** Lidos com data fora de [corte, limite superior]: só contam como presentes na fonte. */
  outsideWindow: number;
  destinations: Record<DestinationKey, number>;
  reasons: Record<string, number>;
  newNeedsReview: number;
  divergences: number;
  superseded: number;
  projectionsCreated: number;
  groupsCreated: number;
  projectionAmountCorrected: number;
  refundsAsIncome: number;
  provisionalVanished: number;
  provisionalTransactionsDeleted: number;
  pendingVanished: number;
  missingUpstream: number;
}

export interface AccountCheck {
  accountType: "BANK" | "CREDIT";
  status: "ok" | "failed" | "skipped";
  error: string | null;
  read: number;
  coverage: CoverageStatus | null;
  bills: Omit<BillReconciliation, "bills"> & { list: BillReconciliation["bills"] } | null;
}

export interface ItemCheck {
  status: string | null;
  executionStatus: string | null;
  hoursSinceUpdate: number | null;
  consentDaysLeft: number | null;
  alerts: string[];
}

/** Persistido em PluggySyncRun.checks: sem ids, descrições ou nomes. */
export interface SyncChecks {
  alerts: Record<string, number>;
  items: ItemCheck[];
  accounts: AccountCheck[];
  userPatterns: { configured: number; rejected: number; invalid: boolean };
}

export interface SyncDecision {
  accountLinkId: string;
  originName: string;
  record: MappedPluggyTransaction;
  result: RecordResult;
}

export interface AccountReport {
  accountLinkId: string;
  originName: string;
  check: AccountCheck;
  unseen: UnseenLinksResult | null;
}

export interface SyncReport {
  mode: SyncMode;
  trigger: SyncTrigger;
  status: SyncStatus | "skipped";
  skippedReason: SkippedReason | null;
  runId: string | null;
  startedAt: Date;
  counts: SyncCounts;
  checks: SyncChecks;
  error: string | null;
  /** Só em memória (scripts): decisões por registro. Nunca vai para o run nem para HTTP. */
  decisions: SyncDecision[];
  accounts: AccountReport[];
}

// ---------------------------------------------------------------------------
// Utilidades públicas
// ---------------------------------------------------------------------------

const SAFE_NAME = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;

/** Mensagem de erro sem ids, descrições, valores ou segredos. */
export function describeSyncError(error: unknown): string {
  if (error instanceof PluggyApiError) return error.message;
  if (error instanceof PluggyStoreError) return error.message;
  if (error instanceof PluggyLeaseLostError) return "lease_lost";
  if (error instanceof PluggyMappingError) return error.message;
  if (error && typeof error === "object") {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === "string" && /^P\d{4}$/.test(code)) return "db:" + code;
    if (typeof name === "string" && name.startsWith("Prisma") && SAFE_NAME.test(name)) return "db:" + name;
    if (typeof name === "string" && SAFE_NAME.test(name)) return "unexpected:" + name;
  }
  return "unexpected:" + typeof error;
}

/** Integração ligada e configurada para as entradas automáticas (cron e webhook). */
export function isPluggySyncConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return (
    env.PLUGGY_SYNC_ENABLED === "true" &&
    !!env.PLUGGY_OWNER_USER_ID?.trim() &&
    !!env.PLUGGY_CLIENT_ID?.trim() &&
    !!env.PLUGGY_CLIENT_SECRET?.trim()
  );
}

/** O que pode sair numa resposta HTTP: só números. */
export function publicCounts(counts: SyncCounts): Record<string, number> {
  return {
    read: counts.read,
    outsideWindow: counts.outsideWindow,
    ...counts.destinations,
    newNeedsReview: counts.newNeedsReview,
    accountsOk: counts.accountsOk,
    accountsFailed: counts.accountsFailed,
  };
}

export function emptyCounts(): SyncCounts {
  return {
    accounts: 0,
    accountsOk: 0,
    accountsFailed: 0,
    read: 0,
    outsideWindow: 0,
    destinations: Object.fromEntries(DESTINATIONS.map((d) => [d, 0])) as Record<DestinationKey, number>,
    reasons: {},
    newNeedsReview: 0,
    divergences: 0,
    superseded: 0,
    projectionsCreated: 0,
    groupsCreated: 0,
    projectionAmountCorrected: 0,
    refundsAsIncome: 0,
    provisionalVanished: 0,
    provisionalTransactionsDeleted: 0,
    pendingVanished: 0,
    missingUpstream: 0,
  };
}

function emptyChecks(): SyncChecks {
  return { alerts: {}, items: [], accounts: [], userPatterns: { configured: 0, rejected: 0, invalid: false } };
}

function addAlert(checks: SyncChecks, code: string, count = 1): void {
  if (count <= 0) return;
  checks.alerts[code] = (checks.alerts[code] ?? 0) + count;
}

export function statusFromAlerts(alerts: Record<string, number>): SyncStatus {
  const codes = Object.keys(alerts).filter((code) => alerts[code] > 0);
  if (codes.some((code) => ERROR_CODES.has(code))) return "error";
  return codes.length > 0 ? "warning" : "ok";
}

const ITEM_STATUS_FORMAT = /^[A-Z_]{1,40}$/;

function safeEnum(value: string | null | undefined): string | null {
  return typeof value === "string" && ITEM_STATUS_FORMAT.test(value) ? value : null;
}

/** Saúde do item: status, atualização parada há mais de 48 horas, consentimento perto do fim. */
export function evaluateItemHealth(item: PluggyItem, now: Date): ItemCheck {
  const alerts: string[] = [];
  const status = safeEnum(item.status);
  if (status !== "UPDATED" && status !== "UPDATING") alerts.push("item_not_updated");

  const lastUpdated = item.lastUpdatedAt ? Date.parse(item.lastUpdatedAt) : NaN;
  const hoursSinceUpdate = Number.isNaN(lastUpdated) ? null : Math.floor((now.getTime() - lastUpdated) / 3_600_000);
  if (Number.isNaN(lastUpdated) || now.getTime() - lastUpdated > ITEM_STALE_MS) alerts.push("item_stale");

  const consent = item.consentExpiresAt ? Date.parse(item.consentExpiresAt) : NaN;
  let consentDaysLeft: number | null = null;
  if (!Number.isNaN(consent)) {
    consentDaysLeft = Math.floor((consent - now.getTime()) / DAY_MS);
    if (consent <= now.getTime()) alerts.push("consent_expired");
    else if (consent - now.getTime() < CONSENT_WARNING_DAYS * DAY_MS) alerts.push("consent_expiring");
  }
  return { status, executionStatus: safeEnum(item.executionStatus), hoursSinceUpdate, consentDaysLeft, alerts };
}

/** Padrões do usuário (Settings pluggy.excludePatterns). Inválido vira aviso, nunca exceção. */
export async function loadUserPatterns(
  db: Pick<PrismaClient, "settings">,
  ownerUserId: string
): Promise<{ compiled: CompiledExcludePatterns; invalid: boolean }> {
  const empty = { matchers: [], rejected: 0 };
  const row = await db.settings.findFirst({
    where: { key: EXCLUDE_PATTERNS_SETTING_KEY, userId: ownerUserId },
    select: { value: true },
  });
  if (!row) return { compiled: empty, invalid: false };
  let parsed: unknown;
  try {
    parsed = JSON.parse(row.value);
  } catch {
    return { compiled: empty, invalid: true };
  }
  if (!Array.isArray(parsed)) return { compiled: empty, invalid: true };
  return { compiled: compileExcludePatterns(parsed), invalid: false };
}

// ---------------------------------------------------------------------------
// Sincronização
// ---------------------------------------------------------------------------

interface LinkRow {
  id: string;
  itemId: string;
  pluggyAccountId: string;
  accountType: string;
  syncFrom: Date;
  originName: string;
}

interface AccountRead {
  link: LinkRow;
  account: PluggyAccount;
  transactions: PluggyTransaction[];
  coverage: { total: number; minDate: string | null; maxDate: string | null };
  bills: PluggyBill[] | null;
  mapped: MappedPluggyTransaction[];
}

function skipped(mode: SyncMode, trigger: SyncTrigger, reason: SkippedReason, startedAt: Date): SyncReport {
  return {
    mode,
    trigger,
    status: "skipped",
    skippedReason: reason,
    runId: null,
    startedAt,
    counts: emptyCounts(),
    checks: emptyChecks(),
    error: null,
    decisions: [],
    accounts: [],
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function billDueDates(bills: PluggyBill[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const bill of bills) {
    const due = toBusinessDate(bill.dueDate);
    if (!due) throw new PluggyApiError("schema", "GET", "/bills", null, "vencimento inválido");
    map.set(bill.id, due);
  }
  return map;
}

export async function runPluggySync(deps: SyncDeps, options: RunSyncOptions): Promise<SyncReport> {
  const env = deps.env ?? process.env;
  const now = deps.now ?? (() => new Date());
  const startedAt = now();
  const { mode, trigger } = options;
  const db = deps.db;

  if (!options.ignoreEnabledFlag && env.PLUGGY_SYNC_ENABLED !== "true") return skipped(mode, trigger, "disabled", startedAt);
  const ownerUserId = env.PLUGGY_OWNER_USER_ID?.trim();
  if (!ownerUserId) return skipped(mode, trigger, "owner_not_configured", startedAt);

  const links: LinkRow[] = (
    await db.pluggyAccountLink.findMany({
      where: { userId: ownerUserId, enabled: true },
      include: { origin: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    })
  ).map((link) => ({
    id: link.id,
    itemId: link.itemId,
    pluggyAccountId: link.pluggyAccountId,
    accountType: link.accountType,
    syncFrom: link.syncFrom,
    originName: link.origin.name,
  }));
  if (links.length === 0) return skipped(mode, trigger, "no_links", startedAt);

  let leaseToken: string | null = null;
  let runId: string | null = null;
  if (mode === "apply") {
    leaseToken = await acquirePluggyLease(db, ownerUserId, SYNC_LEASE_TTL_MS);
    if (!leaseToken) return skipped(mode, trigger, "lease_busy", startedAt);
  }

  const report: SyncReport = {
    mode,
    trigger,
    status: "ok",
    skippedReason: null,
    runId: null,
    startedAt,
    counts: emptyCounts(),
    checks: emptyChecks(),
    error: null,
    decisions: [],
    accounts: [],
  };
  const errors: string[] = [];

  try {
    if (mode === "apply") {
      // Quem detém o lease é o único worker vivo: run "running" anterior foi interrompido.
      await db.pluggySyncRun.updateMany({
        where: { userId: ownerUserId, status: "running" },
        data: { status: "interrupted", finishedAt: startedAt },
      });
      const run = await db.pluggySyncRun.create({
        data: { userId: ownerUserId, trigger, status: "running", startedAt },
        select: { id: true },
      });
      runId = run.id;
      report.runId = runId;
    }

    await syncAccounts({ deps, env, options, ownerUserId, links, leaseToken, report, errors, startedAt });
  } catch (error) {
    const code = error instanceof PluggyLeaseLostError ? "lease_lost" : "unexpected";
    addAlert(report.checks, code);
    errors.push(describeSyncError(error));
  }

  report.status = statusFromAlerts(report.checks.alerts);
  report.error = errors.length > 0 ? errors[0] : null;

  if (mode === "apply") {
    try {
      if (runId) {
        await db.pluggySyncRun.update({
          where: { id: runId },
          data: {
            status: report.status,
            finishedAt: now(),
            counts: toJson(report.counts),
            checks: toJson(report.checks),
            error: report.error,
          },
        });
      }
    } finally {
      if (leaseToken) await releasePluggyLease(db, ownerUserId, leaseToken).catch(() => undefined);
    }
    const summary: AlertSummary = {
      status: report.status,
      newNeedsReview: report.counts.newNeedsReview,
      alerts: report.checks.alerts,
    };
    if (shouldAlert(summary)) {
      const send = deps.alert ?? ((client, owner, s) => sendSyncAlert(client, owner, s));
      // Falha no envio não muda o resultado do run.
      await Promise.resolve()
        .then(() => send(db, ownerUserId, summary))
        .catch(() => undefined);
    }
  }
  return report;
}

interface SyncContext {
  deps: SyncDeps;
  env: Record<string, string | undefined>;
  options: RunSyncOptions;
  ownerUserId: string;
  links: LinkRow[];
  leaseToken: string | null;
  report: SyncReport;
  errors: string[];
  startedAt: Date;
}

async function syncAccounts(ctx: SyncContext): Promise<void> {
  const { deps, options, ownerUserId, links, report, errors, startedAt } = ctx;
  const { db } = deps;
  const checks = report.checks;
  const counts = report.counts;
  const mode = options.mode;
  const importPending = options.importPending ?? true;
  counts.accounts = links.length;

  const fail = (link: LinkRow, code: string, error: unknown, status: "failed" | "skipped" = "failed") => {
    addAlert(checks, code);
    const message = error === null ? code : describeSyncError(error);
    if (error !== null) errors.push(message);
    const check: AccountCheck = {
      accountType: link.accountType === "CREDIT" ? "CREDIT" : "BANK",
      status,
      error: message,
      read: 0,
      coverage: null,
      bills: null,
    };
    checks.accounts.push(check);
    report.accounts.push({ accountLinkId: link.id, originName: link.originName, check, unseen: null });
    counts.accountsFailed++;
  };

  let client: PluggyReader;
  try {
    client = deps.client ?? createPluggyClientFromEnv({}, ctx.env);
  } catch (error) {
    addAlert(checks, "config");
    errors.push(describeSyncError(error));
    for (const link of links) fail(link, "account_read_failed", null, "skipped");
    return;
  }

  const patterns = await loadUserPatterns(db, ownerUserId);
  checks.userPatterns = {
    configured: patterns.compiled.matchers.length + patterns.compiled.rejected,
    rejected: patterns.compiled.rejected,
    invalid: patterns.invalid,
  };
  if (patterns.invalid) addAlert(checks, "user_patterns_invalid");
  addAlert(checks, "user_patterns_rejected", patterns.compiled.rejected);

  // Saúde do item e contas do item (uma vez por item).
  const accountsByItem = new Map<string, Map<string, PluggyAccount> | null>();
  for (const itemId of Array.from(new Set(links.map((link) => link.itemId)))) {
    try {
      const health = evaluateItemHealth(await client.getItem(itemId), startedAt);
      checks.items.push(health);
      for (const code of health.alerts) addAlert(checks, code);
    } catch (error) {
      addAlert(checks, "item_read_failed");
      errors.push(describeSyncError(error));
    }
    try {
      const accounts = await client.listAccounts(itemId);
      accountsByItem.set(itemId, new Map(accounts.map((account) => [account.id, account])));
    } catch (error) {
      accountsByItem.set(itemId, null);
      addAlert(checks, "accounts_read_failed");
      errors.push(describeSyncError(error));
    }
  }

  // Leitura completa de cada conta. Falha em qualquer página invalida a conta inteira.
  const reads: AccountRead[] = [];
  const failedCreditItems = new Set<string>();
  for (const link of links) {
    const accounts = accountsByItem.get(link.itemId);
    if (!accounts) {
      if (link.accountType === "CREDIT") failedCreditItems.add(link.itemId);
      fail(link, "account_read_failed", null, "skipped");
      continue;
    }
    const account = accounts.get(link.pluggyAccountId);
    if (!account || account.type !== link.accountType) {
      if (link.accountType === "CREDIT") failedCreditItems.add(link.itemId);
      fail(link, account ? "account_type_mismatch" : "account_not_found", null);
      continue;
    }
    let stage: "account_read_failed" | "bills_read_failed" | "mapping_failed" = "account_read_failed";
    try {
      const { transactions, coverage } = await client.listTransactions(account.id);
      let bills: PluggyBill[] | null = null;
      if (link.accountType === "CREDIT") {
        stage = "bills_read_failed";
        bills = await client.listBills(account.id);
        billDueDates(bills);
      }
      stage = "mapping_failed";
      const mapped = transactions.map((tx) =>
        mapPluggyTransaction(
          tx,
          { type: link.accountType as "BANK" | "CREDIT", currencyCode: account.currencyCode },
          { excludePatterns: patterns.compiled, importPending }
        )
      );
      reads.push({ link, account, transactions, coverage, bills, mapped });
    } catch (error) {
      if (link.accountType === "CREDIT") failedCreditItems.add(link.itemId);
      fail(link, stage, error);
    }
  }

  // O débito do pagamento de fatura na conta corrente só é reconhecido com o cartão lido:
  // sem ele, a conta corrente do mesmo item também fica para a próxima execução.
  const usable = reads.filter((read) => {
    if (read.link.accountType === "BANK" && failedCreditItems.has(read.link.itemId)) {
      fail(read.link, "account_dependency_failed", null, "skipped");
      return false;
    }
    return true;
  });

  // Regras de lote com as contas juntas.
  const entries: BatchEntry[] = [];
  const offsets: number[] = [];
  for (const read of usable) {
    offsets.push(entries.length);
    read.transactions.forEach((tx, index) =>
      entries.push({ accountId: read.account.id, itemId: read.link.itemId, operationType: tx.operationType, mapped: read.mapped[index] })
    );
  }
  const ruled = applyBatchRules(entries);
  usable.forEach((read, readIndex) => {
    read.mapped = ruled.slice(offsets[readIndex], offsets[readIndex] + read.mapped.length);
  });

  const upperDay = businessDayKey(startedAt);
  let first = true;
  for (const read of usable) {
    if (mode === "apply" && !first) {
      if (!(await renewPluggyLease(db, ownerUserId, ctx.leaseToken!, SYNC_LEASE_TTL_MS))) throw new PluggyLeaseLostError();
    }
    first = false;
    try {
      await processAccount(ctx, read, upperDay);
    } catch (error) {
      if (error instanceof PluggyLeaseLostError) throw error;
      fail(read.link, "account_processing_failed", error);
    }
  }
}

async function processAccount(ctx: SyncContext, read: AccountRead, upperDay: string): Promise<void> {
  const { deps, options, ownerUserId, report } = ctx;
  const { db } = deps;
  const { link } = read;
  const counts = report.counts;
  const checks = report.checks;
  const mode = options.mode;
  const syncFromDay = businessDayKey(link.syncFrom);

  const window = read.mapped.filter((record) => record.sourceDate >= syncFromDay && record.sourceDate <= upperDay);
  const outsideWindow = read.mapped.length - window.length;

  const before = await db.pluggyTransactionLink.findMany({
    where: { accountLinkId: link.id, disposition: "needs_review" },
    select: { externalId: true },
  });
  const previouslyInReview = new Set(before.map((row) => row.externalId));

  const input: ProcessPluggyRecordsInput & { billDueDates?: Map<string, string> } = {
    mode,
    ownerUserId,
    accountLinkId: link.id,
    records: window,
    leaseToken: ctx.leaseToken ?? undefined,
    importPending: options.importPending ?? true,
    now: report.startedAt,
  };
  // Cartão: corte por fatura, com o vencimento de cada fatura da mesma leitura de /bills.
  if (read.bills) input.billDueDates = billDueDates(read.bills);
  const batch: BatchResult = await processPluggyRecords(db, input);

  // Invariante: todo registro lido termina com um destino.
  const destinationTotal = Object.values(batch.counts).reduce((sum, n) => sum + n, 0);
  if (batch.results.length !== window.length || destinationTotal !== window.length) {
    addAlert(checks, "invariant_violation");
    throw new PluggyStoreError("invariant_violation");
  }

  const coverage = checkCoverage({ syncFromDay, minDate: read.coverage.minDate, total: read.coverage.total });
  if (coverage.status === "truncated") addAlert(checks, "coverage_truncated");

  const seenExternalIds = read.transactions.map((tx) => tx.id);
  let unseen: UnseenLinksResult;
  const unseenInput = { ownerUserId, accountLinkId: link.id, seenExternalIds, readFrom: coverage.coveredFrom, now: report.startedAt };
  if (coverage.status === "empty") {
    // Leitura vazia não prova que algo sumiu: só conta, nada é removido.
    unseen = await reconcileUnseenLinks(db, { ...unseenInput, mode: "simulate" });
    const wouldChange = unseen.missingUpstream + unseen.provisionalVanished + unseen.pendingVanished;
    if (wouldChange > 0) addAlert(checks, "empty_read");
    unseen = { missingUpstream: 0, missingByDisposition: {}, provisionalVanished: 0, provisionalTransactionsDeleted: 0, pendingVanished: 0 };
  } else {
    unseen = await reconcileUnseenLinks(db, { ...unseenInput, mode, leaseToken: ctx.leaseToken ?? undefined });
  }
  addAlert(checks, "missing_upstream", unseen.missingUpstream);

  let bills: AccountCheck["bills"] = null;
  if (read.bills) {
    const reconciliation = reconcileBills(
      read.bills.map((bill) => ({
        id: bill.id,
        dueDate: toBusinessDate(bill.dueDate) as string,
        totalCents: Math.round(bill.totalAmount * 100),
        currencyCode: bill.totalAmountCurrencyCode ?? null,
      })),
      read.mapped.map((record) => ({
        billId: record.billId,
        direction: record.direction,
        amountCents: record.amountCents,
        currencyCode: record.currencyCode,
      }))
    );
    const { bills: list, ...summary } = reconciliation;
    bills = { ...summary, list };
    addAlert(checks, "bill_residue_negative", reconciliation.residueNegative);
  }

  if (mode === "apply") {
    await db.$transaction(async (tx) => {
      await lockUserForPluggy(tx, ownerUserId);
      await assertPluggyLeaseHeld(tx, ownerUserId, ctx.leaseToken!);
      await tx.pluggyAccountLink.update({ where: { id: link.id }, data: { lastSuccessfulSyncAt: report.startedAt } });
    });
  }

  // Contagens
  counts.accountsOk++;
  counts.read += read.mapped.length;
  counts.outsideWindow += outsideWindow;
  for (const key of DESTINATIONS) counts.destinations[key] += batch.counts[key] ?? 0;
  for (const [reason, n] of Object.entries(batch.reasons)) counts.reasons[reason] = (counts.reasons[reason] ?? 0) + n;
  counts.divergences += batch.divergences;
  counts.superseded += batch.superseded;
  counts.projectionsCreated += batch.projectionsCreated;
  counts.groupsCreated += batch.groupsCreated;
  counts.projectionAmountCorrected += batch.projectionAmountCorrected;
  counts.provisionalVanished += unseen.provisionalVanished;
  counts.provisionalTransactionsDeleted += unseen.provisionalTransactionsDeleted;
  counts.pendingVanished += unseen.pendingVanished;
  counts.missingUpstream += unseen.missingUpstream;
  counts.newNeedsReview += unseen.pendingVanished;

  const byExternalId = new Map(window.map((record) => [record.externalId, record]));
  for (const result of batch.results) {
    const record = byExternalId.get(result.externalId)!;
    if (result.outcome === "needs_review" && !previouslyInReview.has(result.externalId)) counts.newNeedsReview++;
    if (result.outcome === "created" && record.creditKind === "refund" && record.type === "INCOME") counts.refundsAsIncome++;
    report.decisions.push({ accountLinkId: link.id, originName: link.originName, record, result });
  }

  const check: AccountCheck = {
    accountType: link.accountType === "CREDIT" ? "CREDIT" : "BANK",
    status: "ok",
    error: null,
    read: read.mapped.length,
    coverage: coverage.status,
    bills,
  };
  checks.accounts.push(check);
  report.accounts.push({ accountLinkId: link.id, originName: link.originName, check, unseen });
}

// ---------------------------------------------------------------------------
// Webhook: gatilho com intervalo mínimo
// ---------------------------------------------------------------------------

export type WebhookTriggerResult =
  | { started: true; status: SyncReport["status"] }
  | { started: false; reason: "disabled" | "owner_not_configured" | "foreign_item" | "too_soon" | "busy" };

/**
 * Dispara a sincronização a partir de um webhook já verificado. Só para itens dos vínculos
 * ativos do dono; não dispara se a última execução começou há menos de 10 minutos ou se o
 * lease está tomado.
 */
export async function triggerSyncFromWebhook(deps: SyncDeps, event: { itemId: string }): Promise<WebhookTriggerResult> {
  const env = deps.env ?? process.env;
  const now = (deps.now ?? (() => new Date()))();
  if (env.PLUGGY_SYNC_ENABLED !== "true") return { started: false, reason: "disabled" };
  const ownerUserId = env.PLUGGY_OWNER_USER_ID?.trim();
  if (!ownerUserId) return { started: false, reason: "owner_not_configured" };

  const link = await deps.db.pluggyAccountLink.findFirst({
    where: { userId: ownerUserId, enabled: true, itemId: event.itemId },
    select: { id: true },
  });
  if (!link) return { started: false, reason: "foreign_item" };

  const last = await deps.db.pluggySyncRun.findFirst({
    where: { userId: ownerUserId },
    orderBy: { startedAt: "desc" },
    select: { startedAt: true },
  });
  if (last && now.getTime() - last.startedAt.getTime() < WEBHOOK_MIN_INTERVAL_MS) return { started: false, reason: "too_soon" };

  const lease = await deps.db.pluggySyncLease.findUnique({ where: { userId: ownerUserId }, select: { expiresAt: true } });
  if (lease && lease.expiresAt.getTime() > now.getTime()) return { started: false, reason: "busy" };

  const report = await runPluggySync(deps, { mode: "apply", trigger: "webhook" });
  if (report.status === "skipped") return { started: false, reason: report.skippedReason === "lease_busy" ? "busy" : "disabled" };
  return { started: true, status: report.status };
}

