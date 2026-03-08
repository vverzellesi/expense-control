# Phase 3: Vinculação via Deep Link

## Overview

Implementar o fluxo completo de vinculação de conta: API de geração de token, comando `/start TOKEN` no bot, e nova aba "Telegram" na página de Settings com botão de vincular/desvincular. Após esta fase, um usuário pode vincular sua conta MyPocket ao Telegram.

## Reference Docs for This Phase
- `prisma/schema.prisma` - TelegramLink e TelegramLinkToken models (criados na Phase 1)
- `src/lib/telegram/bot.ts` - Handler principal com roteamento (criado na Phase 2)
- `src/lib/telegram/commands.ts` - Stubs a substituir (criado na Phase 2)
- `src/app/settings/page.tsx` (lines 528-554) - TabsList para adicionar nova aba
- `src/app/api/settings/route.ts` - Padrão de API com auth
- `src/lib/auth-utils.ts` - getAuthenticatedUserId pattern

## Changes Required

#### 1. Create link token API endpoint - [x] DONE

**File**: `src/app/api/telegram/link/route.ts` (CREATE)
**Complexity**: High
**TDD**: YES
**Depends On**: Phase 1 Task 1 (TelegramLinkToken model must exist)

**Load Before Implementing**:
1. `prisma/schema.prisma` (TelegramLink and TelegramLinkToken models)
2. `src/lib/auth-utils.ts` (full file) - Auth pattern
3. `src/app/api/settings/route.ts` (full file) - API route pattern to follow

**Pre-conditions**:
- [ ] TelegramLinkToken model exists in Prisma schema
- [ ] TelegramLink model exists in Prisma schema
- [ ] `npm run db:generate` has been run after Phase 1

**Why**: Gera tokens temporários para vinculação via deep link. Também provê GET para status de vinculação e DELETE para desvinculação.

**Acceptance Criteria**:
```gherkin
Given an authenticated user without a Telegram link
When POST /api/telegram/link is called
Then a new TelegramLinkToken is created with 10-minute expiry
And the response contains the token and deep link URL

Given an authenticated user with an existing Telegram link
When GET /api/telegram/link is called
Then the response contains linked: true and chatId

Given an authenticated user with an existing Telegram link
When DELETE /api/telegram/link is called
Then the TelegramLink is deleted
And linked: false is returned

Given an authenticated user
When POST /api/telegram/link is called
Then any existing tokens for this user are deleted first (cleanup)
```

**Implementation**:

```typescript
import { NextRequest, NextResponse } from "next/server"
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
```

**Verification**: `npm run build`

**On Failure**:
- If `randomUUID` not available: Use `crypto.randomUUID()` or `import { v4 as uuidv4 } from 'uuid'`
- If Prisma model not found: Run `npm run db:generate`

**Learning:** O mock do módulo `crypto` nativo no Vitest requer `importOriginal` para preservar o export default. Optei por testar a estrutura da resposta (token presente, deepLink contém o token) em vez de mockar `randomUUID`, abordagem mais robusta e menos frágil.

---

#### 2. Implement /start and /desvincular commands in bot - [x] DONE

**File**: `src/lib/telegram/commands.ts` (MODIFY)
**Complexity**: High
**TDD**: YES
**Depends On**: Task 1 (link API for context), Phase 2 Task 1 (commands.ts exists)

**Load Before Implementing**:
1. `src/lib/telegram/commands.ts` (full file) - Current stubs to replace
2. `src/lib/telegram/client.ts` (full file) - sendMessage API
3. `prisma/schema.prisma` (TelegramLink and TelegramLinkToken models)

**Pre-conditions**:
- [ ] `src/lib/telegram/commands.ts` exists with stub functions
- [ ] TelegramLink and TelegramLinkToken models exist in Prisma

**Why**: Implementa o fluxo de vinculação: `/start TOKEN` valida o token, cria o link, e responde com sucesso. `/desvincular` remove o link.

