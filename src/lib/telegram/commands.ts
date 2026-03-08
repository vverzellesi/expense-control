import prisma from "@/lib/db"
import {
  sendMessage,
  answerCallbackQuery,
  editMessageText,
  getFile,
  downloadFile,
  type TelegramMessage,
  type TelegramCallbackQuery,
  type InlineKeyboardButton,
} from "./client"
import { parseExpenseMessage } from "./parser"
import { parseCSV } from "@/lib/csv-parser"
import { suggestCategory } from "@/lib/categorizer"
import { findDuplicate } from "@/lib/dedup"
import { formatCurrency } from "@/lib/utils"
import {
  handleSummaryQuery,
  handleCategoryQuery,
  handleTransactionsQuery,
} from "./queries"

export async function handleStartCommand(
  message: TelegramMessage,
  existingUserId: string | null
) {
  const chatId = message.chat.id
  const text = message.text || ""
  const token = text.replace("/start", "").trim()

  if (!token) {
    if (existingUserId) {
      return sendMessage(
        chatId,
        "Sua conta já está vinculada! Envie /menu para ver as opções."
      )
    }
    return sendMessage(
      chatId,
      "Bem-vindo ao MyPocket Bot!\n\nPara vincular sua conta, acesse Configurações > Telegram no app e clique em \"Vincular Telegram\"."
    )
  }

  // Validate token
  const linkToken = await prisma.telegramLinkToken.findUnique({
    where: { token },
  })

  if (!linkToken) {
    return sendMessage(chatId, "Token inválido. Gere um novo link nas configurações do app.")
  }

  if (linkToken.expiresAt < new Date()) {
    await prisma.telegramLinkToken.delete({ where: { id: linkToken.id } })
    return sendMessage(chatId, "Token expirado. Gere um novo link nas configurações do app.")
  }

  // Check if chatId already linked to another account
  const existingChatLink = await prisma.telegramLink.findUnique({
    where: { chatId: String(chatId) },
  })
  if (existingChatLink) {
    return sendMessage(
      chatId,
      "Este chat já está vinculado a outra conta. Desvincule primeiro com /desvincular."
    )
  }

  // Create link and delete token
  try {
    await prisma.$transaction([
      prisma.telegramLink.create({
        data: {
          userId: linkToken.userId,
          chatId: String(chatId),
        },
      }),
      prisma.telegramLinkToken.delete({ where: { id: linkToken.id } }),
    ])

    return sendMessage(
      chatId,
      "Conta vinculada com sucesso! \n\nEnvie /menu para ver as opções disponíveis."
    )
  } catch (error) {
    // Handle unique constraint violation (user already linked)
    return sendMessage(
      chatId,
      "Erro ao vincular conta. Sua conta pode já estar vinculada a outro chat."
    )
  }
}

export async function handleUnlinkCommand(
  chatId: number,
  userId: string
) {
  await prisma.telegramLink.deleteMany({
    where: { userId },
  })

  return sendMessage(
    chatId,
    "Conta desvinculada. Para vincular novamente, acesse Configurações > Telegram no app."
  )
}

export async function handleMenuCommand(
  chatId: number,
  userId: string
) {
  return sendMessage(chatId, "📊 MyPocket - Menu", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📈 Resumo do mês", callback_data: "summary:0" }],
        [{ text: "🏷️ Gastos por categoria", callback_data: "categories:0" }],
        [{ text: "📋 Últimas transações", callback_data: "txns:0" }],
      ],
    },
  })
}

