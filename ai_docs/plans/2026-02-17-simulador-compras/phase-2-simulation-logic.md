# Phase 2: Logica de Simulacao + Visualizacao

## Overview

Adiciona o engine de calculo client-side que sobrepoe uma simulacao sobre o baseline, 3 cards de resumo (parcela mensal, mes mais apertado, comprometimento), e aprimora o grafico com barras empilhadas, zona vermelha, e tooltip detalhado. Ao final: preencher o form atualiza o grafico e cards em tempo real.

## Reference Docs for This Phase
- `src/app/simulador/page.tsx` - Pagina criada na Phase 1
- `src/components/simulator/ImpactChart.tsx` - Chart basico da Phase 1
- `src/types/index.ts` (search for `BaselineMonth`, `SimulationData`) - Tipos baseline
- `src/lib/utils.ts` - `formatCurrency`, `cn`
- `src/lib/hooks.ts` - `useMediaQuery`

## Changes Required

#### 1. Create simulation calculation engine -- DONE

**File**: `src/lib/simulation-engine.ts` (CREATE)
**Complexity**: High
**TDD**: YES
**Depends On**: none (uses types from Phase 1)

**Load Before Implementing**:
1. `src/types/index.ts` (search for `BaselineMonth`) - Input type
2. `src/lib/utils.ts` (lines 1-20) - `formatCurrency` for reference

**Pre-conditions**:
- [x] `BaselineMonth` type exists in `src/types/index.ts`

**Learning:** Plan code had a potential division by zero in monthlyInstallment reducer when totalInstallments=0. Added guard `s.totalInstallments > 0` in the reduce. 13 unit tests written covering all acceptance criteria including edge cases (zero income, zero installments, multiple simulations, empty baseline).

**Why**: Pure calculation logic that takes baseline + simulation params and computes impact per month. All reactive UI depends on this. Separated as utility for testability.

**Acceptance Criteria**:
```gherkin
Given baseline data with 12 months and averageIncome of 5000
When calculating simulation with totalAmount=3000, totalInstallments=6
Then monthlyInstallment is 500
And first 6 months have simulationExpenses of 500
And months 7-12 have simulationExpenses of 0

Given baseline with currentExpenses=3000/month and averageIncome=5000
When simulating a purchase of 6000 in 3x (2000/month)
Then tightestMonth has freeBalance of 0 (5000 - 3000 - 2000)
And commitmentBefore is 60% (3000/5000)
And commitmentAfter is 100% for first 3 months average

Given multiple active simulations
When calculating cumulative effect
Then simulationExpenses per month is the sum of all active simulations' installments

Given averageIncome is 0
When calculating simulation
Then commitmentPercent values are 0 (no division by zero)
```

**Implementation**:
```typescript
import type { BaselineMonth } from "@/types";

export interface SimulatedMonth extends BaselineMonth {
  simulationExpenses: number;
  totalWithSimulation: number;
  freeBalance: number;
  isOverBudget: boolean;
  commitmentPercent: number;
}

export interface SimulationResult {
  months: SimulatedMonth[];
  monthlyInstallment: number;
  tightestMonth: { label: string; freeBalance: number } | null;
  commitmentBefore: number;
  commitmentAfter: number;
}

export interface SimulationInput {
  totalAmount: number;
  totalInstallments: number;
  isActive: boolean;
}

export function calculateSimulation(
  baseline: BaselineMonth[],
  averageIncome: number,
  simulations: SimulationInput[],
): SimulationResult {
  const activeSimulations = simulations.filter((s) => s.isActive);

  const months: SimulatedMonth[] = baseline.map((month, index) => {
    let simulationExpenses = 0;
    for (const sim of activeSimulations) {
      if (sim.totalInstallments <= 0) continue;
      if (index < sim.totalInstallments) {
        simulationExpenses += sim.totalAmount / sim.totalInstallments;
      }
    }

    const totalWithSimulation = month.currentExpenses + simulationExpenses;
    const freeBalance = averageIncome - totalWithSimulation;
    const commitmentPercent =
      averageIncome > 0 ? (totalWithSimulation / averageIncome) * 100 : 0;

    return {
      ...month,
      simulationExpenses,
      totalWithSimulation,
      freeBalance,
      isOverBudget: freeBalance < 0,
      commitmentPercent,
    };
  });

  const monthlyInstallment = activeSimulations.reduce(
    (sum, s) => sum + s.totalAmount / s.totalInstallments,
    0,
  );

  // Find tightest month (only among months with simulation impact)
  let tightestMonth: { label: string; freeBalance: number } | null = null;
  for (const m of months) {
    if (m.simulationExpenses > 0) {
      if (!tightestMonth || m.freeBalance < tightestMonth.freeBalance) {
        tightestMonth = { label: m.label, freeBalance: m.freeBalance };
      }
    }
  }

  // Commitment before (baseline only)
  const avgCurrentExpenses =
    baseline.length > 0
      ? baseline.reduce((sum, m) => sum + m.currentExpenses, 0) / baseline.length
      : 0;
  const commitmentBefore =
    averageIncome > 0 ? (avgCurrentExpenses / averageIncome) * 100 : 0;

  // Commitment after (with simulation, averaged over impacted months)
  const impactedMonths = months.filter((m) => m.simulationExpenses > 0);
  const avgTotalExpenses =
    impactedMonths.length > 0
      ? impactedMonths.reduce((sum, m) => sum + m.totalWithSimulation, 0) /
        impactedMonths.length
      : avgCurrentExpenses;
  const commitmentAfter =
    averageIncome > 0 ? (avgTotalExpenses / averageIncome) * 100 : 0;

  return {
    months,
    monthlyInstallment,
    tightestMonth,
    commitmentBefore,
    commitmentAfter,
  };
}
```

