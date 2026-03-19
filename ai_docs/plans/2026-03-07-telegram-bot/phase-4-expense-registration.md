# Phase 4: Registro de Despesas

## Overview

Implementar o parser de mensagens de texto para extrair dados de transação, e o fluxo completo de registro com confirmação via inline keyboard (confirmar, mudar categoria, cancelar). Após esta fase, o usuário pode registrar despesas avulsas pelo Telegram.

## Reference Docs for This Phase
- `src/lib/telegram/commands.ts` - Stubs handleExpenseMessage e handleCallbackQuery a substituir
- `src/lib/telegram/client.ts` - sendMessage, answerCallbackQuery, editMessageText, InlineKeyboardButton
- `src/lib/categorizer.ts` (lines 95-109) - suggestCategory para auto-categorização
- `src/lib/dedup.ts` - findDuplicate para verificação de duplicatas
- `src/app/api/transactions/route.ts` (lines 188-219) - Padrão de criação de transação
- `src/lib/utils.ts` (lines 1-27) - formatCurrency, parseDate

## Changes Required

#### 1. Create message parser with tests - [x] DONE

**File**: `src/lib/telegram/parser.ts` (CREATE) + `src/lib/telegram/parser.test.ts` (CREATE)
**Complexity**: High
**TDD**: YES
**Depends On**: none
- **Learning:** Parser implementado conforme plano sem alterações. Regex para formato brasileiro (1.234,56) e extração por posição funcionou corretamente. 7/7 testes passaram na primeira execução.

**Load Before Implementing**:
1. `src/lib/utils.ts` (full file) - formatCurrency, parseDate patterns
2. `src/lib/categorizer.ts` (lines 229-280) - detectInstallment regex patterns as reference

**Pre-conditions**:
- [ ] `src/lib/telegram/` directory exists (created in Phase 2)

**Why**: Parseia mensagens de texto em formato livre para extrair descrição, valor e data. Formato: `DESCRICAO VALOR DD/MM/YYYY`. Data é opcional (assume hoje se omitida).

**Acceptance Criteria**:
```gherkin
Given the message "PIX RESTAURANTE FULANO 45,90 05/03/2026"
When parseExpenseMessage is called
Then it returns { description: "PIX RESTAURANTE FULANO", amount: 45.90, date: 2026-03-05 }

Given the message "UBER *TRIP 23,50"
When parseExpenseMessage is called
Then it returns { description: "UBER *TRIP", amount: 23.50, date: today }

Given the message "SPOTIFY 21,90 04/03/2026"
When parseExpenseMessage is called
Then it returns { description: "SPOTIFY", amount: 21.90, date: 2026-03-04 }

Given the message "hello"
When parseExpenseMessage is called
Then it returns null (no amount detected)

Given the message "1.234,56 COMPRA GRANDE 05/03/2026"
When parseExpenseMessage is called
Then it returns { description: "COMPRA GRANDE", amount: 1234.56, date: 2026-03-05 }
```

**Implementation**:

`src/lib/telegram/parser.ts`:
```typescript
export interface ParsedExpense {
  description: string
  amount: number
  date: Date
}

export function parseExpenseMessage(text: string): ParsedExpense | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // We'll track parts to remove by position
  const removals: Array<{ start: number; end: number }> = []

  // Extract date (DD/MM/YYYY) — look for last occurrence
  const dateRegex = /(\d{2})\/(\d{2})\/(\d{4})/g
  let dateMatch: RegExpExecArray | null = null
  let lastDateMatch: RegExpExecArray | null = null
  while ((dateMatch = dateRegex.exec(trimmed)) !== null) {
    lastDateMatch = dateMatch
  }

  let date: Date
  if (lastDateMatch) {
    const [, day, month, year] = lastDateMatch
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0)
    removals.push({ start: lastDateMatch.index, end: lastDateMatch.index + lastDateMatch[0].length })
  } else {
    const now = new Date()
    date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)
  }

  // Extract amount — look for Brazilian number format (last occurrence)
  // Matches: 45,90 | 1.234,56 | 1234,56
  const amountRegex = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g
  let amountMatch: RegExpExecArray | null = null
  let lastAmountMatch: RegExpExecArray | null = null
  while ((amountMatch = amountRegex.exec(trimmed)) !== null) {
    lastAmountMatch = amountMatch
  }

  if (!lastAmountMatch) return null

  const amountStr = lastAmountMatch[1]
  const amount = parseFloat(amountStr.replace(/\./g, "").replace(",", "."))
  if (isNaN(amount) || amount <= 0) return null

  removals.push({ start: lastAmountMatch.index, end: lastAmountMatch.index + lastAmountMatch[0].length })

  // Build description by removing matched parts by position (sorted descending to preserve indices)
  let description = trimmed
  removals.sort((a, b) => b.start - a.start)
  for (const { start, end } of removals) {
    description = description.slice(0, start) + description.slice(end)
  }
  description = description.replace(/\s+/g, " ").trim()

  if (!description) return null

  return { description, amount, date }
}
```

`src/lib/telegram/parser.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { parseExpenseMessage } from "./parser"

describe("parseExpenseMessage", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 2, 7, 14, 0, 0)) // 2026-03-07
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("parses full message with description, amount and date", () => {
    const result = parseExpenseMessage("PIX RESTAURANTE FULANO 45,90 05/03/2026")
    expect(result).toEqual({
      description: "PIX RESTAURANTE FULANO",
      amount: 45.9,
      date: new Date(2026, 2, 5, 12, 0, 0),
    })
  })

  it("assumes today when date is omitted", () => {
    const result = parseExpenseMessage("UBER *TRIP 23,50")
    expect(result).toEqual({
      description: "UBER *TRIP",
      amount: 23.5,
      date: new Date(2026, 2, 7, 12, 0, 0),
    })
  })

  it("handles amount with thousands separator", () => {
    const result = parseExpenseMessage("COMPRA GRANDE 1.234,56 05/03/2026")
    expect(result).toEqual({
      description: "COMPRA GRANDE",
      amount: 1234.56,
      date: new Date(2026, 2, 5, 12, 0, 0),
    })
  })

  it("returns null for messages without amount", () => {
    expect(parseExpenseMessage("hello")).toBeNull()
    expect(parseExpenseMessage("just a text message")).toBeNull()
  })

  it("returns null for empty messages", () => {
    expect(parseExpenseMessage("")).toBeNull()
    expect(parseExpenseMessage("  ")).toBeNull()
  })

  it("handles amount at start of message", () => {
    const result = parseExpenseMessage("45,90 LANCHE 05/03/2026")
    expect(result).not.toBeNull()
    expect(result!.amount).toBe(45.9)
    expect(result!.description).toBe("LANCHE")
  })

  it("handles simple amount without thousands", () => {
    const result = parseExpenseMessage("SPOTIFY 21,90")
    expect(result).toEqual({
      description: "SPOTIFY",
      amount: 21.9,
      date: new Date(2026, 2, 7, 12, 0, 0),
    })
  })
})
```

**Verification**: `npx vitest run src/lib/telegram/parser.test.ts`

**On Failure**:
- If regex doesn't match: Test regex independently in isolation
- If date parsing off by one: Check month is 0-indexed in `new Date(year, month-1, day)`

---

#### 2. Implement expense registration flow with inline keyboard - [x] DONE

**File**: `src/lib/telegram/commands.ts` (MODIFY)
**Complexity**: High
**TDD**: NO -- integrates external APIs (Telegram, Prisma) heavily
**Depends On**: Task 1 (parser must exist), Phase 1 Task 2 (dedup module)
- **Learning:** Implementado junto com Task 3 para evitar reescrita. O plano incluía um `callbackData` JSON que não era usado (dead code) -- removido. O stub `csv_confirm:` com import dinâmico de `handleCsvConfirm` foi removido pois gerava referência circular e não existia como export.

