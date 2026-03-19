# Phase 1: Schema + Deduplicação

## Overview

Adicionar modelos Prisma para vinculação Telegram, criar módulo centralizado de deduplicação de transações, e integrá-lo ao fluxo de importação existente. Esta fase entrega valor imediato — deduplicação funciona no app web independente do bot.

## Reference Docs for This Phase
- `prisma/schema.prisma` (lines 16-49) - User model com relations
- `prisma/schema.prisma` (lines 414-435) - Final do schema (onde adicionar novos modelos)
- `src/app/api/import/route.ts` (lines 80-187) - Loop de criação de transações
- `src/app/api/import/route.ts` (lines 241-263) - Response builder
- `src/lib/db.ts` - Prisma client singleton

## Changes Required

#### 1. Add TelegramLink and TelegramLinkToken models to Prisma schema

- [x] **COMPLETE**
  - **Learning:** Schema usa PostgreSQL com Neon adapter (driverAdapters preview feature). `db:generate` funciona sem DATABASE_URL, mas `db:push` e `build` requerem a variável configurada.

**File**: `prisma/schema.prisma` (MODIFY)
**Complexity**: Low
**TDD**: NO — schema definition, no logic
**Depends On**: none

**Load Before Implementing**:
1. `prisma/schema.prisma` (lines 16-49) - User model para adicionar relations
2. `prisma/schema.prisma` (lines 414-435) - Final do arquivo onde inserir novos modelos

**Pre-conditions**:
- [ ] Prisma schema exists at `prisma/schema.prisma`
- [ ] User model exists with `id` field of type `String`

**Why**: Necessário para vincular contas Telegram a usuários e gerar tokens temporários para deep link.

**Acceptance Criteria**:
```gherkin
Given the Prisma schema with existing models
When the new TelegramLink and TelegramLinkToken models are added
Then `npm run db:generate` succeeds without errors
And the User model has telegramLink and telegramLinkTokens relations
```

**Implementation**:

Add to User model relations (after line 48, before closing `}`):

```prisma
  // Telegram integration
  telegramLink           TelegramLink?
  telegramLinkTokens     TelegramLinkToken[]
  telegramPendingImports TelegramPendingImport[]
```

Add at end of schema file (after Simulation model):

```prisma
// ==========================================
// TELEGRAM INTEGRATION MODELS
// ==========================================

model TelegramLink {
  id       String   @id @default(cuid())
  userId   String   @unique
  chatId   String   @unique
  linkedAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([chatId])
}

model TelegramLinkToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([token])
  @@index([userId])
}

model TelegramPendingImport {
  id        String   @id @default(cuid())
  userId    String
  chatId    String
  payload   String   // JSON array of transactions
  origin    String
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

**Verification**: `npm run db:generate && npm run db:push`

**On Failure**:
- If relation error: Check User model has closing `}` and relations are inside it
- If duplicate model name: Grep schema for existing model names

---

#### 2. Create deduplication module with tests

- [x] **COMPLETE**
  - **Learning:** Mock de Prisma funciona bem com `vi.mocked()` para type-safe assertions. `mode: "insensitive"` funciona com PostgreSQL; em testes unitários o mock abstrai isso.

**File**: `src/lib/dedup.ts` (CREATE) + `src/lib/dedup.test.ts` (CREATE)
**Complexity**: High
**TDD**: YES
**Depends On**: Task 1 (Prisma schema must have Transaction model)

**Load Before Implementing**:
1. `prisma/schema.prisma` (lines 100-137) - Transaction model fields
2. `src/lib/db.ts` (full file) - Prisma client singleton import
3. `src/lib/categorizer.ts` (lines 1-10) - Import pattern example

**Pre-conditions**:
- [ ] Task 1 completed (schema generated)
- [ ] Transaction model has `description`, `amount`, `date`, `userId`, `deletedAt` fields

**Why**: Lógica centralizada para detectar transações duplicatas. Usada pelo import web, pelo bot (registro avulso), e pela importação CSV via bot.

**Acceptance Criteria**:
```gherkin
Given a transaction exists with description "PIX REST FULANO", amount -45.90, date 2026-03-05
When findDuplicate is called with same description (case-insensitive), same amount, same date
Then it returns the existing transaction

Given a transaction exists with description "PIX REST FULANO", amount -45.90, date 2026-03-05
When findDuplicate is called with different description "UBER TRIP"
Then it returns null

