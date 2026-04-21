import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

// Mock dependencies before imports
vi.mock("@/lib/db", () => ({
  default: {
    telegramLinkToken: {
      findUnique: vi.fn(),
      delete: vi.fn(),
    },
    telegramLink: {
      findUnique: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
    telegramPendingImport: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    telegramPhotoQueue: {
      create: vi.fn(),
      updateMany: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock("./client", () => ({
  sendMessage: vi.fn().mockResolvedValue({ ok: true }),
  editMessageText: vi.fn().mockResolvedValue({ ok: true }),
  getFile: vi.fn(),
  downloadFileBuffer: vi.fn(),
}))

vi.mock("@/lib/parse-pipeline", () => ({
  parseFileForImport: vi.fn(),
}))

vi.mock("@/lib/dedup", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dedup")>()
  return {
    ...actual,
    findDuplicate: vi.fn(),
    filterDuplicates: vi.fn(),
  }
})

vi.mock("@/lib/categorizer", () => ({
  suggestCategory: vi.fn(),
  detectInstallment: vi.fn().mockReturnValue({ isInstallment: false }),
  detectRecurringTransaction: vi.fn().mockReturnValue({ isRecurring: false }),
}))

vi.mock("@/lib/import-service", () => ({
  importTransactions: vi.fn(),
}))

vi.mock("@/lib/rate-limit/ai-quota", () => ({
  getUsage: vi.fn(),
  hasQuota: vi.fn(),
  increment: vi.fn(),
  tryReserve: vi.fn(),
  release: vi.fn(),
}))

import prisma from "@/lib/db"
import { sendMessage, editMessageText, getFile, downloadFileBuffer } from "./client"
import {
  handleStartCommand,
  handleUnlinkCommand,
  handlePhotoMessage,
  handlePhotoConfirm,
  handlePhotoCancel,
  handlePhotoReview,
  handlePhotoToggle,
  handlePhotoCategoryPicker,
  handlePhotoSetCategory,
  handlePhotoBackToSummary,
} from "./commands"
import type { TelegramMessage } from "./client"
import { parseFileForImport } from "@/lib/parse-pipeline"
import { suggestCategory } from "@/lib/categorizer"
import { filterDuplicates } from "@/lib/dedup"
import { importTransactions } from "@/lib/import-service"
import { getUsage } from "@/lib/rate-limit/ai-quota"

const mockSendMessage = vi.mocked(sendMessage)
const mockEditMessageText = vi.mocked(editMessageText)
const mockGetFile = vi.mocked(getFile)
const mockDownloadFileBuffer = vi.mocked(downloadFileBuffer)
const mockParsePipeline = vi.mocked(parseFileForImport)
const mockSuggestCategory = vi.mocked(suggestCategory)
const mockFilterDuplicates = vi.mocked(filterDuplicates)
const mockImportTransactions = vi.mocked(importTransactions)
const mockGetUsage = vi.mocked(getUsage)
const mockFindUniqueToken = vi.mocked(prisma.telegramLinkToken.findUnique)
const mockFindUniqueLink = vi.mocked(prisma.telegramLink.findUnique)
const mockTransaction = vi.mocked(prisma.$transaction)

function makeMessage(text: string, chatId = 12345): TelegramMessage {
  return {
    message_id: 1,
    chat: { id: chatId, type: "private" },
    date: Date.now(),
    text,
  }
}

describe("handleStartCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("sends welcome message when no token provided and user not linked", async () => {
    const message = makeMessage("/start")

    await handleStartCommand(message, null)

    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("Bem-vindo ao MyPocket Bot")
    )
  })

  it("sends already-linked message when no token but user exists", async () => {
    const message = makeMessage("/start")

    await handleStartCommand(message, "user-1")

    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("já está vinculada")
    )
  })

  it("sends error when token is invalid", async () => {
    const message = makeMessage("/start invalid-token")
    mockFindUniqueToken.mockResolvedValue(null)

    await handleStartCommand(message, null)

    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("Token inválido")
    )
  })

  it("sends error when token is expired", async () => {
    const message = makeMessage("/start expired-token")
    mockFindUniqueToken.mockResolvedValue({
      id: "token-1",
      token: "expired-token",
      userId: "user-1",
      expiresAt: new Date(Date.now() - 60000), // 1 minute ago
      createdAt: new Date(),
    } as never)

    await handleStartCommand(message, null)

    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("Token expirado")
    )
  })

  it("sends error when chatId is already linked to another account", async () => {
    const message = makeMessage("/start valid-token")
    mockFindUniqueToken.mockResolvedValue({
      id: "token-1",
      token: "valid-token",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 600000), // 10 min in future
      createdAt: new Date(),
    } as never)
    mockFindUniqueLink.mockResolvedValue({
      id: "link-1",
      userId: "user-2",
      chatId: "12345",
      linkedAt: new Date(),
    } as never)

    await handleStartCommand(message, null)

    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("já está vinculado a outra conta")
    )
  })

  it("creates link and deletes token on valid token", async () => {
    const message = makeMessage("/start valid-token")
    mockFindUniqueToken.mockResolvedValue({
      id: "token-1",
      token: "valid-token",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 600000),
      createdAt: new Date(),
    } as never)
    mockFindUniqueLink.mockResolvedValue(null)
    mockTransaction.mockResolvedValue([{}, {}] as never)

    await handleStartCommand(message, null)

    expect(mockTransaction).toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("vinculada com sucesso")
    )
  })

  it("handles transaction error gracefully", async () => {
    const message = makeMessage("/start valid-token")
    mockFindUniqueToken.mockResolvedValue({
      id: "token-1",
      token: "valid-token",
      userId: "user-1",
      expiresAt: new Date(Date.now() + 600000),
      createdAt: new Date(),
    } as never)
    mockFindUniqueLink.mockResolvedValue(null)
    mockTransaction.mockRejectedValue(new Error("Unique constraint"))

    await handleStartCommand(message, null)

    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("Erro ao vincular")
    )
  })
})

