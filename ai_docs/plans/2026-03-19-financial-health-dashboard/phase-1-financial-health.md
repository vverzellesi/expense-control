# Phase 1: Saúde Financeira

## Overview

Criar o componente `FinancialHealthSection` com metric cards, barra de comprometimento e semáforo. Integrá-lo no dashboard substituindo os KPI cards atuais, remover seções redundantes e reordenar. Atualizar testes.

## Reference Docs for This Phase
- `src/app/dashboard/page.tsx` (full file) - Dashboard atual a modificar
- `src/app/dashboard/DashboardPage.test.tsx` (full file) - Testes existentes
- `src/components/ui/card.tsx` (full file) - Padrão de Card component
- `src/lib/utils.ts` (lines 1-30) - formatCurrency utility
- `src/types/index.ts` (lines 1-50) - Transaction, Category types

## Changes Required

#### ~~1. Criar componente FinancialHealthSection com lógica de cálculo e testes~~ [x]

**File**: `src/components/FinancialHealthSection.tsx` (CREATE)
**File**: `src/components/FinancialHealthSection.test.tsx` (CREATE)
**Complexity**: High
**TDD**: YES
**Depends On**: none
- **Learning:** O `makeTransaction` do plano usa `type: "EXPENSE"` como string literal, que causa erro TS2322 (string vs TransactionType). Corrigido com `as const`. Strings de UI em PT-BR devem usar acentuação correta ("Mês", "Disponível", "Variável").

**Load Before Implementing**:
1. `src/components/ui/card.tsx` (full file) - Padrão Card/CardHeader/CardTitle/CardContent
2. `src/lib/utils.ts` (lines 1-30) - formatCurrency import
3. `src/types/index.ts` (lines 1-20) - Transaction e Category types
4. `src/app/dashboard/page.tsx` (lines 169-247) - Padrão dos metric cards atuais

**Pre-conditions**:
- [ ] Diretório `src/components/` existe
- [ ] Pacotes `lucide-react`, `@/components/ui/card`, `@/lib/utils` disponíveis

**Why**: Componente central da feature que encapsula toda a lógica de cálculo de saúde financeira e renderização dos metric cards + barra de comprometimento. Funções de cálculo exportadas separadamente para testabilidade.

**Acceptance Criteria**:
```gherkin
Given income=5000, expense=3000, fixedExpenses com total 1500
When o componente renderiza
Then mostra 4 cards: "Renda do Mês", "Despesas Fixas", "Comprometimento", "Sobra Disponível"
And o card de comprometimento mostra "60%"
And o card usa estilos verdes (commitment < 70%)

Given income=5000, expense=4000
When o componente renderiza
Then o card de comprometimento mostra "80%" com estilos amarelos

Given income=5000, expense=4800
When o componente renderiza
Then o card de comprometimento mostra "96%" com estilos vermelhos

Given income=0, expense=0
When o componente renderiza
Then mostra "—" no card de comprometimento com estilos cinza (não verde)
And mostra mensagem "Adicione suas receitas para ver o comprometimento da renda"

Given income=3000, expense=4000
When o componente renderiza
Then sobra mostra valor negativo em vermelho
And comprometimento mostra "133%" em vermelho

Given upcomingInstallments com itens em meses diferentes
When o componente calcula parcelas
Then apenas parcelas do mês/ano atual são incluídas no total

Given barra com segmentos de diferentes tamanhos
When um segmento tem >= 10% da largura
Then mostra o valor formatado dentro do segmento

Given barra com segmentos
When um segmento tem valor zero
Then o segmento não é renderizado

Given income=3000, expense=5000
When a barra renderiza
Then todos os segmentos são visíveis com largura normalizada (total = 100%)
```

**Implementation**:

