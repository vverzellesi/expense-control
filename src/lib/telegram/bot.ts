import prisma from "@/lib/db"
import { sendMessage, type TelegramUpdate } from "./client"

export async function handleUpdate(update: TelegramUpdate) {
  const chatId =
    update.message?.chat.id ??
    update.callback_query?.message?.chat.id

  if (!chatId) return

  // Look up linked user
  const link = await prisma.telegramLink.findUnique({
    where: { chatId: String(chatId) },
  })

  // Handle /start command (linking) — always allowed, even without link
  if (update.message?.text?.startsWith("/start")) {
    const { handleStartCommand } = await import("./commands")
    return handleStartCommand(update.message, link?.userId ?? null)
  }

  // All other commands require a linked account
  if (!link) {
    return sendMessage(
      chatId,
      "Conta não vinculada. Acesse as configurações do MyPocket para vincular sua conta."
    )
  }

  const userId = link.userId

  // Route callback queries (inline keyboard buttons)
  if (update.callback_query) {
    const { handleCallbackQuery } = await import("./commands")
    return handleCallbackQuery(update.callback_query, userId)
  }

  // Route text messages
  if (update.message?.text) {
    const text = update.message.text

    if (text === "/menu") {
      const { handleMenuCommand } = await import("./commands")
      return handleMenuCommand(chatId, userId)
    }

    if (text === "/desvincular") {
      const { handleUnlinkCommand } = await import("./commands")
      return handleUnlinkCommand(chatId, userId)
    }

    // Default: try to parse as expense
    const { handleExpenseMessage } = await import("./commands")
    return handleExpenseMessage(update.message, userId)
  }

  // Route document messages (CSV files)
  if (update.message?.document) {
    const { handleDocumentMessage } = await import("./commands")
    return handleDocumentMessage(update.message, userId)
  }
}