export async function handleCallbackQuery(
  query: TelegramCallbackQuery,
  userId: string
) {
  const chatId = query.message?.chat.id
  const messageId = query.message?.message_id
  const data = query.data || ""

  if (!chatId || !messageId) return

  await answerCallbackQuery(query.id)

  if (data.startsWith("cancel:")) {
    return editMessageText(chatId, messageId, "Operação cancelada.")
  }

  if (data.startsWith("confirm:")) {
    const categoryIdFromData = data.replace("confirm:", "")
    return handleConfirmExpense(chatId, messageId, userId, query.message!, categoryIdFromData !== "none" ? categoryIdFromData : null)
  }

  if (data.startsWith("change_cat:")) {
    return handleShowCategories(chatId, messageId, userId)
  }

  if (data.startsWith("set_cat:")) {
    const categoryId = data.replace("set_cat:", "")
    return handleSetCategory(chatId, messageId, categoryId)
  }

  if (data.startsWith("csv_confirm:")) {
    const importKey = data.replace("csv_confirm:", "")
    return handleCsvConfirm(chatId, messageId, userId, importKey)
  }

  if (data.startsWith("csv_cancel:")) {
    return editMessageText(chatId, messageId, "Importação cancelada.")
  }

  if (data.startsWith("summary:")) {
    return handleSummaryQuery(chatId, userId)
  }

  if (data.startsWith("categories:")) {
    return handleCategoryQuery(chatId, userId)
  }

  if (data.startsWith("txns:")) {
    const offset = parseInt(data.replace("txns:", "")) || 0
    return handleTransactionsQuery(chatId, userId, offset)
  }

  if (data.startsWith("menu:")) {
    return handleMenuCommand(chatId, userId)
  }
}

export async function handleExpenseMessage(
  message: TelegramMessage,
  userId: string
) {
  const chatId = message.chat.id
  const text = message.text || ""

  const parsed = parseExpenseMessage(text)
  if (!parsed) {
    return sendMessage(
      chatId,
      "Não consegui entender. Envie no formato:\nDESCRICAO VALOR DD/MM/AAAA\n\nExemplo: PIX RESTAURANTE 45,90 05/03/2026"
    )
  }

  const { description, amount, date } = parsed

  // Auto-categorize
  const suggested = await suggestCategory(description, userId)
  const categoryName = suggested?.name || "Sem categoria"
  const categoryId = suggested?.id || null

  // Format date for display
  const dateStr = date.toLocaleDateString("pt-BR")

  const confirmData = `confirm:${categoryId || "none"}`
  const changeCatData = `change_cat:0`
  const cancelData = `cancel:0`

  return sendMessage(chatId, [
    "Nova despesa:",
    `📝 ${description}`,
    `💰 ${formatCurrency(amount)}`,
    `📅 ${dateStr}`,
    `🏷️ ${categoryName}`,
  ].join("\n"), {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Confirmar", callback_data: confirmData },
          { text: "✏️ Categoria", callback_data: changeCatData },
          { text: "❌ Cancelar", callback_data: cancelData },
        ],
      ],
    },
  })
}

async function handleConfirmExpense(
  chatId: number,
  messageId: number,
  userId: string,
  message: TelegramMessage,
  overrideCategoryId: string | null = null
) {
  // Parse expense data from the confirmation message text
  const text = message.text || ""
  const lines = text.split("\n")

  const descLine = lines.find(l => l.startsWith("📝"))
  const amountLine = lines.find(l => l.startsWith("💰"))
  const dateLine = lines.find(l => l.startsWith("📅"))
  const catLine = lines.find(l => l.startsWith("🏷️"))

  if (!descLine || !amountLine || !dateLine) {
    return editMessageText(chatId, messageId, "Erro: dados da transação não encontrados.")
  }

  const description = descLine.replace("📝 ", "")
  const amountStr = amountLine.replace("💰 ", "").replace("R$", "").replace(/\./g, "").replace(",", ".").trim()
  const amount = parseFloat(amountStr)
  const dateParts = dateLine.replace("📅 ", "").split("/")
  const date = new Date(
    parseInt(dateParts[2]),
    parseInt(dateParts[1]) - 1,
    parseInt(dateParts[0]),
    12, 0, 0
  )

  // Resolve category
  const categoryName = catLine?.replace("🏷️ ", "") || "Sem categoria"
  let category = null
  if (overrideCategoryId) {
    category = await prisma.category.findUnique({ where: { id: overrideCategoryId } })
  } else if (categoryName !== "Sem categoria") {
    category = await prisma.category.findFirst({
      where: { name: categoryName, userId },
    })
  }

  // Check for duplicate
  const duplicate = await findDuplicate({
    userId,
    description,
    amount: -Math.abs(amount),
    date,
  })

  if (duplicate) {
    return editMessageText(
      chatId,
      messageId,
      `⚠️ Transação duplicata detectada!\n\n📝 ${description}\n💰 ${formatCurrency(amount)}\n📅 ${dateLine.replace("📅 ", "")}\n\nEsta transação já existe no sistema.`
    )
  }

  // Create transaction
  await prisma.transaction.create({
    data: {
      userId,
      description,
      amount: -Math.abs(amount),
      date,
      type: "EXPENSE",
      origin: "Telegram",
      categoryId: category?.id || null,
      isFixed: false,
      isInstallment: false,
    },
  })

  const finalCategoryName = category?.name || categoryName

  return editMessageText(
    chatId,
    messageId,
    `✅ Despesa registrada!\n\n📝 ${description}\n💰 ${formatCurrency(amount)}\n📅 ${dateLine.replace("📅 ", "")}\n🏷️ ${finalCategoryName}`
  )
}

