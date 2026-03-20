# Phase 1: Backend + Tracer Bullet

## Overview

Estender o modelo Origin com enum de tipo e campos financeiros, criar a API `/api/cards/summary` com lógica de cálculo (mês atual + projeção), e entregar uma página skeleton `/cartoes` com link no sidebar que consome a API e exibe dados reais.

## Reference Docs for This Phase

- `prisma/schema.prisma` (linhas 233-248) — Modelo Origin atual
- `src/types/index.ts` (linhas 77-80) — Interface Origin
- `src/app/api/summary/route.ts` (linhas 193-220) — Padrão de API com month/year params
- `src/app/api/origins/route.ts` (full) — API CRUD de origins
- `src/components/Sidebar.tsx` (linhas 38-56) — Array de navegação
- `prisma/seed.ts` (linhas 92-114) — Seed de origins
- `tests/integration/setup.ts` (full) — Setup de testes de integração
- `tests/integration/api/summary.test.ts` (linhas 1-52) — Padrão de teste de integração

## Changes Required

#### 1. [x] Estender modelo Origin com OriginType e campos financeiros

**File**: `prisma/schema.prisma` (MODIFY) + `src/types/index.ts` (MODIFY) + `prisma/seed.ts` (MODIFY) + `src/app/api/origins/route.ts` (MODIFY)
**Complexity**: Medium
**TDD**: NO — Schema migration, type definitions, seed update, and API wiring. No decision logic.
**Depends On**: none

**Load Before Implementing**:
1. `prisma/schema.prisma` (linhas 233-248) — Origin model to extend
2. `prisma/schema.prisma` (linhas 498-510) — Existing enum pattern (SpaceRole, InviteStatus)
3. `src/types/index.ts` (linhas 77-80) — Origin interface to extend
4. `prisma/seed.ts` (linhas 92-187) — Seed creation pattern
5. `src/app/api/origins/route.ts` (full) — CRUD to update for new fields

**Pre-conditions**:
- [ ] `prisma/schema.prisma` exists and has Origin model at ~line 233
- [ ] `src/types/index.ts` exists with Origin interface at ~line 77
- [ ] `prisma/seed.ts` exists with defaultOrigins array at ~line 92

**Why**: O modelo Origin precisa distinguir cartões de crédito de outros tipos de pagamento e armazenar dados financeiros (limite, taxas, dias de fechamento/vencimento) para a visão consolidada.

**Acceptance Criteria**:
```gherkin
Given the Prisma schema
When OriginType enum is added with CREDIT_CARD, DEBIT, PIX, OTHER values
And Origin model gets type, creditLimit, rotativoRateMonth, parcelamentoRate, cetAnual, billingCycleDay, dueDateDay fields
Then npm run db:generate succeeds
And npm run db:push succeeds without data loss

Given the seed file with defaultOrigins
When origins starting with "Cartão" get type CREDIT_CARD
And origins like PIX get type PIX
And remaining origins get type OTHER
Then npm run db:seed succeeds

Given an Origin with type CREDIT_CARD
When POST /api/origins is called with { name, type: "CREDIT_CARD", creditLimit: 5000 }
Then the origin is created with all financial fields stored

Given an Origin with type CREDIT_CARD
When GET /api/origins is called
Then the response includes type, creditLimit, and all financial fields
```

**Implementation**:

In `prisma/schema.prisma`, add enum before Origin model (around line 232):

```prisma
enum OriginType {
  CREDIT_CARD
  DEBIT
  PIX
  OTHER
}
```

Add the following fields to the existing Origin model (after `name String`, before `// User relationship`). Keep all existing fields, relations, and constraints intact:

```prisma
  type              OriginType @default(OTHER)
  creditLimit       Float?
  rotativoRateMonth Float?
  parcelamentoRate  Float?
  cetAnual          Float?
  billingCycleDay   Int?
  dueDateDay        Int?
```

In `src/types/index.ts`, replace the Origin interface (lines 77-80) with:

```typescript
export type OriginType = "CREDIT_CARD" | "DEBIT" | "PIX" | "OTHER";

export interface Origin {
  id: string;
  name: string;
  type: OriginType;
  creditLimit: number | null;
  rotativoRateMonth: number | null;
  parcelamentoRate: number | null;
  cetAnual: number | null;
  billingCycleDay: number | null;
  dueDateDay: number | null;
}
```