Given a transaction exists but is soft-deleted (deletedAt is set)
When findDuplicate is called with matching description, amount, date
Then it returns null (ignores deleted transactions)

Given a transaction with description "PIX REST FULANO", amount -45.90, date 2026-03-05T15:30:00
When findDuplicate is called with same description, same amount, date 2026-03-05T08:00:00
Then it returns the existing transaction (same day, different time)
```

**Implementation**:

`src/lib/dedup.ts`:
```typescript
import prisma from "@/lib/db"

export interface DuplicateCheckParams {
  userId: string
  description: string
  amount: number
  date: Date
}

export async function findDuplicate({
  userId,
  description,
  amount,
  date,
}: DuplicateCheckParams) {
  // Normalize date to start/end of day
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const duplicate = await prisma.transaction.findFirst({
    where: {
      userId,
      description: {
        equals: description.trim(),
        mode: "insensitive",
      },
      amount,
      date: {
        gte: dayStart,
        lte: dayEnd,
      },
      deletedAt: null,
    },
  })

  return duplicate
}

export async function filterDuplicates(
  userId: string,
  transactions: Array<{ description: string; amount: number; date: Date }>
): Promise<{ unique: typeof transactions; duplicateCount: number }> {
  const unique: typeof transactions = []
  let duplicateCount = 0

  for (const t of transactions) {
    const dup = await findDuplicate({
      userId,
      description: t.description,
      amount: t.amount,
      date: t.date,
    })
    if (dup) {
      duplicateCount++
    } else {
      unique.push(t)
    }
  }

  return { unique, duplicateCount }
}
```

`src/lib/dedup.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest"
import { findDuplicate, filterDuplicates } from "./dedup"

// Mock prisma
vi.mock("@/lib/db", () => ({
  default: {
    transaction: {
      findFirst: vi.fn(),
    },
  },
}))

import prisma from "@/lib/db"

const mockFindFirst = vi.mocked(prisma.transaction.findFirst)

describe("findDuplicate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns matching transaction when duplicate exists", async () => {
    const existingTx = {
      id: "tx1",
      description: "PIX REST FULANO",
      amount: -45.9,
      date: new Date("2026-03-05T15:30:00"),
    }
    mockFindFirst.mockResolvedValue(existingTx as never)

    const result = await findDuplicate({
      userId: "user1",
      description: "PIX REST FULANO",
      amount: -45.9,
      date: new Date("2026-03-05T08:00:00"),
    })

    expect(result).toEqual(existingTx)
    expect(mockFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user1",
        description: {
          equals: "PIX REST FULANO",
          mode: "insensitive",
        },
        amount: -45.9,
        date: {
          gte: expect.any(Date),
          lte: expect.any(Date),
        },
        deletedAt: null,
      },
    })
  })

  it("returns null when no duplicate exists", async () => {
    mockFindFirst.mockResolvedValue(null)

    const result = await findDuplicate({
      userId: "user1",
      description: "UBER TRIP",
      amount: -23.5,
      date: new Date("2026-03-05"),
    })

    expect(result).toBeNull()
  })

  it("trims description before comparing", async () => {
    mockFindFirst.mockResolvedValue(null)

    await findDuplicate({
      userId: "user1",
      description: "  PIX REST FULANO  ",
      amount: -45.9,
      date: new Date("2026-03-05"),
    })

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          description: {
            equals: "PIX REST FULANO",
            mode: "insensitive",
          },
        }),
      })
    )
  })

  it("uses day boundaries for date comparison", async () => {
    mockFindFirst.mockResolvedValue(null)

    await findDuplicate({
      userId: "user1",
      description: "TEST",
      amount: -10,
      date: new Date("2026-03-05T14:30:00"),
    })

    const call = mockFindFirst.mock.calls[0][0]
    const dateFilter = call?.where?.date as { gte: Date; lte: Date }
    expect(dateFilter.gte.getHours()).toBe(0)
    expect(dateFilter.gte.getMinutes()).toBe(0)
    expect(dateFilter.lte.getHours()).toBe(23)
    expect(dateFilter.lte.getMinutes()).toBe(59)
  })
})

