import { describe, it, expect, vi, beforeEach } from "vitest"
import { findDuplicate, filterDuplicates, normalizeDescription } from "./dedup"

// Mock prisma
vi.mock("@/lib/db", () => ({
  default: {
    transaction: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

import prisma from "@/lib/db"

const mockFindFirst = vi.mocked(prisma.transaction.findFirst)
const mockFindMany = vi.mocked(prisma.transaction.findMany)

describe("normalizeDescription", () => {
  it("should lowercase and trim", () => {
    expect(normalizeDescription("  NETFLIX  ")).toBe("netflix")
  })

  it("should remove dots", () => {
    expect(normalizeDescription("MERCHANT.COM")).toBe("merchantcom")
  })

  it("should remove asterisks", () => {
    expect(normalizeDescription("OPENAI *CHATGPT")).toBe("openai chatgpt")
  })

  it("should remove slashes", () => {
    expect(normalizeDescription("MERCHANT.COM/BILL")).toBe("merchantcombill")
  })

  it("should collapse multiple spaces", () => {
    expect(normalizeDescription("FOO   BAR    BAZ")).toBe("foo bar baz")
  })

  it("should normalize similar descriptions to same output", () => {
    const a = normalizeDescription("MERCHANTCOMBILL")
    const b = normalizeDescription("MERCHANT.COM/BILL")
    expect(a).toBe(b)
  })

  it("should handle empty string", () => {
    expect(normalizeDescription("")).toBe("")
  })

  it("should strip accents for comparison", () => {
    expect(normalizeDescription("Café Açaí")).toBe("cafe acai")
  })
})

describe("findDuplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns matching transaction when duplicate exists", async () => {
    const existingTx = {
      id: "tx1",
      description: "PIX REST FULANO",
      amount: -45.9,
      date: new Date("2026-03-05T15:30:00"),
    }
    mockFindMany.mockResolvedValue([existingTx] as never)

    const result = await findDuplicate({
      userId: "user1",
      description: "PIX REST FULANO",
      amount: -45.9,
      date: new Date("2026-03-05T08:00:00"),
    })

    expect(result).toEqual(existingTx)
  })

  it("returns null when no duplicate exists", async () => {
    mockFindMany.mockResolvedValue([])

    const result = await findDuplicate({
      userId: "user1",
      description: "UBER TRIP",
      amount: -23.5,
      date: new Date("2026-03-05"),
    })

    expect(result).toBeNull()
  })

  it("matches with normalized descriptions (dots, slashes removed)", async () => {
    const existingTx = {
      id: "tx1",
      description: "MERCHANT.COM/BILL",
      amount: -50,
      date: new Date("2026-03-05T12:00:00"),
    }
    mockFindMany.mockResolvedValue([existingTx] as never)

    const result = await findDuplicate({
      userId: "user1",
      description: "MERCHANTCOMBILL",
      amount: -50,
      date: new Date("2026-03-05T08:00:00"),
    })

    expect(result).toEqual(existingTx)
  })

  it("matches with asterisks removed", async () => {
    const existingTx = {
      id: "tx1",
      description: "OPENAI *CHATGPT",
      amount: -20,
      date: new Date("2026-03-05T12:00:00"),
    }
    mockFindMany.mockResolvedValue([existingTx] as never)

    const result = await findDuplicate({
      userId: "user1",
      description: "OPENAI CHATGPT",
      amount: -20,
      date: new Date("2026-03-05T08:00:00"),
    })

    expect(result).toEqual(existingTx)
  })

  it("uses day boundaries for date comparison", async () => {
    mockFindMany.mockResolvedValue([])

    await findDuplicate({
      userId: "user1",
      description: "TEST",
      amount: -10,
      date: new Date("2026-03-05T14:30:00"),
    })

    const call = mockFindMany.mock.calls[0][0]
    const dateFilter = call?.where?.date as { gte: Date; lte: Date }
    expect(dateFilter.gte.getHours()).toBe(0)
    expect(dateFilter.gte.getMinutes()).toBe(0)
    expect(dateFilter.lte.getHours()).toBe(23)
    expect(dateFilter.lte.getMinutes()).toBe(59)
  })
})

describe("filterDuplicates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("separates unique and duplicate transactions", async () => {
    // Mock findMany to return existing transactions that match "DUP"
    mockFindMany.mockResolvedValue([
      { description: "DUP", amount: -10, date: new Date("2026-03-05T12:00:00") },
    ] as never)

    const transactions = [
      { description: "DUP", amount: -10, date: new Date("2026-03-05T12:00:00") },
      { description: "NEW", amount: -20, date: new Date("2026-03-05T12:00:00") },
    ]

    const result = await filterDuplicates("user1", transactions)

    expect(result.unique).toHaveLength(1)
    expect(result.unique[0].description).toBe("NEW")
    expect(result.duplicateCount).toBe(1)
  })

  it("returns all as unique when no existing transactions", async () => {
    mockFindMany.mockResolvedValue([])

    const transactions = [
      { description: "NEW1", amount: -10, date: new Date("2026-03-05") },
      { description: "NEW2", amount: -20, date: new Date("2026-03-06") },
    ]

    const result = await filterDuplicates("user1", transactions)

    expect(result.unique).toHaveLength(2)
    expect(result.duplicateCount).toBe(0)
  })

  it("returns empty for empty input", async () => {
    const result = await filterDuplicates("user1", [])

    expect(result.unique).toHaveLength(0)
    expect(result.duplicateCount).toBe(0)
    expect(mockFindMany).not.toHaveBeenCalled()
  })

  it("detects duplicates with normalized descriptions (dots, slashes)", async () => {
    mockFindMany.mockResolvedValue([
      { description: "MERCHANT.COM/BILL", amount: -50, date: new Date("2026-03-05T12:00:00") },
    ] as never)

    const transactions = [
      { description: "MERCHANTCOMBILL", amount: -50, date: new Date("2026-03-05T12:00:00") },
    ]

    const result = await filterDuplicates("user1", transactions)

    expect(result.unique).toHaveLength(0)
    expect(result.duplicateCount).toBe(1)
  })

  it("detects duplicates with asterisks in descriptions", async () => {
    mockFindMany.mockResolvedValue([
      { description: "OPENAI *CHATGPT", amount: -20, date: new Date("2026-03-05T12:00:00") },
    ] as never)

    const transactions = [
      { description: "OPENAI CHATGPT", amount: -20, date: new Date("2026-03-05T12:00:00") },
    ]

    const result = await filterDuplicates("user1", transactions)

    expect(result.unique).toHaveLength(0)
    expect(result.duplicateCount).toBe(1)
  })
})