In `prisma/seed.ts`, replace `defaultOrigins` array (lines 92-114) with:

```typescript
const defaultOrigins = [
  // Cartões de crédito
  { name: "Cartão C6", type: "CREDIT_CARD" as const },
  { name: "Cartão Itaú", type: "CREDIT_CARD" as const },
  { name: "Cartão BTG", type: "CREDIT_CARD" as const },
  { name: "Cartão Nubank", type: "CREDIT_CARD" as const },
  // Formas de pagamento
  { name: "PIX", type: "PIX" as const },
  { name: "Transferência", type: "OTHER" as const },
  { name: "Dinheiro", type: "OTHER" as const },
  { name: "Boleto", type: "OTHER" as const },
  { name: "Débito Automático", type: "DEBIT" as const },
  // Extratos bancários
  { name: "Extrato C6", type: "OTHER" as const },
  { name: "Extrato Itaú", type: "OTHER" as const },
  { name: "Extrato BTG", type: "OTHER" as const },
  { name: "Extrato Nubank", type: "OTHER" as const },
  { name: "Extrato Bradesco", type: "OTHER" as const },
  { name: "Extrato Santander", type: "OTHER" as const },
  { name: "Extrato BB", type: "OTHER" as const },
  { name: "Extrato Caixa", type: "OTHER" as const },
  { name: "Extrato Bancário", type: "OTHER" as const },
];
```

In `src/app/api/origins/route.ts`, update POST handler to accept new fields. Replace the create call (lines 51-57) with:

```typescript
    const { name, type, creditLimit, rotativoRateMonth, parcelamentoRate, cetAnual, billingCycleDay, dueDateDay } = body;

    if (!name || typeof name !== "string" || name.trim() === "") {
      return NextResponse.json(
        { error: "Nome é obrigatório" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    const origin = await prisma.origin.create({
      data: {
        name: trimmedName,
        type: type || "OTHER",
        creditLimit: creditLimit ?? null,
        rotativoRateMonth: rotativoRateMonth ?? null,
        parcelamentoRate: parcelamentoRate ?? null,
        cetAnual: cetAnual ?? null,
        billingCycleDay: billingCycleDay ?? null,
        dueDateDay: dueDateDay ?? null,
        userId: ctx.userId,
        spaceId: ctx.spaceId,
      },
    });
```

In the PUT handler, update the body destructuring (line 99) and the update data (line 128):

```typescript
    const { name, type, creditLimit, rotativoRateMonth, parcelamentoRate, cetAnual, billingCycleDay, dueDateDay } = body;
```

And in the `$transaction` update call, replace line 128 `data: { name: trimmedName }` with:

```typescript
        data: {
          name: trimmedName,
          ...(type !== undefined && { type }),
          ...(creditLimit !== undefined && { creditLimit: creditLimit ?? null }),
          ...(rotativoRateMonth !== undefined && { rotativoRateMonth: rotativoRateMonth ?? null }),
          ...(parcelamentoRate !== undefined && { parcelamentoRate: parcelamentoRate ?? null }),
          ...(cetAnual !== undefined && { cetAnual: cetAnual ?? null }),
          ...(billingCycleDay !== undefined && { billingCycleDay: billingCycleDay ?? null }),
          ...(dueDateDay !== undefined && { dueDateDay: dueDateDay ?? null }),
        },
```

**Verification**: `npx prisma generate && npx prisma db push`

**Learning:** `prisma generate` funciona no worktree, mas `db push` requer DATABASE_URL (PostgreSQL). A validação do schema é feita via `prisma generate` + `tsc --noEmit`. Enum OriginType funciona sem problemas com o provider PostgreSQL.

**On Failure**:
- If migration fails: Check SQLite enum support — Prisma stores enums as TEXT in SQLite. This is supported.
- If seed fails: Ensure `type` field uses valid enum values. Use `as const` assertion.
- If type errors in origins route: Verify the body destructuring matches the Prisma model fields exactly.

---

#### 2. [x] Criar API `/api/cards/summary` com lógica de cálculo e unit tests

**File**: `src/app/api/cards/summary/route.ts` (CREATE) + `src/lib/cards-summary.ts` (CREATE) + `src/lib/cards-summary.test.ts` (CREATE)
**Complexity**: High
**TDD**: YES
**Depends On**: Task 1

