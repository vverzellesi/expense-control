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
    $transaction: vi.fn(),
  },
}))

vi.mock("./client", () => ({
  sendMessage: vi.fn().mockResolvedValue({ ok: true }),
}))

import prisma from "@/lib/db"
import { sendMessage } from "./client"
import { handleStartCommand, handleUnlinkCommand } from "./commands"
import type { TelegramMessage } from "./client"

const mockSendMessage = vi.mocked(sendMessage)
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
