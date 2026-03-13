# Phase 5: CSV Import + Consultas

## Overview

Implementar importação de arquivos CSV via bot (download, parse, dedup, criação) e os três comandos de consulta (resumo do mês, gastos por categoria, últimas transações) com menu via inline keyboard. Esta fase completa todas as funcionalidades do bot.

## Reference Docs for This Phase
- `src/lib/telegram/commands.ts` - Stubs handleDocumentMessage e handleMenuCommand a substituir
- `src/lib/telegram/client.ts` - getFile, downloadFile, sendMessage, editMessageText
- `src/lib/csv-parser.ts` (lines 151-211) - parseCSV function
- `src/lib/dedup.ts` - findDuplicate, filterDuplicates
- `src/app/api/summary/route.ts` (lines 1-155) - Summary queries para reutilizar
- `src/app/api/import/route.ts` (lines 80-187) - Import loop para replicar
- `src/app/api/transactions/route.ts` (lines 5-115) - Transaction query pattern
- `src/lib/utils.ts` - formatCurrency

## Changes Required

#### 1. Implement CSV file import via bot -- DONE

**File**: `src/lib/telegram/commands.ts` (MODIFY)
**Complexity**: High
**TDD**: NO — integrates Telegram File API + existing parseCSV + database writes
**Depends On**: Phase 4 (commands.ts with callback query handler), Phase 1 (dedup module)
- **Learning:** Consolidei os imports de `./client` em um único bloco para evitar imports duplicados. O `parseCSV` retorna `ImportedTransaction[]` com `amount` já negativo (credit card expenses), então o dedup precisa considerar isso ao verificar duplicatas.

**Load Before Implementing**:
1. `src/lib/telegram/commands.ts` (full file) - Current state after Phase 4
2. `src/lib/telegram/client.ts` (full file) - getFile, downloadFile functions
3. `src/lib/csv-parser.ts` (lines 151-242) - parseCSV function signature and return type
4. `src/lib/dedup.ts` (full file) - findDuplicate function
5. `src/app/api/import/route.ts` (lines 80-187) - Transaction creation pattern to replicate

**Pre-conditions**:
- [x] Phase 4 completed (commands.ts has working callback query handler)
- [x] `src/lib/csv-parser.ts` exports `parseCSV(fileContent: string, origin: string)`
- [x] `src/lib/dedup.ts` exports `findDuplicate`

**Why**: Permite importar faturas CSV diretamente pelo Telegram. O bot baixa o arquivo, parseia, verifica duplicatas, e cria transações — replicando o fluxo do app web.

**Acceptance Criteria**:
```gherkin
Given a linked user sends a .csv file via Telegram
When handleDocumentMessage is called
Then the file is downloaded and parsed
And a summary message shows count of transactions found and duplicates detected
And inline keyboard offers [Importar] [Cancelar]

Given the user clicks [Importar] after sending a CSV
When handleCallbackQuery receives csv_confirm
Then all non-duplicate transactions are created in the database
And a success message shows imported count and skipped duplicates

Given the user sends a non-CSV file
When handleDocumentMessage is called
Then an error message says only CSV files are supported
```

**Implementation**:

Add import at top of commands.ts:
```typescript
import { parseCSV } from "@/lib/csv-parser"
import { getFile, downloadFile } from "./client"
```

Replace `handleDocumentMessage`:
```typescript
// Pending imports are stored in database (TelegramPendingImport model)
// to survive cold starts and work across multiple processes

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
```

Update `handleCallbackQuery` to route csv_confirm:
```typescript
  if (data.startsWith("csv_confirm:")) {
    const importKey = data.replace("csv_confirm:", "")
    return handleCsvConfirm(chatId, messageId, userId, importKey)
  }
```

**Verification**: `npm run build`

**On Failure**:
- If `parseCSV` signature mismatch: Check `csv-parser.ts` for exact parameter names
- If callback_data exceeds 64 bytes: Shorten importKey format
- If pendingCsvImports memory grows: The cleanup loop handles expiration

---

#### 2. Implement query commands (summary, categories, transactions) -- DONE