**Load Before Implementing**:
1. `src/app/api/summary/route.ts` (linhas 193-220) — API pattern with month/year params
2. `src/lib/auth-utils.ts` (linhas 75-95) — getAuthContext pattern
3. `prisma/schema.prisma` (linhas 158-182) — RecurringExpense model for projection queries
4. `prisma/schema.prisma` (linhas 209-231) — Installment model for projection queries
5. `src/lib/categorizer.test.ts` (linhas 1-30) — Unit test mock pattern

**Pre-conditions**:
- [ ] Task 1 complete (Origin model has `type` field and financial fields)
- [ ] `src/app/api/` directory exists
- [ ] `src/lib/` directory exists

**Why**: A lógica de cálculo de breakdown (parcela/novo/fixo), status do limite, e projeção do próximo mês é o core da feature. Extrair para `cards-summary.ts` permite testar unitariamente sem mock de HTTP.

**Acceptance Criteria**:
```gherkin
Given origins with type CREDIT_CARD and transactions in the current month
When calculateCardsSummary is called with month/year
Then each card returns currentMonth with total, installmentTotal, fixedTotal, newExpenseTotal, transactionCount
And limitUsedPercent is calculated when creditLimit is set
And status is 'healthy' (<60%), 'warning' (60-80%), or 'critical' (>80%)

Given a card with future installment transactions and active recurring expenses
When calculateCardsSummary is called
Then projection returns installmentTotal, fixedTotal, and estimatedTotal for next month

Given no origins with type CREDIT_CARD
When GET /api/cards/summary is called
Then response returns empty cards array and zero totals

Given an unauthenticated request
When GET /api/cards/summary is called
Then response returns 401
```

**Implementation**:

Create `src/lib/cards-summary.ts`:

```typescript
import prisma from "./db";
import type { AuthContext } from "./auth-utils";

export type CardStatus = "healthy" | "warning" | "critical";

export interface CardCurrentMonth {
  total: number;
  installmentTotal: number;
  newExpenseTotal: number;
  fixedTotal: number;
  transactionCount: number;
  limitUsedPercent: number | null;
  status: CardStatus;
}

export interface CardProjection {
  installmentTotal: number;
  fixedTotal: number;
  estimatedTotal: number;
}

export interface CardRates {
  rotativoRateMonth: number | null;
  parcelamentoRate: number | null;
  cetAnual: number | null;
}

export interface CardSummary {
  id: string;
  name: string;
  creditLimit: number | null;
  billingCycleDay: number | null;
  dueDateDay: number | null;
  currentMonth: CardCurrentMonth;
  projection: CardProjection;
  rates: CardRates;
}

export interface CardsSummaryResponse {
  cards: CardSummary[];
  totals: {
    totalAllCards: number;
    projectedNextMonth: number;
  };
}

export function calculateStatus(limitUsedPercent: number | null): CardStatus {
  if (limitUsedPercent === null) return "healthy";
  if (limitUsedPercent >= 80) return "critical";
  if (limitUsedPercent >= 60) return "warning";
  return "healthy";
}

export function calculateLimitUsedPercent(
  total: number,
  creditLimit: number | null
): number | null {
  if (!creditLimit || creditLimit <= 0) return null;
  return Math.round((Math.abs(total) / creditLimit) * 100 * 100) / 100;
}

export async function calculateCardsSummary(
  ctx: AuthContext,
  targetMonth: number,
  targetYear: number
): Promise<CardsSummaryResponse> {
  // Fetch credit card origins
  const creditCards = await prisma.origin.findMany({
    where: {
      ...ctx.ownerFilter,
      type: "CREDIT_CARD",
    },
    orderBy: { name: "asc" },
  });

  if (creditCards.length === 0) {
    return { cards: [], totals: { totalAllCards: 0, projectedNextMonth: 0 } };
  }

  const cardNames = creditCards.map((c) => c.name);

  // Date ranges for current month
  const startDate = new Date(targetYear, targetMonth - 1, 1);
  const endDate = new Date(targetYear, targetMonth, 0);
  endDate.setHours(23, 59, 59, 999);

  // Next month range for projection
  const nextMonthStart = new Date(targetYear, targetMonth, 1);
  const nextMonthEnd = new Date(targetYear, targetMonth + 1, 0);
  nextMonthEnd.setHours(23, 59, 59, 999);

  // Fetch all transactions for credit cards in current month
  const transactions = await prisma.transaction.findMany({
    where: {
      ...ctx.ownerFilter,
      origin: { in: cardNames },
      date: { gte: startDate, lte: endDate },
      type: "EXPENSE",
      deletedAt: null,
    },
    select: {
      origin: true,
      amount: true,
      isInstallment: true,
      isFixed: true,
    },
  });

  // Fetch future installment transactions for next month
  const futureInstallments = await prisma.transaction.findMany({
    where: {
      ...ctx.ownerFilter,
      origin: { in: cardNames },
      isInstallment: true,
      type: "EXPENSE",
      date: { gte: nextMonthStart, lte: nextMonthEnd },
      deletedAt: null,
    },
    select: {
      origin: true,
      amount: true,
    },
  });

  // Fetch active recurring expenses for credit cards
  const recurringExpenses = await prisma.recurringExpense.findMany({
    where: {
      ...ctx.ownerFilter,
      origin: { in: cardNames },
      isActive: true,
      type: "EXPENSE",
    },
    select: {
      origin: true,
      defaultAmount: true,
    },
  });

  // Build per-card summaries
  const cards: CardSummary[] = creditCards.map((card) => {
    // Current month breakdown
    const cardTransactions = transactions.filter((t) => t.origin === card.name);
    const total = cardTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const installmentTotal = cardTransactions
      .filter((t) => t.isInstallment)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const fixedTotal = cardTransactions
      .filter((t) => t.isFixed && !t.isInstallment)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const newExpenseTotal = total - installmentTotal - fixedTotal;

    const limitUsedPercent = calculateLimitUsedPercent(total, card.creditLimit);
    const status = calculateStatus(limitUsedPercent);

    // Projection for next month
    const projInstallments = futureInstallments
      .filter((t) => t.origin === card.name)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const projFixed = recurringExpenses
      .filter((r) => r.origin === card.name)
      .reduce((sum, r) => sum + Math.abs(r.defaultAmount), 0);

    return {
      id: card.id,
      name: card.name,
      creditLimit: card.creditLimit,
      billingCycleDay: card.billingCycleDay,
      dueDateDay: card.dueDateDay,
      currentMonth: {
        total,
        installmentTotal,
        fixedTotal,
        newExpenseTotal,
        transactionCount: cardTransactions.length,
        limitUsedPercent,
        status,
      },
      projection: {
        installmentTotal: projInstallments,
        fixedTotal: projFixed,
        estimatedTotal: projInstallments + projFixed,
      },
      rates: {
        rotativoRateMonth: card.rotativoRateMonth,
        parcelamentoRate: card.parcelamentoRate,
        cetAnual: card.cetAnual,
      },
    };
  });

  const totalAllCards = cards.reduce((sum, c) => sum + c.currentMonth.total, 0);
  const projectedNextMonth = cards.reduce(
    (sum, c) => sum + c.projection.estimatedTotal,
    0
  );

  return {
    cards,
    totals: { totalAllCards, projectedNextMonth },
  };
}
```

Create `src/lib/cards-summary.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { calculateStatus, calculateLimitUsedPercent } from "./cards-summary";

describe("cards-summary", () => {
  describe("calculateStatus", () => {
    it("returns healthy when limitUsedPercent is null", () => {
      expect(calculateStatus(null)).toBe("healthy");
    });

    it("returns healthy when under 60%", () => {
      expect(calculateStatus(0)).toBe("healthy");
      expect(calculateStatus(30)).toBe("healthy");
      expect(calculateStatus(59.99)).toBe("healthy");
    });

    it("returns warning when between 60% and 80%", () => {
      expect(calculateStatus(60)).toBe("warning");
      expect(calculateStatus(70)).toBe("warning");
      expect(calculateStatus(79.99)).toBe("warning");
    });

    it("returns critical when 80% or above", () => {
      expect(calculateStatus(80)).toBe("critical");
      expect(calculateStatus(90)).toBe("critical");
      expect(calculateStatus(100)).toBe("critical");
      expect(calculateStatus(150)).toBe("critical");
    });
  });

  describe("calculateLimitUsedPercent", () => {
    it("returns null when creditLimit is null", () => {
      expect(calculateLimitUsedPercent(500, null)).toBeNull();
    });

    it("returns null when creditLimit is 0", () => {
      expect(calculateLimitUsedPercent(500, 0)).toBeNull();
    });

    it("returns null when creditLimit is negative", () => {
      expect(calculateLimitUsedPercent(500, -1000)).toBeNull();
    });

    it("calculates percentage correctly", () => {
      expect(calculateLimitUsedPercent(500, 1000)).toBe(50);
      expect(calculateLimitUsedPercent(800, 1000)).toBe(80);
      expect(calculateLimitUsedPercent(1500, 1000)).toBe(150);
    });

    it("uses absolute value of total", () => {
      expect(calculateLimitUsedPercent(-500, 1000)).toBe(50);
    });

    it("rounds to 2 decimal places", () => {
      expect(calculateLimitUsedPercent(333, 1000)).toBe(33.3);
    });
  });
});
```

