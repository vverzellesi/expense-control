# Phase 1: Data Layer + Pagina Base

## Overview

Cria o model Prisma `Simulation`, endpoint de dados baseline financeiro, e a pagina `/simulador` com formulario + grafico basico mostrando dados reais. Ao final desta fase: usuario navega para /simulador, ve o formulario e um grafico com projecao de despesas dos proximos 12 meses.

## Reference Docs for This Phase
- `prisma/schema.prisma` - Schema atual, padroes de model
- `src/app/api/projection/route.ts` - Logica de projecao (referencia para baseline)
- `src/components/Sidebar.tsx` - Array de navegacao
- `src/types/index.ts` - Tipos existentes
- `src/app/investments/page.tsx` - Padrao de pagina client-side
- `src/components/Charts/ProjectionChart.tsx` - Padrao de chart Recharts
- `src/lib/utils.ts` - `formatCurrency`, `cn`
- `src/lib/hooks.ts` - `useMediaQuery`

## Changes Required

#### 1. Add Simulation model, types, and sidebar navigation -- [x] DONE

**File**: `prisma/schema.prisma` (MODIFY), `src/types/index.ts` (MODIFY), `src/components/Sidebar.tsx` (MODIFY)
**Complexity**: Low
**TDD**: NO (schema/config changes)
**Depends On**: none
- **Learning:** DB is PostgreSQL (Neon), not SQLite as CLAUDE.md says. `npx prisma generate` succeeds locally but `prisma db push` requires network access to Neon. `npx next build` works for build verification.

**Load Before Implementing**:
1. `prisma/schema.prisma` (lines 16-45) - User model relations to add `simulations`
2. `prisma/schema.prisma` (lines 155-171) - Category model to add `simulations` relation
3. `src/types/index.ts` (full file) - Existing type patterns
4. `src/components/Sidebar.tsx` (lines 1-42) - Imports and navigation array

**Pre-conditions**:
- [ ] `prisma/schema.prisma` exists and has User/Category models
- [ ] `src/types/index.ts` exists
- [ ] `src/components/Sidebar.tsx` exists

**Why**: Foundation for all simulator features. Model stores saved simulations, types enable type-safe frontend, sidebar enables navigation.

**Acceptance Criteria**:
```gherkin
Given the Prisma schema has been updated
When running `npx prisma db push`
Then the Simulation table is created without errors

Given the Sidebar component renders
When the user is authenticated
Then "Simulador" appears in the navigation after "Projecao"
And clicking it navigates to /simulador
```

**Implementation**:

Add to `prisma/schema.prisma` User model (after `billPayments` line):
```prisma
  // Simulation models
  simulations           Simulation[]
```

Add to `prisma/schema.prisma` Category model (after `recurringExpenses RecurringExpense[]` line):
```prisma
  simulations   Simulation[]
```

Add new model at end of file (before closing, in DOMAIN MODELS section or new section):
```prisma
// ==========================================
// SIMULATION MODELS
// ==========================================

model Simulation {
  id                String    @id @default(cuid())
  description       String
  totalAmount       Float
  totalInstallments Int       @default(1)
  categoryId        String?
  category          Category? @relation(fields: [categoryId], references: [id])
  isActive          Boolean   @default(true)
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt

  // User relationship
  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

Add to `src/types/index.ts` (at end of file, before Investment types section):
```typescript
// ==========================================
// SIMULATION TYPES
// ==========================================