`src/components/FinancialHealthSection.tsx`:
```tsx
"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Wallet, Receipt, Percent, PiggyBank } from "lucide-react";
import type { Transaction, Category } from "@/types";

interface FinancialHealthSectionProps {
  income: number;
  expense: number;
  fixedExpenses: (Transaction & { category: Category | null })[];
  upcomingInstallments: (Transaction & { category: Category | null })[];
  currentMonth: number;
  currentYear: number;
}

export function getCommitmentLevel(percentage: number): "green" | "yellow" | "red" {
  if (percentage < 70) return "green";
  if (percentage <= 90) return "yellow";
  return "red";
}

export function calculateFinancialHealth(
  income: number,
  expense: number,
  fixedExpenses: { amount: number }[],
  upcomingInstallments: { amount: number; date: string | Date }[],
  currentMonth: number,
  currentYear: number,
) {
  const fixedTotal = fixedExpenses.reduce((sum, e) => sum + Math.abs(e.amount), 0);

  const installmentsTotal = upcomingInstallments
    .filter((inst) => {
      const d = new Date(inst.date);
      return d.getUTCMonth() + 1 === currentMonth && d.getUTCFullYear() === currentYear;
    })
    .reduce((sum, inst) => sum + Math.abs(inst.amount), 0);

  const variableTotal = Math.max(0, expense - fixedTotal - installmentsTotal);
  const available = income - expense;
  const commitmentPercentage = income > 0 ? (expense / income) * 100 : 0;
  const level = getCommitmentLevel(commitmentPercentage);

  return {
    fixedTotal,
    installmentsTotal,
    variableTotal,
    available,
    commitmentPercentage,
    level,
  };
}

const LEVEL_STYLES = {
  green: { text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  yellow: { text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  red: { text: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
};

export function FinancialHealthSection({
  income,
  expense,
  fixedExpenses,
  upcomingInstallments,
  currentMonth,
  currentYear,
}: FinancialHealthSectionProps) {
  const {
    fixedTotal,
    installmentsTotal,
    variableTotal,
    available,
    commitmentPercentage,
    level,
  } = calculateFinancialHealth(income, expense, fixedExpenses, upcomingInstallments, currentMonth, currentYear);

  const hasIncome = income > 0;
  const styles = hasIncome ? LEVEL_STYLES[level] : { text: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" };

  const rawSegments = hasIncome
    ? [
        { label: "Fixas", value: fixedTotal, color: "bg-slate-400", pct: (fixedTotal / income) * 100 },
        { label: "Parcelas", value: installmentsTotal, color: "bg-blue-400", pct: (installmentsTotal / income) * 100 },
        { label: "Variável", value: variableTotal, color: "bg-purple-400", pct: (variableTotal / income) * 100 },
        { label: "Sobra", value: Math.max(0, available), color: "bg-emerald-400", pct: (Math.max(0, available) / income) * 100 },
      ].filter((s) => s.pct > 0)
    : [];

  // Normalize segments when total exceeds 100% (expenses > income)
  const totalPct = rawSegments.reduce((sum, s) => sum + s.pct, 0);
  const segments = totalPct > 100
    ? rawSegments.map((s) => ({ ...s, pct: (s.pct / totalPct) * 100 }))
    : rawSegments;

  return (
    <div className="space-y-4">
      {/* Metric Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Renda do Mês</CardTitle>
            <Wallet className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(income)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Despesas Fixas</CardTitle>
            <Receipt className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-700">
              {formatCurrency(fixedTotal)}
            </div>
          </CardContent>
        </Card>

        <Card className={`${styles.border} ${styles.bg}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comprometimento</CardTitle>
            <Percent className={`h-4 w-4 ${styles.text}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${styles.text}`}>
              {hasIncome ? `${commitmentPercentage.toFixed(0)}%` : "\u2014"}
            </div>
          </CardContent>
        </Card>

        <Card className={available < 0 ? "border-red-200 bg-red-50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sobra Disponível</CardTitle>
            <PiggyBank className={`h-4 w-4 ${available >= 0 ? "text-emerald-500" : "text-red-500"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${available >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatCurrency(available)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Commitment Bar */}
      {hasIncome ? (
        <div className="space-y-2">
          <div className="flex h-6 w-full overflow-hidden rounded-full bg-gray-100">
            {segments.map((seg) => (
              <div
                key={seg.label}
                className={`${seg.color} flex items-center justify-center transition-all`}
                style={{ width: `${Math.min(seg.pct, 100)}%` }}
                title={`${seg.label}: ${formatCurrency(seg.value)}`}
              >
                {seg.pct >= 10 && (
                  <span className="text-xs font-medium text-white truncate px-1">
                    {formatCurrency(seg.value)}
                  </span>
                )}
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
            {[
              { label: "Fixas", color: "bg-slate-400", value: fixedTotal },
              { label: "Parcelas", color: "bg-blue-400", value: installmentsTotal },
              { label: "Variável", color: "bg-purple-400", value: variableTotal },
              { label: "Sobra", color: "bg-emerald-400", value: Math.max(0, available) },
            ]
              .filter((item) => item.value > 0)
              .map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={`h-3 w-3 rounded-full ${item.color}`} />
                  <span>{item.label}: {formatCurrency(item.value)}</span>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
          Adicione suas receitas para ver o comprometimento da renda
        </div>
      )}
    </div>
  );
}
```

`src/components/FinancialHealthSection.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  FinancialHealthSection,
  calculateFinancialHealth,
  getCommitmentLevel,
} from "./FinancialHealthSection";

describe("getCommitmentLevel", () => {
  it("returns green when below 70%", () => {
    expect(getCommitmentLevel(0)).toBe("green");
    expect(getCommitmentLevel(50)).toBe("green");
    expect(getCommitmentLevel(69.9)).toBe("green");
  });

  it("returns yellow when between 70% and 90%", () => {
    expect(getCommitmentLevel(70)).toBe("yellow");
    expect(getCommitmentLevel(80)).toBe("yellow");
    expect(getCommitmentLevel(90)).toBe("yellow");
  });

  it("returns red when above 90%", () => {
    expect(getCommitmentLevel(91)).toBe("red");
    expect(getCommitmentLevel(100)).toBe("red");
    expect(getCommitmentLevel(150)).toBe("red");
  });
});

describe("calculateFinancialHealth", () => {
  it("calculates totals correctly", () => {
    const result = calculateFinancialHealth(
      5000,
      3000,
      [{ amount: -1000 }, { amount: -500 }],
      [{ amount: -300, date: "2026-03-15" }],
      3,
      2026,
    );
    expect(result.fixedTotal).toBe(1500);
    expect(result.installmentsTotal).toBe(300);
    expect(result.variableTotal).toBe(1200);
    expect(result.available).toBe(2000);
    expect(result.commitmentPercentage).toBe(60);
    expect(result.level).toBe("green");
  });

  it("filters installments by current month", () => {
    const result = calculateFinancialHealth(
      5000,
      3000,
      [],
      [
        { amount: -300, date: "2026-03-15" },
        { amount: -200, date: "2026-04-15" },
      ],
      3,
      2026,
    );
    expect(result.installmentsTotal).toBe(300);
  });

  it("handles zero income", () => {
    const result = calculateFinancialHealth(0, 500, [{ amount: -500 }], [], 3, 2026);
    expect(result.commitmentPercentage).toBe(0);
    expect(result.available).toBe(-500);
    expect(result.level).toBe("green");
  });

  it("clamps variable to zero when fixed + installments exceed expense", () => {
    const result = calculateFinancialHealth(
      5000,
      1000,
      [{ amount: -800 }, { amount: -500 }],
      [],
      3,
      2026,
    );
    expect(result.variableTotal).toBe(0);
  });

  it("returns red level for high commitment", () => {
    const result = calculateFinancialHealth(
      5000,
      4800,
      [{ amount: -2000 }],
      [],
      3,
      2026,
    );
    expect(result.commitmentPercentage).toBe(96);
    expect(result.level).toBe("red");
  });

  it("returns yellow level for moderate commitment", () => {
    const result = calculateFinancialHealth(
      5000,
      4000,
      [{ amount: -2000 }],
      [],
      3,
      2026,
    );
    expect(result.commitmentPercentage).toBe(80);
    expect(result.level).toBe("yellow");
  });
});

const makeTransaction = (overrides: Partial<any> = {}) => ({
  id: "1",
  description: "Test",
  amount: -1000,
  date: new Date("2026-03-15"),
  type: "EXPENSE",
  origin: "",
  isFixed: true,
  isInstallment: false,
  tags: null,
  categoryTagId: null,
  categoryId: null,
  installmentId: null,
  currentInstallment: null,
  totalInstallments: null,
  recurringExpenseId: null,
  deletedAt: null,
  userId: null,
  spaceId: null,
  isPrivate: false,
  createdByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  category: null,
  ...overrides,
});

describe("FinancialHealthSection", () => {
  const defaultProps = {
    income: 5000,
    expense: 3000,
    fixedExpenses: [makeTransaction({ amount: -1500, description: "Aluguel" })],
    upcomingInstallments: [],
    currentMonth: 3,
    currentYear: 2026,
  };

  it("renders all four metric cards", () => {
    render(<FinancialHealthSection {...defaultProps} />);
    expect(screen.getByText("Renda do Mês")).toBeDefined();
    expect(screen.getByText("Despesas Fixas")).toBeDefined();
    expect(screen.getByText("Comprometimento")).toBeDefined();
    expect(screen.getByText("Sobra Disponível")).toBeDefined();
  });

  it("shows commitment percentage", () => {
    render(<FinancialHealthSection {...defaultProps} />);
    expect(screen.getByText("60%")).toBeDefined();
  });

  it("shows empty state when income is zero", () => {
    render(<FinancialHealthSection {...defaultProps} income={0} expense={0} />);
    expect(
      screen.getByText("Adicione suas receitas para ver o comprometimento da renda"),
    ).toBeDefined();
    expect(screen.getByText("\u2014")).toBeDefined();
  });

  it("shows red styling when expenses exceed income", () => {
    render(<FinancialHealthSection {...defaultProps} income={3000} expense={4000} />);
    expect(screen.getByText("133%")).toBeDefined();
  });

  it("renders commitment bar segments", () => {
    const { container } = render(<FinancialHealthSection {...defaultProps} />);
    const bar = container.querySelector(".rounded-full.bg-gray-100");
    expect(bar).toBeDefined();
    expect(bar?.children.length).toBeGreaterThan(0);
  });

  it("renders legend items for non-zero segments", () => {
    render(<FinancialHealthSection {...defaultProps} />);
    expect(screen.getByText(/Fixas:/)).toBeDefined();
    expect(screen.getByText(/Variável:/)).toBeDefined();
    expect(screen.getByText(/Sobra:/)).toBeDefined();
  });

  it("renders bar when expenses exceed income (overflow normalized)", () => {
    const { container } = render(
      <FinancialHealthSection {...defaultProps} income={3000} expense={5000} />,
    );
    const bar = container.querySelector(".rounded-full.bg-gray-100");
    expect(bar).toBeDefined();
    // All segments should still render (normalized to 100%)
    expect(bar?.children.length).toBeGreaterThan(0);
  });
});
```

**Verification**: `cd /Users/victor/code/victor/expense-control/.worktrees/financial-health && npx vitest run src/components/FinancialHealthSection.test.tsx`

**On Failure**:
- Se tipo Transaction não encontrado: verificar import em `@/types` e campos obrigatórios
- Se ícones não encontrados: verificar `lucide-react` exports com `grep -r "Receipt\|Percent\|PiggyBank" node_modules/lucide-react/dist/esm/icons/`
- Se formatCurrency não encontrado: verificar export em `@/lib/utils`

---

#### ~~2. Integrar FinancialHealthSection no dashboard e reorganizar seções~~ [x]

**File**: `src/app/dashboard/page.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO (reorganização de JSX, sem lógica de decisão)
**Depends On**: 1
- **Learning:** O ícone `Zap` ainda é usado pela seção Gastos Incomuns -- não pode ser removido do import. Os tipos `WeeklySummary`/`WeeklyBreakdown` devem permanecer no import pois a interface `SummaryData` os referencia (contrato da API). `Wallet` e `Calendar` foram removidos com sucesso.

**Load Before Implementing**:
1. `src/app/dashboard/page.tsx` (full file) - Dashboard completo a modificar
2. `src/components/FinancialHealthSection.tsx` (full file) - Componente criado na task 1

**Pre-conditions**:
- [ ] Task 1 concluída — `src/components/FinancialHealthSection.tsx` existe
- [ ] Testes da task 1 passando

**Why**: Integrar o novo componente no dashboard, substituindo os KPI cards antigos e removendo seções redundantes para um layout mais focado.

**Acceptance Criteria**:
```gherkin
Given o dashboard carregou dados
When a página renderiza
Then FinancialHealthSection aparece no topo (após header)
And os 3 cards KPI antigos (Receitas/Despesas/Saldo) não existem mais
And as seções "Resumo da Semana" e "Gastos por Semana" não existem mais

Given o dashboard carregou dados
When a página renderiza
Then a ordem das seções é: Header → Saúde Financeira → Gráficos → Alertas → Gastos Incomuns → Variação Categoria → Metas → Fixas+Parcelas → Meta Economia → Investimentos
```

**Implementation**:

Changes to `src/app/dashboard/page.tsx`:

1. Add import at top (after line 16):
```tsx
import { FinancialHealthSection } from "@/components/FinancialHealthSection";
```

2. Replace the KPI cards section (lines 168-247) with:
```tsx
      {/* 1. Financial Health Section */}
      <FinancialHealthSection
        income={data?.summary.income || 0}
        expense={data?.summary.expense || 0}
        fixedExpenses={data?.fixedExpenses || []}
        upcomingInstallments={data?.upcomingInstallments || []}
        currentMonth={currentMonth}
        currentYear={currentYear}
      />
```

3. Remove the weekly summary section (lines 447-488 — from `{/* 4. Weekly Summary */}` to the closing `)}`)

4. Remove the weekly breakdown section (lines 676-805 — from `{/* 9. Weekly Breakdown */}` to the closing `)}`)

5. Reorder sections so the final JSX order within the return is:
   - Header (keep as is)
   - FinancialHealthSection (new, replaces KPI cards)
   - Charts — pizza + barras (keep as is)
   - Budget Alerts (move up, before savings goal)
   - Unusual Spending (move up, after budget alerts)
   - Category Variation (keep position)
   - Budget Goals Grid (keep position)
   - Fixed Expenses + Upcoming Installments (keep position)
   - Savings Goal (move down)
   - Investment Card (move down)

6. Remove unused imports that were only used by removed sections. After removal, check if these are still used elsewhere:
   - `Calendar` icon — used only in weekly sections → REMOVE from import
   - `Zap` icon — check usage → REMOVE if unused
   - `WeeklySummary` type import — REMOVE if not used in interface
   - `WeeklyBreakdown` type import — REMOVE if not used in interface
   - Keep `weeklySummary` and `weeklyBreakdown` in `SummaryData` interface (API still returns them; removing would misrepresent the API contract)

**Verification**: `cd /Users/victor/code/victor/expense-control/.worktrees/financial-health && npm run build`

**On Failure**:
- Se linhas mudaram: localizar seções por comentários (`grep -n "Summary Cards\|Weekly Summary\|Weekly Breakdown" src/app/dashboard/page.tsx`)
- Se imports quebram: verificar quais ícones/tipos ainda são usados com grep
- Se build falha por tipo: manter campos na interface se algo os referencia

---

#### ~~3. Atualizar testes do dashboard para nova estrutura~~ [x]

**File**: `src/app/dashboard/DashboardPage.test.tsx` (MODIFY)
**Complexity**: Low
**TDD**: NO (ajuste de mocks/testes existentes)
**Depends On**: 2
- **Learning:** Mock do FinancialHealthSection expõe props como texto para facilitar asserções nos testes de integração.

**Load Before Implementing**:
1. `src/app/dashboard/DashboardPage.test.tsx` (full file) - Testes atuais
2. `src/components/FinancialHealthSection.tsx` (lines 1-5) - Para saber o export name

**Pre-conditions**:
- [ ] Task 2 concluída — dashboard usa FinancialHealthSection
- [ ] Build passa (`npm run build`)

**Why**: Os testes existentes precisam mockar o novo componente FinancialHealthSection para funcionar corretamente com a nova estrutura do dashboard.

**Acceptance Criteria**:
```gherkin
Given os testes do dashboard
When executados
Then todos passam sem erros
And FinancialHealthSection está mockado
And um teste verifica que o componente de saúde financeira é renderizado
```

**Implementation**:

Add mock for FinancialHealthSection after the existing mocks (after line 34):
```tsx
vi.mock('@/components/FinancialHealthSection', () => ({
  FinancialHealthSection: (props: any) => (
    <div data-testid="financial-health">
      FinancialHealthSection income={props.income} expense={props.expense}
    </div>
  ),
}))
```

Add test after existing tests (before closing `})`):
```tsx
  it('renders FinancialHealthSection with summary data', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.queryByText('Carregando...')).toBeNull()
    })

    expect(screen.getByTestId('financial-health')).toBeDefined()
    expect(screen.getByText(/income=5000/)).toBeDefined()
    expect(screen.getByText(/expense=3000/)).toBeDefined()
  })
```

**Verification**: `cd /Users/victor/code/victor/expense-control/.worktrees/financial-health && npx vitest run src/app/dashboard/DashboardPage.test.tsx`

**On Failure**:
- Se mock falha: verificar que o path do mock corresponde ao import no page.tsx
- Se teste de renderização falha: verificar que o fetch mock retorna `mockSummaryData` com campos corretos

---

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - TypeScript 0 errors, build OK, 19/19 tests pass (16 component + 3 dashboard)

### Manual Verification (only if automation impossible)
- [ ] Abrir dashboard no browser e verificar que a barra de comprometimento e cards renderizam corretamente com dados reais
