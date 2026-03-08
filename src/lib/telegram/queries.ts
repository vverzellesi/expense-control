import prisma from "@/lib/db"
import { formatCurrency } from "@/lib/utils"
import { sendMessage, type InlineKeyboardButton } from "./client"

export async function handleSummaryQuery(chatId: number, userId: string) {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)

  // Fetch transactions for current month
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: monthStart, lte: monthEnd },
      deletedAt: null,
    },
    include: { investmentTransaction: true },
  })

  // Calculate totals (same logic as /api/summary)
  let income = 0
  let expense = 0
  for (const t of transactions) {
    if ((t as Record<string, unknown>).investmentTransaction) continue
    if (t.type === "TRANSFER") continue
    if (t.type === "INCOME") income += Math.abs(t.amount)
    else if (t.type === "EXPENSE") expense += Math.abs(t.amount)
  }
  const balance = income - expense

  // Get total budget
  const budgets = await prisma.budget.findMany({
    where: { userId, isActive: true },
  })
  const totalBudget = budgets.reduce((sum, b) => sum + b.amount, 0)

  const monthName = monthStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

  const lines = [
    `📊 Resumo - ${monthName}`,
    "",
    `Despesas:  ${formatCurrency(expense)}`,
    `Receitas:  ${formatCurrency(income)}`,
    `Saldo:     ${formatCurrency(balance)}`,
  ]

  if (totalBudget > 0) {
    const pct = Math.round((expense / totalBudget) * 100)
    const filled = Math.round(pct / 10)
    const bar = "█".repeat(Math.min(filled, 10)) + "░".repeat(Math.max(10 - filled, 0))
    lines.push("")
    lines.push(`Orçamento: ${formatCurrency(totalBudget)}`)
    lines.push(`Usado:     ${pct}% ${bar}`)
  }

  return sendMessage(chatId, lines.join("\n"), {
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 Menu", callback_data: "menu:0" }]],
    },
  })
}

export async function handleCategoryQuery(chatId: number, userId: string) {
  const now = new Date()
  const month = now.getMonth() + 1
  const year = now.getFullYear()

  const monthStart = new Date(year, month - 1, 1)
  const monthEnd = new Date(year, month, 0, 23, 59, 59, 999)

  // Fetch expense transactions with categories
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      type: "EXPENSE",
      date: { gte: monthStart, lte: monthEnd },
      deletedAt: null,
    },
    include: { category: true },
  })

  // Aggregate by category
  const categoryTotals = new Map<string, { name: string; total: number }>()
  for (const t of transactions) {
    const catName = t.category?.name || "Sem categoria"
    const catId = t.categoryId || "none"
    const existing = categoryTotals.get(catId) || { name: catName, total: 0 }
    existing.total += Math.abs(t.amount)
    categoryTotals.set(catId, existing)
  }

  // Fetch budgets
  const budgets = await prisma.budget.findMany({
    where: { userId, isActive: true },
    include: { category: true },
  })
  const budgetMap = new Map(budgets.map(b => [b.categoryId, b.amount]))

  const monthName = monthStart.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })

  const lines = [`🏷️ Gastos por categoria - ${monthName}`, ""]

  // Sort by total descending
  const sorted = Array.from(categoryTotals.entries()).sort((a, b) => b[1].total - a[1].total)

  for (const [catId, { name, total }] of sorted) {
    const budget = budgetMap.get(catId)
    if (budget) {
      const pct = Math.round((total / budget) * 100)
      const warning = pct >= 100 ? " ⚠️" : ""
      lines.push(`${name}: ${formatCurrency(total)} / ${formatCurrency(budget)} (${pct}%)${warning}`)
    } else {
      lines.push(`${name}: ${formatCurrency(total)}`)
    }
  }

  if (sorted.length === 0) {
    lines.push("Nenhuma despesa neste mês.")
  }

  return sendMessage(chatId, lines.join("\n"), {
    reply_markup: {
      inline_keyboard: [[{ text: "🔙 Menu", callback_data: "menu:0" }]],
    },
  })
}

export async function handleTransactionsQuery(
  chatId: number,
  userId: string,
  offset: number = 0
) {
  const limit = 10
  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      deletedAt: null,
    },
    include: { category: true },
    orderBy: { date: "desc" },
    skip: offset,
    take: limit + 1, // Fetch one extra to check if there are more
  })

  const hasMore = transactions.length > limit
  const display = transactions.slice(0, limit)

  const lines = [`📋 ${offset === 0 ? "Últimas" : "Mais"} transações`, ""]

  for (const t of display) {
    const date = new Date(t.date).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    })
    const sign = t.type === "INCOME" ? "+" : "-"
    const amount = formatCurrency(Math.abs(t.amount))
    const cat = t.category?.name || ""
    lines.push(`${date} ${t.description.substring(0, 25)}  ${sign}${amount}  ${cat}`)
  }

  if (display.length === 0) {
    lines.push("Nenhuma transação encontrada.")
  }

  const keyboard: InlineKeyboardButton[][] = []
  const navRow: InlineKeyboardButton[] = []
  if (offset > 0) {
    navRow.push({ text: "⬅️ Anteriores", callback_data: `txns:${Math.max(0, offset - limit)}` })
  }
  if (hasMore) {
    navRow.push({ text: "➡️ Próximas", callback_data: `txns:${offset + limit}` })
  }
  if (navRow.length > 0) keyboard.push(navRow)
  keyboard.push([{ text: "🔙 Menu", callback_data: "menu:0" }])

  return sendMessage(chatId, lines.join("\n"), {
    reply_markup: { inline_keyboard: keyboard },
  })
}
