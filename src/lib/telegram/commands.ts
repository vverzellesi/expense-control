import {
  sendMessage,
  type TelegramMessage,
  type TelegramCallbackQuery,
} from "./client"

export async function handleStartCommand(
  message: TelegramMessage,
  existingUserId: string | null
) {
  const chatId = message.chat.id
  // Stub — full implementation in Phase 3
  return sendMessage(
    chatId,
    "Bem-vindo ao MyPocket Bot! Vinculação será implementada em breve."
  )
}

export async function handleMenuCommand(
  chatId: number,
  userId: string
) {
  // Stub — full implementation in Phase 5
  return sendMessage(chatId, "Menu em construção.")
}

export async function handleCallbackQuery(
  query: TelegramCallbackQuery,
  userId: string
) {
  // Stub — full implementation in Phase 4/5
  return
}

export async function handleUnlinkCommand(
  chatId: number,
  userId: string
) {
  // Stub — full implementation in Phase 3
  return sendMessage(chatId, "Desvinculação em construção.")
}

export async function handleExpenseMessage(
  message: TelegramMessage,
  userId: string
) {
  // Stub — full implementation in Phase 4
  return sendMessage(
    message.chat.id,
    "Registro de despesas em construção."
  )
}

export async function handleDocumentMessage(
  message: TelegramMessage,
  userId: string
) {
  // Stub — full implementation in Phase 5
  return sendMessage(
    message.chat.id,
    "Importação de CSV em construção."
  )
}
