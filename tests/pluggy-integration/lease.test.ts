import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  acquirePluggyLease,
  PluggyLeaseLostError,
  releasePluggyLease,
  renewPluggyLease,
} from "@/lib/pluggy/lease";
import { processPluggyRecords } from "@/lib/pluggy/store";
import { createOwner, createTestClient, rec, resetDatabase, type Owner } from "./helpers";

const db: PrismaClient = createTestClient();
const other: PrismaClient = createTestClient();

afterAll(async () => {
  await db.$disconnect();
  await other.$disconnect();
});

let owner: Owner;

beforeEach(async () => {
  await resetDatabase(db);
  owner = await createOwner(db);
});

function apply(client: PrismaClient, token: string, records = [rec({ externalId: "w_1" })], extra = {}) {
  return processPluggyRecords(client, {
    mode: "apply",
    ownerUserId: owner.userId,
    accountLinkId: owner.accountLinkId,
    records,
    leaseToken: token,
    ...extra,
  });
}

async function expireLease(userId: string) {
  await other.$executeRaw`UPDATE "PluggySyncLease" SET "expiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 second' WHERE "userId" = ${userId}`;
}

describe("lease", () => {
  it("só um worker adquire; renova, libera e é readquirido", async () => {
    const [a, b] = await Promise.all([acquirePluggyLease(db, owner.userId), acquirePluggyLease(other, owner.userId)]);
    expect([a, b].filter(Boolean)).toHaveLength(1);
    const token = (a ?? b) as string;
    expect(await renewPluggyLease(db, owner.userId, token)).toBe(true);
    expect(await renewPluggyLease(db, owner.userId, "not-the-owner")).toBe(false);
    expect(await acquirePluggyLease(db, owner.userId)).toBeNull();
    expect(await releasePluggyLease(db, owner.userId, token)).toBe(true);
    expect(await acquirePluggyLease(db, owner.userId)).not.toBeNull();
  });

  it("lease expirado é tomado por outro worker, e o token antigo não renova", async () => {
    const a = (await acquirePluggyLease(db, owner.userId)) as string;
    await expireLease(owner.userId);
    const b = await acquirePluggyLease(other, owner.userId);
    expect(b).not.toBeNull();
    expect(b).not.toBe(a);
    expect(await renewPluggyLease(db, owner.userId, a)).toBe(false);
  });

  it("validade gravada em UTC, coerente com o que o Prisma lê (servidor em qualquer fuso)", async () => {
    const before = Date.now();
    await acquirePluggyLease(db, owner.userId, 60_000);
    const row = await db.pluggySyncLease.findUniqueOrThrow({ where: { userId: owner.userId } });
    expect(Math.abs(row.expiresAt.getTime() - (before + 60_000))).toBeLessThan(10_000);
  });

  it("execução sem novidades com lease expirado não atualiza nada", async () => {
    const token = (await acquirePluggyLease(db, owner.userId)) as string;
    await apply(db, token);
    const link = await db.pluggyTransactionLink.findFirstOrThrow();
    await expireLease(owner.userId);
    await expect(apply(db, token)).rejects.toBeInstanceOf(PluggyLeaseLostError);
    const after = await db.pluggyTransactionLink.findFirstOrThrow();
    expect(after.lastSeenAt.getTime()).toBe(link.lastSeenAt.getTime());
  });

  it("worker com lease expirado não grava (mesmo com token igual)", async () => {
    const token = (await acquirePluggyLease(db, owner.userId)) as string;
    await expireLease(owner.userId);
    await expect(apply(db, token)).rejects.toBeInstanceOf(PluggyLeaseLostError);
    expect(await db.transaction.count()).toBe(0);
    expect(await db.pluggyTransactionLink.count()).toBe(0);
  });

  it("lease expira e é tomado durante uma escrita: a tomada espera o commit e o antigo dono para", async () => {
    const tokenA = (await acquirePluggyLease(db, owner.userId)) as string;
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    let paused!: () => void;
    const reachedLink = new Promise<void>((resolve) => (paused = resolve));
    let first = true;

    const workerA = apply(db, tokenA, [rec({ externalId: "a_1" }), rec({ externalId: "a_2", description: "OUTRA LOJA" })], {
      onWrite: async (step: string) => {
        if (step === "link" && first) {
          first = false;
          paused();
          await gate;
        }
      },
    });
    const outcomeA = workerA.then(
      () => "finished",
      (e) => e
    );

    await reachedLink;
    await expireLease(owner.userId);
    let bDone = false;
    const workerB = acquirePluggyLease(other, owner.userId).then((t) => {
      bDone = true;
      return t;
    });
    await new Promise((r) => setTimeout(r, 400));
    expect(bDone).toBe(false); // a troca de dono espera a escrita em andamento

    release();
    const tokenB = await workerB;
    expect(tokenB).not.toBeNull();
    expect(await outcomeA).toBeInstanceOf(PluggyLeaseLostError);

    const links = await db.pluggyTransactionLink.findMany();
    expect(links.map((l) => l.externalId)).toEqual(["a_1"]);
    expect(await db.transaction.count()).toBe(1);
  });

  it("dois workers no mesmo lote, ao mesmo tempo, não duplicam", async () => {
    const token = (await acquirePluggyLease(db, owner.userId)) as string;
    const batch = [
      rec({ externalId: "c_1" }),
      rec({ externalId: "c_2" }),
      rec({ externalId: "c_3", installmentNumber: 1, totalInstallments: 4, amountCents: 9000, description: "LOJA EXEMPLO 1/4" }),
    ];
    const results = await Promise.allSettled([apply(db, token, batch), apply(other, token, batch)]);
    // Ambos podem terminar (serializados pelo lock) ou um falhar na unicidade; nunca duplicam.
    expect(results.some((r) => r.status === "fulfilled")).toBe(true);
    expect(await db.pluggyTransactionLink.count()).toBe(3);
    expect(await db.transaction.count()).toBe(2 + 4);
    expect(await db.installment.count()).toBe(1);

    const again = await apply(db, token, batch);
    expect(again.counts.created).toBe(0);
    expect(await db.transaction.count()).toBe(6);
  });
});