**Load Before Implementing**:
1. `src/lib/telegram/commands.ts` (full file) - Current state after Phase 3
2. `src/lib/telegram/client.ts` (full file) - All Telegram API functions
3. `src/lib/telegram/parser.ts` (full file) - parseExpenseMessage
4. `src/lib/categorizer.ts` (lines 95-109) - suggestCategory
5. `src/lib/dedup.ts` (full file) - findDuplicate

**Pre-conditions**:
- [ ] Task 1 completed (parser.ts exists and tests pass)
- [ ] Phase 3 completed (commands.ts has real /start and /desvincular)
- [ ] `src/lib/dedup.ts` exists

**Why**: Fluxo completo de registro de despesa: parse da mensagem → sugestão de categoria → confirmação via botões → criação da transação com verificação de duplicata.

**Acceptance Criteria**:
```gherkin
Given a linked user sends "PIX REST FULANO 45,90 05/03/2026"
When handleExpenseMessage is called
Then a confirmation message is sent with description, amount, date, suggested category
And inline keyboard with [Confirmar] [Mudar categoria] [Cancelar] buttons

Given the user clicks [Confirmar]
When handleCallbackQuery is called with "confirm:" data
Then the transaction is created in the database
And a success message replaces the confirmation message

Given the user clicks [Mudar categoria]
When handleCallbackQuery is called with "change_cat:" data
Then a list of categories is shown as inline keyboard buttons

Given the user clicks a category button
When handleCallbackQuery is called with "set_cat:" data
Then the confirmation message is updated with the new category

Given the user clicks [Cancelar]
When handleCallbackQuery is called with "cancel:" data
Then the message is updated to "Cancelado"
```

**Implementation**:

Replace `handleExpenseMessage` and `handleCallbackQuery` in `commands.ts`. Add these imports at top:

```typescript
import { parseExpenseMessage } from "./parser"
import { suggestCategory } from "@/lib/categorizer"
import { findDuplicate } from "@/lib/dedup"
import { formatCurrency } from "@/lib/utils"
```

Replace `handleExpenseMessage`:
```typescript
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

  const callbackData = JSON.stringify({
    d: description,
    a: amount,
    dt: date.toISOString(),
    c: categoryId,
  })

  // Callback data has 64 byte limit — use message_id as reference instead
  const confirmData = `confirm:${categoryId || "none"}`
  const changeCatData = `change_cat:0`
  const cancelData = `cancel:0`

  return sendMessage(chatId, [
    "Nova despesa:",
    `📝 ${description}`,
    `💰 ${formatCurrency(amount)}`,
    `📅 ${dateStr}`,
    `🏷️ ${categoryName}${suggested ? "" : ""}`,
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
```

Replace `handleCallbackQuery`:
```typescript
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
    return handleConfirmExpense(chatId, messageId, userId, query.message!)
  }

  if (data.startsWith("change_cat:")) {
    return handleShowCategories(chatId, messageId, userId)
  }

  if (data.startsWith("set_cat:")) {
    const categoryId = data.replace("set_cat:", "")
    return handleSetCategory(chatId, messageId, categoryId)
  }

  if (data.startsWith("csv_confirm:")) {
    const { handleCsvConfirm } = await import("./commands")
    // Stub for Phase 5
    return editMessageText(chatId, messageId, "Importação CSV em construção.")
  }

  if (data.startsWith("csv_cancel:")) {
    return editMessageText(chatId, messageId, "Importação cancelada.")
  }
}

async function handleConfirmExpense(
  chatId: number,
  messageId: number,
  userId: string,
  message: TelegramMessage
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

  // Get categoryId from the current keyboard data
  const categoryName = catLine?.replace("🏷️ ", "") || "Sem categoria"

  // Find category by name
  const category = categoryName !== "Sem categoria"
    ? await prisma.category.findFirst({
        where: { name: categoryName, userId },
      })
    : null

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

  return editMessageText(
    chatId,
    messageId,
    `✅ Despesa registrada!\n\n📝 ${description}\n💰 ${formatCurrency(amount)}\n📅 ${dateLine.replace("📅 ", "")}\n🏷️ ${categoryName}`
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

  // We need to rebuild the confirmation message with the new category
  // Since we can't access the original parsed data, we ask the user to send the message again
  // This is a simplified approach — the full message is reconstructed from the edit
  return editMessageText(
    chatId,
    messageId,
    `Categoria alterada para: ${category.name}\n\nEnvie a despesa novamente para confirmar com a nova categoria.`
  )
}
```

