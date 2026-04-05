import { describe, it, expect, vi, beforeEach } from "vitest"

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
      delete: vi.fn(),
      deleteMany: vi.fn(),
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

vi.mock("@/lib/ocr-parser", () => ({
  processBufferOCR: vi.fn(),
}))

vi.mock("@/lib/statement-parser", () => ({
  parseStatementText: vi.fn(),
}))

vi.mock("@/lib/notification-parser", () => ({
  parseNotificationText: vi.fn(),
}))

vi.mock("@/lib/dedup", () => ({
  findDuplicate: vi.fn(),
  filterDuplicates: vi.fn(),
}))

vi.mock("@/lib/categorizer", () => ({
  suggestCategory: vi.fn(),
  detectInstallment: vi.fn().mockReturnValue({ isInstallment: false }),
  detectRecurringTransaction: vi.fn().mockReturnValue({ isRecurring: false }),
}))

vi.mock("@/lib/import-service", () => ({
  importTransactions: vi.fn(),
}))

import prisma from "@/lib/db"
import { sendMessage, editMessageText, getFile, downloadFileBuffer } from "./client"
import {
  handleStartCommand,
  handleUnlinkCommand,
  handlePhotoMessage,
  handlePhotoConfirm,
  handlePhotoCancel,
} from "./commands"
import type { TelegramMessage } from "./client"
import { processBufferOCR } from "@/lib/ocr-parser"
import { parseStatementText } from "@/lib/statement-parser"
import { parseNotificationText } from "@/lib/notification-parser"
import { suggestCategory } from "@/lib/categorizer"
import { filterDuplicates } from "@/lib/dedup"
import { importTransactions } from "@/lib/import-service"

const mockSendMessage = vi.mocked(sendMessage)
const mockEditMessageText = vi.mocked(editMessageText)
const mockGetFile = vi.mocked(getFile)
const mockDownloadFileBuffer = vi.mocked(downloadFileBuffer)
const mockProcessBufferOCR = vi.mocked(processBufferOCR)
const mockParseStatementText = vi.mocked(parseStatementText)
const mockParseNotificationText = vi.mocked(parseNotificationText)
const mockSuggestCategory = vi.mocked(suggestCategory)
const mockFilterDuplicates = vi.mocked(filterDuplicates)
const mockImportTransactions = vi.mocked(importTransactions)
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

describe("handlePhotoMessage", () => {
  beforeEach(() => { vi.clearAllMocks() })

  it("processes photo and sends summary with transactions", async () => {
    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake-image"))

    mockProcessBufferOCR.mockResolvedValue({
      text: "14/03\nCOMPRA R$ 50,00\nCartao final 1234",
      confidence: 85,
    })

    const transaction = {
      date: new Date(2026, 2, 14),
      description: "COMPRA",
      amount: -50,
      type: "EXPENSE" as const,
      confidence: 85,
    }

    mockParseStatementText.mockReturnValue({
      bank: "Fatura C6",
      transactions: [transaction],
      averageConfidence: 85,
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
        isRecurring: false,
        recurringName: null,
      }],
      duplicateCount: 0,
    } as never)

    vi.mocked(prisma.telegramPendingImport.deleteMany).mockResolvedValue({ count: 0 } as never)
    vi.mocked(prisma.telegramPendingImport.create).mockResolvedValue({ id: "pending-1" } as never)

    await handlePhotoMessage(makePhotoMessage(), "user-1")

    expect(mockGetFile).toHaveBeenCalledWith("large")
    expect(mockProcessBufferOCR).toHaveBeenCalled()
    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("1 transaç"),
      expect.objectContaining({ reply_markup: expect.any(Object) })
    )
  })

  it("sends error when OCR returns no text", async () => {
    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockProcessBufferOCR.mockResolvedValue({ text: "", confidence: 0 })

    await handlePhotoMessage(makePhotoMessage(), "user-1")

    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("extrair texto")
    )
  })

  it("sends error when no transactions found", async () => {
    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockProcessBufferOCR.mockResolvedValue({ text: "some random text", confidence: 85 })
    mockParseStatementText.mockReturnValue({ bank: "Unknown", transactions: [], averageConfidence: 0 })
    mockParseNotificationText.mockReturnValue(null)

    await handlePhotoMessage(makePhotoMessage(), "user-1")

    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("Nenhuma transação encontrada")
    )
  })

  it("reports all duplicates when all transactions exist", async () => {
    mockGetFile.mockResolvedValue("photos/file_1.jpg")
    mockDownloadFileBuffer.mockResolvedValue(Buffer.from("fake"))
    mockProcessBufferOCR.mockResolvedValue({ text: "14/03\nCOMPRA R$ 50,00", confidence: 85 })
    mockParseStatementText.mockReturnValue({
      bank: "Fatura C6",
      transactions: [{ date: new Date(2026, 2, 14), description: "COMPRA", amount: -50, type: "EXPENSE" as const, confidence: 85 }],
      averageConfidence: 85,
    })
    mockSuggestCategory.mockResolvedValue(null)
    mockFilterDuplicates.mockResolvedValue({ unique: [], duplicateCount: 1 } as never)

    await handlePhotoMessage(makePhotoMessage(), "user-1")

    expect(mockSendMessage).toHaveBeenCalledWith(
      12345,
      expect.stringContaining("já existem no sistema")
    )
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
