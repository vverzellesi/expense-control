import { describe, it, expect, vi, beforeEach } from "vitest"
import { findDuplicate, filterDuplicates } from "./dedup"

// Mock prisma
vi.mock("@/lib/db", () => ({
  default: {
    transaction: {
      findFirst: vi.fn(),
    },
  },
}))

import prisma from "@/lib/db"

const mockFindFirst = vi.mocked(prisma.transaction.findFirst)

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
    mockFindFirst.mockResolvedValue(existingTx as never)

    const result = await findDuplicate({
      userId: "user1",
      description: "PIX REST FULANO",
      amount: -45.9,
      date: new Date("2026-03-05T08:00:00"),
    })

    expect(result).toEqual(existingTx)
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user1",
        description: {
          equals: "PIX REST FULANO",
          mode: "insensitive",
        },
        amount: -45.9,
        date: {
          gte: expect.any(Date),
          lte: expect.any(Date),
        },
        deletedAt: null,
      },
    })
  })

  it("returns null when no duplicate exists", async () => {
    mockFindFirst.mockResolvedValue(null)

    const result = await findDuplicate({
      userId: "user1",
      description: "UBER TRIP",
      amount: -23.5,
      date: new Date("2026-03-05"),
    })

    expect(result).toBeNull()
  })

  it("trims description before comparing", async () => {
    mockFindFirst.mockResolvedValue(null)

    await findDuplicate({
      userId: "user1",
      description: "  PIX REST FULANO  ",
      amount: -45.9,
      date: new Date("2026-03-05"),
    })

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          description: {
            equals: "PIX REST FULANO",
            mode: "insensitive",
          },
        }),
      })
    )
  })

  it("uses day boundaries for date comparison", async () => {
    mockFindFirst.mockResolvedValue(null)

    await findDuplicate({
      userId: "user1",
      description: "TEST",
      amount: -10,
      date: new Date("2026-03-05T14:30:00"),
    })

    const call = mockFindFirst.mock.calls[0][0]
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
    mockFindFirst
      .mockResolvedValueOnce({ id: "existing" } as never) // first is dup
      .mockResolvedValueOnce(null) // second is unique

    const transactions = [
      { description: "DUP", amount: -10, date: new Date("2026-03-05") },
      { description: "NEW", amount: -20, date: new Date("2026-03-05") },
    ]

    const result = await filterDuplicates("user1", transactions)

    expect(result.unique).toHaveLength(1)
    expect(result.unique[0].description).toBe("NEW")
    expect(result.duplicateCount).toBe(1)
  })
})