describe("handleUnlinkCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("deletes link and sends confirmation", async () => {
    const mockDeleteMany = vi.mocked(prisma.telegramLink.deleteMany)
    mockDeleteMany.mockResolvedValue({ count: 1 } as never)

    await handleUnlinkCommand(12345, "user-1")

    expect(mockDeleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    })
    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("desvinculada")
    )
  })
})

// Photo import tests

function makePhotoMessage(chatId = 12345): TelegramMessage {
  return {
    message_id: 1,
    chat: { id: chatId, type: "private" },
    date: Date.now(),
    photo: [
      { file_id: "small", file_unique_id: "s1", width: 100, height: 100 },
      { file_id: "large", file_unique_id: "l1", width: 800, height: 600 },
    ],
  }
}

// Helper to setup queue mocks for single-photo tests (batch of 1)
function setupSinglePhotoQueueMocks() {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
  vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 1 } as never)
  vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
    { id: "q1", fileId: "large", mediaGroupId: "single_1", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
  ] as never)
  vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 1 } as never)
}

describe("handlePhotoMessage", () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.useRealTimers() })

  it("processes photo and sends summary with transactions", async () => {
    setupSinglePhotoQueueMocks()
    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake-image"))

    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "Fatura C6",
      transactions: [
        {
          date: new Date(2026, 2, 14),
          description: "COMPRA",
          amount: -50,
          type: "EXPENSE",
          confidence: 85,
        },
      ],
      source: "regex",
      usedFallback: true,
      aiEnabled: false,
      aiAttempted: false,
      fallbackReason: "disabled",
      confidence: 85,
    })

    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockResolvedValue({
      unique: [{
        description: "COMPRA",
        amount: -50,
        date: new Date(2026, 2, 14),
        categoryId: null,
        type: "EXPENSE",
        selected: true,
        isInstallment: false,
        currentInstallment: null,
        totalInstallments: null,
      }],
      duplicateCount: 0,
    } as never)

    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-1" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })

    const promise = handlePhotoMessage(makePhotoMessage(), "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    expect(mockGetFile).toHaveBeenCalledWith("large")
    expect(mockParsePipeline).toHaveBeenCalled()
  })

  it("handles no transactions found after OCR (empty text)", async () => {
    setupSinglePhotoQueueMocks()
    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline.mockResolvedValue({
      kind: "error",
      error: "no_transactions_found",
      rawText: "",
    })
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })

    const promise = handlePhotoMessage(makePhotoMessage(), "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    // With batch flow, pipeline error means 0 transactions, so it shows "Nenhuma transacao encontrada nas imagens"
    const lastCall = mockSendMessage.mock.calls[mockSendMessage.mock.calls.length - 1] ||
                     mockEditMessageText.mock.calls[mockEditMessageText.mock.calls.length - 1]
    expect(lastCall).toBeDefined()
  })

  it("handles no transactions found after parsing", async () => {
    setupSinglePhotoQueueMocks()
    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline.mockResolvedValue({
      kind: "error",
      error: "no_transactions_found",
      rawText: "some random text",
    })
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })

    const promise = handlePhotoMessage(makePhotoMessage(), "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    // Should show no-transactions message
    const editCalls = mockEditMessageText.mock.calls
    const lastEdit = editCalls[editCalls.length - 1]
    if (lastEdit) {
      expect(lastEdit[2]).toContain("Nenhuma transação encontrada")
    } else {
      // Falls through to sendMessage
      const sendCalls = mockSendMessage.mock.calls
      expect(sendCalls[sendCalls.length - 1][1]).toContain("Nenhuma transação encontrada")
    }
  })

  it("reports all duplicates when all transactions exist", async () => {
    setupSinglePhotoQueueMocks()
    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "Fatura C6",
      transactions: [
        {
          date: new Date(2026, 2, 14),
          description: "COMPRA",
          amount: -50,
          type: "EXPENSE",
          confidence: 85,
        },
      ],
      source: "regex",
      usedFallback: true,
      aiEnabled: false,
      aiAttempted: false,
      fallbackReason: "disabled",
      confidence: 85,
    })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockResolvedValue({ unique: [], duplicateCount: 1 } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })

    const promise = handlePhotoMessage(makePhotoMessage(), "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    // Check that duplicates message was sent (via editMessageText since progressMsg exists)
    const editCalls = mockEditMessageText.mock.calls
    const lastEdit = editCalls[editCalls.length - 1]
    if (lastEdit) {
      expect(lastEdit[2]).toContain("já existem no sistema")
    } else {
      const sendCalls = mockSendMessage.mock.calls
      expect(sendCalls[sendCalls.length - 1][1]).toContain("já existem no sistema")
    }
  })
})