describe("filterDuplicates", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("separates unique and duplicate transactions", async () => {
    mockFindFirst
      .mockResolvedValueOnce({ id: "existing" } as never) // first is dup
      .mockResolvedValueOnce(null) // second is unique

    const transactions = [
      { description: "DUP", amount: -10, date: new Date("2026-03-05") },
      { description: "NEW", amount: -20, date: new Date("2026-03-05") },
    ]

    const result = await filterDuplicates("user1", transactions)

    expect(result.unique).toHaveLength(1)
    expect(result.unique[0].description).toBe("NEW")
    expect(result.duplicateCount).toBe(1)
  })
})
```

**Verification**: `npx vitest run src/lib/dedup.test.ts`

**On Failure**:
- If import error on `@/lib/db`: Check tsconfig paths has `@/*` → `./src/*`
- If Prisma types missing: Run `npm run db:generate` first
- If `mode: "insensitive"` not supported: This works with PostgreSQL; if using SQLite in tests, the mock handles it

---

#### 3. Integrate deduplication into import endpoint

- [x] **COMPLETE**
  - **Learning:** O mock de `@/lib/db` no teste de integração precisou incluir `findFirst` (para dedup) e `categoryTag.findMany` (já era chamado pela rota mas não estava no mock). O `findDuplicate` é chamado diretamente pela rota -- o mock do prisma é compartilhado entre o módulo dedup e a rota.

**File**: `src/app/api/import/route.ts` (MODIFY)
**Complexity**: Medium
**TDD**: YES
**Depends On**: Task 2 (dedup module must exist)

**Load Before Implementing**:
1. `src/app/api/import/route.ts` (lines 80-187) - Transaction creation loop
2. `src/app/api/import/route.ts` (lines 241-263) - Response builder
3. `src/lib/dedup.ts` (full file) - Dedup functions to import

**Pre-conditions**:
- [ ] Task 2 completed (`src/lib/dedup.ts` exists and tests pass)
- [ ] `src/app/api/import/route.ts` has the transaction creation loop at line 80+

**Why**: Prevenir duplicatas ao importar o mesmo CSV múltiplas vezes. Valor imediato para o app web, independente do bot.

**Acceptance Criteria**:
```gherkin
Given 5 transactions already exist in the database for a user
When the user imports a CSV with 10 transactions where 3 match existing ones
Then 7 new transactions are created
And the response includes skippedCount: 3
And the response message mentions duplicatas ignoradas

Given no existing transactions
When the user imports a CSV with 10 transactions
Then all 10 are created
And skippedCount is 0
```

**Implementation**:

Add import at top of file:
```typescript
import { findDuplicate } from "@/lib/dedup"
```

Add `skippedCount` variable after `linkedCount` declaration (around line 70):
```typescript
    let skippedCount = 0;
```

Add dedup check inside the loop, right before `const transaction = await prisma.transaction.create` (before line 166):
```typescript
      // Check for duplicate transaction
      const duplicate = await findDuplicate({
        userId,
        description: t.description,
        amount,
        date: transactionDate,
      });
      if (duplicate) {
        skippedCount++;
        continue;
      }
```

Update response message (replace lines 241-262):
```typescript
    // Build response message
    const messageParts = [`${created.length} transacoes importadas`];
    if (skippedCount > 0) {
      messageParts.push(`${skippedCount} duplicatas ignoradas`);
    }
    if (linkedCount > 0) {
      messageParts.push(`${linkedCount} vinculadas a recorrentes`);
    }
    if (carryoverLinkedCount > 0) {
      messageParts.push(`${carryoverLinkedCount} vinculadas a saldo rolado`);
    }
    const message =
      skippedCount > 0 || linkedCount > 0 || carryoverLinkedCount > 0
        ? `${messageParts[0]} (${messageParts.slice(1).join(", ")})`
        : `${created.length} transacoes importadas com sucesso`;

    return NextResponse.json(
      {
        message,
        count: created.length,
        skippedCount,
        linkedCount,
        carryoverLinkedCount,
        linkedCarryovers,
      },
      { status: 201 }
    );
```

**Verification**: `npx vitest run src/lib/dedup.test.ts && npm run build`

**On Failure**:
- If `findDuplicate` import fails: Check path is `@/lib/dedup` (not `@/lib/dedup.ts`)
- If `continue` breaks loop: Ensure the dedup check is inside the `for` loop, not outside
- If build fails: Check that `skippedCount` is declared in scope

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - Testes unitários e de integração passam. TypeCheck sem erros nos arquivos alterados. Lint e build requerem configuração de ambiente (DATABASE_URL, .eslintrc) ausente no worktree.
- [x] `npm run db:generate` - Prisma client gera com sucesso (db:push requer DATABASE_URL)

### Manual Verification (only if automation impossible)
- [ ] Import same CSV twice — second import should report duplicatas ignoradas