async function handleShowCategories(
  chatId: number,
  messageId: number,
  userId: string
) {
  const categories = await prisma.category.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  })

  if (categories.length === 0) {
    return editMessageText(chatId, messageId, "Nenhuma categoria cadastrada.")
  }

  // Build keyboard with categories (max 2 per row)
  const keyboard: InlineKeyboardButton[][] = []
  for (let i = 0; i < categories.length; i += 2) {
    const row: InlineKeyboardButton[] = [
      { text: categories[i].name, callback_data: `set_cat:${categories[i].id}` },
    ]
    if (i + 1 < categories.length) {
      row.push({
        text: categories[i + 1].name,
        callback_data: `set_cat:${categories[i + 1].id}`,
      })
    }
    keyboard.push(row)
  }

  keyboard.push([{ text: "❌ Cancelar", callback_data: "cancel:0" }])

  return editMessageText(chatId, messageId, "Selecione a categoria:", {
    reply_markup: { inline_keyboard: keyboard },
  })
}

async function handleSetCategory(
  chatId: number,
  messageId: number,
  categoryId: string
) {
  const category = await prisma.category.findUnique({
    where: { id: categoryId },
  })

  if (!category) {
    return editMessageText(chatId, messageId, "Categoria não encontrada.")
  }

  // Store selected category in callback data for confirm action
  const confirmData = `confirm:${categoryId}`
  const changeCatData = `change_cat:0`
  const cancelData = `cancel:0`

  return editMessageText(
    chatId,
    messageId,
    `Categoria selecionada: ${category.name}\n\nClique em Confirmar para registrar com esta categoria.`,
    {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Confirmar", callback_data: confirmData },
            { text: "✏️ Categoria", callback_data: changeCatData },
            { text: "❌ Cancelar", callback_data: cancelData },
          ],
        ],
      },
    }
  )
}