describe("handlePhotoConfirm", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("imports selected transactions", async () => {
    const payload = {
      transactions: [
        {
          description: "COMPRA",
          amount: -50,
          date: "2026-03-14",
          categoryId: null,
          type: "EXPENSE",
          selected: true,
          isInstallment: false,
          currentInstallment: null,
          totalInstallments: null,
        },
      ],
      bank: "Fatura C6",
      confidence: 85,
    }
    vi.mocked(prisma.telegramPendingImport.findUnique).mockResolvedValue({
      id: "p1",
      userId: "user-1",
      chatId: "12345",
      payload: JSON.stringify(payload),
      origin: "Fatura C6",
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(),
    } as never)
    vi.mocked(prisma.telegramPendingImport.delete).mockResolvedValue({} as never)
    mockImportTransactions.mockResolvedValue({
      created: [{
        id: "t1",
        description: "COMPRA",
        amount: -50,
        date: new Date(),
        type: "EXPENSE",
        categoryId: null,
        recurringExpenseId: null,
      }],
      skippedCount: 0,
      linkedCount: 0,
      carryoverLinkedCount: 0,
      installmentGroupsCreated: 0,
      futureInstallmentsCreated: 0,
      linkedCarryovers: [],
    } as never)

    await handlePhotoConfirm(12345, 1, "user-1", "p1")

    expect(mockImportTransactions).toHaveBeenCalledWith("user-1", expect.any(Array), "Fatura C6")
    expect(mockEditMessageText).toHaveBeenCalledWith(
      12345,
      1,
      expect.stringContaining("1 transações importadas")
    )
  })

  it("returns expired message when pending import is expired", async () => {
    vi.mocked(prisma.telegramPendingImport.findUnique).mockResolvedValue({
      id: "p1",
      userId: "user-1",
      chatId: "12345",
      payload: "{}",
      origin: "test",
      expiresAt: new Date(Date.now() - 60000),
      createdAt: new Date(),
    } as never)
    vi.mocked(prisma.telegramPendingImport.delete).mockResolvedValue({} as never)

    await handlePhotoConfirm(12345, 1, "user-1", "p1")

    expect(mockEditMessageText).toHaveBeenCalledWith(
      12345,
      1,
      expect.stringContaining("expirada")
    )
  })
})

describe("handlePhotoCancel", () => {
  it("deletes pending and confirms cancellation", async () => {
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 1 } as never)

    await handlePhotoCancel(12345, 1, "user-1", "p1")

    expect(mockEditMessageText).toHaveBeenCalledWith(12345, 1, "Importação cancelada.")
  })
})