**Verification**: `npm run test:unit -- --grep "simulation-engine"`

**On Failure**:
- If type errors: Verify `BaselineMonth` is exported from `@/types`
- If NaN in results: Check division by zero guards (averageIncome, installments)

---

#### 2. Create ImpactSummaryCards component and wire reactive calculation -- DONE

**File**: `src/components/simulator/ImpactSummaryCards.tsx` (CREATE), `src/app/simulador/page.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO (UI component)
**Depends On**: Task 1

**Load Before Implementing**:
1. `src/lib/simulation-engine.ts` (full file) - `SimulationResult` type and `calculateSimulation` function
2. `src/app/simulador/page.tsx` (full file) - Current page to modify
3. `src/components/ui/card.tsx` - Card component API
4. `src/lib/utils.ts` - `formatCurrency`, `cn`

**Pre-conditions**:
- [x] Task 1 complete (`calculateSimulation` exists)
- [x] Phase 1 complete (page, form, chart exist)

**Learning:** Used unicode escape `\u2014` for em-dash in JSX to avoid encoding issues. The page already had `useState` and `useEffect` imported, only needed to add `useMemo` to the import.

**Why**: Shows the 3 key metrics: monthly installment amount, tightest month with balance, and income commitment change. Wires the reactive calculation from form to cards + chart via `useMemo` with debounce.

**Acceptance Criteria**:
```gherkin
Given simulation data with totalAmount=3000 and 6 installments
When the ImpactSummaryCards renders
Then "Parcela mensal" card shows R$ 500,00
And "Mes mais apertado" card shows the month with lowest free balance
And "Comprometimento" card shows before -> after percentages

Given no simulation input (totalAmount=0)
When ImpactSummaryCards renders
Then cards show placeholder/empty state (dashes)

Given the user changes form values
When 300ms debounce elapses
Then cards and chart update with new simulation results
```

**Implementation**:

`src/components/simulator/ImpactSummaryCards.tsx`:
```typescript
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { SimulationResult } from "@/lib/simulation-engine";

interface ImpactSummaryCardsProps {
  result: SimulationResult | null;
  averageIncome: number;
}

