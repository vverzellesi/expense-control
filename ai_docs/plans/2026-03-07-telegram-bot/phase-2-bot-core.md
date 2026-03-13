# Phase 2: Core do Bot + Webhook

## Overview

Criar o cliente Telegram (wrapper de fetch para a API), o webhook endpoint integrado ao Next.js, e o handler principal que roteia comandos e valida vinculação de conta. Após esta fase, o webhook recebe mensagens do Telegram e responde com mensagem de "conta não vinculada".

## Reference Docs for This Phase
- `src/auth.config.ts` (full file) - Middleware config para adicionar exceção
- `src/lib/db.ts` (full file) - Padrão de import do Prisma client
- `src/app/api/import/route.ts` (lines 1-5) - Padrão de imports em API routes
- Telegram Bot API: `https://core.telegram.org/bots/api`

## Changes Required

#### 1. Create Telegram API client and bot handler

- [x] **COMPLETE**
  - **Learning:** O worktree compartilha `node_modules` com o repo principal, mas `.prisma/client` é gerado localmente. Para `tsc` funcionar, foi necessário copiar os tipos gerados para o `.prisma/client` do repo principal, pois `@prisma/client` re-exporta de `.prisma/client/default` que resolve do repo principal.

**File**: `src/lib/telegram/client.ts` (CREATE) + `src/lib/telegram/bot.ts` (CREATE)
**Complexity**: Medium
**TDD**: NO — pure HTTP wiring with no decision logic
**Depends On**: none

**Load Before Implementing**:
1. `src/lib/db.ts` (full file) - Import pattern for Prisma

**Pre-conditions**:
- [ ] Directory `src/lib/telegram/` can be created
- [ ] Environment variable `TELEGRAM_BOT_TOKEN` will be set

**Why**: O client abstrai chamadas à API do Telegram. O bot handler roteia updates recebidos para os comandos corretos e valida a vinculação de conta.

**Acceptance Criteria**:
```gherkin
Given a valid Telegram Bot Token
When sendMessage is called with a chatId and text
Then a POST request is made to https://api.telegram.org/bot{token}/sendMessage

Given an update with a text message from a linked account
When handleUpdate is called
Then the message is routed to the appropriate command handler

Given an update from an unlinked chatId
When handleUpdate is called
Then a message is sent asking the user to link their account
```

**Implementation**:

