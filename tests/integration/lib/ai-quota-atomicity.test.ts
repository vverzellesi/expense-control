import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { tryReserve, release, currentYearMonth } from "@/lib/rate-limit/ai-quota";

describe("ai-quota atomicity (integration, PostgreSQL)", () => {
  const userId = "integration-test-user";
  let yearMonth: string;

  beforeEach(async () => {
    yearMonth = currentYearMonth();
    // garantir user e limpar estado
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: `${userId}@test.local`,
      },
      update: {},
    });
    await prisma.aiUsage.deleteMany({ where: { userId } });
    process.env.AI_MONTHLY_QUOTA = "5";
  });

  it("10 tryReserve concorrentes com limit=5 → exatamente 5 reservam", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => tryReserve(userId, yearMonth))
    );
    const reserved = results.filter(Boolean).length;
    expect(reserved).toBe(5);

    const row = await prisma.aiUsage.findUnique({
      where: { userId_yearMonth: { userId, yearMonth } },
    });
    expect(row?.count).toBe(5);
  });

  it("release após reserva decrementa, permitindo nova reserva", async () => {
    for (let i = 0; i < 5; i++) await tryReserve(userId, yearMonth);
    expect(await tryReserve(userId, yearMonth)).toBe(false);

    await release(userId, yearMonth);
    expect(await tryReserve(userId, yearMonth)).toBe(true);
  });

  it("release com count=0 é idempotente (não vai negativo)", async () => {
    await release(userId, yearMonth);
    await release(userId, yearMonth);
    const row = await prisma.aiUsage.findUnique({
      where: { userId_yearMonth: { userId, yearMonth } },
    });
    // Row pode nem existir se nunca reservou; se existir count >= 0
    expect(row?.count ?? 0).toBeGreaterThanOrEqual(0);
  });
});
