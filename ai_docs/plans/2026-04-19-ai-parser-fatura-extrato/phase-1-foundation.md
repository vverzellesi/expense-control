# Phase 1: Foundation (Quota Infrastructure)

## Overview

Criar a base para o controle de quota: modelo Prisma `AiUsage`, migration, módulo `ai-quota.ts` com API interna (`getUsage`, `hasQuota`, `increment`), e endpoint público `GET /api/ai-usage` pro frontend consultar o status.

Esta fase é independente da IA — depois dela, já temos quota funcionando e testável isoladamente.

## Reference Docs for This Phase

- `prisma/schema.prisma:16-60` — User model (adicionar relation)
- `prisma/schema.prisma` (final do arquivo) — onde inserir novo modelo
- `src/lib/db.ts` — Prisma client singleton
- `src/lib/auth-utils.ts` — `getAuthContext()`, `unauthorizedResponse()`
- `src/app/api/summary/route.ts` — exemplo de endpoint GET autenticado com pattern atual
- `tests/integration/` — estrutura de integration tests existente
- `tests/mocks/prisma.ts` (se existir) — mock do Prisma client

## Changes Required

---

### Task 1.1: Adicionar modelo `AiUsage` ao schema Prisma

**Files:**
- Modify: `prisma/schema.prisma`

**Complexity:** Low
**TDD:** NO — schema definition, validação vem da migration
**Depends On:** none

**Pre-conditions:**
- [ ] `prisma/schema.prisma` existe com model `User` tendo `id String @id`
- [ ] `DATABASE_URL` configurada em `.env` pra gerar migration

**Why:** Precisamos persistir quantas chamadas de IA cada usuário fez no mês atual. Modelo dedicado (em vez de reusar `Settings` key-value) permite índice composto `@@unique([userId, yearMonth])` pra garantir atomicidade do upsert.

**Acceptance Criteria:**
```gherkin
Given o schema Prisma com models existentes
When o model AiUsage é adicionado com a relation no User
Then `npm run db:generate` roda sem erros
And `User.aiUsage` retorna `AiUsage[]`
And o index composto (userId, yearMonth) é único
```

- [ ] **Step 1: Adicionar relation no User model**

Editar `prisma/schema.prisma`. Na seção do User (após `telegramPhotoQueue TelegramPhotoQueue[]` na linha ~59), adicionar:

```prisma
  // AI usage tracking
  aiUsage AiUsage[]
```

- [ ] **Step 2: Adicionar modelo AiUsage no final do schema**

Adicionar no final de `prisma/schema.prisma` (depois do último modelo existente, `TelegramPhotoQueue` ou similar):

```prisma
// ==========================================
// AI USAGE TRACKING
// ==========================================

model AiUsage {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  yearMonth String   // "2026-04"
  count     Int      @default(0)
  updatedAt DateTime @updatedAt

  @@unique([userId, yearMonth])
  @@index([userId])
}
```

- [ ] **Step 3: Regenerar Prisma client**