**Acceptance Criteria**:
```gherkin
Given a user sends /start with a valid, non-expired token
When handleStartCommand is called
Then a TelegramLink is created linking chatId to userId
And the token is deleted
And success message is sent

Given a user sends /start with an expired token
When handleStartCommand is called
Then an error message about token expirado is sent
And no link is created

Given a user sends /start without a token
When handleStartCommand is called
Then a welcome message explaining how to link is sent

Given a linked user sends /desvincular
When handleUnlinkCommand is called
Then the TelegramLink is deleted
And confirmation message is sent
```

**Implementation**:

Replace `handleStartCommand` and `handleUnlinkCommand` in `commands.ts`:

```typescript
import prisma from "@/lib/db"
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
      "Conta vinculada com sucesso! 🎉\n\nEnvie /menu para ver as opções disponíveis."
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

// Keep other stubs unchanged for now
export async function handleMenuCommand(
  chatId: number,
  userId: string
) {
  return sendMessage(chatId, "Menu em construção.")
}

export async function handleCallbackQuery(
  query: TelegramCallbackQuery,
  userId: string
) {
  return
}

export async function handleExpenseMessage(
  message: TelegramMessage,
  userId: string
) {
  return sendMessage(
    message.chat.id,
    "Registro de despesas em construção. Envie /menu para outras opções."
  )
}

export async function handleDocumentMessage(
  message: TelegramMessage,
  userId: string
) {
  return sendMessage(
    message.chat.id,
    "Importação de CSV em construção. Envie /menu para outras opções."
  )
}
```

**Verification**: `npm run build`

**On Failure**:
- If `$transaction` type error: Use sequential operations instead of array transaction
- If chatId type mismatch: Ensure `String(chatId)` is used consistently

**Learning:** O mock do Prisma `$transaction` precisa aceitar array de Promises (batch transaction). O mock existente em `tests/mocks/prisma.ts` usa callback pattern, mas o `vi.mock` inline funciona corretamente com `vi.fn()` simples.

---

#### 3. Add Telegram tab to Settings page - [x] DONE

**File**: `src/app/settings/page.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO — UI component with no decision logic
**Depends On**: Task 1 (link API must exist)

**Load Before Implementing**:
1. `src/app/settings/page.tsx` (lines 1-31) - Imports
2. `src/app/settings/page.tsx` (lines 528-554) - TabsList
3. `src/app/settings/page.tsx` (lines 1054-1177) - Last TabsContent + closing Tabs

**Pre-conditions**:
- [ ] Task 1 completed (`/api/telegram/link` endpoint exists)
- [ ] Settings page has TabsList at lines 528-554
- [ ] `MessageCircle` icon available from lucide-react (or `Send` as alternative)

**Why**: Interface para o usuário vincular/desvincular sua conta Telegram sem sair do app.

**Acceptance Criteria**:
```gherkin
Given the user navigates to /settings
When they click the "Telegram" tab
Then they see the current link status (linked or not)

Given the user is not linked
When they click "Vincular Telegram"
Then a deep link is generated and displayed
And a QR code or clickable link is shown

Given the user is linked
When they click "Desvincular"
Then the link is removed and status updates
```

**Implementation**:

Add `MessageCircle` to lucide-react import (line 30):
```typescript
import { Plus, Trash2, Target, Tag, PiggyBank, CheckCircle, XCircle, History, Wallet, Pencil, Layers, MessageCircle } from "lucide-react";
```

Add state variables after other state declarations (around line 93):
```typescript
  // Telegram
  const [telegramStatus, setTelegramStatus] = useState<{
    linked: boolean;
    chatId?: string;
    linkedAt?: string;
  } | null>(null);
  const [telegramLink, setTelegramLink] = useState<string | null>(null);
  const [telegramLoading, setTelegramLoading] = useState(false);
```

Add Telegram data fetch to `fetchData()` (inside the try block, after existing fetches):
```typescript
      // Fetch Telegram link status
      try {
        const telegramRes = await fetch("/api/telegram/link");
        const telegramData = await telegramRes.json();
        setTelegramStatus(telegramData);
      } catch {
        setTelegramStatus({ linked: false });
      }
