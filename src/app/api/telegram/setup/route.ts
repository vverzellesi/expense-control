import { NextRequest, NextResponse } from "next/server"
import { setWebhook } from "@/lib/telegram/client"

export async function POST(request: NextRequest) {
  try {
    // Admin-only: validate setup secret
    const setupSecret = request.headers.get("x-setup-secret")
    if (!setupSecret || setupSecret !== process.env.TELEGRAM_SETUP_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { webhookUrl } = await request.json()
    if (!webhookUrl) {
      return NextResponse.json(
        { error: "webhookUrl é obrigatório" },
        { status: 400 }
      )
    }

    const secret = process.env.TELEGRAM_WEBHOOK_SECRET
    if (!secret) {
      return NextResponse.json(
        { error: "TELEGRAM_WEBHOOK_SECRET não configurado" },
        { status: 500 }
      )
    }

    const result = await setWebhook(webhookUrl, secret)
    return NextResponse.json(result)
  } catch (error) {
    console.error("Error setting up Telegram webhook:", error)
    return NextResponse.json(
      { error: "Erro ao configurar webhook" },
      { status: 500 }
    )
  }
}
