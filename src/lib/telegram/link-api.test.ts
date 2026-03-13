import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock dependencies before imports
vi.mock("@/lib/db", () => ({
  default: {
    telegramLink: {
      findUnique: vi.fn(),
      deleteMany: vi.fn(),
    },
    telegramLinkToken: {
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

vi.mock("@/lib/auth-utils", () => ({
  getAuthenticatedUserId: vi.fn(),
  unauthorizedResponse: vi.fn(() => ({
    status: 401,
    json: { error: "Não autorizado" },
  })),
}))

// crypto.randomUUID is a native function - we test token format instead of mocking

import prisma from "@/lib/db"
import { getAuthenticatedUserId } from "@/lib/auth-utils"

const mockGetAuthenticatedUserId = vi.mocked(getAuthenticatedUserId)
const mockFindUniqueLink = vi.mocked(prisma.telegramLink.findUnique)
const mockDeleteManyLink = vi.mocked(prisma.telegramLink.deleteMany)
const mockCreateToken = vi.mocked(prisma.telegramLinkToken.create)
const mockDeleteManyToken = vi.mocked(prisma.telegramLinkToken.deleteMany)

describe("Telegram Link API", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.TELEGRAM_BOT_USERNAME = "test_bot"
  })

  describe("GET - Check link status", () => {
    it("returns linked: true when user has a TelegramLink", async () => {
      mockGetAuthenticatedUserId.mockResolvedValue("user-1")
      mockFindUniqueLink.mockResolvedValue({
        id: "link-1",
        userId: "user-1",
        chatId: "123456",
        linkedAt: new Date("2026-03-08"),
      } as never)

      const { GET } = await import("@/app/api/telegram/link/route")
      const response = await GET()
      const data = await response.json()

      expect(data.linked).toBe(true)
      expect(data.chatId).toBe("123456")
    })

    it("returns linked: false when user has no TelegramLink", async () => {
      mockGetAuthenticatedUserId.mockResolvedValue("user-1")
      mockFindUniqueLink.mockResolvedValue(null)

      const { GET } = await import("@/app/api/telegram/link/route")
      const response = await GET()
      const data = await response.json()

      expect(data.linked).toBe(false)
    })

    it("returns 401 when not authenticated", async () => {
      mockGetAuthenticatedUserId.mockRejectedValue(new Error("Unauthorized"))

      const { GET } = await import("@/app/api/telegram/link/route")
      const response = await GET()

      // unauthorizedResponse is called
      expect(response.status).toBe(401)
    })
  })

  describe("POST - Generate link token", () => {
    it("creates token and returns deep link when user not linked", async () => {
      mockGetAuthenticatedUserId.mockResolvedValue("user-1")
      mockFindUniqueLink.mockResolvedValue(null)
      mockDeleteManyToken.mockResolvedValue({ count: 0 } as never)
      mockCreateToken.mockResolvedValue({
        id: "token-1",
        token: "test-uuid-1234",
        userId: "user-1",
        expiresAt: new Date(),
        createdAt: new Date(),
      } as never)

      const { POST } = await import("@/app/api/telegram/link/route")
      const response = await POST()
      const data = await response.json()

      expect(data.token).toBeDefined()
      expect(typeof data.token).toBe("string")
      expect(data.deepLink).toBe(`https://t.me/test_bot?start=${data.token}`)
      expect(data.expiresAt).toBeDefined()
      expect(mockDeleteManyToken).toHaveBeenCalledWith({ where: { userId: "user-1" } })
    })

    it("returns 400 when user is already linked", async () => {
      mockGetAuthenticatedUserId.mockResolvedValue("user-1")
      mockFindUniqueLink.mockResolvedValue({
        id: "link-1",
        userId: "user-1",
        chatId: "123456",
        linkedAt: new Date(),
      } as never)

      const { POST } = await import("@/app/api/telegram/link/route")
      const response = await POST()
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe("Conta já vinculada ao Telegram")
    })

    it("returns 401 when not authenticated", async () => {
      mockGetAuthenticatedUserId.mockRejectedValue(new Error("Unauthorized"))

      const { POST } = await import("@/app/api/telegram/link/route")
      const response = await POST()

      expect(response.status).toBe(401)
    })
  })

  describe("DELETE - Unlink Telegram", () => {
    it("deletes link and returns linked: false", async () => {
      mockGetAuthenticatedUserId.mockResolvedValue("user-1")
      mockDeleteManyLink.mockResolvedValue({ count: 1 } as never)

      const { DELETE } = await import("@/app/api/telegram/link/route")
      const response = await DELETE()
      const data = await response.json()

      expect(data.linked).toBe(false)
      expect(mockDeleteManyLink).toHaveBeenCalledWith({ where: { userId: "user-1" } })
    })

    it("returns 401 when not authenticated", async () => {
      mockGetAuthenticatedUserId.mockRejectedValue(new Error("Unauthorized"))

      const { DELETE } = await import("@/app/api/telegram/link/route")
      const response = await DELETE()

      expect(response.status).toBe(401)
    })
  })
})
