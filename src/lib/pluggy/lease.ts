import { randomUUID } from "crypto";
import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Lease de sincronização Pluggy por usuário.
 *
 * Aquisição, troca de dono, renovação, liberação e toda escrita do caminho
 * Pluggy passam pelo MESMO `pg_advisory_xact_lock` do usuário. Dentro dele a
 * posse é conferida por token E validade, sempre com o relógio do banco
 * (`now()` em UTC, a mesma convenção com que o Prisma grava `timestamp`):
 * um worker cujo lease expirou não grava, e ninguém toma o lease no meio de
 * uma escrita em andamento (a aquisição espera o commit).
 *
 * As funções recebem o cliente de banco por parâmetro; nada de singleton.
 */

export type PluggyDbClient = PrismaClient;
export type PluggyTxClient = Prisma.TransactionClient;

export const DEFAULT_LEASE_TTL_MS = 5 * 60 * 1000;

export class PluggyLeaseLostError extends Error {
  constructor() {
    super("Pluggy sync lease is not held by this worker");
    this.name = "PluggyLeaseLostError";
  }
}

/** Exclusão mútua do usuário no caminho Pluggy (lease e escritas usam a mesma). */
export async function lockUserForPluggy(tx: PluggyTxClient, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"pluggy-sync:" + userId}, 0))`;
}

function assertTtl(ttlMs: number) {
  if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
    throw new Error("Lease TTL must be a positive integer (ms)");
  }
}

/**
 * Tenta adquirir o lease (insert, ou troca de dono quando o atual expirou).
 * Devolve o token do novo dono, ou null se outro worker detém um lease válido.
 */
export async function acquirePluggyLease(
  db: PluggyDbClient,
  userId: string,
  ttlMs: number = DEFAULT_LEASE_TTL_MS
): Promise<string | null> {
  assertTtl(ttlMs);
  const token = randomUUID();
  return db.$transaction(async (tx) => {
    await lockUserForPluggy(tx, userId);
    const rows = await tx.$queryRaw<Array<{ ownerToken: string }>>`
      INSERT INTO "PluggySyncLease" ("userId", "ownerToken", "expiresAt")
      VALUES (${userId}, ${token}, (now() AT TIME ZONE 'UTC') + make_interval(secs => ${ttlMs}::double precision / 1000))
      ON CONFLICT ("userId") DO UPDATE
        SET "ownerToken" = EXCLUDED."ownerToken", "expiresAt" = EXCLUDED."expiresAt"
        WHERE "PluggySyncLease"."expiresAt" <= (now() AT TIME ZONE 'UTC')
      RETURNING "ownerToken"`;
    return rows.length === 1 && rows[0].ownerToken === token ? token : null;
  });
}

/** Renova o lease; devolve false se o worker já não é o dono ou o lease expirou. */
export async function renewPluggyLease(
  db: PluggyDbClient,
  userId: string,
  ownerToken: string,
  ttlMs: number = DEFAULT_LEASE_TTL_MS
): Promise<boolean> {
  assertTtl(ttlMs);
  return db.$transaction(async (tx) => {
    await lockUserForPluggy(tx, userId);
    const count = await tx.$executeRaw`
      UPDATE "PluggySyncLease"
      SET "expiresAt" = (now() AT TIME ZONE 'UTC') + make_interval(secs => ${ttlMs}::double precision / 1000)
      WHERE "userId" = ${userId} AND "ownerToken" = ${ownerToken} AND "expiresAt" > (now() AT TIME ZONE 'UTC')`;
    return count === 1;
  });
}

/** Libera o lease se ainda for deste worker. */
export async function releasePluggyLease(
  db: PluggyDbClient,
  userId: string,
  ownerToken: string
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await lockUserForPluggy(tx, userId);
    const count = await tx.$executeRaw`
      DELETE FROM "PluggySyncLease" WHERE "userId" = ${userId} AND "ownerToken" = ${ownerToken}`;
    return count === 1;
  });
}

/**
 * Para uso dentro de uma transação que já chamou `lockUserForPluggy`:
 * confere token e validade com o relógio do banco. Lança PluggyLeaseLostError.
 */
export async function assertPluggyLeaseHeld(
  tx: PluggyTxClient,
  userId: string,
  ownerToken: string
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ ok: number }>>`
    SELECT 1 AS ok FROM "PluggySyncLease"
    WHERE "userId" = ${userId} AND "ownerToken" = ${ownerToken} AND "expiresAt" > (now() AT TIME ZONE 'UTC')`;
  if (rows.length !== 1) {
    throw new PluggyLeaseLostError();
  }
}