Note: Add `import { type InlineKeyboardButton } from "./client"` and `import { answerCallbackQuery, editMessageText } from "./client"` to the imports.

**Verification**: `npm run build`

**On Failure**:
- If callback_data exceeds 64 bytes: Shorten the data payload
- If formatCurrency import fails: Check `@/lib/utils` exports
- If suggestCategory returns unexpected shape: Check return type `{ id: string, name: string } | null`

---

#### 3. Refine category selection to preserve expense context - [x] DONE

**File**: `src/lib/telegram/commands.ts` (MODIFY)
**Complexity**: Medium
**TDD**: NO -- UI flow refinement
**Depends On**: Task 2
- **Learning:** Implementado junto com Task 2 para consistência. O `handleConfirmExpense` recebe `overrideCategoryId` do callback data, e `handleSetCategory` reconstrui o inline keyboard com o categoryId no botão Confirmar.

**Load Before Implementing**:
1. `src/lib/telegram/commands.ts` (full file) - After Task 2 changes

**Pre-conditions**:
- [ ] Task 2 completed

**Why**: A abordagem simplificada do Task 2 pede que o usuário reenvie a mensagem após mudar categoria. Esta task melhora o fluxo para preservar o contexto da despesa e reconstruir a confirmação com a nova categoria selecionada.

**Acceptance Criteria**:
```gherkin
Given the user is viewing a category selection list
When they click a category
Then the confirmation message is shown again with the new category
And the [Confirmar] [Categoria] [Cancelar] buttons are restored
```

**Implementation**:

Replace `handleSetCategory` to parse the original message from the edit history and reconstruct:

```typescript
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
```

Also update `handleConfirmExpense` to accept category from callback data:

In the `handleCallbackQuery` function, when handling `confirm:`, pass the category ID from the data:

```typescript
  if (data.startsWith("confirm:")) {
    const categoryIdFromData = data.replace("confirm:", "")
    return handleConfirmExpense(chatId, messageId, userId, query.message!, categoryIdFromData !== "none" ? categoryIdFromData : null)
  }
```

Update `handleConfirmExpense` signature and use overrideCategoryId:

```typescript
async function handleConfirmExpense(
  chatId: number,
  messageId: number,
  userId: string,
  message: TelegramMessage,
  overrideCategoryId: string | null = null
) {
```

Inside the function, use `overrideCategoryId` if provided instead of parsing category from message text:

```typescript
  // Resolve category
  let category = null
  if (overrideCategoryId) {
    category = await prisma.category.findUnique({ where: { id: overrideCategoryId } })
  } else if (categoryName !== "Sem categoria") {
    category = await prisma.category.findFirst({
      where: { name: categoryName, userId },
    })
  }
```

**Verification**: `npm run build`

**On Failure**:
- If message text format changed: Re-check the confirmation message format from Task 2

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - Parser tests: 7/7 pass. Typecheck: 0 new errors (1 pre-existing in csv-parser.test.ts). Full suite: 0 regressions (5 pre-existing failures in utils.test.ts).