export function ImpactSummaryCards({ result, averageIncome }: ImpactSummaryCardsProps) {
  const hasSimulation = result && result.monthlyInstallment > 0;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Parcela mensal */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-gray-500">Parcela mensal</p>
          <p className="text-2xl font-bold text-emerald-600">
            {hasSimulation ? formatCurrency(result.monthlyInstallment) : "—"}
          </p>
          <p className="text-xs text-gray-400">
            {hasSimulation ? "adicionado ao seu fluxo" : "preencha a simulacao"}
          </p>
        </CardContent>
      </Card>

      {/* Mes mais apertado */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-gray-500">Mes mais apertado</p>
          {hasSimulation && result.tightestMonth ? (
            <>
              <p className={cn(
                "text-2xl font-bold",
                result.tightestMonth.freeBalance < 0
                  ? "text-red-600"
                  : result.tightestMonth.freeBalance < averageIncome * 0.1
                    ? "text-yellow-600"
                    : "text-gray-900"
              )}>
                {result.tightestMonth.label}
              </p>
              <p className={cn(
                "text-sm",
                result.tightestMonth.freeBalance < 0 ? "text-red-500" : "text-gray-500"
              )}>
                {result.tightestMonth.freeBalance < 0 ? "Faltam " : "Sobram "}
                {formatCurrency(Math.abs(result.tightestMonth.freeBalance))}
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold text-gray-300">—</p>
          )}
        </CardContent>
      </Card>

      {/* Comprometimento */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-gray-500">Comprometimento da renda</p>
          {hasSimulation ? (
            <div className="flex items-baseline gap-2">
              <span className="text-lg text-gray-500">
                {result.commitmentBefore.toFixed(0)}%
              </span>
              <span className="text-gray-400">&rarr;</span>
              <span className={cn(
                "text-2xl font-bold",
                result.commitmentAfter > 100
                  ? "text-red-600"
                  : result.commitmentAfter > 80
                    ? "text-yellow-600"
                    : "text-emerald-600"
              )}>
                {result.commitmentAfter.toFixed(0)}%
              </span>
            </div>
          ) : (
            <p className="text-2xl font-bold text-gray-300">—</p>
          )}
          <p className="text-xs text-gray-400">da renda media mensal</p>
        </CardContent>
      </Card>
    </div>
  );
}
```

Update `src/app/simulador/page.tsx` to add reactive calculation:
- Import `useMemo` and `calculateSimulation` from `@/lib/simulation-engine`
- Import `ImpactSummaryCards` from `@/components/simulator/ImpactSummaryCards`
- Add `useMemo` for `simulationResult` that depends on form state + baseline data
- Add debounced state using `useEffect` with 300ms timeout
- Pass `simulationResult` to `ImpactSummaryCards` and updated data to `ImpactChart`

Key code to add in page:
```typescript
import { useMemo, useEffect } from "react";
import { calculateSimulation, SimulationResult } from "@/lib/simulation-engine";
import { ImpactSummaryCards } from "@/components/simulator/ImpactSummaryCards";

// Inside component, after form state:
const [debouncedAmount, setDebouncedAmount] = useState(0);

// Debounce only amount input (text input with rapid typing)
// Installments is a select - no debounce needed
useEffect(() => {
  const timer = setTimeout(() => {
    setDebouncedAmount(totalAmount);
  }, 300);
  return () => clearTimeout(timer);
}, [totalAmount]);

const simulationResult = useMemo(() => {
  if (!simulationData || debouncedAmount <= 0) return null;
  return calculateSimulation(
    simulationData.months,
    simulationData.averageIncome,
    [{ totalAmount: debouncedAmount, totalInstallments: totalInstallments, isActive: true }],
  );
}, [simulationData, debouncedAmount, totalInstallments]);
```

Add in JSX between form and chart:
```tsx
<ImpactSummaryCards
  result={simulationResult}
  averageIncome={simulationData?.averageIncome ?? 0}
/>
```

**Verification**: `npm run build`

**On Failure**:
- If build fails on SimulationResult import: Check export from simulation-engine.ts
- If cards don't update: Verify debounce state is wired correctly in page

---

#### 3. Enhance ImpactChart with stacked bars, income line, red zone, and custom tooltip -- DONE

**File**: `src/components/simulator/ImpactChart.tsx` (MODIFY)
**Complexity**: High
**TDD**: NO (Recharts visual component)
**Depends On**: Task 1, Task 2

**Load Before Implementing**:
1. `src/components/simulator/ImpactChart.tsx` (full file) - Current basic chart
2. `src/lib/simulation-engine.ts` (search for `SimulatedMonth`) - Enhanced data type
3. `src/components/Charts/ProjectionChart.tsx` (full file) - Reference for advanced Recharts usage
4. `src/lib/utils.ts` - `formatCurrency`

**Pre-conditions**:
- [x] Task 1 complete (`SimulatedMonth` type available)
- [x] Task 2 complete (page passes simulation results)

**Learning:** ReferenceArea and TooltipProps imports from recharts worked without issues. Used `"in" operator` type narrowing to safely access SimulatedMonth-specific fields when the data source could be either BaselineMonth or SimulatedMonth.

**Why**: Upgrades the basic bar chart to the full visualization: gray stacked bars for current expenses, emerald bars for simulation overlay, dashed income reference line, translucent red zone for over-budget months, and rich tooltip.

**Acceptance Criteria**:
```gherkin
Given simulation data with some months over budget
When the ImpactChart renders
Then gray bars show current expenses
And emerald bars stack on top showing simulation installments
And a dashed line shows average income
And months where total > income have a red translucent background

Given user hovers over a month bar
When tooltip appears
Then it shows: Renda, Fixas, Parcelas existentes, Esta simulacao, Saldo livre

Given no simulation (simulatedMonths is null)
When chart renders
Then only gray baseline bars and income line are shown (no emerald bars)
```

**Implementation**:

Replace `ImpactChart` to accept optional `SimulatedMonth[]`:
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
  ReferenceArea,
  TooltipProps,
} from "recharts";
import { useMediaQuery } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";
import type { BaselineMonth } from "@/types";
import type { SimulatedMonth } from "@/lib/simulation-engine";

interface ImpactChartProps {
  baseline: BaselineMonth[];
  averageIncome: number;
  simulatedMonths?: SimulatedMonth[] | null;
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="rounded-lg border bg-white p-3 shadow-md">
      <p className="font-medium text-gray-900 mb-2">{label}</p>
      <div className="space-y-1 text-sm">
        {data.averageIncome != null && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Renda:</span>
            <span className="font-medium">{formatCurrency(data.averageIncome)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Despesas fixas:</span>
          <span>{formatCurrency(data.recurringExpenses ?? data.currentExpenses)}</span>
        </div>
        {data.installmentsTotal > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Parcelas existentes:</span>
            <span>{formatCurrency(data.installmentsTotal)}</span>
          </div>
        )}
        {data.simulationExpenses > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-emerald-600 font-medium">Esta simulacao:</span>
            <span className="text-emerald-600 font-medium">
              {formatCurrency(data.simulationExpenses)}
            </span>
          </div>
        )}
        <div className="border-t pt-1 flex justify-between gap-4">
          <span className="text-gray-700 font-medium">Saldo livre:</span>
          <span className={data.freeBalance < 0 ? "text-red-600 font-bold" : "font-medium"}>
            {formatCurrency(data.freeBalance ?? (data.averageIncome - data.currentExpenses))}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ImpactChart({ baseline, averageIncome, simulatedMonths }: ImpactChartProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const chartData = (simulatedMonths ?? baseline).map((m) => ({
    label: m.label,
    currentExpenses: m.currentExpenses,
    simulationExpenses: "simulationExpenses" in m ? (m as SimulatedMonth).simulationExpenses : 0,
    freeBalance: "freeBalance" in m ? (m as SimulatedMonth).freeBalance : averageIncome - m.currentExpenses,
    isOverBudget: "isOverBudget" in m ? (m as SimulatedMonth).isOverBudget : false,
    recurringExpenses: m.recurringExpenses,
    installmentsTotal: m.installmentsTotal,
    averageIncome,
  }));

  // Find over-budget month ranges for red zones
  const overBudgetMonths = chartData
    .filter((d) => d.isOverBudget)
    .map((d) => d.label);

  const formatCompact = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(value);

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 280 : 380}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: isMobile ? 10 : 12 }} />
        <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />

        {/* Red zones for over-budget months */}
        {overBudgetMonths.map((monthLabel) => (
          <ReferenceArea
            key={monthLabel}
            x1={monthLabel}
            x2={monthLabel}
            fill="#ef4444"
            fillOpacity={0.08}
          />
        ))}

        <Bar
          dataKey="currentExpenses"
          name="Despesas atuais"
          stackId="expenses"
          fill="#d1d5db"
          radius={simulatedMonths ? [0, 0, 0, 0] : [4, 4, 0, 0]}
        />
        {simulatedMonths && (
          <Bar
            dataKey="simulationExpenses"
            name="Simulacao"
            stackId="expenses"
            fill="#34d399"
            radius={[4, 4, 0, 0]}
          />
        )}

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

Update page to pass `simulatedMonths` to chart:
```tsx
<ImpactChart
  baseline={simulationData.months}
  averageIncome={simulationData.averageIncome}
  simulatedMonths={simulationResult?.months ?? null}
/>
```

**Verification**: `npm run build`

**On Failure**:
- If ReferenceArea import fails: Check recharts version supports it (`npm ls recharts`)
- If tooltip doesn't render: Verify CustomTooltip receives correct payload structure
- If stacked bars misaligned: Ensure both bars use same `stackId="expenses"`

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - All project checks pass (pre-existing failures only: 5 timezone tests in utils.test.ts, 1 type error in csv-parser.test.ts)

### Manual Verification
- [ ] Fill form with value and installments -> chart shows stacked emerald bars + cards update
- [ ] Over-budget months show red background in chart
- [ ] Tooltip shows breakdown when hovering a month
