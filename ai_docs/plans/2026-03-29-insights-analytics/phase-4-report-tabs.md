# Phase 4: Tabs de Reports

## Overview

Implementar as 3 tabs de reports: "Maiores Gastos" (top merchants com normalização), expansão do "Fixo vs Variável" com 3 camadas via FlexibilityType + simulador, e "Assinaturas" (recorrentes consolidadas). Cada tab segue o padrão existente: componente + API + gráfico.

## Reference Docs for This Phase
- `src/app/reports/page.tsx` (lines 129-229) - TabsList e TabsContent
- `src/components/reports/FixedVariableTab.tsx` (lines 1-209) - Tab atual a expandir
- `src/app/api/reports/fixed-variable/route.ts` - API atual a expandir
- `src/lib/merchant-normalizer.ts` - normalizeMerchant e groupByMerchant (Phase 1)
- `src/components/Charts/FixedVariableChart.tsx` - Chart atual
- `ai_docs/research/2026-03-29-insights-analytics-research.md` - Sections 2, 6, 10

## Changes Required

#### 1. Criar API top-merchants + TopMerchantsTab com gráfico

**File**: `src/app/api/reports/top-merchants/route.ts` (CREATE), `src/components/reports/TopMerchantsTab.tsx` (CREATE), `src/app/reports/page.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO (API wiring uses tested merchant-normalizer, component is display)
**Depends On**: Phase 1 Task 2 (merchant-normalizer)

**Load Before Implementing**:
1. `src/lib/merchant-normalizer.ts` - groupByMerchant (Phase 1)
2. `src/app/reports/page.tsx` (lines 129-229) - How to add new tab
3. `src/components/reports/FixedVariableTab.tsx` (lines 1-60) - Tab component pattern
4. `src/components/Charts/MonthlyBarChart.tsx` - Recharts bar chart pattern

**Pre-conditions**:
- [ ] `src/lib/merchant-normalizer.ts` exists (Phase 1)
- [ ] Reports page has tabs infrastructure

**Why**: "Maiores Gastos" (issue #56) revela onde o dinheiro realmente vai, agrupando transações por estabelecimento normalizado. Alto valor de insight com baixo esforço, reutilizando o normalizer da Phase 1.

**Acceptance Criteria**:
```gherkin
Given the top-merchants API is called with month=3&year=2026
When transactions exist for the period
Then response includes top 10 merchants sorted by total, each with total/count/average

Given the TopMerchantsTab is active in reports
When data loads
Then a horizontal bar chart shows top merchants with values
And a detail table lists merchant, total, visits, average, and category breakdown

Given the reports page loads
When user clicks the "Maiores Gastos" tab
Then the TopMerchantsTab component renders with current month/year filters
```

**Implementation**:

```typescript
// src/app/api/reports/top-merchants/route.ts

import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import { groupByMerchant } from "@/lib/merchant-normalizer";
import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const { searchParams } = new URL(request.url);
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Current month transactions
    const transactions = await prisma.transaction.findMany({
      where: {
        ...ctx.ownerFilter,
        type: "EXPENSE",
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
        investmentTransaction: null,
      },
      select: { id: true, description: true, amount: true, date: true },
    });

    // Previous month for comparison
    const prevStartDate = new Date(year, month - 2, 1);
    const prevEndDate = new Date(year, month - 1, 0, 23, 59, 59);

    const prevTransactions = await prisma.transaction.findMany({
      where: {
        ...ctx.ownerFilter,
        type: "EXPENSE",
        deletedAt: null,
        date: { gte: prevStartDate, lte: prevEndDate },
        investmentTransaction: null,
      },
      select: { id: true, description: true, amount: true, date: true },
    });

    const currentGroups = groupByMerchant(transactions);
    const prevGroups = groupByMerchant(prevTransactions);

    const prevMap = new Map(prevGroups.map((g) => [g.merchant, g.total]));

    const topMerchants = currentGroups.slice(0, 10).map((group) => {
      const { transactions: _txs, ...rest } = group; // Omitir lista de transações
      const prevTotal = prevMap.get(group.merchant) || 0;
      const change = prevTotal > 0 ? ((group.total - prevTotal) / prevTotal) * 100 : null;
      return {
        ...rest,
        previousTotal: prevTotal,
        changePercent: change !== null ? Math.round(change) : null,
      };
    });

    return NextResponse.json({
      topMerchants,
      totalMerchants: currentGroups.length,
      totalExpenses: currentGroups.reduce((sum, g) => sum + g.total, 0),
    });
  } catch (error) {
    return handleApiError(error);
  }
}
```

TopMerchantsTab component — follows FixedVariableTab pattern:
```tsx
// Structure:
// 1. Fetch /api/reports/top-merchants?month=X&year=Y
// 2. Summary cards: Total de estabelecimentos, Total gasto, Maior gasto
// 3. Horizontal BarChart (Recharts) with top 10 merchants
//    - layout="vertical", XAxis type="number", YAxis type="category" dataKey="merchant"
//    - Bar dataKey="total", fill="#10b981" (emerald)
//    - Tooltip with formatCurrency
// 4. Detail table: merchant, total, count, average, changePercent (with arrow up/down)
```

Add tab to `src/app/reports/page.tsx`:
```tsx
// In TabsList, add:
<TabsTrigger value="top-merchants">
  <Store className="h-4 w-4" />
  <span className="hidden sm:inline">Maiores Gastos</span>
