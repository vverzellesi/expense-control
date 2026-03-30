# Phase 1: Fundação + Projeção

## Overview

Estabelecer a base do milestone: schema change (FlexibilityType em Category), módulo de normalização de merchants, e o primeiro card visível no dashboard (projeção do mês). Ao final, temos migration rodada, um módulo utilitário testado, e projeção funcional.

## Reference Docs for This Phase
- `prisma/schema.prisma` (lines 184-207) - Category model atual
- `prisma/seed.ts` (lines 5-18) - defaultCategories array
- `src/app/api/categories/[id]/route.ts` (lines 45-79) - PUT handler
- `src/app/api/summary/route.ts` (lines 234-339) - Padrão de queries
- `src/app/dashboard/page.tsx` (lines 37-77, 109-128) - SummaryData interface e fetch
- `src/components/FinancialHealthSection.tsx` (lines 7-40) - Props e cálculo de comprometimento
- `src/lib/cards-summary.test.ts` - Padrão de testes unitários
- `ai_docs/research/2026-03-29-insights-analytics-research.md` - Pesquisa completa

## Changes Required

#### 1. Adicionar FlexibilityType ao schema e atualizar seed/API

- [x] **DONE**

**File**: `prisma/schema.prisma` (MODIFY), `prisma/seed.ts` (MODIFY), `src/app/api/categories/[id]/route.ts` (MODIFY), `src/types/index.ts` (MODIFY)
**Complexity**: Medium
**TDD**: NO (schema/config changes)
**Depends On**: none

**Load Before Implementing**:
1. `prisma/schema.prisma` (lines 184-207) - Category model atual
2. `prisma/seed.ts` (lines 5-18) - defaultCategories array
3. `src/app/api/categories/[id]/route.ts` (lines 45-79) - PUT handler
4. `src/types/index.ts` (lines 59-64) - Category interface

**Pre-conditions**:
- [ ] prisma/schema.prisma exists
- [ ] prisma/seed.ts exists
- [ ] Database is accessible

