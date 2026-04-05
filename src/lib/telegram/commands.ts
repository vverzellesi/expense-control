import prisma from "@/lib/db"
import {
  sendMessage,
  answerCallbackQuery,
  editMessageText,
  getFile,
  downloadFile,
  downloadFileBuffer,
  type TelegramMessage,
  type TelegramCallbackQuery,
  type InlineKeyboardButton,
} from "./client"
import { parseExpenseMessage } from "./parser"
import { parseCSV, detectBankFromContent } from "@/lib/csv-parser"
import { suggestCategory, detectInstallment, detectRecurringTransaction } from "@/lib/categorizer"
import { findDuplicate, filterDuplicates } from "@/lib/dedup"
import { importTransactions } from "@/lib/import-service"
import { processBufferOCR } from "@/lib/ocr-parser"
import { parseStatementText } from "@/lib/statement-parser"
import { parseNotificationText } from "@/lib/notification-parser"
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
    const pendingId = data.replace("confirm:", "")
    return handleConfirmExpense(chatId, messageId, userId, pendingId)
  }

  if (data.startsWith("change_cat:")) {
    const pendingId = data.replace("change_cat:", "")
    return handleShowCategories(chatId, messageId, userId, pendingId)
  }

  if (data.startsWith("set_cat:")) {
    const parts = data.replace("set_cat:", "").split(":")
    const pendingId = parts[0]
    const categoryId = parts[1]
    return handleSetCategory(chatId, messageId, pendingId, categoryId, userId)
  }

  if (data.startsWith("csv_confirm:")) {
    const importKey = data.replace("csv_confirm:", "")
    return handleCsvConfirm(chatId, messageId, userId, importKey)
  }

  if (data.startsWith("csv_cancel:")) {
    return editMessageText(chatId, messageId, "Importação cancelada.")
  }

  if (data.startsWith("phcf:")) {
    const importId = data.replace("phcf:", "")
    return handlePhotoConfirm(chatId, messageId, userId, importId)
  }

  if (data.startsWith("phcc:")) {
    const importId = data.replace("phcc:", "")
    return handlePhotoCancel(chatId, messageId, userId, importId)
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

  // Store parsed expense data in DB to avoid fragile message text parsing on confirm
  const pendingExpense = await prisma.telegramPendingImport.create({
    data: {
      userId,
      chatId: String(chatId),
      payload: JSON.stringify({
        description,
        amount,
        date: date.toISOString(),
        categoryId,
        categoryName,
      }),
      origin: "Telegram",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  })

  // Format date for display
  const dateStr = date.toLocaleDateString("pt-BR")

  const confirmData = `confirm:${pendingExpense.id}`
  const changeCatData = `change_cat:${pendingExpense.id}`
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
  pendingId: string
) {
  // Load expense data from DB instead of parsing fragile message text
  const pending = await prisma.telegramPendingImport.findUnique({
    where: { id: pendingId },
  })

  if (!pending || pending.expiresAt < new Date()) {
    if (pending) await prisma.telegramPendingImport.delete({ where: { id: pendingId } })
    return editMessageText(chatId, messageId, "Despesa expirada. Envie novamente.")
  }

  if (pending.userId !== userId) {
    return editMessageText(chatId, messageId, "Erro: despesa não encontrada.")
  }

  const data = JSON.parse(pending.payload) as {
    description: string
    amount: number
    date: string
    categoryId: string | null
    categoryName: string
  }

  await prisma.telegramPendingImport.delete({ where: { id: pendingId } })

  const { description, amount, categoryName } = data
  const date = new Date(data.date)
  const categoryId = data.categoryId

  // Resolve category (may have been changed via set_cat)
  let category = null
  if (categoryId) {
    category = await prisma.category.findFirst({
      where: { id: categoryId, userId },
    })
  }

  // Check for duplicate
  const duplicate = await findDuplicate({
    userId,
    description,
    amount: -Math.abs(amount),
    date,
  })

  const dateStr = date.toLocaleDateString("pt-BR")

  if (duplicate) {
    return editMessageText(
      chatId,
      messageId,
      `⚠️ Transação duplicata detectada!\n\n📝 ${description}\n💰 ${formatCurrency(amount)}\n📅 ${dateStr}\n\nEsta transação já existe no sistema.`
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
    `✅ Despesa registrada!\n\n📝 ${description}\n💰 ${formatCurrency(amount)}\n📅 ${dateStr}\n🏷️ ${finalCategoryName}`
  )
}

async function handleShowCategories(
  chatId: number,
  messageId: number,
  userId: string,
  pendingId: string
) {
  const categories = await prisma.category.findMany({
    where: { userId },
    orderBy: { name: "asc" },
  })

  if (categories.length === 0) {
    return editMessageText(chatId, messageId, "Nenhuma categoria cadastrada.")
  }

  // Load expense data from pending import for display
  const pending = await prisma.telegramPendingImport.findUnique({
    where: { id: pendingId },
  })
  let expenseLines = ""
  if (pending) {
    const data = JSON.parse(pending.payload) as {
      description: string
      amount: number
      date: string
    }
    const dateStr = new Date(data.date).toLocaleDateString("pt-BR")
    expenseLines = `\n📝 ${data.description}\n💰 ${formatCurrency(data.amount)}\n📅 ${dateStr}`
  }

  // Build keyboard with categories (max 2 per row)
  // Encode pendingId in callback_data so set_cat can update the pending record
  const keyboard: InlineKeyboardButton[][] = []
  for (let i = 0; i < categories.length; i += 2) {
    const row: InlineKeyboardButton[] = [
      { text: categories[i].name, callback_data: `set_cat:${pendingId}:${categories[i].id}` },
    ]
    if (i + 1 < categories.length) {
      row.push({
        text: categories[i + 1].name,
        callback_data: `set_cat:${pendingId}:${categories[i + 1].id}`,
      })
    }
    keyboard.push(row)
  }

  keyboard.push([{ text: "❌ Cancelar", callback_data: "cancel:0" }])

  return editMessageText(chatId, messageId, `Selecione a categoria:${expenseLines}`, {
    reply_markup: { inline_keyboard: keyboard },
  })
}

async function handleSetCategory(
  chatId: number,
  messageId: number,
  pendingId: string,
  categoryId: string,
  userId: string,
) {
  const category = await prisma.category.findFirst({
    where: { id: categoryId, userId },
  })

  if (!category) {
    return editMessageText(chatId, messageId, "Categoria não encontrada.")
  }

  // Update pending import with new category
  const pending = await prisma.telegramPendingImport.findUnique({
    where: { id: pendingId },
  })

  if (!pending || pending.userId !== userId) {
    return editMessageText(chatId, messageId, "Erro: despesa não encontrada.")
  }

  const data = JSON.parse(pending.payload) as {
    description: string
    amount: number
    date: string
    categoryId: string | null
    categoryName: string
  }

  // Update category in pending record
  data.categoryId = categoryId
  data.categoryName = category.name
  await prisma.telegramPendingImport.update({
    where: { id: pendingId },
    data: { payload: JSON.stringify(data) },
  })

  const dateStr = new Date(data.date).toLocaleDateString("pt-BR")

  const confirmData = `confirm:${pendingId}`
  const changeCatData = `change_cat:${pendingId}`
  const cancelData = `cancel:0`

  return editMessageText(
    chatId,
    messageId,
    `Nova despesa:\n📝 ${data.description}\n💰 ${formatCurrency(data.amount)}\n📅 ${dateStr}\n🏷️ ${category.name}`,
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

    // Detect real bank origin from CSV content (not hardcoded "Telegram")
    const origin = detectBankFromContent(content)

    // Parse CSV
    const parsed = await parseCSV(content, origin)

    if (parsed.length === 0) {
      return sendMessage(chatId, "Nenhuma transação encontrada no arquivo.")
    }

    // Re-categorize with userId (parseCSV calls suggestCategory without userId)
    for (const t of parsed) {
      const suggested = await suggestCategory(t.description, userId)
      if (suggested) {
        t.suggestedCategoryId = suggested.id
      }
    }

    // Check for duplicates (batch query instead of N+1)
    const transactionsWithSignedAmount = parsed.map(t => ({
      ...t,
      amount: t.type === "EXPENSE" ? -Math.abs(t.amount) : Math.abs(t.amount),
    }))
    const { unique: uniqueTransactions, duplicateCount } = await filterDuplicates(
      userId,
      transactionsWithSignedAmount
    )

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

  // Validate that the pending import belongs to the requesting user
  if (pending.userId !== userId) {
    return editMessageText(chatId, messageId, "Erro: importação não encontrada.")
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

  // Use shared import service for full pipeline (recurring matching, carryover, dedup)
  const result = await importTransactions(
    userId,
    transactions.map(t => ({
      ...t,
      categoryId: t.categoryId,
      origin: pending.origin,
    })),
    pending.origin
  )

  const parts = [`✅ ${result.created.length} transações importadas`]
  if (result.skippedCount > 0) {
    parts.push(`${result.skippedCount} duplicatas ignoradas`)
  }
  if (result.linkedCount > 0) {
    parts.push(`${result.linkedCount} vinculadas a recorrentes`)
  }

  return editMessageText(
    chatId,
    messageId,
    parts.join("\n")
  )
}

export async function handlePhotoMessage(
  message: TelegramMessage,
  userId: string
) {
  const chatId = message.chat.id
  const photo = message.photo
  if (!photo || photo.length === 0) return

  // Use largest resolution (last element in Telegram's photo array)
  const largestPhoto = photo[photo.length - 1]

  try {
    await sendMessage(chatId, "📸 Processando imagem...")

    // Download photo as Buffer
    const filePath = await getFile(largestPhoto.file_id)
    if (!filePath) {
      return sendMessage(chatId, "Erro ao acessar a imagem. Tente novamente.")
    }
    const buffer = await downloadFileBuffer(filePath)

    // OCR
    const ocrResult = await processBufferOCR(buffer)
    if (!ocrResult.text || ocrResult.text.trim().length === 0) {
      return sendMessage(chatId, "Não foi possível extrair texto da imagem. Verifique se a foto está legível.")
    }

    // Parse statement text
    let parseResult = parseStatementText(ocrResult.text, ocrResult.confidence)
    if (parseResult.transactions.length === 0) {
      const notificationResult = parseNotificationText(ocrResult.text, ocrResult.confidence)
      if (notificationResult) {
        parseResult = notificationResult
      }
    }

    if (parseResult.transactions.length === 0) {
      return sendMessage(chatId, "Nenhuma transação encontrada na imagem. Certifique-se de que a foto do extrato está clara e legível.")
    }

    // Categorize and detect installments/recurring
    const categorizedTransactions = []
    for (const t of parseResult.transactions) {
      const suggested = await suggestCategory(t.description, userId)
      const installment = detectInstallment(t.description)
      const recurring = detectRecurringTransaction(t.description)

      categorizedTransactions.push({
        description: t.description,
        amount: t.type === "EXPENSE" ? -Math.abs(t.amount) : Math.abs(t.amount),
        date: t.date,
        categoryId: suggested?.id || null,
        type: t.type || "EXPENSE",
        selected: true,
        isInstallment: installment.isInstallment,
        currentInstallment: installment.currentInstallment || null,
        totalInstallments: installment.totalInstallments || null,
        isRecurring: recurring.isRecurring,
        recurringName: recurring.recurringName || null,
      })
    }

    // Filter duplicates
    const transactionsForDedup = categorizedTransactions.map(t => ({
      ...t,
      date: t.date instanceof Date ? t.date : new Date(t.date),
    }))
    const { unique, duplicateCount } = await filterDuplicates(userId, transactionsForDedup)

    if (unique.length === 0) {
      return sendMessage(chatId, `Todas as ${categorizedTransactions.length} transações já existem no sistema.`)
    }

    // Calculate total
    const total = unique.reduce((sum, t) => sum + Math.abs(t.amount), 0)

    // Store in TelegramPendingImport
    await prisma.telegramPendingImport.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    })

    const payload = {
      transactions: unique.map(t => ({ ...t, selected: true })),
      bank: parseResult.bank,
      confidence: parseResult.averageConfidence,
    }

    const pendingImport = await prisma.telegramPendingImport.create({
      data: {
        userId,
        chatId: String(chatId),
        payload: JSON.stringify(payload),
        origin: parseResult.bank,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    })

    // Build summary message
    const lines = [
      `📊 ${parseResult.bank} — ${categorizedTransactions.length} transações encontradas`,
      `💰 Total: R$ ${total.toFixed(2).replace(".", ",")}`,
    ]
    if (duplicateCount > 0) {
      lines.push(`⚠️ ${duplicateCount} duplicata(s) removida(s)`)
    }
    lines.push(`✅ ${unique.length} pronta(s) para importar`)

    return sendMessage(chatId, lines.join("\n"), {
      reply_markup: {
        inline_keyboard: [[
          { text: "✅ Importar", callback_data: `phcf:${pendingImport.id}` },
          { text: "❌ Cancelar", callback_data: `phcc:${pendingImport.id}` },
        ]],
      },
    })
  } catch (error) {
    console.error("Photo import error:", error)
    return sendMessage(chatId, "Erro ao processar a imagem. Tente novamente.")
  }
}

export async function handlePhotoConfirm(
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
    return editMessageText(chatId, messageId, "Importação expirada. Envie a(s) imagem(ns) novamente.")
  }
  if (pending.userId !== userId) {
    return editMessageText(chatId, messageId, "Erro: importação não encontrada.")
  }

  await prisma.telegramPendingImport.delete({ where: { id: importId } })

  const { transactions: allTransactions } = JSON.parse(pending.payload) as {
    transactions: Array<{
      description: string
      amount: number
      date: string | Date
      categoryId: string | null
      type: string
      selected: boolean
      isInstallment: boolean
      currentInstallment: number | null
      totalInstallments: number | null
    }>
  }

  // Only import selected transactions
  const selectedTransactions = allTransactions.filter(t => t.selected)

  if (selectedTransactions.length === 0) {
    return editMessageText(chatId, messageId, "Nenhuma transação selecionada para importar.")
  }

  const result = await importTransactions(
    userId,
    selectedTransactions.map(t => ({
      ...t,
      categoryId: t.categoryId,
      origin: pending.origin,
    })),
    pending.origin
  )

  const parts = [`✅ ${result.created.length} transações importadas`]
  if (result.skippedCount > 0) parts.push(`⚠️ ${result.skippedCount} duplicatas ignoradas`)
  if (result.linkedCount > 0) parts.push(`🔗 ${result.linkedCount} vinculadas a recorrentes`)

  return editMessageText(chatId, messageId, parts.join("\n"))
}

export async function handlePhotoCancel(
  chatId: number,
  messageId: number,
  userId: string,
  importId: string
) {
  await prisma.telegramPendingImport.deleteMany({
    where: { id: importId, userId },
  })
  return editMessageText(chatId, messageId, "Importação cancelada.")
}
