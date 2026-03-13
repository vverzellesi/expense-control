function getTelegramApi() {
  return `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  callback_query?: TelegramCallbackQuery
}

export interface TelegramMessage {
  message_id: number
  from?: { id: number; first_name: string }
  chat: { id: number; type: string }
  date: number
  text?: string
  document?: TelegramDocument
}

export interface TelegramCallbackQuery {
  id: string
  from: { id: number; first_name: string }
  message?: TelegramMessage
  data?: string
}

export interface TelegramDocument {
  file_id: string
  file_name?: string
  mime_type?: string
  file_size?: number
}

export interface InlineKeyboardButton {
  text: string
  callback_data: string
}

export async function sendMessage(
  chatId: number | string,
  text: string,
  options?: {
    reply_markup?: {
      inline_keyboard: InlineKeyboardButton[][]
    }
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2"
  }
) {
  const res = await fetch(`${getTelegramApi()}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      ...options,
    }),
  })
  return res.json()
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string
) {
  const res = await fetch(`${getTelegramApi()}/answerCallbackQuery`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
    }),
  })
  return res.json()
}

export async function editMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  options?: {
    reply_markup?: {
      inline_keyboard: InlineKeyboardButton[][]
    }
    parse_mode?: "HTML" | "Markdown" | "MarkdownV2"
  }
) {
  const res = await fetch(`${getTelegramApi()}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      message_id: messageId,
      text,
      ...options,
    }),
  })
  return res.json()
}

export async function getFile(fileId: string) {
  const res = await fetch(`${getTelegramApi()}/getFile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ file_id: fileId }),
  })
  const data = await res.json()
  return data.result?.file_path as string | undefined
}

export async function downloadFile(filePath: string): Promise<string> {
  const url = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Failed to download file: ${res.status} ${res.statusText}`)
  }
  return res.text()
}

export async function setWebhook(url: string, secretToken: string) {
  const res = await fetch(`${getTelegramApi()}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url,
      secret_token: secretToken,
      allowed_updates: ["message", "callback_query"],
    }),
  })
  return res.json()
}
