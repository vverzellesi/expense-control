import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/db", () => ({
  default: {
    transaction: {
      findMany: vi.fn(),
    },
    budget: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock("./client", () => ({
  sendMessage: vi.fn().mockResolvedValue({ ok: true }),
}))

import prisma from "@/lib/db"
import { sendMessage } from "./client"
import { handleSummaryQuery } from "./queries"

const mockSendMessage = vi.mocked(sendMessage)
const mockFindManyTx = vi.mocked(prisma.transaction.findMany)
const mockFindManyBudget = vi.mocked(prisma.budget.findMany)

function makeTx(overrides: Record<string, unknown> = {}) {
  return {
    id: "tx-1",
    userId: "user-1",
    description: "Test",
    amount: -100,
    date: new Date(),
    type: "EXPENSE",
    isFixed: false,
    isInstallment: false,
    investmentTransaction: null,
    ...overrides,
  }
}

describe("handleSummaryQuery", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFindManyBudget.mockResolvedValue([])
  })

  it("includes financial health metrics in summary", async () => {
    mockFindManyTx.mockResolvedValue([
      makeTx({ amount: 5000, type: "INCOME" }),
      makeTx({ amount: -2000, type: "EXPENSE", isFixed: true }),
      makeTx({ amount: -500, type: "EXPENSE", isInstallment: true }),
      makeTx({ amount: -800, type: "EXPENSE" }),
    ] as never)

    await handleSummaryQuery(12345, "user-1")

    const message = mockSendMessage.mock.calls[0][1] as string
    expect(message).toContain("Fixas")
    expect(message).toContain("Parcelas")
    expect(message).toContain("Variável")
    expect(message).toContain("Sobra")
    expect(message).toContain("Comprometimento")
  })

  it("shows green indicator when commitment below 70%", async () => {
    mockFindManyTx.mockResolvedValue([
      makeTx({ amount: 10000, type: "INCOME" }),
      makeTx({ amount: -3000, type: "EXPENSE", isFixed: true }),
    ] as never)

    await handleSummaryQuery(12345, "user-1")

    const message = mockSendMessage.mock.calls[0][1] as string
    expect(message).toContain("🟢")
  })

  it("shows yellow indicator when commitment between 70-90%", async () => {
    mockFindManyTx.mockResolvedValue([
      makeTx({ amount: 10000, type: "INCOME" }),
      makeTx({ amount: -8000, type: "EXPENSE", isFixed: true }),
    ] as never)

    await handleSummaryQuery(12345, "user-1")

    const message = mockSendMessage.mock.calls[0][1] as string
    expect(message).toContain("🟡")
  })

  it("shows red indicator when commitment above 90%", async () => {
    mockFindManyTx.mockResolvedValue([
      makeTx({ amount: 10000, type: "INCOME" }),
      makeTx({ amount: -9500, type: "EXPENSE", isFixed: true }),
    ] as never)

    await handleSummaryQuery(12345, "user-1")

    const message = mockSendMessage.mock.calls[0][1] as string
    expect(message).toContain("🔴")
  })

  it("handles zero income gracefully", async () => {
    mockFindManyTx.mockResolvedValue([
      makeTx({ amount: -500, type: "EXPENSE", isFixed: true }),
    ] as never)

    await handleSummaryQuery(12345, "user-1")

    const message = mockSendMessage.mock.calls[0][1] as string
    expect(message).toContain("Despesas")
    expect(message).not.toContain("Comprometimento")
  })

  it("calculates variable expenses correctly", async () => {
    // Variable = total expense - fixed - installments
    mockFindManyTx.mockResolvedValue([
      makeTx({ amount: 5000, type: "INCOME" }),
      makeTx({ amount: -1000, type: "EXPENSE", isFixed: true }),
      makeTx({ amount: -500, type: "EXPENSE", isInstallment: true }),
      makeTx({ amount: -300, type: "EXPENSE" }), // variable
    ] as never)

    await handleSummaryQuery(12345, "user-1")

    const message = mockSendMessage.mock.calls[0][1] as string
    // R$ 300 variable
    expect(message).toContain("R$\u00a0300")
  })

  it("still shows budget bar when budgets exist", async () => {
    mockFindManyTx.mockResolvedValue([
      makeTx({ amount: 5000, type: "INCOME" }),
      makeTx({ amount: -2000, type: "EXPENSE", isFixed: true }),
    ] as never)
    mockFindManyBudget.mockResolvedValue([
      { id: "b-1", amount: 5000, isActive: true },
    ] as never)

    await handleSummaryQuery(12345, "user-1")

    const message = mockSendMessage.mock.calls[0][1] as string
    expect(message).toContain("Orçamento")
    expect(message).toContain("█")
  })

  it("skips investment transactions in calculations", async () => {
    mockFindManyTx.mockResolvedValue([
      makeTx({ amount: 5000, type: "INCOME" }),
      makeTx({ amount: -1000, type: "EXPENSE", isFixed: true }),
      makeTx({ amount: -500, type: "EXPENSE", investmentTransaction: { id: "inv-1" } }),
    ] as never)

    await handleSummaryQuery(12345, "user-1")

    const message = mockSendMessage.mock.calls[0][1] as string
    // Only R$ 1000 expense (investment excluded), commitment = 20%
    expect(message).toContain("🟢")
    expect(message).toContain("20%")
  })
})