**File**: `src/lib/telegram/queries.ts` (CREATE)
**Complexity**: High
**TDD**: NO — queries Prisma directly, formatting output
**Depends On**: Phase 2 (client.ts must exist)
- **Learning:** O spread `[...map.entries()]` causa erro de compilação com o target ES atual do projeto; usar `Array.from(map.entries())` resolve. O `investmentTransaction` relation existe no modelo Transaction e funciona com `include`.

**Load Before Implementing**:
1. `src/app/api/summary/route.ts` (lines 100-155) - Summary calculation logic to replicate
2. `src/app/api/transactions/route.ts` (lines 5-115) - Transaction query pattern
3. `src/lib/utils.ts` (full file) - formatCurrency
4. `src/lib/telegram/client.ts` (full file) - sendMessage, InlineKeyboardButton

**Pre-conditions**:
- [x] `src/lib/telegram/` directory exists
- [x] Prisma client available via `@/lib/db`

**Why**: Três consultas core do bot: resumo mensal (totais + orçamento geral), gastos por categoria (vs orçamento), e últimas 10 transações.

**Acceptance Criteria**:
```gherkin
Given a linked user requests summary
When handleSummaryQuery is called
Then it returns formatted text with income, expense, balance, and budget usage

Given a linked user requests category breakdown
When handleCategoryQuery is called
Then it returns each category with spent amount vs budget (if defined)

Given a linked user requests recent transactions
When handleTransactionsQuery is called
Then it returns the 10 most recent transactions with date, description, amount, and category
```

**Implementation**:

`src/lib/telegram/queries.ts`:
```typescript
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
  const sorted = [...categoryTotals.entries()].sort((a, b) => b[1].total - a[1].total)

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
```

**Verification**: `npm run build`

**On Failure**:
- If `investmentTransaction` relation not found: Check Transaction model includes this relation; may need to filter differently
- If formatCurrency import fails: Verify `@/lib/utils` path and export name

---

#### 3. Implement menu command and wire query callbacks -- DONE

**File**: `src/lib/telegram/commands.ts` (MODIFY)
**Complexity**: Medium
**TDD**: NO — wiring callbacks to query handlers
**Depends On**: Task 1 (csv import), Task 2 (queries module)
- **Learning:** Sem dependência circular: queries.ts importa de client.ts, commands.ts importa de queries.ts. Callback routing precisa estar antes do fechamento da função.

**Load Before Implementing**:
1. `src/lib/telegram/commands.ts` (full file) - After Task 1 changes
2. `src/lib/telegram/queries.ts` (full file) - Query handlers to call

**Pre-conditions**:
- [x] Task 2 completed (`src/lib/telegram/queries.ts` exists)
- [x] `handleCallbackQuery` in commands.ts is working

**Why**: Conecta o menu principal às funções de consulta e implementa paginação de transações.

**Acceptance Criteria**:
```gherkin
Given a linked user sends /menu
When handleMenuCommand is called
Then an inline keyboard with three options is displayed

Given the user clicks "Resumo do mês"
When handleCallbackQuery receives "summary:0"
Then handleSummaryQuery is called

Given the user clicks "Gastos por categoria"
When handleCallbackQuery receives "categories:0"
Then handleCategoryQuery is called

Given the user clicks "Últimas transações"
When handleCallbackQuery receives "txns:0"
Then handleTransactionsQuery is called

Given the user clicks "Menu" from any query result
When handleCallbackQuery receives "menu:0"
Then the menu is shown again
```

**Implementation**:

Add import in commands.ts:
```typescript
import {
  handleSummaryQuery,
  handleCategoryQuery,
  handleTransactionsQuery,
} from "./queries"
```

Replace `handleMenuCommand`:
```typescript
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
```

Add these cases to `handleCallbackQuery` (before the final closing):
```typescript
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
```

**Verification**: `npm run build`

**On Failure**:
- If circular import: queries.ts imports from client.ts, commands.ts imports from queries.ts — no circular dependency
- If callback routing misses: Ensure new cases are added BEFORE the catch-all/end of the function

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - Build passes, typecheck passes (1 pre-existing error in csv-parser.test.ts), tests pass (5 pre-existing failures in utils.test.ts timezone issues)

### Manual Verification (only if automation impossible)
- [ ] Send a CSV file via Telegram → bot shows summary and imports on confirm
- [ ] /menu → all three query options work and display correct data
- [ ] Transaction pagination works (next/previous buttons)