`src/lib/telegram/client.ts`:
```typescript
const TELEGRAM_API = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}`

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
  const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
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
  const res = await fetch(`${TELEGRAM_API}/answerCallbackQuery`, {
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
  const res = await fetch(`${TELEGRAM_API}/editMessageText`, {
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
  const res = await fetch(`${TELEGRAM_API}/getFile`, {
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
  return res.text()
}

export async function setWebhook(url: string, secretToken: string) {
  const res = await fetch(`${TELEGRAM_API}/setWebhook`, {
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
```

`src/lib/telegram/bot.ts`:
```typescript
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
```

**Verification**: `npx tsc --noEmit src/lib/telegram/client.ts src/lib/telegram/bot.ts`

**On Failure**:
- If import error: Create `src/lib/telegram/` directory first
- If type errors from commands.ts: The commands module is created in Phase 3/4 — stub it for now

---

#### 2. Create webhook endpoint and add middleware exception

- [x] **COMPLETE**
  - **Learning:** A exceção no middleware de autenticação usa comparação exata de pathname (`=== "/api/telegram/webhook"`), não `startsWith`, para evitar bypass acidental em outras rotas sob `/api/telegram/`.

**File**: `src/app/api/telegram/webhook/route.ts` (CREATE) + `src/auth.config.ts` (MODIFY)
**Complexity**: Medium
**TDD**: NO — HTTP handler wiring
**Depends On**: Task 1 (bot handler must exist)

**Load Before Implementing**:
1. `src/auth.config.ts` (full file) - Middleware config to modify
2. `src/app/api/import/route.ts` (lines 1-5) - API route import pattern
3. `src/lib/telegram/bot.ts` (full file) - handleUpdate function to call

**Pre-conditions**:
- [ ] Task 1 completed (`src/lib/telegram/bot.ts` exists)
- [ ] `src/auth.config.ts` exists with `authorized` callback

**Why**: O webhook é o ponto de entrada para todas as mensagens do Telegram. A exceção no middleware garante que requests do Telegram não são bloqueados pela autenticação JWT.

**Acceptance Criteria**:
```gherkin
Given a POST request to /api/telegram/webhook with valid X-Telegram-Bot-Api-Secret-Token header
When the request contains a valid Telegram update
Then handleUpdate is called and 200 OK is returned

Given a POST request to /api/telegram/webhook without the secret token header
When the request is received
Then 401 Unauthorized is returned

Given the middleware is configured
When a request comes to /api/telegram/webhook without a session
Then the request is allowed through (not redirected to login)
```

**Implementation**:

`src/app/api/telegram/webhook/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { handleUpdate } from "@/lib/telegram/bot"
import type { TelegramUpdate } from "@/lib/telegram/client"

export async function POST(request: NextRequest) {
  try {
    // Validate webhook secret
    const secret = request.headers.get("x-telegram-bot-api-secret-token")
    if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const update: TelegramUpdate = await request.json()

    await handleUpdate(update)

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Telegram webhook error:", error)
    return NextResponse.json(
      { error: "Internal error" },
      { status: 500 }
    )
  }
}
```

`src/auth.config.ts` — add Telegram webhook exception (modify `authorized` callback):
```typescript
      const isTelegramWebhook = nextUrl.pathname === "/api/telegram/webhook"
```
Add this line after `const isLandingPage = nextUrl.pathname === "/"` (line 15), then add `isTelegramWebhook` to the allow condition:
```typescript
      if (isLandingPage || isOnAuthPage || isApiAuthRoute || isTelegramWebhook) {
```

**Verification**: `npm run build`

**On Failure**:
- If middleware still blocks: Clear `.next` cache and rebuild
- If import error on bot.ts: Check path is `@/lib/telegram/bot`

---

#### 3. Create setup endpoint and stub commands module

- [x] **COMPLETE**
  - **Learning:** O plano sugeria importar `getAuthenticatedUserId` de `auth-utils`, mas o código de implementação do plano usou `x-setup-secret` header. Seguido o código do plano (mais adequado para endpoint administrativo de setup, que pode ser chamado via curl sem sessão).

**File**: `src/app/api/telegram/setup/route.ts` (CREATE) + `src/lib/telegram/commands.ts` (CREATE)
**Complexity**: Low
**TDD**: NO — simple endpoint + stubs
**Depends On**: Task 1 (client must exist)

**Load Before Implementing**:
1. `src/lib/telegram/client.ts` (full file) - setWebhook function
2. `src/lib/auth-utils.ts` (full file) - Auth pattern for admin route

**Pre-conditions**:
- [ ] Task 1 completed (`src/lib/telegram/client.ts` exists)
- [ ] Environment variables `TELEGRAM_BOT_TOKEN` and `TELEGRAM_WEBHOOK_SECRET` defined

**Why**: O endpoint de setup registra o webhook na API do Telegram. Os stubs de commands permitem que o bot compile e responda a comandos básicos, completados nas fases seguintes.

**Acceptance Criteria**:
```gherkin
Given a POST request to /api/telegram/setup with valid auth and webhookUrl
When the Telegram API accepts the webhook registration
Then success response is returned with Telegram API result

Given the commands module is imported by bot.ts
When any command handler is called
Then it responds with a "em construção" or appropriate stub message
```

**Implementation**:

`src/app/api/telegram/setup/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils"
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
```

`src/lib/telegram/commands.ts`:
```typescript
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
```

**Verification**: `npm run build`

**On Failure**:
- If types mismatch: Check TelegramMessage and TelegramCallbackQuery match client.ts exports
- If auth import fails: Verify `@/lib/auth-utils` path

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - TypeCheck passa (exceto erro pré-existente em csv-parser.test.ts). Testes unitários passam (244/249, 5 falhas pré-existentes em utils.test.ts por timezone). Lint indisponível no worktree (sem .eslintrc).