describe("handlePhotoMessage - media group batching", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("stores file_id in queue and claims batch for media group", async () => {
    const msg = makePhotoMessage()
    msg.media_group_id = "group-1"

    // Mock queue operations
    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 2 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
      { id: "q1", fileId: "large", mediaGroupId: "group-1", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 1 } as never)

    // Mock pipeline
    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "Fatura C6",
      transactions: [
        {
          date: new Date(2026, 2, 14),
          description: "COMPRA",
          amount: -50,
          type: "EXPENSE",
          confidence: 85,
        },
      ],
      source: "regex",
      usedFallback: true,
      aiEnabled: false,
      aiAttempted: false,
      fallbackReason: "disabled",
      confidence: 85,
    })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockResolvedValue({
      unique: [{ description: "COMPRA", amount: -50, date: new Date(2026, 2, 14), categoryId: null, type: "EXPENSE", selected: true, isInstallment: false, currentInstallment: null, totalInstallments: null }],
      duplicateCount: 0,
    } as never)
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-1" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    expect(prisma.telegramPhotoQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mediaGroupId: "group-1", fileId: "large" }) })
    )
    expect(prisma.telegramPhotoQueue.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { mediaGroupId: "group-1", userId: "user-1", claimed: false } })
    )
  })

  it("returns silently when claim fails (another handler won)", async () => {
    const msg = makePhotoMessage()
    msg.media_group_id = "group-1"

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 0 } as never)

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    // Should not attempt to process photos
    expect(mockGetFile).not.toHaveBeenCalled()
    expect(mockParsePipeline).not.toHaveBeenCalled()
  })

  it("generates unique mediaGroupId for single photos (no media_group_id)", async () => {
    const msg = makePhotoMessage()
    // No media_group_id set — should generate single_<message_id>

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
      { id: "q1", fileId: "large", mediaGroupId: "single_1", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 1 } as never)
    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "Fatura C6",
      transactions: [
        {
          date: new Date(2026, 2, 14),
          description: "COMPRA",
          amount: -50,
          type: "EXPENSE",
          confidence: 85,
        },
      ],
      source: "regex",
      usedFallback: true,
      aiEnabled: false,
      aiAttempted: false,
      fallbackReason: "disabled",
      confidence: 85,
    })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockResolvedValue({
      unique: [{ description: "COMPRA", amount: -50, date: new Date(2026, 2, 14), categoryId: null, type: "EXPENSE", selected: true, isInstallment: false, currentInstallment: null, totalInstallments: null }],
      duplicateCount: 0,
    } as never)
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-1" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    expect(prisma.telegramPhotoQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ mediaGroupId: expect.stringContaining("single_") }) })
    )
  })

  it("processes multiple photos and sends progress updates", async () => {
    const msg = makePhotoMessage()
    msg.media_group_id = "group-multi"

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 2 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
      { id: "q1", fileId: "file-a", mediaGroupId: "group-multi", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
      { id: "q2", fileId: "file-b", mediaGroupId: "group-multi", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 2 } as never)

    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "Fatura C6",
      transactions: [
        {
          date: new Date(2026, 2, 14),
          description: "COMPRA",
          amount: -50,
          type: "EXPENSE",
          confidence: 85,
        },
      ],
      source: "regex",
      usedFallback: true,
      aiEnabled: false,
      aiAttempted: false,
      fallbackReason: "disabled",
      confidence: 85,
    })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockResolvedValue({
      unique: [{ description: "COMPRA", amount: -50, date: new Date(2026, 2, 14), categoryId: null, type: "EXPENSE", selected: true, isInstallment: false, currentInstallment: null, totalInstallments: null }],
      duplicateCount: 0,
    } as never)
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-1" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })
    mockEditMessageText.mockResolvedValue({ ok: true })

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    // Should download both photos
    expect(mockGetFile).toHaveBeenCalledTimes(2)

    // Should send progress message then edit it for second photo
    expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining("Processando imagem 1 de 2"))
    expect(mockEditMessageText).toHaveBeenCalledWith(
      12345, 99, expect.stringContaining("Processando imagem 2 de 2")
    )
  })

  it("cleans up queue on error", async () => {
    const msg = makePhotoMessage()
    msg.media_group_id = "group-err"

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockRejectedValue(new Error("DB error"))
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 1 } as never)

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    // Should clean up queue entries on error
    expect(prisma.telegramPhotoQueue.deleteMany).toHaveBeenCalledWith({ where: { mediaGroupId: "group-err", userId: "user-1" } })
    // Should send error message
    expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining("Erro ao processar"))
  })

  it("inclui linha '(IA · X/5 usos)' quando batch usou AI com sucesso", async () => {
    const msg = makePhotoMessage()
    msg.media_group_id = "group-ai"

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
      { id: "q1", fileId: "large", mediaGroupId: "group-ai", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 1 } as never)

    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "Nubank",
      transactions: [
        { date: new Date(), description: "PAG*IFOOD", amount: 45, type: "EXPENSE", confidence: 1 },
      ],
      source: "ai",
      usedFallback: false,
      aiEnabled: true,
      aiAttempted: true,
      confidence: 1,
    })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockResolvedValue({
      unique: [{ description: "PAG*IFOOD", amount: -45, date: new Date(), categoryId: null, type: "EXPENSE", selected: true, isInstallment: false, currentInstallment: null, totalInstallments: null }],
      duplicateCount: 0,
    } as never)
    mockGetUsage.mockResolvedValue({ used: 4, remaining: 1, limit: 5 })
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-ai" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })
    mockEditMessageText.mockResolvedValue({ ok: true })

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    // Summary should have been sent via editMessageText (progress message)
    const editCalls = mockEditMessageText.mock.calls
    const lastEdit = editCalls[editCalls.length - 1]
    const text = (lastEdit?.[2] ?? mockSendMessage.mock.calls.at(-1)?.[1] ?? "") as string
    expect(text).toContain("✨")
    expect(text).toContain("IA · 4/5")
  })

  it("AI sucesso: getUsage falhando é tolerado (best-effort) — resumo ainda sai", async () => {
    const msg = makePhotoMessage()
    msg.media_group_id = "group-ai-getusage-err"

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
      { id: "q1", fileId: "large", mediaGroupId: "group-ai-getusage-err", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 1 } as never)

    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "Nubank",
      transactions: [
        { date: new Date(), description: "PAG*IFOOD", amount: 45, type: "EXPENSE", confidence: 1 },
      ],
      source: "ai",
      usedFallback: false,
      aiEnabled: true,
      aiAttempted: true,
      confidence: 1,
    })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockResolvedValue({
      unique: [{ description: "PAG*IFOOD", amount: -45, date: new Date(), categoryId: null, type: "EXPENSE", selected: true, isInstallment: false, currentInstallment: null, totalInstallments: null }],
      duplicateCount: 0,
    } as never)
    // getUsage falha — getUsage é best-effort no summary
    mockGetUsage.mockRejectedValue(new Error("DB down"))
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-ai" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })
    mockEditMessageText.mockResolvedValue({ ok: true })

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    // Resumo AINDA deve sair (usando fallback da linha sem contador).
    const editCalls = mockEditMessageText.mock.calls
    const lastEdit = editCalls[editCalls.length - 1]
    const text = (lastEdit?.[2] ?? mockSendMessage.mock.calls.at(-1)?.[1] ?? "") as string
    expect(text).toContain("✨")
    expect(text).not.toContain("Erro ao processar")
  })

  it("fallbackReason='quota_exhausted': mensagem específica '⚠️ Cota de IA esgotada'", async () => {
    const msg = makePhotoMessage()
    msg.media_group_id = "group-quota-exhausted"

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
      { id: "q1", fileId: "large", mediaGroupId: "group-quota-exhausted", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 1 } as never)

    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "C6",
      transactions: [
        { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
      ],
      source: "regex",
      usedFallback: true,
      aiEnabled: true,
      aiAttempted: false,
      fallbackReason: "quota_exhausted",
      confidence: 0.85,
    })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockResolvedValue({
      unique: [{ description: "PIX", amount: 100, date: new Date(), categoryId: null, type: "INCOME", selected: true, isInstallment: false, currentInstallment: null, totalInstallments: null }],
      duplicateCount: 0,
    } as never)
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-fb" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })
    mockEditMessageText.mockResolvedValue({ ok: true })

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    const editCalls = mockEditMessageText.mock.calls
    const lastEdit = editCalls[editCalls.length - 1]
    const text = (lastEdit?.[2] ?? mockSendMessage.mock.calls.at(-1)?.[1] ?? "") as string
    expect(text).toContain("Cota de IA esgotada")
    expect(text).toContain("parser tradicional")
  })

  it("fallbackReason='disabled' (AI não configurada): NÃO diz 'cota esgotada' (só mensagem neutra)", async () => {
    const msg = makePhotoMessage()
    msg.media_group_id = "group-disabled"

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
      { id: "q1", fileId: "large", mediaGroupId: "group-disabled", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 1 } as never)

    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "C6",
      transactions: [
        { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
      ],
      source: "regex",
      usedFallback: true,
      aiEnabled: false,
      aiAttempted: false,
      fallbackReason: "disabled",
      confidence: 0.85,
    })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockResolvedValue({
      unique: [{ description: "PIX", amount: 100, date: new Date(), categoryId: null, type: "INCOME", selected: true, isInstallment: false, currentInstallment: null, totalInstallments: null }],
      duplicateCount: 0,
    } as never)
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-dis" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })
    mockEditMessageText.mockResolvedValue({ ok: true })

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    const editCalls = mockEditMessageText.mock.calls
    const lastEdit = editCalls[editCalls.length - 1]
    const text = (lastEdit?.[2] ?? mockSendMessage.mock.calls.at(-1)?.[1] ?? "") as string
    // Contrato crítico: quando AI não está configurada, não mentir sobre "cota esgotada".
    expect(text).not.toContain("Cota de IA esgotada")
    expect(text).not.toContain("IA indisponível")
  })

  it("fallbackReason='gate_rejected': mensagem específica 'IA não reconheceu'", async () => {
    const msg = makePhotoMessage()
    msg.media_group_id = "group-gate"

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
      { id: "q1", fileId: "large", mediaGroupId: "group-gate", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 1 } as never)

    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "C6",
      transactions: [
        { date: new Date(), description: "PIX", amount: 100, type: "INCOME", confidence: 0.85 },
      ],
      source: "regex",
      usedFallback: true,
      aiEnabled: true,
      aiAttempted: true,
      fallbackReason: "gate_rejected",
      confidence: 0.85,
    })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockResolvedValue({
      unique: [{ description: "PIX", amount: 100, date: new Date(), categoryId: null, type: "INCOME", selected: true, isInstallment: false, currentInstallment: null, totalInstallments: null }],
      duplicateCount: 0,
    } as never)
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-gate" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })
    mockEditMessageText.mockResolvedValue({ ok: true })

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    const editCalls = mockEditMessageText.mock.calls
    const lastEdit = editCalls[editCalls.length - 1]
    const text = (lastEdit?.[2] ?? mockSendMessage.mock.calls.at(-1)?.[1] ?? "") as string
    expect(text).toContain("IA não reconheceu")
  })

  it("multi-imagem + AI habilitada: processa N fotos, agrega transações e mostra contador de uso", async () => {
    // Regressão do caso reportado pelo usuário: antes da feature de AI, múltiplas
    // imagens via Telegram rodavam "eternamente" (webhook síncrono vs timeout).
    // Agora com AI on, o loop sequencial deve processar todas, agregar, e terminar
    // com resumo único mostrando IA usada e contador de quota.
    const msg = makePhotoMessage()
    msg.media_group_id = "group-multi-ai"

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 3 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
      { id: "q1", fileId: "ai-a", mediaGroupId: "group-multi-ai", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
      { id: "q2", fileId: "ai-b", mediaGroupId: "group-multi-ai", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
      { id: "q3", fileId: "ai-c", mediaGroupId: "group-multi-ai", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 3 } as never)

    mockGetFile.mockResolvedValue("photos/file.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline
      .mockResolvedValueOnce({
        kind: "success",
        bank: "Nubank",
        transactions: [{ date: new Date(), description: "IFOOD", amount: 30, type: "EXPENSE", confidence: 1 }],
        source: "ai",
        usedFallback: false,
        aiEnabled: true,
        aiAttempted: true,
        confidence: 1,
      })
      .mockResolvedValueOnce({
        kind: "success",
        bank: "Nubank",
        transactions: [{ date: new Date(), description: "UBER", amount: 18, type: "EXPENSE", confidence: 1 }],
        source: "ai",
        usedFallback: false,
        aiEnabled: true,
        aiAttempted: true,
        confidence: 1,
      })
      .mockResolvedValueOnce({
        kind: "success",
        bank: "Nubank",
        transactions: [{ date: new Date(), description: "SPOTIFY", amount: 22, type: "EXPENSE", confidence: 1 }],
        source: "ai",
        usedFallback: false,
        aiEnabled: true,
        aiAttempted: true,
        confidence: 1,
      })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockImplementation(async (_userId, txs) => ({
      unique: txs.map(t => ({ ...t, selected: true })),
      duplicateCount: 0,
    }) as never)
    mockGetUsage.mockResolvedValue({ used: 3, remaining: 2, limit: 5 })
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-multi-ai" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })
    mockEditMessageText.mockResolvedValue({ ok: true })

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    // Todas as 3 fotos foram baixadas e parseadas (loop não travou)
    expect(mockGetFile).toHaveBeenCalledTimes(3)
    expect(mockParsePipeline).toHaveBeenCalledTimes(3)
    // Progress inicial + 2 edits intermediários (não edita depois da última)
    expect(mockSendMessage).toHaveBeenCalledWith(12345, expect.stringContaining("Processando imagem 1 de 3"))
    const progressEdits = mockEditMessageText.mock.calls.filter(c => String(c[2] ?? "").includes("Processando imagem"))
    expect(progressEdits).toHaveLength(2)
    // Resumo final: 3 transações agregadas, badge AI + contador, queue limpa
    const lastEdit = mockEditMessageText.mock.calls[mockEditMessageText.mock.calls.length - 1]
    const finalText = String(lastEdit?.[2] ?? "")
    expect(finalText).toContain("✨")
    expect(finalText).toContain("3 transações")
    expect(finalText).toContain("IA · 3/5")
    expect(prisma.telegramPhotoQueue.deleteMany).toHaveBeenCalledWith({ where: { mediaGroupId: "group-multi-ai", userId: "user-1" } })
  })

  it("multi-imagem + AI: quota esgota no meio do batch, loop continua e resumo mostra fallback", async () => {
    // Edge case importante: usuário manda 3 fotos, quota permite 1 uso, as outras
    // 2 caem no parser tradicional. Loop NÃO deve abortar — cada foto é independente
    // e o fallbackReason agregado é o primeiro observado (quota_exhausted).
    const msg = makePhotoMessage()
    msg.media_group_id = "group-multi-quota"

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 3 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
      { id: "q1", fileId: "mq-a", mediaGroupId: "group-multi-quota", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
      { id: "q2", fileId: "mq-b", mediaGroupId: "group-multi-quota", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
      { id: "q3", fileId: "mq-c", mediaGroupId: "group-multi-quota", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 3 } as never)

    mockGetFile.mockResolvedValue("photos/file.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline
      .mockResolvedValueOnce({
        kind: "success",
        bank: "Nubank",
        transactions: [{ date: new Date(), description: "IFOOD", amount: 30, type: "EXPENSE", confidence: 1 }],
        source: "ai",
        usedFallback: false,
        aiEnabled: true,
        aiAttempted: true,
        confidence: 1,
      })
      .mockResolvedValueOnce({
        kind: "success",
        bank: "Nubank",
        transactions: [{ date: new Date(), description: "UBER", amount: 18, type: "EXPENSE", confidence: 0.8 }],
        source: "regex",
        usedFallback: true,
        aiEnabled: true,
        aiAttempted: false,
        fallbackReason: "quota_exhausted",
        confidence: 0.8,
      })
      .mockResolvedValueOnce({
        kind: "success",
        bank: "Nubank",
        transactions: [{ date: new Date(), description: "SPOTIFY", amount: 22, type: "EXPENSE", confidence: 0.8 }],
        source: "regex",
        usedFallback: true,
        aiEnabled: true,
        aiAttempted: false,
        fallbackReason: "quota_exhausted",
        confidence: 0.8,
      })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockImplementation(async (_userId, txs) => ({
      unique: txs.map(t => ({ ...t, selected: true })),
      duplicateCount: 0,
    }) as never)
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-multi-quota" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })
    mockEditMessageText.mockResolvedValue({ ok: true })

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    // Loop não abortou: 3 fotos processadas mesmo com mistura ai + fallback
    expect(mockGetFile).toHaveBeenCalledTimes(3)
    expect(mockParsePipeline).toHaveBeenCalledTimes(3)
    // Resumo informa fallback (prioridade temporal do primeiro observado = quota_exhausted)
    // e agrega as 3 transações (tanto as de AI quanto as de fallback).
    const lastEdit = mockEditMessageText.mock.calls[mockEditMessageText.mock.calls.length - 1]
    const finalText = String(lastEdit?.[2] ?? "")
    expect(finalText).toContain("Cota de IA esgotada")
    expect(finalText).toContain("3 transações")
    expect(finalText).not.toContain("IA · ") // não mostra contador quando tem fallbackReason
    expect(prisma.telegramPhotoQueue.deleteMany).toHaveBeenCalledWith({ where: { mediaGroupId: "group-multi-quota", userId: "user-1" } })
  })

  it("multi-imagem: uma foto falhando (parse error) não aborta o batch — outras continuam", async () => {
    // Garantia: se 1 de N fotos falhar no pipeline, o loop registra o erro e
    // segue processando as demais. Usuário recebe resumo com as que sucederam.
    const msg = makePhotoMessage()
    msg.media_group_id = "group-partial-fail"

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 3 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
      { id: "q1", fileId: "pf-a", mediaGroupId: "group-partial-fail", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
      { id: "q2", fileId: "pf-b", mediaGroupId: "group-partial-fail", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
      { id: "q3", fileId: "pf-c", mediaGroupId: "group-partial-fail", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 3 } as never)

    mockGetFile.mockResolvedValue("photos/file.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    const okResult = {
      kind: "success" as const,
      bank: "Nubank",
      transactions: [{ date: new Date(), description: "IFOOD", amount: 30, type: "EXPENSE" as const, confidence: 1 }],
      source: "ai" as const,
      usedFallback: false,
      aiEnabled: true,
      aiAttempted: true,
      confidence: 1,
    }
    mockParsePipeline
      .mockResolvedValueOnce(okResult)
      .mockRejectedValueOnce(new Error("OCR falhou pra essa imagem"))
      .mockResolvedValueOnce(okResult)
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockImplementation(async (_userId, txs) => ({
      unique: txs.map(t => ({ ...t, selected: true })),
      duplicateCount: 0,
    }) as never)
    mockGetUsage.mockResolvedValue({ used: 2, remaining: 3, limit: 5 })
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-pf" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })
    mockEditMessageText.mockResolvedValue({ ok: true })
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      const promise = handlePhotoMessage(msg, "user-1")
      await vi.advanceTimersByTimeAsync(3000)
      await promise

      // Todas as 3 tentativas ocorreram, apesar do erro na 2ª
      expect(mockParsePipeline).toHaveBeenCalledTimes(3)
      // Resumo final mostra 2 transações (fotos 1 e 3), batch não foi abortado
      const lastEdit = mockEditMessageText.mock.calls[mockEditMessageText.mock.calls.length - 1]
      const finalText = String(lastEdit?.[2] ?? "")
      expect(finalText).toContain("2 transações")
      expect(finalText).not.toContain("Erro ao processar as imagens")
      // Erro da foto 2 foi logado
      expect(errSpy).toHaveBeenCalled()
    } finally {
      errSpy.mockRestore()
    }
  })

  it("não adiciona linha de IA quando source='notif'", async () => {
    const msg = makePhotoMessage()
    msg.media_group_id = "group-notif"

    vi.mocked(prisma.telegramPhotoQueue.create).mockResolvedValue({} as never)
    vi.mocked(prisma.telegramPhotoQueue.updateMany).mockResolvedValue({ count: 1 } as never)
    vi.mocked(prisma.telegramPhotoQueue.findMany).mockResolvedValue([
      { id: "q1", fileId: "large", mediaGroupId: "group-notif", chatId: "12345", userId: "user-1", claimed: true, createdAt: new Date() },
    ] as never)
    vi.mocked(prisma.telegramPhotoQueue.deleteMany).mockResolvedValue({ count: 1 } as never)

    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockParsePipeline.mockResolvedValue({
      kind: "success",
      bank: "Nubank",
      transactions: [
        { date: new Date(), description: "CPG IFOOD", amount: 25, type: "EXPENSE", confidence: 0.9 },
      ],
      source: "notif",
      usedFallback: false,
      aiEnabled: true,
      aiAttempted: false,
      confidence: 0.9,
    })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockResolvedValue({
      unique: [{ description: "CPG IFOOD", amount: -25, date: new Date(), categoryId: null, type: "EXPENSE", selected: true, isInstallment: false, currentInstallment: null, totalInstallments: null }],
      duplicateCount: 0,
    } as never)
    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-notif" } as never)
    mockSendMessage.mockResolvedValue({ result: { message_id: 99 } })
    mockEditMessageText.mockResolvedValue({ ok: true })

    const promise = handlePhotoMessage(msg, "user-1")
    await vi.advanceTimersByTimeAsync(3000)
    await promise

    const editCalls = mockEditMessageText.mock.calls
    const lastEdit = editCalls[editCalls.length - 1]
    const text = (lastEdit?.[2] ?? mockSendMessage.mock.calls.at(-1)?.[1] ?? "") as string
    expect(text).not.toContain("IA ·")
    expect(text).not.toContain("parser tradicional")
  })
})

describe("Photo review UI", () => {
  const makePayload = (count: number) => ({
    transactions: Array.from({ length: count }, (_, i) => ({
      description: `COMPRA ${i + 1}`,
      amount: -(10 + i),
      date: new Date(2026, 2, 14).toISOString(),
      categoryId: "cat-1",
      type: "EXPENSE",
      selected: true,
      isInstallment: false,
      currentInstallment: null,
      totalInstallments: null,
    })),
    bank: "Fatura C6",
    confidence: 85,
  })

  const makePending = (id: string, payload: object) => ({
    id,
    userId: "user-1",
    chatId: "12345",
    payload: JSON.stringify(payload),
    origin: "Fatura C6",
    expiresAt: new Date(Date.now() + 60000),
    createdAt: new Date(),
  })

  beforeEach(() => { vi.clearAllMocks() })

  it("shows paginated review with 5 transactions per page", async () => {
    const payload = makePayload(12)
    vi.mocked(prisma.telegramPendingImport.findUnique).mockResolvedValue(makePending("p1", payload) as never)
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      { id: "cat-1", name: "Alimentacao" },
    ] as never)

    await handlePhotoReview(12345, 1, "user-1", "p1", 0)

    expect(vi.mocked(editMessageText)).toHaveBeenCalledWith(
      12345, 1,
      expect.stringContaining("gina 1/3"),
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
  })

  it("toggles transaction selection", async () => {
    const payload = makePayload(3)
    vi.mocked(prisma.telegramPendingImport.findUnique).mockResolvedValue(makePending("p1", payload) as never)
    vi.mocked(prisma.telegramPendingImport.update).mockResolvedValue({} as never)
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      { id: "cat-1", name: "Alimentacao" },
    ] as never)

    await handlePhotoToggle(12345, 1, "user-1", "p1", 1)

    // Verify the payload was updated with toggled selection
    expect(prisma.telegramPendingImport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({
          payload: expect.stringContaining('"selected":false'),
        }),
      })
    )
  })

  it("shows category picker for a transaction", async () => {
    const payload = makePayload(3)
    vi.mocked(prisma.telegramPendingImport.findUnique).mockResolvedValue(makePending("p1", payload) as never)
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      { id: "cat-1", name: "Alimentacao" },
      { id: "cat-2", name: "Transporte" },
    ] as never)

    await handlePhotoCategoryPicker(12345, 1, "user-1", "p1", 0)

    expect(vi.mocked(editMessageText)).toHaveBeenCalledWith(
      12345, 1,
      expect.stringContaining("Selecione a categoria"),
      expect.objectContaining({
        reply_markup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: "Alimentacao" }),
              expect.objectContaining({ text: "Transporte" }),
            ]),
          ]),
        }),
      })
    )
  })

  it("shows updated summary when going back", async () => {
    const payload = makePayload(5)
    payload.transactions[0].selected = false
    payload.transactions[2].selected = false
    vi.mocked(prisma.telegramPendingImport.findUnique).mockResolvedValue(makePending("p1", payload) as never)

    await handlePhotoBackToSummary(12345, 1, "user-1", "p1")

    expect(vi.mocked(editMessageText)).toHaveBeenCalledWith(
      12345, 1,
      expect.stringContaining("3 pronta(s) para importar"),
      expect.any(Object)
    )
    expect(vi.mocked(editMessageText)).toHaveBeenCalledWith(
      12345, 1,
      expect.stringContaining("2 desmarcada(s)"),
      expect.any(Object)
    )
  })

  it("shows expired message for invalid import", async () => {
    vi.mocked(prisma.telegramPendingImport.findUnique).mockResolvedValue(null)

    await handlePhotoReview(12345, 1, "user-1", "nonexistent", 0)

    expect(vi.mocked(editMessageText)).toHaveBeenCalledWith(
      12345, 1,
      expect.stringContaining("expirada")
    )
  })

  it("sets category on a transaction", async () => {
    const payload = makePayload(3)
    vi.mocked(prisma.telegramPendingImport.findUnique).mockResolvedValue(makePending("p1", payload) as never)
    vi.mocked(prisma.telegramPendingImport.update).mockResolvedValue({} as never)
    vi.mocked(prisma.category.findFirst).mockResolvedValue({ id: "cat-2", name: "Transporte" } as never)
    vi.mocked(prisma.category.findMany).mockResolvedValue([
      { id: "cat-1", name: "Alimentacao" },
      { id: "cat-2", name: "Transporte" },
    ] as never)

    await handlePhotoSetCategory(12345, 1, "user-1", "p1", 0, "cat-2")

    expect(prisma.telegramPendingImport.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1" },
        data: expect.objectContaining({
          payload: expect.stringContaining('"categoryId":"cat-2"'),
        }),
      })
    )
  })
})
