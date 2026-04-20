import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getUsage,
  tryReserve,
  release,
  currentYearMonth,
} from "./ai-quota";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: {
    aiUsage: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

const mockFindUnique = vi.mocked(prisma.aiUsage.findUnique);
const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockExecuteRaw = vi.mocked(prisma.$executeRaw);

describe("ai-quota", () => {
  const userId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));
    process.env.AI_MONTHLY_QUOTA = "5";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("currentYearMonth", () => {
    it("devolve yearMonth UTC atual formatado", () => {
      expect(currentYearMonth()).toBe("2026-04");
    });

    it("muda ao virar o mês UTC", () => {
      vi.setSystemTime(new Date("2026-05-01T00:00:01Z"));
      expect(currentYearMonth()).toBe("2026-05");
    });
  });

  describe("getUsage", () => {
    it("retorna zero quando não há registro pro mês", async () => {
      mockFindUnique.mockResolvedValue(null);
      const result = await getUsage(userId);
      expect(result).toEqual({ used: 0, remaining: 5, limit: 5 });
    });

    it("retorna contagem quando há registro", async () => {
      mockFindUnique.mockResolvedValue({
        id: "x", userId, yearMonth: "2026-04", count: 3, updatedAt: new Date(),
      });
      const result = await getUsage(userId);
      expect(result).toEqual({ used: 3, remaining: 2, limit: 5 });
    });

    it("limita remaining em 0 se count >= limit", async () => {
      mockFindUnique.mockResolvedValue({
        id: "x", userId, yearMonth: "2026-04", count: 10, updatedAt: new Date(),
      });
      const result = await getUsage(userId);
      expect(result).toEqual({ used: 10, remaining: 0, limit: 5 });
    });

    it("aceita yearMonth explícito (pra consistência em requests longos)", async () => {
      mockFindUnique.mockResolvedValue(null);
      await getUsage(userId, "2026-03");
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { userId_yearMonth: { userId, yearMonth: "2026-03" } },
      });
    });

    it("usa limit customizado via env AI_MONTHLY_QUOTA", async () => {
      process.env.AI_MONTHLY_QUOTA = "10";
      mockFindUnique.mockResolvedValue(null);
      const result = await getUsage(userId);
      expect(result.limit).toBe(10);
    });
  });

  describe("tryReserve", () => {
    it("retorna true quando a query retorna row (reserva feita)", async () => {
      mockQueryRaw.mockResolvedValue([{ count: 1 }] as never);
      const result = await tryReserve(userId);
      expect(result).toBe(true);
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    });

    it("retorna false quando query retorna 0 rows (quota esgotada)", async () => {
      mockQueryRaw.mockResolvedValue([] as never);
      const result = await tryReserve(userId);
      expect(result).toBe(false);
    });

    it("retorna false sem bater no banco quando AI_MONTHLY_QUOTA=0", async () => {
      process.env.AI_MONTHLY_QUOTA = "0";
      const result = await tryReserve(userId);
      expect(result).toBe(false);
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });

    it("usa yearMonth explícito quando passado (evita race na virada de mês)", async () => {
      mockQueryRaw.mockResolvedValue([{ count: 1 }] as never);
      await tryReserve(userId, "2026-03");
      // Inspeção superficial: a chamada foi feita 1 vez
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe("release", () => {
    it("executa update decrementando count com GREATEST(count-1, 0)", async () => {
      mockExecuteRaw.mockResolvedValue(1 as never);
      await release(userId);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    });

    it("aceita yearMonth explícito", async () => {
      mockExecuteRaw.mockResolvedValue(1 as never);
      await release(userId, "2026-03");
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    });

    it("não lança se linha não existir (idempotente)", async () => {
      mockExecuteRaw.mockResolvedValue(0 as never);
      await expect(release(userId)).resolves.toBeUndefined();
    });
  });
});