</TabsTrigger>

// In TabsContent section, add:
<TabsContent value="top-merchants">
  <TopMerchantsTab filterMonth={filterMonth} filterYear={filterYear} />
</TabsContent>
```

**Verification**: Navigate to /reports, click "Maiores Gastos" tab

**On Failure**:
- If merchant-normalizer import fails: verify Phase 1 created the file
- If chart empty: check transactions exist for selected month
- If tab not visible: verify TabsTrigger was added inside TabsList

---

#### 2. Expandir FixedVariableTab com 3 camadas + simulador

**File**: `src/app/api/reports/fixed-variable/route.ts` (MODIFY), `src/components/reports/FixedVariableTab.tsx` (MODIFY), `src/components/Charts/FixedVariableChart.tsx` (MODIFY)
**Complexity**: High
**TDD**: NO (expanding existing component, no pure logic to test separately)
**Depends On**: Phase 1 Task 1 (FlexibilityType in schema), Phase 3 Task 3 (category UI)

**Load Before Implementing**:
1. `src/app/api/reports/fixed-variable/route.ts` (full file) - Current API implementation
2. `src/components/reports/FixedVariableTab.tsx` (full file) - Current component
3. `src/components/Charts/FixedVariableChart.tsx` (full file) - Current chart
4. `prisma/schema.prisma` (lines 184-207) - Category with flexibilityType

**Pre-conditions**:
- [ ] FlexibilityType field exists on Category (Phase 1)
- [ ] Some categories have flexibilityType classified (Phase 3 Task 3)

**Why**: Issue #57 — o relatório existente é binário (fixo/variável). Com FlexibilityType, o usuário vê 3 camadas (essencial/negociável/variável) com potencial de redução, transformando informação em ação.

**Acceptance Criteria**:
```gherkin
Given categories have flexibilityType classified
When the fixed-variable API is called
Then response includes breakdown by ESSENTIAL, NEGOTIABLE, VARIABLE, and UNCLASSIFIED

Given the FixedVariableTab is active
When data loads with 3-way classification
Then chart shows 3 stacked series (+ unclassified if present)
And summary cards show total per flexibility type

Given the user moves the reduction slider to 20%
When the simulator calculates
Then it shows "Se reduzir variáveis em 20%, economiza R$ X/mês"

Given no categories have flexibilityType set
When the tab loads
Then it falls back to the current binary isFixed classification
And shows a CTA: "Classifique suas categorias para ver análise detalhada"
```

**Implementation**:

API expansion — add flexibility breakdown alongside existing binary data:
```typescript
// In the fixed-variable API, after existing queries:
// Load categories with flexibilityType for the user
const categories = await prisma.category.findMany({
  where: ctx.ownerFilter,
  select: { id: true, name: true, flexibilityType: true },
});

const categoryFlexMap = new Map(categories.map((c) => [c.id, c.flexibilityType]));
const hasFlexibility = categories.some((c) => c.flexibilityType !== null);

// If categories have flexibilityType, compute 3-way breakdown
if (hasFlexibility) {
  // Group transactions by category flexibilityType
  // ESSENTIAL, NEGOTIABLE, VARIABLE, null → UNCLASSIFIED
  // Return: flexibilityBreakdown: { essential, negotiable, variable, unclassified }
  // Monthly breakdown with 4 series for chart
}