export interface Simulation {
  id: string;
  userId: string;
  description: string;
  totalAmount: number;
  totalInstallments: number;
  categoryId: string | null;
  category?: Category | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface BaselineMonth {
  month: number;
  year: number;
  label: string;
  currentExpenses: number;
  recurringExpenses: number;
  installmentsTotal: number;
}

export interface SimulationData {
  averageIncome: number;
  months: BaselineMonth[];
}
```

Modify `src/components/Sidebar.tsx` - add `Calculator` to lucide-react imports:
```typescript
import {
  LayoutDashboard,
  Receipt,
  Upload,
  CreditCard,
  Tags,
  BarChart3,
  Settings,
  RefreshCw,
  TrendingUp,
  Trash2,
  FileText,
  LogOut,
  User,
  X,
  HelpCircle,
  PieChart,
  Calculator,
} from "lucide-react";
```

Add to navigation array after `{ name: "Projeção", href: "/projection", icon: BarChart3 }`:
```typescript
  { name: "Simulador", href: "/simulador", icon: Calculator },
```

**Verification**: `npx prisma db push && npx prisma generate && npm run build`

**On Failure**:
- If Prisma push fails: Check for conflicting relation names on Category or User model
- If build fails: Verify imports in Sidebar.tsx match lucide-react exports (`Calculator` exists)
- If type errors: Ensure `Category` interface is imported before `Simulation` in types file

---

#### 2. Create GET /api/simulation/data endpoint for baseline financial data -- [x] DONE

**File**: `src/app/api/simulation/data/route.ts` (CREATE)
**Complexity**: High
**TDD**: YES
**Depends On**: Task 1
- **Learning:** For vi.mock factories that need mock objects, use `vi.hoisted()` to declare mocks since `vi.mock` is hoisted above `const` declarations. The `require()` approach with relative paths inside factory functions does not resolve correctly from deeply nested test files. Inline mocks with `vi.hoisted()` is the reliable pattern.

**Load Before Implementing**:
1. `src/app/api/projection/route.ts` (full file) - Similar projection logic to follow
2. `src/lib/auth-utils.ts` (full file) - Auth pattern
3. `src/lib/db.ts` (full file) - Prisma singleton import
4. `src/types/index.ts` (search for `BaselineMonth`, `SimulationData`) - Response types

**Pre-conditions**:
- [ ] Task 1 complete (types exist)
- [ ] Directory `src/app/api/simulation/` does not exist yet

**Why**: Provides real financial baseline data (average income, recurring expenses, existing installments) for the simulator chart. All simulation calculations on frontend depend on this data.

**Acceptance Criteria**:
```gherkin
Given an authenticated user with income transactions in the last 3 months
When GET /api/simulation/data is called
Then response contains averageIncome > 0 calculated from last 3 months
And response contains 12 months of baseline data

Given an authenticated user with active recurring expenses
When GET /api/simulation/data is called
Then each month's currentExpenses includes the recurring expenses total

Given an authenticated user with active installment payments
When GET /api/simulation/data is called
Then months with installment payments include those amounts in installmentsTotal

Given an unauthenticated request
When GET /api/simulation/data is called
Then response status is 401
```

**Implementation**:
```typescript
import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

const MONTH_LABELS = [
  "jan", "fev", "mar", "abr", "mai", "jun",
  "jul", "ago", "set", "out", "nov", "dez",
];

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();
    const now = new Date();

    // 1. Average income from last 3 months (only months with income)
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const incomeTransactions = await prisma.transaction.findMany({
      where: {
        userId,
        type: "INCOME",
        date: { gte: threeMonthsAgo, lte: currentMonthEnd },
        deletedAt: null,
      },
    });

    const incomeByMonth = new Map<string, number>();
    for (const t of incomeTransactions) {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      incomeByMonth.set(key, (incomeByMonth.get(key) || 0) + Math.abs(t.amount));
    }
    const monthlyIncomes = Array.from(incomeByMonth.values());
    const averageIncome =
      monthlyIncomes.length > 0
        ? monthlyIncomes.reduce((sum, v) => sum + v, 0) / monthlyIncomes.length
        : 0;

    // 2. Active recurring expenses with effective amounts
    const activeRecurring = await prisma.recurringExpense.findMany({
      where: { userId, isActive: true },
    });

    const recurringWithLatestAmount = await Promise.all(
      activeRecurring.map(async (recurring) => {
        const latestTransaction = await prisma.transaction.findFirst({
          where: { userId, recurringExpenseId: recurring.id },
          orderBy: { date: "desc" },
          select: { amount: true },
        });
        return {
          ...recurring,
          effectiveAmount: latestTransaction?.amount ?? recurring.defaultAmount,
        };
      })
    );

    // 3. Future installments (next 12 months) - grouped
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = new Date(now.getFullYear(), now.getMonth() + 12, 0);

    const futureInstallments = await prisma.transaction.findMany({
      where: {
        userId,
        isInstallment: true,
        installmentId: { not: null },
        date: { gte: startOfCurrentMonth, lte: endDate },
        deletedAt: null,
      },
    });

    // 3b. Standalone installments (manually tagged, no group) - project remaining
    const standaloneInstallments = await prisma.transaction.findMany({
      where: {
        userId,
        isInstallment: true,
        installmentId: null,
        totalInstallments: { not: null },
        currentInstallment: { not: null },
        deletedAt: null,
      },
    });

    const projectedStandalone: Array<{ amount: number; date: Date }> = [];
    standaloneInstallments.forEach((t) => {
      if (!t.currentInstallment || !t.totalInstallments) return;
      const remaining = t.totalInstallments - t.currentInstallment;
      const tDate = new Date(t.date);
      for (let j = 1; j <= remaining; j++) {
        const futureDate = new Date(tDate);
        futureDate.setMonth(tDate.getMonth() + j);
        if (futureDate >= startOfCurrentMonth && futureDate <= endDate) {
          projectedStandalone.push({ amount: Math.abs(t.amount), date: futureDate });
        }
      }
    });

