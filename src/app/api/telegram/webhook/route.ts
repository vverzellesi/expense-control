import { NextRequest, NextResponse } from "next/server"
import { timingSafeEqual } from "crypto"
import { waitUntil } from "@vercel/functions"
import { handleUpdate } from "@/lib/telegram/bot"
import type { TelegramUpdate } from "@/lib/telegram/client"

export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    // Validate webhook secret (timing-safe to prevent brute-force)
    const expected = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!expected) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 })
    }
    const secret = request.headers.get("x-telegram-bot-api-secret-token") || ""
    const secretBuf = Buffer.from(secret)
    const expectedBuf = Buffer.from(expected)
    if (secretBuf.length !== expectedBuf.length || !timingSafeEqual(secretBuf, expectedBuf)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const update: TelegramUpdate = await request.json()

    // Process in the background so Telegram gets an immediate 200 response.
    // Without this, heavy operations like OCR cause Telegram to time out
    // and retry the webhook repeatedly, creating duplicate progress messages.
    waitUntil(
      handleUpdate(update).catch(err =>
        console.error("Telegram handler error:", err)
      )
    )

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Telegram webhook error:", error)
    return NextResponse.json({ ok: true })
  }
}