// Add to response:
// flexibilityBreakdown: { ... } | null  (null = no categories classified)
// flexibilityMonthly: [...] | null
```

Component expansion — keep existing binary view, add FlexibilityType view when available:
```tsx
// If data.flexibilityBreakdown exists:
//   Show 4 summary cards (Essential, Negotiable, Variable, Unclassified)
//   Chart with 3-4 stacked areas
//   Lists per flexibility type
//   Simulator slider:
//     <Slider min={0} max={50} step={5} value={reduction}
//       onChange={(v) => setReduction(v)} />
//     "Se reduzir variáveis em {reduction}%, economiza
//      {formatCurrency(data.flexibilityBreakdown.variable * reduction / 100)}/mês"
// Else:
//   Show current binary view (unchanged)
//   CTA card: "Classifique suas categorias para análise detalhada"
//   Link to /categories page
```

Chart expansion — add support for 3-4 series:
```tsx
// FixedVariableChart accepts optional flexibilityData prop
// If flexibilityData: render 3-4 Area series (essential=slate, negotiable=blue, variable=amber, unclassified=gray)
// If not: render existing 2-series (fixed=blue, variable=amber)
```

**Verification**: Navigate to /reports, click "Fixo vs Variável" tab with classified categories

**On Failure**:
- If flexibilityBreakdown null: verify categories have flexibilityType set via Phase 3 Task 3
- If chart breaks: check data format matches chart's expected series structure
- If slider not working: verify Slider component import from radix/ui

---

#### 3. Criar API subscriptions + SubscriptionsTab

**File**: `src/app/api/reports/subscriptions/route.ts` (CREATE), `src/components/reports/SubscriptionsTab.tsx` (CREATE), `src/app/reports/page.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO (simple query + display, no decision logic)
**Depends On**: none

**Load Before Implementing**:
1. `src/app/reports/page.tsx` (lines 129-229) - Tab infrastructure
2. `src/components/reports/FixedVariableTab.tsx` (lines 1-60) - Tab component pattern
3. `prisma/schema.prisma` - RecurringExpense model

**Pre-conditions**:
- [ ] RecurringExpense model has data
- [ ] Reports page has tabs infrastructure

**Why**: "Assinaturas Consolidadas" (issue #71) lista todas as recorrentes ativas com custo mensal e anualizado. Permite visualizar o peso total de assinaturas e decidir o que cortar.

**Acceptance Criteria**:
```gherkin
Given the subscriptions API is called
When there are active recurring expenses of type EXPENSE
Then response includes each with description, monthlyAmount, annualAmount, category, origin

Given the SubscriptionsTab is active
When data loads
Then summary cards show total mensal and total anual
And a table lists all active subscriptions sorted by amount

Given no active recurring expenses exist
When the tab loads
Then it shows empty state "Nenhuma assinatura ativa encontrada"
```

**Implementation**:

```typescript
// src/app/api/reports/subscriptions/route.ts

import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import prisma from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    const subscriptions = await prisma.recurringExpense.findMany({
      where: {
        ...ctx.ownerFilter,
        isActive: true,
        type: "EXPENSE",
      },
      include: { category: true },
      orderBy: { defaultAmount: "desc" },
    });

    const items = subscriptions.map((sub) => ({
      id: sub.id,
      description: sub.description,
      monthlyAmount: sub.defaultAmount,
      annualAmount: sub.defaultAmount * 12,
      categoryName: sub.category?.name || null,
      categoryColor: sub.category?.color || null,
      origin: sub.origin,
      dayOfMonth: sub.dayOfMonth,
    }));

    const totalMonthly = items.reduce((sum, s) => sum + s.monthlyAmount, 0);
    const totalAnnual = totalMonthly * 12;

    return NextResponse.json({
      subscriptions: items,
      totalMonthly,
      totalAnnual,
      count: items.length,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
```

SubscriptionsTab component:
```tsx
// Structure:
// 1. Fetch /api/reports/subscriptions (no month/year filter - all active)
// 2. Summary cards (2):
//    - "Total Mensal" with formatCurrency(totalMonthly)
//    - "Total Anual" with formatCurrency(totalAnnual)
//    - "Assinaturas Ativas" with count
// 3. Table with columns: Descrição, Mensal, Anual, Categoria (color dot + name), Origin, Dia
// 4. Empty state: "Nenhuma assinatura ativa encontrada"
// No chart needed - table is the primary view
```

Add tab to `src/app/reports/page.tsx`:
```tsx
// In TabsList:
<TabsTrigger value="subscriptions">
  <Repeat className="h-4 w-4" />
  <span className="hidden sm:inline">Assinaturas</span>
</TabsTrigger>

// In TabsContent:
<TabsContent value="subscriptions">
  <SubscriptionsTab />
</TabsContent>
```

**Verification**: Navigate to /reports, click "Assinaturas" tab

**On Failure**:
- If empty results: verify RecurringExpense has data with isActive=true and type="EXPENSE"
- If tab not visible: verify TabsTrigger added inside TabsList
- If import fails: verify component path matches file location

## Success Criteria

### Automated Verification
- [ ] `Skill(running-automated-checks)` - All project checks pass

### Manual Verification
- [ ] "Maiores Gastos" tab shows top merchants with horizontal bar chart
- [ ] "Fixo vs Variável" tab shows 3-way breakdown when categories are classified
- [ ] "Assinaturas" tab lists active recurring expenses with totals