    // 4. Build 12-month baseline
    const months = [];
    for (let i = 0; i < 12; i++) {
      const projMonth = now.getMonth() + i;
      const projYear = now.getFullYear() + Math.floor(projMonth / 12);
      const normalizedMonth = (projMonth % 12) + 1;
      const label = `${MONTH_LABELS[normalizedMonth - 1]}/${String(projYear).slice(-2)}`;

      const monthInstallments = futureInstallments.filter((t) => {
        const d = new Date(t.date);
        return d.getMonth() + 1 === normalizedMonth && d.getFullYear() === projYear;
      });
      const monthStandalone = projectedStandalone.filter((t) => {
        return t.date.getMonth() + 1 === normalizedMonth && t.date.getFullYear() === projYear;
      });
      const installmentsTotal =
        monthInstallments.reduce((sum, t) => sum + Math.abs(t.amount), 0) +
        monthStandalone.reduce((sum, t) => sum + t.amount, 0);

      const recurringExpensesTotal = recurringWithLatestAmount
        .filter((r) => r.type === "EXPENSE")
        .reduce((sum, r) => sum + Math.abs(r.effectiveAmount), 0);

      months.push({
        month: normalizedMonth,
        year: projYear,
        label,
        currentExpenses: recurringExpensesTotal + installmentsTotal,
        recurringExpenses: recurringExpensesTotal,
        installmentsTotal,
      });
    }

    return NextResponse.json({ averageIncome, months });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching simulation data:", error);
    return NextResponse.json(
      { error: "Erro ao buscar dados de simulacao" },
      { status: 500 }
    );
  }
}
```

**Verification**: `npm run test:unit -- --grep "simulation/data"`

**On Failure**:
- If import errors: Verify `@/lib/db` exports default prisma client
- If type errors on BaselineMonth: Ensure Task 1 types are committed
- If 401 on test: Check mock setup matches `tests/integration/setup.ts` pattern

---

#### 3. Create SimulatorPage with SimulationForm and basic ImpactChart -- [x] DONE

**File**: `src/app/simulador/page.tsx` (CREATE), `src/components/simulator/SimulationForm.tsx` (CREATE), `src/components/simulator/ImpactChart.tsx` (CREATE)
**Complexity**: Medium
**TDD**: NO (UI components)
**Depends On**: Task 1, Task 2
- **Learning:** All UI components (Card, Input, Label, Select) exist at the expected paths. Recharts pattern from ProjectionChart.tsx was followed. Build succeeded with `/simulador` page at 3.61 kB.

**Load Before Implementing**:
1. `src/app/investments/page.tsx` (lines 1-50) - Page component pattern (client, state, useEffect)
2. `src/app/projection/page.tsx` (lines 1-40) - Projection page pattern
3. `src/components/Charts/ProjectionChart.tsx` (full file) - Recharts BarChart pattern
4. `src/lib/utils.ts` (lines 1-20) - `formatCurrency`, `cn`
5. `src/lib/hooks.ts` - `useMediaQuery` hook

**Pre-conditions**:
- [ ] Task 1 complete (types, sidebar nav)
- [ ] Task 2 complete (API endpoint returning data)
- [ ] Directory `src/components/simulator/` does not exist yet

**Why**: Delivers the first visible page. Users can navigate to /simulador, see a form with 4 fields, and a bar chart showing their current financial baseline for 12 months. This is the tracer bullet - end-to-end from nav to API to visualization.

**Acceptance Criteria**:
```gherkin
Given an authenticated user navigates to /simulador
When the page loads
Then a form with 4 fields (descricao, valor, parcelas, categoria) is displayed
And a bar chart shows 12 months of baseline expenses
And a dashed reference line shows average income

Given the page is loading data
When the API has not yet responded
Then a loading indicator is displayed

Given the user is on mobile
When viewing the chart
Then the chart adapts to smaller screen size
```

**Implementation**:

`src/app/simulador/page.tsx`:
```typescript
"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimulationForm } from "@/components/simulator/SimulationForm";
import { ImpactChart } from "@/components/simulator/ImpactChart";
import type { Category, SimulationData } from "@/types";