**Why**: FlexibilityType é a única schema change do milestone. Necessário para o relatório expandido fixo vs variável (#57) e score financeiro (#71). Campo nullable permite adoção gradual.

**Acceptance Criteria**:
```gherkin
Given the Prisma schema has the FlexibilityType enum
When running npx prisma migrate dev --name add-flexibility-type
Then the migration succeeds without errors

Given a category with no flexibilityType set
When the category is queried
Then flexibilityType is null (backward compatible)

Given a PUT request to /api/categories/[id] with flexibilityType: "ESSENTIAL"
When the request is processed
Then the category is updated with the new flexibilityType

Given the seed script runs
When default categories are created
Then each has a flexibilityType matching its nature
```

**Implementation**:

Add to `prisma/schema.prisma` before the Category model:
```prisma
enum FlexibilityType {
  ESSENTIAL
  NEGOTIABLE
  VARIABLE
}
```

Add field to Category model:
```prisma
  flexibilityType FlexibilityType?
```

Update `prisma/seed.ts` defaultCategories to include flexibilityType:
```typescript
const defaultCategories = [
  { name: "Moradia", color: "#3B82F6", icon: "home", flexibilityType: "ESSENTIAL" as const },
  { name: "Alimentação", color: "#F97316", icon: "utensils", flexibilityType: "VARIABLE" as const },
  { name: "Mercado", color: "#22C55E", icon: "shopping-cart", flexibilityType: "VARIABLE" as const },
  { name: "Transporte", color: "#8B5CF6", icon: "car", flexibilityType: "NEGOTIABLE" as const },
  { name: "Saúde", color: "#EF4444", icon: "heart", flexibilityType: "ESSENTIAL" as const },
  { name: "Lazer", color: "#EC4899", icon: "gamepad", flexibilityType: "VARIABLE" as const },
  { name: "Educação", color: "#6366F1", icon: "book", flexibilityType: "NEGOTIABLE" as const },
  { name: "Serviços", color: "#14B8A6", icon: "smartphone", flexibilityType: "NEGOTIABLE" as const },
  { name: "Compras", color: "#F59E0B", icon: "shopping-bag", flexibilityType: "VARIABLE" as const },
  { name: "Salário", color: "#10B981", icon: "wallet", flexibilityType: null },
  { name: "Investimentos", color: "#06B6D4", icon: "trending-up", flexibilityType: null },
  { name: "Outros", color: "#6B7280", icon: "help-circle", flexibilityType: "VARIABLE" as const },
];
```

Update PUT handler in `src/app/api/categories/[id]/route.ts` to accept `flexibilityType`:
```typescript
// In the PUT handler, add flexibilityType to the destructured body:
const { name, color, icon, flexibilityType } = await request.json();

// In the prisma update call, add:
flexibilityType: flexibilityType !== undefined ? flexibilityType : undefined,
```

Add to `src/types/index.ts`:
```typescript
export type FlexibilityType = "ESSENTIAL" | "NEGOTIABLE" | "VARIABLE";
```

Update `Category` interface to include:
```typescript
flexibilityType?: FlexibilityType | null;
```

Also add a data migration script in the seed or as post-migration step to update existing default categories:
```typescript
// After migration, update existing categories with known names
const categoryDefaults: Record<string, string> = {
  "Moradia": "ESSENTIAL", "Saúde": "ESSENTIAL",
  "Transporte": "NEGOTIABLE", "Educação": "NEGOTIABLE", "Serviços": "NEGOTIABLE",
  "Alimentação": "VARIABLE", "Mercado": "VARIABLE", "Lazer": "VARIABLE",
  "Compras": "VARIABLE", "Outros": "VARIABLE",
};

for (const [name, type] of Object.entries(categoryDefaults)) {
  await prisma.category.updateMany({
    where: { name, flexibilityType: null },
    data: { flexibilityType: type },
  });
}
```

**Verification**: `npx prisma migrate dev --name add-flexibility-type && npx prisma generate`

**Learning**: Worktree não tem `.env` local -- necessário symlink para o repo principal. DB Neon estava inacessível, então migration SQL foi criada manualmente e Prisma generate confirmou schema válido. `as const` no seed garante tipagem correta dos enum values.

**On Failure**:
- If migration fails: check for syntax errors in schema, ensure enum is before model
- If seed fails: check flexibilityType values match enum exactly (case-sensitive)
- If API fails: verify PUT handler destructures flexibilityType from body
- If data migration fails: updateMany is safe — only updates where flexibilityType is null

---

#### 2. Criar merchant-normalizer.ts com testes

- [x] **DONE**

**File**: `src/lib/merchant-normalizer.ts` (CREATE), `src/lib/merchant-normalizer.test.ts` (CREATE)
**Complexity**: High
**TDD**: YES
**Depends On**: none

**Load Before Implementing**:
1. `src/lib/cards-summary.test.ts` - Padrão de testes unitários no projeto
2. `src/lib/utils.ts` (lines 1-30) - Utilitários existentes

**Pre-conditions**:
- [ ] Directory `src/lib/` exists

**Why**: Normalização de merchants é base para a tab "Maiores Gastos" (#56) e detecção de cobranças duplicadas (#71). Módulo puro, testável isoladamente.

**Acceptance Criteria**:
```gherkin
Given a description "IFD*ESFIHARIA O SULTAO"
When normalizeMerchant is called
Then it returns "Esfiharia O Sultao"

Given a description "PAG*JoseDaSilva"
When normalizeMerchant is called
Then it returns "Josedasilva"

Given a description "PIX QR - MERCADO LIVRE"
When normalizeMerchant is called
Then it returns "Mercado Livre"

Given an array of transactions with similar merchants
When groupByMerchant is called
Then transactions are grouped by normalized merchant name
And each group has total, count, and average
```

**Implementation**:

```typescript
// src/lib/merchant-normalizer.ts

const KNOWN_PREFIXES = [
  /^IFD\*/i,
  /^PAG\*/i,
  /^PIX\s*(QR\s*-?\s*)?/i,
  /^MP\*/i,
  /^PAGAMENTO\*?/i,
  /^PG\*/i,
  /^CDB\*/i,
  /^COMPRA\s+NO\s+(DEBITO|CREDITO)\s*/i,
];

export function normalizeMerchant(description: string): string {
  let normalized = description.trim();

  for (const prefix of KNOWN_PREFIXES) {
    normalized = normalized.replace(prefix, "");
  }

  normalized = normalized.trim();

  if (!normalized) return description.trim();

  // Title case: first letter of each word uppercase, rest lowercase
  normalized = normalized
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());

  return normalized;
}

export interface MerchantGroup {
  merchant: string;
  total: number;
  count: number;
  average: number;
  transactions: Array<{ id: string; description: string; amount: number; date: Date }>;
}

export function groupByMerchant(
  transactions: Array<{ id: string; description: string; amount: number; date: Date }>
): MerchantGroup[] {
  const groups = new Map<string, MerchantGroup>();

  for (const tx of transactions) {
    const merchant = normalizeMerchant(tx.description);
    const existing = groups.get(merchant);

    if (existing) {
      existing.total += Math.abs(tx.amount);
      existing.count += 1;
      existing.transactions.push(tx);
    } else {
      groups.set(merchant, {
        merchant,
        total: Math.abs(tx.amount),
        count: 1,
        average: 0,
        transactions: [tx],
      });
    }
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    group.average = group.total / group.count;
  }

  return result.sort((a, b) => b.total - a.total);
}
```

```typescript
// src/lib/merchant-normalizer.test.ts

import { describe, it, expect } from "vitest";
import { normalizeMerchant, groupByMerchant } from "./merchant-normalizer";

describe("normalizeMerchant", () => {
  it("removes IFD* prefix and applies title case", () => {
    expect(normalizeMerchant("IFD*ESFIHARIA O SULTAO")).toBe("Esfiharia O Sultao");
  });

  it("removes PAG* prefix", () => {
    expect(normalizeMerchant("PAG*JoseDaSilva")).toBe("Josedasilva");
  });

  it("removes PIX QR prefix", () => {
    expect(normalizeMerchant("PIX QR - MERCADO LIVRE")).toBe("Mercado Livre");
  });

  it("removes MP* prefix", () => {
    expect(normalizeMerchant("MP*SHOPEE")).toBe("Shopee");
  });

  it("removes PAGAMENTO prefix", () => {
    expect(normalizeMerchant("PAGAMENTO*NETFLIX")).toBe("Netflix");
  });

  it("handles plain descriptions", () => {
    expect(normalizeMerchant("RESTAURANTE DO ZE")).toBe("Restaurante Do Ze");
  });

  it("handles empty result after prefix removal", () => {
    expect(normalizeMerchant("PIX ")).toBe("Pix");
  });

  it("trims whitespace", () => {
    expect(normalizeMerchant("  IFD*LOJA  ")).toBe("Loja");
  });
});

describe("groupByMerchant", () => {
  it("groups transactions by normalized merchant", () => {
    const txs = [
      { id: "1", description: "IFD*LOJA ABC", amount: -100, date: new Date("2026-01-05") },
      { id: "2", description: "IFD*LOJA ABC", amount: -200, date: new Date("2026-01-10") },
      { id: "3", description: "PAG*OUTRO", amount: -50, date: new Date("2026-01-15") },
    ];

    const groups = groupByMerchant(txs);

    expect(groups).toHaveLength(2);
    expect(groups[0].merchant).toBe("Loja Abc");
    expect(groups[0].total).toBe(300);
    expect(groups[0].count).toBe(2);
    expect(groups[0].average).toBe(150);
  });

  it("sorts by total descending", () => {
    const txs = [
      { id: "1", description: "SMALL", amount: -10, date: new Date() },
      { id: "2", description: "BIG", amount: -500, date: new Date() },
    ];

    const groups = groupByMerchant(txs);
    expect(groups[0].merchant).toBe("Big");
    expect(groups[1].merchant).toBe("Small");
  });

  it("handles empty array", () => {
    expect(groupByMerchant([])).toEqual([]);
  });

  it("uses absolute values for amounts", () => {
    const txs = [
      { id: "1", description: "LOJA", amount: -100, date: new Date() },
    ];
    const groups = groupByMerchant(txs);
    expect(groups[0].total).toBe(100);
  });
});
```

**Verification**: `npx vitest run src/lib/merchant-normalizer.test.ts`

**Learning**: O fallback de `normalizeMerchant` quando a string fica vazia após remoção de prefixo (ex: `"PIX "`) precisa aplicar title case ao original trimado também, não retornar cru. Corrigido no GREEN phase.

**On Failure**:
- If import fails: verify file was created at exact path `src/lib/merchant-normalizer.ts`
- If title case fails: check regex pattern handles unicode correctly
- If grouping fails: verify Map key is the normalized string

---

#### 3. Criar projection.ts + API + ProjectionCard no dashboard

- [x] **DONE**

**File**: `src/lib/projection.ts` (CREATE), `src/lib/projection.test.ts` (CREATE), `src/app/api/insights/projection/route.ts` (CREATE), `src/app/dashboard/page.tsx` (MODIFY)
**Complexity**: High
**TDD**: YES
**Depends On**: none

**Load Before Implementing**:
1. `src/app/api/summary/route.ts` (lines 234-339) - Padrão de queries e auth
2. `src/app/dashboard/page.tsx` (lines 37-77) - SummaryData interface
3. `src/app/dashboard/page.tsx` (lines 109-128) - useEffect fetch pattern
4. `src/components/FinancialHealthSection.tsx` (lines 7-40) - Props com income
5. `src/lib/date-utils.ts` - getMonthBoundaries e helpers de data

**Pre-conditions**:
- [ ] Directory `src/lib/` exists
- [ ] Directory `src/app/api/insights/` can be created

**Why**: Projeção do mês é o primeiro card visível do milestone — mostra gastos reais + pendentes, dando ao usuário uma estimativa do total do mês antes de acabar. Alto valor, validação imediata end-to-end.

**Acceptance Criteria**:
```gherkin
Given expenses of R$ 5000 so far and 2 pending fixed expenses of R$ 2000 each
When calculateProjection is called
Then projectedTotal is 9000 and pendingItems lists the 2 expenses

Given no pending expenses in the current month
When calculateProjection is called
Then projectedTotal equals current expenses and pendingItems is empty

Given the projection API is called with valid auth
When month=3&year=2026
Then response includes projectedTotal, currentExpenses, pendingItems, and income

Given the dashboard loads
When projection data is available
Then a ProjectionCard shows projectedTotal with progress bar vs income
```

**Implementation**:

```typescript
// src/lib/projection.ts

export interface PendingItem {
  description: string;
  amount: number;
  type: "recurring" | "installment";
  categoryName?: string;
}

export interface ProjectionResult {
  currentExpenses: number;
  pendingTotal: number;
  projectedTotal: number;
  pendingItems: PendingItem[];
  income: number;
  projectedPercentage: number; // projectedTotal / income * 100
}

export function calculateProjection({
  currentExpenses,
  income,
  pendingRecurring,
  pendingInstallments,
}: {
  currentExpenses: number;
  income: number;
  pendingRecurring: Array<{ description: string; defaultAmount: number; categoryName?: string }>;
  pendingInstallments: Array<{ description: string; installmentAmount: number; categoryName?: string }>;
}): ProjectionResult {
  const pendingItems: PendingItem[] = [];

  for (const r of pendingRecurring) {
    pendingItems.push({
      description: r.description,
      amount: r.defaultAmount,
      type: "recurring",
      categoryName: r.categoryName,
    });
  }

  for (const i of pendingInstallments) {
    pendingItems.push({
      description: i.description,
      amount: i.installmentAmount,
      type: "installment",
      categoryName: i.categoryName,
    });
  }

  const pendingTotal = pendingItems.reduce((sum, item) => sum + item.amount, 0);
  const projectedTotal = currentExpenses + pendingTotal;
  const projectedPercentage = income > 0 ? (projectedTotal / income) * 100 : 0;

  return {
    currentExpenses,
    pendingTotal,
    projectedTotal,
    pendingItems,
    income,
    projectedPercentage,
  };
}
```

```typescript
// src/lib/projection.test.ts

import { describe, it, expect } from "vitest";
import { calculateProjection } from "./projection";

describe("calculateProjection", () => {
  it("calculates projection with pending recurring and installments", () => {
    const result = calculateProjection({
      currentExpenses: 5000,
      income: 10000,
      pendingRecurring: [
        { description: "Aluguel", defaultAmount: 2000, categoryName: "Moradia" },
      ],
      pendingInstallments: [
        { description: "TV 3/10", installmentAmount: 500, categoryName: "Compras" },
      ],
    });

    expect(result.currentExpenses).toBe(5000);
    expect(result.pendingTotal).toBe(2500);
    expect(result.projectedTotal).toBe(7500);
    expect(result.projectedPercentage).toBe(75);
    expect(result.pendingItems).toHaveLength(2);
  });

  it("returns zero pending when no pending items", () => {
    const result = calculateProjection({
      currentExpenses: 3000,
      income: 10000,
      pendingRecurring: [],
      pendingInstallments: [],
    });

    expect(result.pendingTotal).toBe(0);
    expect(result.projectedTotal).toBe(3000);
    expect(result.pendingItems).toHaveLength(0);
  });

  it("handles zero income without division error", () => {
    const result = calculateProjection({
      currentExpenses: 1000,
      income: 0,
      pendingRecurring: [],
      pendingInstallments: [],
    });

    expect(result.projectedPercentage).toBe(0);
  });

  it("classifies pending items by type", () => {
    const result = calculateProjection({
      currentExpenses: 0,
      income: 5000,
      pendingRecurring: [{ description: "Netflix", defaultAmount: 55 }],
      pendingInstallments: [{ description: "Celular 2/12", installmentAmount: 200 }],
    });

    expect(result.pendingItems[0].type).toBe("recurring");
    expect(result.pendingItems[1].type).toBe("installment");
  });
});
```

API route (`src/app/api/insights/projection/route.ts`) — Medium complexity, follows established pattern:

```typescript
// Intent: Fetch current month expenses + pending recurring/installments not yet generated
// Query pattern: same as summary/route.ts (getAuthContext, ownerFilter, Promise.all)
// 1. Get all EXPENSE transactions for current month (excl investment, transfer, deleted)
// 2. Get active RecurringExpenses (type EXPENSE) whose dayOfMonth > today
//    AND have no transaction in current month
// 3. Get Installments with future payments this month not yet created
// 4. Get income for the month
// 5. Call calculateProjection() and return result
```

Key query logic for the API:
```typescript
import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import { calculateProjection } from "@/lib/projection";
import prisma from "@/lib/db";

// In GET handler:
const ctx = await getAuthContext();
const { searchParams } = new URL(request.url);
const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));
const today = new Date().getDate();

const startDate = new Date(year, month - 1, 1);
const endDate = new Date(year, month, 0, 23, 59, 59);

const [expenses, recurringExpenses, installments, incomeTransactions] = await Promise.all([
  // Current month EXPENSE transactions (excl investment, transfer)
  prisma.transaction.findMany({
    where: {
      ...ctx.ownerFilter, type: "EXPENSE", deletedAt: null,
      date: { gte: startDate, lte: endDate },
      investmentTransaction: null,
    },
    include: { category: true },
  }),
  // Active recurring expenses not yet generated this month
  prisma.recurringExpense.findMany({
    where: {
      ...ctx.ownerFilter, isActive: true, type: "EXPENSE",
      autoGenerate: true, // Excluir recorrentes manuais
      dayOfMonth: { gt: today },
      transactions: { none: { date: { gte: startDate, lte: endDate }, deletedAt: null } },
    },
    include: { category: true },
  }),
  // Installments with remaining payments this month
  prisma.transaction.findMany({
    where: {
      ...ctx.ownerFilter, isInstallment: true, type: "EXPENSE", deletedAt: null,
      date: { gte: new Date(year, month - 1, today + 1), lte: endDate },
      investmentTransaction: null,
    },
    include: { category: true, installment: true },
  }),
  // Income for the month
  prisma.transaction.findMany({
    where: {
      ...ctx.ownerFilter, type: "INCOME", deletedAt: null,
      date: { gte: startDate, lte: endDate },
      investmentTransaction: null,
    },
  }),
]);

const currentExpenses = expenses.reduce((sum, t) => sum + Math.abs(t.amount), 0);
const income = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);

const result = calculateProjection({
  currentExpenses,
  income,
  pendingRecurring: recurringExpenses.map((r) => ({
    description: r.description,
    defaultAmount: r.defaultAmount,
    categoryName: r.category?.name,
  })),
  pendingInstallments: installments.map((t) => ({
    description: t.description,
    installmentAmount: Math.abs(t.amount),
    categoryName: t.category?.name,
  })),
});

return NextResponse.json(result);
```

Dashboard card (add to `src/app/dashboard/page.tsx`) — Medium complexity:
```tsx
// Add state for projection data
const [projection, setProjection] = useState<ProjectionResult | null>(null);

// Add fetch in useEffect alongside existing fetches
// fetch(`/api/insights/projection?month=${month}&year=${year}`)

// Add ProjectionCard after MonthlyBarChart section, before budget alerts:
// Card with:
// - Title: "Projeção do Mês" with TrendingUp icon
// - Progress bar: projectedTotal / income (color-coded by percentage)
// - Current: formatCurrency(currentExpenses)
// - Pendente: formatCurrency(pendingTotal)
// - Projeção: formatCurrency(projectedTotal)
// - Collapsible list of pendingItems (description + amount + type badge)
// - Color: green <70%, yellow 70-90%, red >90%
```

**Verification**: `npx vitest run src/lib/projection.test.ts`

**Learning**: O ProjectionCard é mostrado condicionalmente quando `projection && projection.income > 0` para evitar renderização desnecessária quando não há dados ou receita. Card usa padrão de cores escalonado (green/amber/red) consistente com `FinancialHealthSection`. API usa `handleApiError` para tratamento consistente de erros.

**On Failure**:
- If API auth fails: verify `getAuthContext` import from `@/lib/auth-utils`
- If queries return empty: check ownerFilter is applied correctly
- If card doesn't render: verify fetch URL matches route path exactly
- If pending items wrong: check dayOfMonth > today logic for recurring

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - All project checks pass (16 new tests pass, 0 new type errors, 0 new regressions)
- [x] `npx prisma migrate dev --name add-flexibility-type` - Migration SQL criada manualmente (DB remoto inacessível), schema validado com `npx prisma generate`

### Manual Verification
- [ ] ProjectionCard visible on dashboard with correct projection data