Run: `npm run db:generate`
Expected output: `✔ Generated Prisma Client`
Expected: sem erros de sintaxe, client atualizado em `node_modules/.prisma/client`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(ai-parser): add AiUsage model for quota tracking"
```

---

### Task 1.2: Criar migration

**Files:**
- Create: `prisma/migrations/<timestamp>_add_ai_usage/migration.sql` (gerado)

**Complexity:** Low
**TDD:** NO — migration é SQL autogerada
**Depends On:** Task 1.1

**Why:** Criar a tabela no banco. Migration é o contrato entre código e DB.

**Acceptance Criteria:**
```gherkin
Given o schema com AiUsage
When `npm run db:migrate -- --name add_ai_usage` é executado
Then uma migration é criada em prisma/migrations/
And o SQL cria tabela ai_usage com índices corretos
And a migration aplica sem erros num banco novo
```

- [ ] **Step 1: Gerar migration**

Run: `npm run db:migrate -- --name add_ai_usage`
Expected output: `✔ Generated Prisma Client` + `Your database is now in sync with your schema.`
Expected: novo diretório em `prisma/migrations/` com um `migration.sql` contendo `CREATE TABLE "AiUsage"`.

- [ ] **Step 2: Inspecionar migration gerada**

Run: `ls prisma/migrations/ | tail -1`
Abrir o `migration.sql` mais recente e confirmar que tem:
- `CREATE TABLE "AiUsage"`
- `CREATE UNIQUE INDEX ... ON "AiUsage"("userId", "yearMonth")`
- `CREATE INDEX ... ON "AiUsage"("userId")`
- `ADD CONSTRAINT ... FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE`

Se algo estiver errado, ajustar schema e regenerar. NÃO editar SQL à mão.

- [ ] **Step 3: Commit**

```bash
git add prisma/migrations/
git commit -m "feat(ai-parser): migration for AiUsage table"
```

---

### Task 1.3: Escrever testes do módulo `ai-quota.ts` (TDD) — com reserve/release atômico

**Files:**
- Create: `src/lib/rate-limit/ai-quota.test.ts`

**Complexity:** Medium
**TDD:** YES — testes primeiro
**Depends On:** Task 1.1 (tipo `AiUsage` existe)

**Why:** Quota precisa de enforcement atômico (SQL-nível) pra evitar race em uploads concorrentes. Testes mockam `$queryRaw`/`$executeRaw` e verificam que `tryReserve` retorna false quando a query volta sem rows (quota esgotada) e que `release` é chamado com args corretos.

**Contrato público da API:**
- `currentYearMonth()` → `"YYYY-MM"` UTC
- `getUsage(userId, yearMonth?)` → `{ used, remaining, limit }`
- `tryReserve(userId, yearMonth?)` → `boolean` (true = reservou, false = quota esgotada)
- `release(userId, yearMonth?)` → `void` (decrementa idempotentemente)

**Acceptance Criteria:**
```gherkin
Given o módulo ai-quota ainda não implementado
When os testes são executados
Then os testes falham com erro de import (módulo não existe)
```

- [ ] **Step 1: Criar arquivo de teste**

Escrever `src/lib/rate-limit/ai-quota.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  getUsage,
  tryReserve,
  release,
  currentYearMonth,
} from "./ai-quota";
import prisma from "@/lib/db";

