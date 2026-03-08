import { NextRequest, NextResponse } from "next/server"
import { handleUpdate } from "@/lib/telegram/bot"
import type { TelegramUpdate } from "@/lib/telegram/client"

export async function POST(request: NextRequest) {
  try {
    // Validate webhook secret
    const secret = request.headers.get("x-telegram-bot-api-secret-token")
    if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const update: TelegramUpdate = await request.json()

    await handleUpdate(update)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Telegram webhook error:", error)
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    )
  }
}
