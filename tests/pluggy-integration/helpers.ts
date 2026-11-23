import { PrismaClient } from "@prisma/client";
import { acquirePluggyLease } from "@/lib/pluggy/lease";
import { processPluggyRecords, type PluggyStoreRecord, type ProcessPluggyRecordsInput } from "@/lib/pluggy/store";

/**
 * Banco descartável da suíte. Recusa qualquer host que não seja local para
 * que os TRUNCATE dos testes nunca alcancem um banco real.
 */
export function testDatabaseUrl(): string {
  const url = process.env.PLUGGY_TEST_DATABASE_URL;
  if (!url) {
    throw new Error("PLUGGY_TEST_DATABASE_URL is required for the Pluggy integration suite");
  }
  const host = new URL(url).hostname;
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(host)) {
    throw new Error("Refusing to run the Pluggy integration suite against a non-local database");
  }
  return url;
}

export function createTestClient(): PrismaClient {
  return new PrismaClient({ datasourceUrl: testDatabaseUrl() });
}

/** Cliente que conta as consultas enviadas ao banco (para o teste de custo). */
export function createCountingClient(): { client: PrismaClient; count: () => number; reset: () => void } {
  const client = new PrismaClient({
    datasourceUrl: testDatabaseUrl(),
    log: [{ emit: "event", level: "query" }],
  });
  let n = 0;
  client.$on("query", () => {
    n++;
  });
  return { client, count: () => n, reset: () => (n = 0) };
}

export async function resetDatabase(db: PrismaClient): Promise<void> {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => '"' + t.tablename + '"').join(", ");
  await db.$executeRawUnsafe("TRUNCATE " + list + " CASCADE");
}

/** Contagem de linhas de todas as tabelas do schema público. */
export async function countAllRows(db: PrismaClient): Promise<Record<string, number>> {
  const tables = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`;
  const out: Record<string, number> = {};
  for (const t of tables) {
    const rows = await db.$queryRawUnsafe<Array<{ n: bigint }>>('SELECT count(*) AS n FROM "' + t.tablename + '"');
    out[t.tablename] = Number(rows[0].n);
  }
  return out;
}

export interface Owner {
  userId: string;
  originId: string;
  originName: string;
  accountLinkId: string;
}

let seq = 0;

/** Dono sintético com um origin pessoal e uma conta Pluggy vinculada. */
export async function createOwner(
  db: PrismaClient,
  opts: { syncFrom?: string; originName?: string } = {}
): Promise<Owner> {
  seq++;
  const user = await db.user.create({ data: { email: "owner" + seq + "@example.test" } });
  const originName = opts.originName ?? "Cartão Teste";
  const origin = await db.origin.create({ data: { name: originName, userId: user.id, type: "CREDIT_CARD" } });
  const link = await db.pluggyAccountLink.create({
    data: {
      userId: user.id,
      itemId: "item_test_" + seq,
      pluggyAccountId: "acc_test_" + seq,
      accountType: "CREDIT",
      originId: origin.id,
      syncFrom: syncFromDate(opts.syncFrom ?? "2026-01-01"),
    },
  });
  return { userId: user.id, originId: origin.id, originName, accountLinkId: link.id };
}

/** Início do dia de corte em America/Sao_Paulo (UTC-3). */
export function syncFromDate(day: string): Date {
  return new Date(day + "T03:00:00.000Z");
}

export function noonUtc(day: string): Date {
  return new Date(day + "T12:00:00.000Z");
}

export function rec(overrides: Partial<PluggyStoreRecord> & { externalId: string }): PluggyStoreRecord {
  const sourceDate = overrides.sourceDate ?? "2026-03-10";
  return {
    providerId: null,
    accountType: "CREDIT",
    sourceStatus: "POSTED",
    sourceDate,
    purchaseDate: null,
    ledgerDate: overrides.ledgerDate ?? sourceDate,
    description: "LOJA EXEMPLO",
    amountCents: 2500,
    currencyCode: "BRL",
    direction: "DEBIT",
    type: "EXPENSE",
    creditKind: null,
    billId: null,
    installmentNumber: null,
    totalInstallments: null,
    preDisposition: null,
    ...overrides,
  };
}

const tokens = new Map<string, string>();

/** Lease do teste para o usuário (reaproveitado enquanto válido). */
export async function testLease(db: PrismaClient, userId: string): Promise<string> {
  const existing = tokens.get(userId);
  if (existing) {
    const row = await db.pluggySyncLease.findUnique({ where: { userId } });
    if (row && row.ownerToken === existing && row.expiresAt > new Date(Date.now() + 5000)) return existing;
  }
  const token = await acquirePluggyLease(db, userId, 10 * 60 * 1000);
  if (!token) throw new Error("lease busy in test");
  tokens.set(userId, token);
  return token;
}

/** Executa a gravação real com o lease do teste. */
export async function applyBatch(
  db: PrismaClient,
  owner: Owner,
  records: PluggyStoreRecord[],
  extra: Partial<ProcessPluggyRecordsInput> = {}
) {
  const leaseToken = extra.leaseToken ?? (await testLease(db, owner.userId));
  return processPluggyRecords(db, {
    mode: "apply",
    ownerUserId: owner.userId,
    accountLinkId: owner.accountLinkId,
    records,
    ...extra,
    leaseToken,
  });
}

export async function simulateBatch(
  db: PrismaClient,
  owner: Owner,
  records: PluggyStoreRecord[],
  extra: Partial<ProcessPluggyRecordsInput> = {}
) {
  return processPluggyRecords(db, {
    mode: "simulate",
    ownerUserId: owner.userId,
    accountLinkId: owner.accountLinkId,
    records,
    ...extra,
  });
}

export function byExternalId<T extends { externalId: string }>(items: T[]): Record<string, T> {
  return Object.fromEntries(items.map((i) => [i.externalId, i]));
}

/** Grupo de parcelas legado (como a importação por PDF cria), com as transações indicadas. */
export async function createLegacyInstallments(
  db: PrismaClient,
  owner: Owner,
  opts: {
    description: string;
    amount: number;
    total: number;
    startDay: string;
    items: Array<{ number: number; day: string; description?: string }>;
  }
) {
  const group = await db.installment.create({
    data: {
      description: opts.description,
      totalAmount: opts.amount * opts.total,
      totalInstallments: opts.total,
      installmentAmount: opts.amount,
      startDate: noonUtc(opts.startDay),
      origin: owner.originName,
      userId: owner.userId,
    },
  });
  const txs = [];
  for (const item of opts.items) {
    txs.push(
      await db.transaction.create({
        data: {
          userId: owner.userId,
          description: item.description ?? opts.description + " - Parcela " + item.number + "/" + opts.total,
          amount: -opts.amount,
          date: noonUtc(item.day),
          type: "EXPENSE",
          origin: owner.originName,
          isInstallment: true,
          installmentId: group.id,
          currentInstallment: item.number,
          totalInstallments: opts.total,
        },
      })
    );
  }
  return { group, txs };
}