vi.mock("@/lib/db", () => ({
  default: {
    aiUsage: {
      findUnique: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

const mockFindUnique = vi.mocked(prisma.aiUsage.findUnique);
const mockQueryRaw = vi.mocked(prisma.$queryRaw);
const mockExecuteRaw = vi.mocked(prisma.$executeRaw);

describe("ai-quota", () => {
  const userId = "user-123";

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-15T12:00:00Z"));
    process.env.AI_MONTHLY_QUOTA = "5";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("currentYearMonth", () => {
    it("devolve yearMonth UTC atual formatado", () => {
      expect(currentYearMonth()).toBe("2026-04");
    });

    it("muda ao virar o mês UTC", () => {
      vi.setSystemTime(new Date("2026-05-01T00:00:01Z"));
      expect(currentYearMonth()).toBe("2026-05");
    });
  });

  describe("getUsage", () => {
    it("retorna zero quando não há registro pro mês", async () => {
      mockFindUnique.mockResolvedValue(null);
      const result = await getUsage(userId);
      expect(result).toEqual({ used: 0, remaining: 5, limit: 5 });
    });

    it("retorna contagem quando há registro", async () => {
      mockFindUnique.mockResolvedValue({
        id: "x", userId, yearMonth: "2026-04", count: 3, updatedAt: new Date(),
      });
      const result = await getUsage(userId);
      expect(result).toEqual({ used: 3, remaining: 2, limit: 5 });
    });

    it("limita remaining em 0 se count >= limit", async () => {
      mockFindUnique.mockResolvedValue({
        id: "x", userId, yearMonth: "2026-04", count: 10, updatedAt: new Date(),
      });
      const result = await getUsage(userId);
      expect(result).toEqual({ used: 10, remaining: 0, limit: 5 });
    });

    it("aceita yearMonth explícito (pra consistência em requests longos)", async () => {
      mockFindUnique.mockResolvedValue(null);
      await getUsage(userId, "2026-03");
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { userId_yearMonth: { userId, yearMonth: "2026-03" } },
      });
    });

    it("usa limit customizado via env AI_MONTHLY_QUOTA", async () => {
      process.env.AI_MONTHLY_QUOTA = "10";
      mockFindUnique.mockResolvedValue(null);
      const result = await getUsage(userId);
      expect(result.limit).toBe(10);
    });
  });

  describe("tryReserve", () => {
    it("retorna true quando a query retorna row (reserva feita)", async () => {
      mockQueryRaw.mockResolvedValue([{ count: 1 }] as never);
      const result = await tryReserve(userId);
      expect(result).toBe(true);
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    });

    it("retorna false quando query retorna 0 rows (quota esgotada)", async () => {
      mockQueryRaw.mockResolvedValue([] as never);
      const result = await tryReserve(userId);
      expect(result).toBe(false);
    });

    it("retorna false sem bater no banco quando AI_MONTHLY_QUOTA=0", async () => {
      process.env.AI_MONTHLY_QUOTA = "0";
      const result = await tryReserve(userId);
      expect(result).toBe(false);
      expect(mockQueryRaw).not.toHaveBeenCalled();
    });

    it("usa yearMonth explícito quando passado (evita race na virada de mês)", async () => {
      mockQueryRaw.mockResolvedValue([{ count: 1 }] as never);
      await tryReserve(userId, "2026-03");
      // Inspeção superficial: a chamada foi feita 1 vez
      expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe("release", () => {
    it("executa update decrementando count com GREATEST(count-1, 0)", async () => {
      mockExecuteRaw.mockResolvedValue(1 as never);
      await release(userId);
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    });

    it("aceita yearMonth explícito", async () => {
      mockExecuteRaw.mockResolvedValue(1 as never);
      await release(userId, "2026-03");
      expect(mockExecuteRaw).toHaveBeenCalledTimes(1);
    });

    it("não lança se linha não existir (idempotente)", async () => {
      mockExecuteRaw.mockResolvedValue(0 as never);
      await expect(release(userId)).resolves.toBeUndefined();
    });
  });
});
```

**Nota sobre os mocks de `$queryRaw`/`$executeRaw`:** Prisma chama essas funções como tagged templates. Nos testes só verificamos _que_ foram chamadas e com o número correto de calls — não inspecionamos a SQL exata porque `vi.mock` retorna um mock plano e o conteúdo do template se perde. A atomicidade é verificada empiricamente na Task 1.7 (integration test contra DB real).

- [ ] **Step 2: Rodar testes — devem falhar por módulo inexistente**

Run: `npm run test:unit -- src/lib/rate-limit/ai-quota.test.ts`
Expected: FAIL com `Cannot find module './ai-quota'` ou similar.

- [ ] **Step 3: Commit (só os testes)**

```bash
git add src/lib/rate-limit/ai-quota.test.ts
git commit -m "test(ai-parser): add failing tests for ai-quota module"
```

---

### Task 1.4: Implementar `ai-quota.ts` com reserve/release atômico

**Files:**
- Create: `src/lib/rate-limit/ai-quota.ts`

**Complexity:** Medium
**TDD:** YES — código que faz os testes da 1.3 passarem
**Depends On:** Task 1.3

**Why:** Implementação mínima com enforcement SQL-nível.

**Acceptance Criteria:**
```gherkin
Given os testes de ai-quota
When o módulo é implementado com tryReserve + release
Then todos os testes passam
And tryReserve é SQL atômico (INSERT ON CONFLICT WHERE)
And release é SQL atômico (UPDATE GREATEST)
```

- [ ] **Step 1: Implementar módulo**

Escrever `src/lib/rate-limit/ai-quota.ts`:

```typescript
import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";

const DEFAULT_MONTHLY_LIMIT = 5;

function monthlyLimit(): number {
  const raw = process.env.AI_MONTHLY_QUOTA;
  if (raw === undefined || raw === null) return DEFAULT_MONTHLY_LIMIT;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_MONTHLY_LIMIT;
  return Math.floor(parsed);
}

export function currentYearMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function getUsage(
  userId: string,
  yearMonth: string = currentYearMonth()
): Promise<{ used: number; remaining: number; limit: number }> {
  const limit = monthlyLimit();
  const row = await prisma.aiUsage.findUnique({
    where: { userId_yearMonth: { userId, yearMonth } },
  });
  const used = row?.count ?? 0;
  return { used, remaining: Math.max(0, limit - used), limit };
}

/**
 * Reserva atomicamente 1 call da quota. Retorna true se reservou; false se esgotada.
 * A atomicidade vem do INSERT ... ON CONFLICT DO UPDATE ... WHERE,
 * que só atualiza a row existente se count < limit.
 */
export async function tryReserve(
  userId: string,
  yearMonth: string = currentYearMonth()
): Promise<boolean> {
  const limit = monthlyLimit();
  if (limit <= 0) return false;

  const rows = await prisma.$queryRaw<Array<{ count: number }>>(
    Prisma.sql`
      INSERT INTO "AiUsage" ("id", "userId", "yearMonth", "count", "updatedAt")
      VALUES (gen_random_uuid()::text, ${userId}, ${yearMonth}, 1, now())
      ON CONFLICT ("userId", "yearMonth")
      DO UPDATE SET count = "AiUsage".count + 1, "updatedAt" = now()
      WHERE "AiUsage".count < ${limit}
      RETURNING count;
    `
  );
  return rows.length > 0;
}

/**
 * Libera uma reserva (quando a chamada de IA falhou ou gate reprovou).
 * Idempotente: não desce abaixo de 0.
 */
export async function release(
  userId: string,
  yearMonth: string = currentYearMonth()
): Promise<void> {
  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "AiUsage"
      SET count = GREATEST(count - 1, 0), "updatedAt" = now()
      WHERE "userId" = ${userId} AND "yearMonth" = ${yearMonth};
    `
  );
}
```

**Nota:** Requer extensão `pgcrypto` (pra `gen_random_uuid()`). É padrão no Neon, mas se `db:migrate` reclamar, adicionar `CREATE EXTENSION IF NOT EXISTS pgcrypto;` na migration da Task 1.2.

- [ ] **Step 2: Rodar testes — devem passar**

Run: `npm run test:unit -- src/lib/rate-limit/ai-quota.test.ts`
Expected: PASS (~13 testes).

- [ ] **Step 3: Commit**

```bash
git add src/lib/rate-limit/ai-quota.ts
git commit -m "feat(ai-parser): implement atomic tryReserve/release quota"
```

---

### Task 1.4b: Teste de integração de atomicidade (contra DB real)

**Files:**
- Create: `tests/integration/lib/ai-quota-atomicity.test.ts`

**Complexity:** Medium
**TDD:** NO (validação empírica de invariante)
**Depends On:** Task 1.4

**Why:** Unit tests mockam `$queryRaw` e não validam atomicidade real. Oracle apontou que race é o risco principal; precisamos exercitar concorrência contra DB de verdade.

**Acceptance Criteria:**
```gherkin
Given AI_MONTHLY_QUOTA = 5 e um usuário sem registro
When disparamos 10 tryReserve em paralelo (Promise.all)
Then exatamente 5 retornam true e 5 retornam false
And o count final em AiUsage é exatamente 5
```

- [ ] **Step 1: Escrever o teste**

Escrever `tests/integration/lib/ai-quota-atomicity.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import prisma from "@/lib/db";
import { tryReserve, release, currentYearMonth } from "@/lib/rate-limit/ai-quota";

describe("ai-quota atomicity (integration, PostgreSQL)", () => {
  const userId = "integration-test-user";
  let yearMonth: string;

  beforeEach(async () => {
    yearMonth = currentYearMonth();
    // garantir user e limpar estado
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: `${userId}@test.local`,
      },
      update: {},
    });
    await prisma.aiUsage.deleteMany({ where: { userId } });
    process.env.AI_MONTHLY_QUOTA = "5";
  });

  it("10 tryReserve concorrentes com limit=5 → exatamente 5 reservam", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () => tryReserve(userId, yearMonth))
    );
    const reserved = results.filter(Boolean).length;
    expect(reserved).toBe(5);

    const row = await prisma.aiUsage.findUnique({
      where: { userId_yearMonth: { userId, yearMonth } },
    });
    expect(row?.count).toBe(5);
  });

  it("release após reserva decrementa, permitindo nova reserva", async () => {
    for (let i = 0; i < 5; i++) await tryReserve(userId, yearMonth);
    expect(await tryReserve(userId, yearMonth)).toBe(false);

    await release(userId, yearMonth);
    expect(await tryReserve(userId, yearMonth)).toBe(true);
  });

  it("release com count=0 é idempotente (não vai negativo)", async () => {
    await release(userId, yearMonth);
    await release(userId, yearMonth);
    const row = await prisma.aiUsage.findUnique({
      where: { userId_yearMonth: { userId, yearMonth } },
    });
    // Row pode nem existir se nunca reservou; se existir count >= 0
    expect(row?.count ?? 0).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Rodar**

Run: `npm run test:integration -- tests/integration/lib/ai-quota-atomicity.test.ts`
Expected: PASS. Se a atomicidade falhar (ex: o PostgreSQL não enforçar), vamos ver `reserved !== 5` — parar e diagnosticar antes de seguir.

- [ ] **Step 3: Commit**

```bash
git add tests/integration/lib/ai-quota-atomicity.test.ts
git commit -m "test(ai-parser): integration test for quota atomicity under concurrency"
```

---

### Task 1.5: Escrever teste do endpoint `GET /api/ai-usage` (TDD)

**Files:**
- Create: `src/app/api/ai-usage/route.test.ts`

**Complexity:** Medium
**TDD:** YES
**Depends On:** Task 1.4

**Why:** Endpoint precisa retornar o status da quota pro frontend.

**Acceptance Criteria:**
```gherkin
Given o endpoint /api/ai-usage ainda não implementado
When os testes de rota são executados
Then os testes falham com erro de import
```

- [ ] **Step 1: Criar arquivo de teste**

Escrever `src/app/api/ai-usage/route.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { GET } from "./route";
import { NextRequest } from "next/server";
import * as authUtils from "@/lib/auth-utils";
import * as aiQuota from "@/lib/rate-limit/ai-quota";

vi.mock("@/lib/auth-utils");
vi.mock("@/lib/rate-limit/ai-quota");

describe("GET /api/ai-usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna 401 se usuário não autenticado", async () => {
    vi.mocked(authUtils.getAuthContext).mockRejectedValue(new Error("Unauthorized"));
    vi.mocked(authUtils.unauthorizedResponse).mockReturnValue(
      new Response(null, { status: 401 }) as never
    );
    const req = new NextRequest("http://localhost/api/ai-usage");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("retorna JSON com used/remaining/limit/yearMonth para usuário autenticado", async () => {
    vi.mocked(authUtils.getAuthContext).mockResolvedValue({
      userId: "u1",
      ownerFilter: { userId: "u1" },
    } as never);
    vi.mocked(aiQuota.getUsage).mockResolvedValue({
      used: 2,
      remaining: 3,
      limit: 5,
    });

    const req = new NextRequest("http://localhost/api/ai-usage");
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      used: 2,
      remaining: 3,
      limit: 5,
      yearMonth: expect.stringMatching(/^\d{4}-\d{2}$/),
    });
  });
});
```

- [ ] **Step 2: Rodar — deve falhar**

Run: `npm run test:unit -- src/app/api/ai-usage/route.test.ts`
Expected: FAIL com `Cannot find module './route'`.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/ai-usage/route.test.ts
git commit -m "test(ai-parser): add failing tests for GET /api/ai-usage"
```

---

### Task 1.6: Implementar endpoint `GET /api/ai-usage`

**Files:**
- Create: `src/app/api/ai-usage/route.ts`

**Complexity:** Low
**TDD:** YES
**Depends On:** Task 1.5

**Why:** Frontend precisa consultar a quota pra exibir o badge.

**Acceptance Criteria:**
```gherkin
Given o endpoint implementado
When o frontend faz GET /api/ai-usage autenticado
Then recebe { used, remaining, limit, yearMonth }
And usuário não autenticado recebe 401
```

- [ ] **Step 1: Implementar rota**

Escrever `src/app/api/ai-usage/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorizedResponse } from "@/lib/auth-utils";
import { getUsage } from "@/lib/rate-limit/ai-quota";

export const runtime = "nodejs";

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const usage = await getUsage(ctx.userId);
    return NextResponse.json({ ...usage, yearMonth: currentYearMonth() });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("/api/ai-usage error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
```

- [ ] **Step 2: Rodar testes — devem passar**

Run: `npm run test:unit -- src/app/api/ai-usage/route.test.ts`
Expected: PASS.

- [ ] **Step 3: Teste manual via curl (opcional)**

Start dev server: `npm run dev`
Em outro terminal, logar via browser primeiro, copiar o cookie de sessão.

Run:
```bash
curl -b "authjs.session-token=<cookie>" http://localhost:3000/api/ai-usage
```
Expected: `{"used":0,"remaining":5,"limit":5,"yearMonth":"2026-04"}`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/ai-usage/route.ts
git commit -m "feat(ai-parser): add GET /api/ai-usage endpoint"
```

---

## Phase 1 Exit Criteria

- [ ] `npm run test:unit` passa, incluindo os novos testes em `rate-limit/` e `api/ai-usage/`
- [ ] `npm run test:integration -- tests/integration/lib/ai-quota-atomicity.test.ts` passa (race test PostgreSQL real)
- [ ] `npm run lint` passa sem warnings novos
- [ ] Endpoint `GET /api/ai-usage` retorna JSON válido manualmente
- [ ] Tabela `AiUsage` existe no banco (confirmar com `npx prisma studio` ou query SQL)
- [ ] `npm run db:generate` roda limpo

**Próxima fase:** [phase-2-ai-parser.md](phase-2-ai-parser.md) — construir o parser de IA em cima da infraestrutura de quota.
