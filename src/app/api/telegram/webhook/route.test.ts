import { describe, it, expect, vi, beforeEach } from "vitest"

// vi.hoisted ensures the mocks are available when vi.mock factories run
const { mockWaitUntil, mockHandleUpdate } = vi.hoisted(() => ({
  mockWaitUntil: vi.fn(),
  mockHandleUpdate: vi.fn(),
}))

vi.mock("@vercel/functions", () => ({
  waitUntil: mockWaitUntil,
}))

vi.mock("@/lib/telegram/bot", () => ({
  handleUpdate: mockHandleUpdate,
}))

import { POST, maxDuration } from "./route"
import { NextRequest } from "next/server"

function makeRequest(body: object, secret = "test-secret") {
  return new NextRequest("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-telegram-bot-api-secret-token": secret,
    },
    body: JSON.stringify(body),
  })
}

describe("Telegram webhook route", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "test-secret")
    mockHandleUpdate.mockResolvedValue(undefined)
  })

  it("exports maxDuration of 300 seconds", () => {
    expect(maxDuration).toBe(300)
  })

  it("returns 200 immediately without awaiting handleUpdate", async () => {
    // handleUpdate returns a promise that never resolves during this test
    let resolveHandler!: () => void
    mockHandleUpdate.mockReturnValue(
      new Promise<void>(resolve => {
        resolveHandler = resolve
      })
    )

    const update = { update_id: 1, message: { chat: { id: 123 } } }
    const res = await POST(makeRequest(update))

    // Response is returned immediately even though handleUpdate hasn't resolved
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toEqual({ ok: true })

    // handleUpdate was called via waitUntil, not directly awaited
    expect(mockWaitUntil).toHaveBeenCalledTimes(1)

    // Clean up
    resolveHandler()
  })

  it("passes the update to handleUpdate via waitUntil", async () => {
    const update = { update_id: 42, message: { chat: { id: 456 } } }
    await POST(makeRequest(update))

    expect(mockHandleUpdate).toHaveBeenCalledWith(update)
    expect(mockWaitUntil).toHaveBeenCalledTimes(1)
  })

  it("catches handleUpdate errors without failing the response", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const error = new Error("OCR timeout")
    mockHandleUpdate.mockRejectedValue(error)

    const update = { update_id: 1, message: { chat: { id: 123 } } }
    const res = await POST(makeRequest(update))

    expect(res.status).toBe(200)

    // The catch handler is inside the promise passed to waitUntil,
    // so we need to await the promise to verify the error is caught
    const waitUntilArg = mockWaitUntil.mock.calls[0][0]
    await waitUntilArg // should not throw

    expect(consoleSpy).toHaveBeenCalledWith("Telegram handler error:", error)
    consoleSpy.mockRestore()
  })

  it("returns 503 when TELEGRAM_WEBHOOK_SECRET is not configured", async () => {
    vi.stubEnv("TELEGRAM_WEBHOOK_SECRET", "")

    const res = await POST(makeRequest({}))
    expect(res.status).toBe(503)
  })

  it("returns 401 for invalid secret", async () => {
    const res = await POST(makeRequest({}, "wrong-secret"))
    expect(res.status).toBe(401)
  })

  it("returns 200 even when request parsing fails", async () => {
    const badRequest = new NextRequest("http://localhost/api/telegram/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-bot-api-secret-token": "test-secret",
      },
      body: "not-json!!!",
    })

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const res = await POST(badRequest)

    // Returns 200 to prevent Telegram retries even on errors
    expect(res.status).toBe(200)
    consoleSpy.mockRestore()
  })
})