**Nota sobre cobertura de testes:** Os unit tests acima cobrem as funções puras (`calculateStatus`, `calculateLimitUsedPercent`). A lógica de agregação principal (`calculateCardsSummary`) é coberta pelos testes de integração em Phase 2 Task 3, que exercitam o pipeline completo com mocks de banco.

Create `src/app/api/cards/summary/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { calculateCardsSummary } from "@/lib/cards-summary";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    const currentDate = new Date();
    const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();

    if (isNaN(targetMonth) || isNaN(targetYear) || targetMonth < 1 || targetMonth > 12) {
      return NextResponse.json(
        { error: "Parâmetros de mês/ano inválidos" },
        { status: 400 }
      );
    }

    const result = await calculateCardsSummary(ctx, targetMonth, targetYear);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error fetching cards summary:", error);
    return NextResponse.json(
      { error: "Erro ao buscar resumo de cartões" },
      { status: 500 }
    );
  }
}
```

**Verification**: `npx vitest run src/lib/cards-summary.test.ts`

**Learning:** Testes unitários cobrem apenas as funções puras (calculateStatus, calculateLimitUsedPercent) - 10/10 passando. A função assíncrona calculateCardsSummary será coberta por testes de integração na Phase 2.

**On Failure**:
- If import errors: Verify `src/lib/db` default export exists and Prisma client is generated
- If test compilation fails: Ensure `calculateStatus` and `calculateLimitUsedPercent` are exported from `cards-summary.ts`
- If type errors on Prisma queries: Verify Origin model has `type` field after migration (Task 1 must complete first)

---

#### 3. [x] Criar página skeleton `/cartoes` e adicionar link no sidebar

**File**: `src/app/cartoes/page.tsx` (CREATE) + `src/components/Sidebar.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO — UI component with data fetching, no decision logic.
**Depends On**: Task 2

**Load Before Implementing**:
1. `src/components/Sidebar.tsx` (linhas 38-56) — Navigation array to add item
2. `src/app/dashboard/page.tsx` (linhas 88-107, 153-250) — Data fetching pattern and layout
3. `src/lib/utils.ts` (full) — formatCurrency utility
4. `src/components/ui/card.tsx` — Card component API

**Pre-conditions**:
- [ ] Task 2 complete (API `/api/cards/summary` exists)
- [ ] `src/app/` directory exists
- [ ] `src/components/Sidebar.tsx` has navigation array

**Why**: A página skeleton consome a API e exibe dados reais de cada cartão, validando o pipeline completo end-to-end. O link no sidebar torna a página acessível.

**Acceptance Criteria**:
```gherkin
Given credit card origins exist with transactions
When user navigates to /cartoes
Then the page shows a list of cards with name and total amount for current month
And month/year selector allows navigating between months

Given the sidebar navigation
When "Cartões" item is added
Then it appears between "Transações" and "Investimentos" with Wallet icon
And clicking it navigates to /cartoes
```

**Implementation**:

In `src/components/Sidebar.tsx`, add a new import for `Wallet` in the lucide-react import block (line 10-29). `Wallet` is NOT currently imported in Sidebar, so add it. Then add a new item to the `navigation` array after "Transações" (after line 45):

```typescript
  { name: "Cartões", href: "/cartoes", icon: Wallet },