export async function handleDocumentMessage(
  message: TelegramMessage,
  userId: string
) {
  const chatId = message.chat.id
  const doc = message.document

  if (!doc) return

  // Check file extension
  const fileName = doc.file_name || ""
  if (!fileName.toLowerCase().endsWith(".csv")) {
    return sendMessage(chatId, "Apenas arquivos CSV são suportados.")
  }

  // Check file size (max 5MB to be safe)
  if (doc.file_size && doc.file_size > 5 * 1024 * 1024) {
    return sendMessage(chatId, "Arquivo muito grande. Máximo 5MB.")
  }

  try {
    // Download file
    const filePath = await getFile(doc.file_id)
    if (!filePath) {
      return sendMessage(chatId, "Erro ao acessar o arquivo.")
    }

    const content = await downloadFile(filePath)

    // Parse CSV
    const origin = "Telegram"
    const parsed = await parseCSV(content, origin)

    if (parsed.length === 0) {
      return sendMessage(chatId, "Nenhuma transação encontrada no arquivo.")
    }

    // Check for duplicates
    let duplicateCount = 0
    const uniqueTransactions: typeof parsed = []

    for (const t of parsed) {
      const amount = t.type === "EXPENSE" ? -Math.abs(t.amount) : Math.abs(t.amount)
      const dup = await findDuplicate({
        userId,
        description: t.description,
        amount,
        date: t.date,
      })
      if (dup) {
        duplicateCount++
      } else {
        uniqueTransactions.push(t)
      }
    }

    if (uniqueTransactions.length === 0) {
      return sendMessage(
        chatId,
        `Todas as ${parsed.length} transações já existem no sistema.`
      )
    }

    // Store for confirmation in database
    // Clean expired entries first
    await prisma.telegramPendingImport.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })

    const pendingImport = await prisma.telegramPendingImport.create({
      data: {
        userId,
        chatId: String(chatId),
        payload: JSON.stringify(uniqueTransactions.map(t => ({
          description: t.description,
          amount: t.amount,
          date: t.date,
          categoryId: t.suggestedCategoryId || null,
          isInstallment: t.isInstallment || false,
          currentInstallment: t.currentInstallment || null,
          totalInstallments: t.totalInstallments || null,
          type: t.type || "EXPENSE",
        }))),
        origin,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    })

    const summaryLines = [
      `📄 Arquivo: ${fileName}`,
      `📊 ${parsed.length} transações encontradas`,
    ]
    if (duplicateCount > 0) {
      summaryLines.push(`⚠️ ${duplicateCount} duplicatas ignoradas`)
    }
    summaryLines.push(`✅ ${uniqueTransactions.length} prontas para importar`)

    return sendMessage(chatId, summaryLines.join("\n"), {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "✅ Importar", callback_data: `csv_confirm:${pendingImport.id}` },
            { text: "❌ Cancelar", callback_data: `csv_cancel:0` },
          ],
        ],
      },
    })
  } catch (error) {
    console.error("CSV import error:", error)
    return sendMessage(
      chatId,
      "Erro ao processar o arquivo. Verifique se é um CSV válido (C6, Itaú ou BTG)."
    )
  }
}

export async function handleCsvConfirm(
  chatId: number,
  messageId: number,
  userId: string,
  importId: string
) {
  const pending = await prisma.telegramPendingImport.findUnique({
    where: { id: importId },
  })
  if (!pending || pending.expiresAt < new Date()) {
    if (pending) await prisma.telegramPendingImport.delete({ where: { id: importId } })
    return editMessageText(chatId, messageId, "Importação expirada. Envie o arquivo novamente.")
  }

  await prisma.telegramPendingImport.delete({ where: { id: importId } })

  const transactions = JSON.parse(pending.payload) as Array<{
    description: string
    amount: number
    date: string | Date
    categoryId: string | null
    isInstallment: boolean
    currentInstallment: number | null
    totalInstallments: number | null
    type: string
  }>

  let importedCount = 0
  for (const t of transactions) {
    const type = t.type || "EXPENSE"
    let amount = t.amount
    if (type === "EXPENSE" && amount > 0) amount = -amount
    else if (type === "INCOME" && amount < 0) amount = Math.abs(amount)

    const dateStr = typeof t.date === "string" && !(t.date as string).includes("T")
      ? t.date + "T12:00:00"
      : t.date
    const transactionDate = new Date(dateStr)

    await prisma.transaction.create({
      data: {
        userId,
        description: t.description,
        amount,
        date: transactionDate,
        type,
        origin: pending!.origin,
        categoryId: t.categoryId,
        isFixed: false,
        isInstallment: t.isInstallment,
        currentInstallment: t.currentInstallment,
        totalInstallments: t.totalInstallments,
      },
    })
    importedCount++
  }

  return editMessageText(
    chatId,
    messageId,
    `✅ ${importedCount} transações importadas com sucesso!`
  )
}
