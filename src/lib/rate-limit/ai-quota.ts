import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";

const DEFAULT_MONTHLY_LIMIT = 5;

function monthlyLimit(): number {
  const raw = process.env.AI_MONTHLY_QUOTA;
  if (raw === undefined || raw === null) return DEFAULT_MONTHLY_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MONTHLY_LIMIT;
  return Math.floor(parsed);
}

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getUsage(
  userId: string,
  yearMonth: string = currentYearMonth()
): Promise<{ used: number; remaining: number; limit: number }> {
  const limit = monthlyLimit();
  const row = await prisma.aiUsage.findUnique({
    where: { userId_yearMonth: { userId, yearMonth } },
  });
  const used = row?.count ?? 0;
  return { used, remaining: Math.max(0, limit - used), limit };
}

/**
 * Reserva atomicamente 1 call da quota. Retorna true se reservou; false se esgotada.
 * A atomicidade vem do INSERT ... ON CONFLICT DO UPDATE ... WHERE,
 * que só atualiza a row existente se count < limit.
 */
export async function tryReserve(
  userId: string,
  yearMonth: string = currentYearMonth()
): Promise<boolean> {
  const limit = monthlyLimit();
  if (limit <= 0) return false;

  const rows = await prisma.$queryRaw<Array<{ count: number }>>(
    Prisma.sql`
      INSERT INTO "AiUsage" ("id", "userId", "yearMonth", "count", "updatedAt")
      VALUES (gen_random_uuid()::text, ${userId}, ${yearMonth}, 1, now())
      ON CONFLICT ("userId", "yearMonth")
      DO UPDATE SET count = "AiUsage".count + 1, "updatedAt" = now()
      WHERE "AiUsage".count < ${limit}
      RETURNING count;
    `
  );
  return rows.length > 0;
}

/**
 * Libera uma reserva (quando a chamada de IA falhou ou gate reprovou).
 * Idempotente: não desce abaixo de 0.
 */
export async function release(
  userId: string,
  yearMonth: string = currentYearMonth()
): Promise<void> {
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "AiUsage"
      SET count = GREATEST(count - 1, 0), "updatedAt" = now()
      WHERE "userId" = ${userId} AND "yearMonth" = ${yearMonth};
    `
  );
}