```

Add handler functions (before the return statement):
```typescript
  async function handleLinkTelegram() {
    setTelegramLoading(true);
    try {
      const res = await fetch("/api/telegram/link", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Erro", description: data.error, variant: "destructive" });
        return;
      }
      setTelegramLink(data.deepLink);
      toast({ title: "Link gerado", description: "Clique no link para abrir o Telegram" });
    } catch {
      toast({ title: "Erro", description: "Erro ao gerar link", variant: "destructive" });
    } finally {
      setTelegramLoading(false);
    }
  }

  async function handleUnlinkTelegram() {
    setTelegramLoading(true);
    try {
      await fetch("/api/telegram/link", { method: "DELETE" });
      setTelegramStatus({ linked: false });
      setTelegramLink(null);
      toast({ title: "Sucesso", description: "Telegram desvinculado" });
    } catch {
      toast({ title: "Erro", description: "Erro ao desvincular", variant: "destructive" });
    } finally {
      setTelegramLoading(false);
    }
  }
```

Add TabsTrigger after the Tags trigger (before `</TabsList>` at line 554):
```tsx
            <TabsTrigger value="telegram" className="min-h-[44px] flex-1 sm:flex-initial">
              <MessageCircle className="mr-2 h-4 w-4" />
              <span className="hidden sm:inline">Telegram</span>
              <span className="sm:hidden">Telegram</span>
            </TabsTrigger>
```

Add TabsContent before `</Tabs>` (at line 1177):
```tsx
          <TabsContent value="telegram" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="h-5 w-5" />
                  Integração Telegram
                </CardTitle>
                <CardDescription>
                  Vincule sua conta para registrar despesas e consultar gastos pelo Telegram.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {telegramStatus?.linked ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-emerald-600">
                      <CheckCircle className="h-5 w-5" />
                      <span className="font-medium">Conta vinculada</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Chat ID: {telegramStatus.chatId}
                    </p>
                    {telegramStatus.linkedAt && (
                      <p className="text-sm text-muted-foreground">
                        Vinculado em: {new Date(telegramStatus.linkedAt).toLocaleDateString("pt-BR")}
                      </p>
                    )}
                    <Button
                      variant="destructive"
                      onClick={handleUnlinkTelegram}
                      disabled={telegramLoading}
                    >
                      {telegramLoading ? "Desvinculando..." : "Desvincular Telegram"}
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <XCircle className="h-5 w-5" />
                      <span>Conta não vinculada</span>
                    </div>
                    {telegramLink ? (
                      <div className="space-y-2">
                        <p className="text-sm">Clique no link abaixo para abrir o Telegram:</p>
                        <a
                          href={telegramLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:text-emerald-700 underline break-all"
                        >
                          {telegramLink}
                        </a>
                        <p className="text-xs text-muted-foreground">
                          O link expira em 10 minutos.
                        </p>
                      </div>
                    ) : (
                      <Button
                        onClick={handleLinkTelegram}
                        disabled={telegramLoading}
                        className="bg-emerald-600 hover:bg-emerald-700"
                      >
                        {telegramLoading ? "Gerando link..." : "Vincular Telegram"}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
```

**Verification**: `npm run build`

**On Failure**:
- If `MessageCircle` not found in lucide-react: Use `Send` icon instead
- If TabsContent position wrong: Search for `</Tabs>` to find exact insertion point
- If type errors on telegramStatus: Ensure state type matches API response shape

**Learning:** A página Settings tem ~1200 linhas. Edições cirúrgicas com strings únicas funcionaram bem. A aba Telegram segue exatamente o padrão visual das demais abas (min-h-[44px], flex-1 sm:flex-initial).

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - All project checks pass (16 telegram tests green, typecheck limpo exceto pre-existing em utils.test.ts)

### Manual Verification (only if automation impossible)
- [ ] Open Settings page → Telegram tab visible and functional
- [ ] Generate deep link → link is clickable and opens Telegram