```

The full navigation array will be:
```typescript
const navigation: {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  requiredPermission?: PermissionKey;
}[] = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Transações", href: "/transactions", icon: Receipt },
  { name: "Cartões", href: "/cartoes", icon: Wallet },
  { name: "Investimentos", href: "/investments", icon: TrendingUp, requiredPermission: "canViewInvestments" },
  { name: "Faturas", href: "/bills", icon: FileText },
  { name: "Recorrentes", href: "/recurring", icon: RefreshCw },
  { name: "Parcelas", href: "/installments", icon: CreditCard },
  { name: "Projeção", href: "/projection", icon: BarChart3, requiredPermission: "canViewBudgets" },
  { name: "Simulador", href: "/simulador", icon: Calculator, requiredPermission: "canViewBudgets" },
  { name: "Importar", href: "/import", icon: Upload },
  { name: "Categorias", href: "/categories", icon: Tags },
  { name: "Relatórios", href: "/reports", icon: PieChart },
  { name: "Lixeira", href: "/trash", icon: Trash2 },
];
```

Create `src/app/cartoes/page.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CardsSummaryResponse } from "@/lib/cards-summary";

export default function CartoesPage() {
  const [data, setData] = useState<CardsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => new Date().getFullYear());

  useEffect(() => {
    fetchData();
  }, [month, year]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/summary?month=${month}&year=${year}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error("Error fetching cards summary:", error);
    } finally {
      setLoading(false);
    }
  }

  function handlePrevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  }

  function handleNextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  }

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  const statusColors = {
    healthy: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    critical: "bg-red-100 text-red-800",
  };

  const statusLabels = {
    healthy: "Saudável",
    warning: "Atenção",
    critical: "Crítico",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cartões</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[160px] text-center font-medium">
            {monthNames[month - 1]} {year}
          </span>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 h-48" />
            </Card>
          ))}
        </div>
      ) : !data || data.cards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Wallet className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg font-medium">
              Nenhum cartão de crédito cadastrado
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Vá em Configurações → Origens e defina o tipo como "Cartão de Crédito"
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Total */}
          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-gray-500">Total de todos os cartões</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(data.totals.totalAllCards)}
                </p>
              </div>
              {data.totals.projectedNextMonth > 0 && (
                <div className="text-right">
                  <p className="text-sm text-gray-500">Projeção próximo mês</p>
                  <p className="text-lg font-semibold text-gray-700">
                    {formatCurrency(data.totals.projectedNextMonth)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cards Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.cards.map((card) => (
              <Card key={card.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{card.name}</CardTitle>
                    <Badge variant="outline" className={statusColors[card.currentMonth.status]}>
                      {statusLabels[card.currentMonth.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-2xl font-bold">
                    {formatCurrency(card.currentMonth.total)}
                  </p>

                  {/* Breakdown */}
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Parcelas</span>
                      <span>{formatCurrency(card.currentMonth.installmentTotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Gastos novos</span>
                      <span>{formatCurrency(card.currentMonth.newExpenseTotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Fixos</span>
                      <span>{formatCurrency(card.currentMonth.fixedTotal)}</span>
                    </div>
                  </div>

                  {/* Limit Progress */}
                  {card.creditLimit && card.currentMonth.limitUsedPercent !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Limite usado</span>
                        <span>{card.currentMonth.limitUsedPercent}%</span>
                      </div>
                      <Progress
                        value={Math.min(card.currentMonth.limitUsedPercent, 100)}
                        className="h-2"
                      />
                      <p className="text-xs text-gray-400">
                        Limite: {formatCurrency(card.creditLimit)}
                      </p>
                    </div>
                  )}

                  {/* Projection */}
                  {card.projection.estimatedTotal > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-gray-500">Próximo mês (estimado)</p>
                      <p className="text-sm font-medium">
                        {formatCurrency(card.projection.estimatedTotal)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
```

**Verification**: `npm run build` (verifies no compilation errors and page route is valid)

**Learning:** O `Wallet` icon do lucide-react já existia na lib, bastou importar. A página compilou em 4.82 kB no build. O padrão de month navigation (handlePrevMonth/handleNextMonth) segue exatamente o mesmo de outras páginas da app.

**On Failure**:
- If build fails on import: Verify `CardsSummaryResponse` is exported from `src/lib/cards-summary.ts`
- If Sidebar type error: Ensure `Wallet` is imported from `lucide-react` in Sidebar.tsx
- If page doesn't show in nav: Verify the navigation array item is correctly placed

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` — All project checks pass (typecheck: 0 new errors; tests: 10/10 pass; build: success)

### Manual Verification
- [ ] Página `/cartoes` renderiza dados reais de cartões com valores do mês atual
