import { NextResponse } from "next/server"
import prisma from "@/lib/db"
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils"
import { randomUUID } from "crypto"

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || "mypocket_bot"

// GET - Check link status
export async function GET() {
  try {
    const userId = await getAuthenticatedUserId()

    const link = await prisma.telegramLink.findUnique({
      where: { userId },
    })

    if (link) {
      return NextResponse.json({
        linked: true,
        chatId: link.chatId,
        linkedAt: link.linkedAt,
      })
    }

    return NextResponse.json({ linked: false })
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse()
    }
    return NextResponse.json(
      { error: "Erro ao verificar vinculação" },
      { status: 500 }
    )
  }
}

// POST - Generate link token
export async function POST() {
  try {
    const userId = await getAuthenticatedUserId()

    // Check if already linked
    const existingLink = await prisma.telegramLink.findUnique({
      where: { userId },
    })
    if (existingLink) {
      return NextResponse.json(
        { error: "Conta já vinculada ao Telegram" },
        { status: 400 }
      )
    }

    // Delete any existing tokens for this user
    await prisma.telegramLinkToken.deleteMany({
      where: { userId },
    })

    // Create new token
    const token = randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await prisma.telegramLinkToken.create({
      data: {
        token,
        userId,
        expiresAt,
      },
    })

    const deepLink = `https://t.me/${BOT_USERNAME}?start=${token}`

    return NextResponse.json({
      token,
      deepLink,
      expiresAt,
    })
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse()
    }
    return NextResponse.json(
      { error: "Erro ao gerar link de vinculação" },
      { status: 500 }
    )
  }
}

// DELETE - Unlink Telegram
export async function DELETE() {
  try {
    const userId = await getAuthenticatedUserId()

    await prisma.telegramLink.deleteMany({
      where: { userId },
    })

    return NextResponse.json({ linked: false })
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse()
    }
    return NextResponse.json(
      { error: "Erro ao desvincular" },
      { status: 500 }
    )
  }
}
