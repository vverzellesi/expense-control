import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { parseExpenseMessage } from "./parser"

describe("parseExpenseMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 7, 14, 0, 0)) // 2026-03-07
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("parses full message with description, amount and date", () => {
    const result = parseExpenseMessage("PIX RESTAURANTE FULANO 45,90 05/03/2026")
    expect(result).toEqual({
      description: "PIX RESTAURANTE FULANO",
      amount: 45.9,
      date: new Date(2026, 2, 5, 12, 0, 0),
    })
  })

  it("assumes today when date is omitted", () => {
    const result = parseExpenseMessage("UBER *TRIP 23,50")
    expect(result).toEqual({
      description: "UBER *TRIP",
      amount: 23.5,
      date: new Date(2026, 2, 7, 12, 0, 0),
    })
  })

  it("handles amount with thousands separator", () => {
    const result = parseExpenseMessage("COMPRA GRANDE 1.234,56 05/03/2026")
    expect(result).toEqual({
      description: "COMPRA GRANDE",
      amount: 1234.56,
      date: new Date(2026, 2, 5, 12, 0, 0),
    })
  })

  it("returns null for messages without amount", () => {
    expect(parseExpenseMessage("hello")).toBeNull()
    expect(parseExpenseMessage("just a text message")).toBeNull()
  })

  it("returns null for empty messages", () => {
    expect(parseExpenseMessage("")).toBeNull()
    expect(parseExpenseMessage("  ")).toBeNull()
  })

  it("handles amount at start of message", () => {
    const result = parseExpenseMessage("45,90 LANCHE 05/03/2026")
    expect(result).not.toBeNull()
    expect(result!.amount).toBe(45.9)
    expect(result!.description).toBe("LANCHE")
  })

  it("handles simple amount without thousands", () => {
    const result = parseExpenseMessage("SPOTIFY 21,90")
    expect(result).toEqual({
      description: "SPOTIFY",
      amount: 21.9,
      date: new Date(2026, 2, 7, 12, 0, 0),
    })
  })
})