export default function SimuladorPage() {
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [totalInstallments, setTotalInstallments] = useState<number>(1);
  const [categoryId, setCategoryId] = useState<string>("");

  useEffect(() => {
    async function fetchData() {
      try {
        const [dataRes, catRes] = await Promise.all([
          fetch("/api/simulation/data"),
          fetch("/api/categories"),
        ]);
        if (!dataRes.ok || !catRes.ok) throw new Error("Failed to fetch data");
        const data = await dataRes.json();
        const cats = await catRes.json();
        setSimulationData(data);
        setCategories(cats);
      } catch (error) {
        console.error("Error loading simulation data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Carregando dados...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Simulador de Compras</h1>
        <p className="text-gray-500">Veja como uma compra afeta seu fluxo financeiro</p>
      </div>

      <SimulationForm
        description={description}
        onDescriptionChange={setDescription}
        totalAmount={totalAmount}
        onTotalAmountChange={setTotalAmount}
        totalInstallments={totalInstallments}
        onTotalInstallmentsChange={setTotalInstallments}
        categoryId={categoryId}
        onCategoryIdChange={setCategoryId}
        categories={categories}
      />

      <Card>
        <CardHeader>
          <CardTitle>Impacto no Fluxo Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          {simulationData && (
            <ImpactChart
              baseline={simulationData.months}
              averageIncome={simulationData.averageIncome}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

`src/components/simulator/SimulationForm.tsx`:
```typescript
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Category } from "@/types";

interface SimulationFormProps {
  description: string;
  onDescriptionChange: (v: string) => void;
  totalAmount: number;
  onTotalAmountChange: (v: number) => void;
  totalInstallments: number;
  onTotalInstallmentsChange: (v: number) => void;
  categoryId: string;
  onCategoryIdChange: (v: string) => void;
  categories: Category[];
}

export function SimulationForm({
  description,
  onDescriptionChange,
  totalAmount,
  onTotalAmountChange,
  totalInstallments,
  onTotalInstallmentsChange,
  categoryId,
  onCategoryIdChange,
  categories,
}: SimulationFormProps) {
  const installmentOptions = Array.from({ length: 24 }, (_, i) => i + 1);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="description">Descricao</Label>
            <Input
              id="description"
              placeholder="Ex: TV Samsung 55&quot;"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="totalAmount">Valor total (R$)</Label>
            <Input
              id="totalAmount"
              type="number"
              min={0}
              step={0.01}
              placeholder="0,00"
              value={totalAmount || ""}
              onChange={(e) => onTotalAmountChange(parseFloat(e.target.value) || 0)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="installments">Parcelas</Label>
            <Select
              value={String(totalInstallments)}
              onValueChange={(v) => onTotalInstallmentsChange(parseInt(v))}
            >
              <SelectTrigger id="installments">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {installmentOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}x {totalAmount > 0 ? `(R$ ${(totalAmount / n).toFixed(2)})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="category">Categoria</Label>
            <Select value={categoryId} onValueChange={onCategoryIdChange}>
              <SelectTrigger id="category">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

`src/components/simulator/ImpactChart.tsx`:
```typescript
"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { useMediaQuery } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";
import type { BaselineMonth } from "@/types";

interface ImpactChartProps {
  baseline: BaselineMonth[];
  averageIncome: number;
}

export function ImpactChart({ baseline, averageIncome }: ImpactChartProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const chartData = baseline.map((m) => ({
    label: m.label,
    currentExpenses: m.currentExpenses,
  }));

  const formatCompact = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(value);

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 260 : 350}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: isMobile ? 10 : 12 }}
        />
        <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
        />
        <Bar
          dataKey="currentExpenses"
          name="Despesas atuais"
          fill="#d1d5db"
          radius={[4, 4, 0, 0]}
        />
        {averageIncome > 0 && (
          <ReferenceLine
            y={averageIncome}
            stroke="#6b7280"
            strokeDasharray="5 5"
            label={{
              value: `Renda: ${formatCurrency(averageIncome)}`,
              position: "insideTopRight",
              fontSize: 11,
              fill: "#6b7280",
            }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
```

**Verification**: `npm run build && npm run dev` (then navigate to /simulador)

**On Failure**:
- If build fails on imports: Check `@/components/ui/card`, `@/components/ui/input`, `@/components/ui/select` exist
- If chart doesn't render: Verify `recharts` is installed (`npm ls recharts`)
- If `useMediaQuery` not found: Grep for the hook location and update import path
- If categories select empty: Check /api/categories returns data for the logged-in user

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - All project checks pass (typecheck: only pre-existing csv-parser.test.ts error; build: OK; tests: 6/6 new pass, 5 pre-existing failures in utils.test.ts timezone issue)

### Manual Verification
- [ ] Navigate to /simulador via sidebar - page loads with form and chart
- [ ] Chart shows 12 months of baseline expense data with income reference line
