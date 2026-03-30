# Phase 3: Scores + Classificação

## Overview

Implementar os 2 cards de score no dashboard (score do cartão e score financeiro) e adicionar o seletor de FlexibilityType no form de edição de categorias. Os scores reutilizam dados já disponíveis (cards-summary, BillPayment, summary).

## Reference Docs for This Phase
- `src/lib/cards-summary.ts` (lines 28-52) - CardSummary interface e calculateStatus
- `src/lib/debt-detector.ts` - analyzeDebtPattern (Phase 2)
- `src/app/api/summary/route.ts` (lines 234-339) - Query pattern
- `src/app/api/bill-payments/route.ts` (lines 7-56) - BillPayment queries
- `src/components/FinancialHealthSection.tsx` (lines 7-40) - Commitment calculation
- `src/app/dashboard/page.tsx` (lines 37-77) - SummaryData interface
- `src/app/api/categories/[id]/route.ts` (lines 45-79) - PUT handler (updated Phase 1)

## Changes Required

#### 1. Criar card-score.ts com testes + API + CardScoreCard -- [x] DONE

**File**: `src/lib/card-score.ts` (CREATE), `src/lib/card-score.test.ts` (CREATE), `src/app/api/insights/card-score/route.ts` (CREATE), `src/app/dashboard/page.tsx` (MODIFY)
**Complexity**: High
**TDD**: YES
**Depends On**: none
- **Learning:** O teste "critical for financed 3+ months" do plano precisou de dados de cartao mais extremos (alto uso de limite + parcelas + tendencia de alta) para atingir score < 40 e nivel "critical". Apenas financiamento sem outros fatores negativos resulta em "warning".

**Load Before Implementing**:
1. `src/lib/cards-summary.ts` (lines 28-52) - CardSummary interface, calculateStatus
2. `src/types/index.ts` (lines 398-416) - BillPayment interface
3. `src/app/api/summary/route.ts` (lines 234-339) - Auth and query pattern

**Pre-conditions**:
- [ ] `src/lib/cards-summary.ts` exists
- [ ] BillPayment model has data

**Why**: Score de saúde do cartão (issue #54) traduz dados complexos de uso do cartão em nota 0-100 com semáforo, tornando imediatamente compreensível qual cartão precisa de atenção.

**Acceptance Criteria**:
```gherkin
Given a card with 0% limit used and no financed bills
When calculateCardScore is called
Then score is 100 and level is "healthy"

Given a card with 80% limit used and 2 consecutive financed months
When calculateCardScore is called
Then score is below 40 and level is "critical"

Given a card with 50% limit used and bills always paid in full
When calculateCardScore is called
Then score is above 70 and level is "healthy"

Given the card-score API is called
When there are credit cards with limits
Then response includes per-card score, level, factors, and recommendation
```

**Implementation**:

```typescript
// src/lib/card-score.ts

export type ScoreLevel = "healthy" | "warning" | "critical";

export interface CardScoreResult {
  origin: string;
  score: number; // 0-100
  level: ScoreLevel;
  factors: {
    limitUsage: { value: number; weight: number; score: number };
    installmentRatio: { value: number; weight: number; score: number };
    financedHistory: { value: number; weight: number; score: number };
    trend: { value: number; weight: number; score: number }; // -1 growing, 0 stable, 1 shrinking
  };
  recommendation: string;
}

interface CardData {
  origin: string;
  creditLimit: number | null;
  currentMonthTotal: number;
  installmentTotal: number;
  billPayments: Array<{
    billMonth: number;
    billYear: number;
    paymentType: string;
    amountCarried: number;
    totalBillAmount: number;
  }>;
  previousMonthTotal: number;
}

// Weights for each factor (must sum to 100)
const WEIGHTS = {
  limitUsage: 35,
  installmentRatio: 25,
  financedHistory: 25,
  trend: 15,
};

function scoreLimitUsage(used: number, limit: number | null): number {
  if (!limit || limit <= 0) return 70; // Unknown limit = neutral
  const pct = (used / limit) * 100;
  if (pct <= 30) return 100;
  if (pct <= 60) return 80;
  if (pct <= 80) return 50;
  if (pct <= 100) return 20;
  return 0; // Over limit
}

function scoreInstallmentRatio(installmentTotal: number, monthTotal: number): number {
  if (monthTotal <= 0) return 100;
  const pct = (installmentTotal / monthTotal) * 100;
  if (pct <= 20) return 100;
  if (pct <= 40) return 75;
  if (pct <= 60) return 50;
  if (pct <= 80) return 25;
  return 0;
}

function scoreFinancedHistory(
  billPayments: CardData["billPayments"],
  currentMonth: number,
  currentYear: number,
): number {
  // Count consecutive months with PARTIAL/FINANCED from most recent
  let consecutive = 0;
  for (let i = 0; i < 6; i++) {
    const targetDate = new Date(currentYear, currentMonth - 1 - i, 1);
    const nm = targetDate.getMonth() + 1;
    const y = targetDate.getFullYear();

    const bp = billPayments.find((p) => p.billMonth === nm && p.billYear === y);
    if (bp && (bp.paymentType === "PARTIAL" || bp.paymentType === "FINANCED")) {
      consecutive++;
    } else {
      break;
    }
  }

  if (consecutive === 0) return 100;
  if (consecutive === 1) return 70;
  if (consecutive === 2) return 40;
  return 10; // 3+ months
}

function scoreTrend(currentTotal: number, previousTotal: number): { value: number; score: number } {
  if (previousTotal <= 0) return { value: 0, score: 70 };
  const change = ((currentTotal - previousTotal) / previousTotal) * 100;
  const value = change > 5 ? -1 : change < -5 ? 1 : 0;
  const score = value === 1 ? 100 : value === 0 ? 70 : 40;
  return { value, score };
}

function getRecommendation(score: number, factors: CardScoreResult["factors"]): string {
  // Checar fatores críticos ANTES do score geral
  if (factors.financedHistory.score <= 40) {
    return "Crítico — fatura parcelada/financiada recentemente. Priorize o pagamento integral.";
  }
  if (factors.limitUsage.score <= 20) {
    return "Crítico — uso do limite está muito alto. Reduza gastos neste cartão urgentemente.";
  }
  if (score >= 80) return "Saudável — continue pagando integral.";
  if (factors.limitUsage.score <= 50) {
    return "Atenção — uso do limite está alto. Considere reduzir gastos neste cartão.";
  }
  if (factors.installmentRatio.score <= 50) {
    return "Atenção — parcelas representam grande parte da fatura. Evite novas compras parceladas.";
  }
  return "Atenção — monitore o uso deste cartão para evitar endividamento.";
}

export function calculateCardScore(
  card: CardData,
  currentMonth: number,
  currentYear: number,
): CardScoreResult {
  const limitScore = scoreLimitUsage(card.currentMonthTotal, card.creditLimit);
  const installmentScore = scoreInstallmentRatio(card.installmentTotal, card.currentMonthTotal);
  const financedScore = scoreFinancedHistory(card.billPayments, currentMonth, currentYear);
  const trendResult = scoreTrend(card.currentMonthTotal, card.previousMonthTotal);

  const score = Math.round(
    (limitScore * WEIGHTS.limitUsage +
      installmentScore * WEIGHTS.installmentRatio +
      financedScore * WEIGHTS.financedHistory +
      trendResult.score * WEIGHTS.trend) / 100,
  );

  const level: ScoreLevel = score >= 70 ? "healthy" : score >= 40 ? "warning" : "critical";

  const factors = {
    limitUsage: { value: card.creditLimit ? (card.currentMonthTotal / card.creditLimit) * 100 : 0, weight: WEIGHTS.limitUsage, score: limitScore },
    installmentRatio: { value: card.currentMonthTotal > 0 ? (card.installmentTotal / card.currentMonthTotal) * 100 : 0, weight: WEIGHTS.installmentRatio, score: installmentScore },
    financedHistory: { value: financedScore, weight: WEIGHTS.financedHistory, score: financedScore },
    trend: { value: trendResult.value, weight: WEIGHTS.trend, score: trendResult.score },
  };

  return {
    origin: card.origin,
    score,
    level,
    factors,
    recommendation: getRecommendation(score, factors),
  };
}
```

```typescript
// src/lib/card-score.test.ts

import { describe, it, expect } from "vitest";
import { calculateCardScore } from "./card-score";

const baseCard = {
  origin: "Test Card",
  creditLimit: 10000,
  currentMonthTotal: 0,
  installmentTotal: 0,
  billPayments: [] as Array<{ billMonth: number; billYear: number; paymentType: string; amountCarried: number; totalBillAmount: number }>,
  previousMonthTotal: 0,
};

describe("calculateCardScore", () => {
  it("returns 100 for zero usage card", () => {
    const result = calculateCardScore(baseCard, 3, 2026);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.level).toBe("healthy");
  });

  it("penalizes high limit usage", () => {
    const card = { ...baseCard, currentMonthTotal: 8500 };
    const result = calculateCardScore(card, 3, 2026);
    expect(result.score).toBeLessThan(70);
  });

  it("penalizes high installment ratio", () => {
    const card = { ...baseCard, currentMonthTotal: 5000, installmentTotal: 4000 };
    const result = calculateCardScore(card, 3, 2026);
    expect(result.factors.installmentRatio.score).toBeLessThanOrEqual(25);
  });

  it("critical for financed 3+ months", () => {
    const card = {
      ...baseCard,
      currentMonthTotal: 5000,
      billPayments: [
        { billMonth: 1, billYear: 2026, paymentType: "FINANCED", amountCarried: 2000, totalBillAmount: 5000 },
        { billMonth: 2, billYear: 2026, paymentType: "FINANCED", amountCarried: 2500, totalBillAmount: 5000 },
        { billMonth: 3, billYear: 2026, paymentType: "FINANCED", amountCarried: 3000, totalBillAmount: 5000 },
      ],
    };
    const result = calculateCardScore(card, 3, 2026);
    expect(result.factors.financedHistory.score).toBeLessThanOrEqual(10);
    expect(result.level).toBe("critical");
  });

  it("handles null credit limit gracefully", () => {
    const card = { ...baseCard, creditLimit: null, currentMonthTotal: 5000 };
    const result = calculateCardScore(card, 3, 2026);
    expect(result.factors.limitUsage.score).toBe(70); // Neutral
  });

  it("rewards declining trend", () => {
    const card = { ...baseCard, currentMonthTotal: 3000, previousMonthTotal: 5000 };
    const result = calculateCardScore(card, 3, 2026);
    expect(result.factors.trend.score).toBe(100);
  });

  it("penalizes growing trend", () => {
    const card = { ...baseCard, currentMonthTotal: 6000, previousMonthTotal: 3000 };
    const result = calculateCardScore(card, 3, 2026);
    expect(result.factors.trend.score).toBe(40);
  });

  it("includes recommendation text", () => {
    const result = calculateCardScore(baseCard, 3, 2026);
    expect(result.recommendation).toBeTruthy();
    expect(typeof result.recommendation).toBe("string");
  });
});
```

API route and dashboard card follow same patterns as Phase 2. API queries Origins with creditLimit, gets transactions and BillPayments per card, calls calculateCardScore. Card shows score gauge/semáforo per card.

**Verification**: `npx vitest run src/lib/card-score.test.ts`

**On Failure**:
- If score out of range: verify weights sum to 100 and division is correct
- If level wrong: check thresholds (>= 70 healthy, >= 40 warning, < 40 critical)

---

#### 2. Criar financial-score.ts com testes + API + FinancialScoreCard -- [x] DONE

**File**: `src/lib/financial-score.ts` (CREATE), `src/lib/financial-score.test.ts` (CREATE), `src/app/api/insights/financial-score/route.ts` (CREATE), `src/app/dashboard/page.tsx` (MODIFY)
**Complexity**: High
**TDD**: YES
**Depends On**: Phase 2 Task 2 (debt-detector)
- **Learning:** O modelo Installment do Prisma nao tem campo `currentInstallment` (que esta no Transaction). A API usa `transactions` do relacionamento para calcular parcelas pagas aproximadamente.

**Load Before Implementing**:
1. `src/components/FinancialHealthSection.tsx` (lines 7-40) - Existing commitment calc
2. `src/lib/debt-detector.ts` - analyzeDebtPattern (Phase 2)
3. `src/app/api/summary/route.ts` (lines 659-693) - Summary response shape

**Pre-conditions**:
- [ ] `src/lib/debt-detector.ts` exists (Phase 2)

**Why**: Score de saúde financeira (issue #71) dá uma nota geral 0-100 baseada em múltiplos fatores. Diferente do score do cartão (per-card), este é global para a situação financeira do usuário.

**Acceptance Criteria**:
```gherkin
Given income=10000, fixedExpenses=4000, no debt, no installments
When calculateFinancialScore is called
Then score is above 80 and level is "healthy"

Given income=10000, fixedExpenses=9000, active debt alerts
When calculateFinancialScore is called
Then score is below 40 and level is "critical"

Given income=10000, fixedExpenses=7000, 5 active installments, expenses growing
When calculateFinancialScore is called
Then score is between 40-70 and level is "warning"
```

**Implementation**:

```typescript
// src/lib/financial-score.ts

export type FinancialLevel = "healthy" | "warning" | "critical";

export interface FinancialScoreResult {
  score: number; // 0-100
  level: FinancialLevel;
  factors: {
    fixedCommitment: { value: number; score: number; description: string };
    expenseTrend: { value: string; score: number; description: string };
    installmentLoad: { value: number; score: number; description: string };
    debtStatus: { value: number; score: number; description: string };
  };
}

const WEIGHTS = {
  fixedCommitment: 35,
  expenseTrend: 20,
  installmentLoad: 25,
  debtStatus: 20,
};

function scoreFixedCommitment(fixedTotal: number, income: number): { value: number; score: number } {
  if (income <= 0) return { value: 0, score: 50 };
  const pct = (fixedTotal / income) * 100;
  if (pct < 50) return { value: pct, score: 100 };
  if (pct < 60) return { value: pct, score: 80 };
  if (pct < 70) return { value: pct, score: 60 };
  if (pct < 80) return { value: pct, score: 40 };
  return { value: pct, score: 10 };
}

function scoreExpenseTrend(
  monthlyExpenses: number[], // last 3 months, oldest first
): { value: string; score: number } {
  if (monthlyExpenses.length < 2) return { value: "insuficiente", score: 70 };

  const recent = monthlyExpenses[monthlyExpenses.length - 1];
  const previous = monthlyExpenses[monthlyExpenses.length - 2];
  if (previous <= 0) return { value: "estável", score: 70 };

  const change = ((recent - previous) / previous) * 100;
  if (change > 15) return { value: "subindo", score: 30 };
  if (change > 5) return { value: "subindo leve", score: 55 };
  if (change < -15) return { value: "descendo", score: 100 };
  if (change < -5) return { value: "descendo leve", score: 85 };
  return { value: "estável", score: 70 };
}

function scoreInstallmentLoad(
  activeInstallments: number,
  totalRemainingMonths: number,
): { value: number; score: number } {
  // Combined metric: count × average remaining duration
  const load = activeInstallments * (totalRemainingMonths / Math.max(activeInstallments, 1));
  if (activeInstallments === 0) return { value: 0, score: 100 };
  if (activeInstallments <= 2 && load <= 12) return { value: activeInstallments, score: 80 };
  if (activeInstallments <= 5 && load <= 30) return { value: activeInstallments, score: 60 };
  if (activeInstallments <= 8) return { value: activeInstallments, score: 40 };
  return { value: activeInstallments, score: 15 };
}

function scoreDebtStatus(debtAlertCount: number, haseCriticalDebt: boolean): { value: number; score: number } {
  if (debtAlertCount === 0) return { value: 0, score: 100 };
  if (haseCriticalDebt) return { value: debtAlertCount, score: 10 };
  return { value: debtAlertCount, score: 40 };
}

export function calculateFinancialScore({
  income,
  fixedExpensesTotal,
  installmentsTotal: _installmentsTotal,
  monthlyExpenses,
  activeInstallments,
  totalRemainingMonths,
  debtAlertCount,
  hasCriticalDebt,
}: {
  income: number;
  fixedExpensesTotal: number;
  installmentsTotal: number;
  monthlyExpenses: number[];
  activeInstallments: number;
  totalRemainingMonths: number;
  debtAlertCount: number;
  hasCriticalDebt: boolean;
}): FinancialScoreResult {
  const fc = scoreFixedCommitment(fixedExpensesTotal, income);
  const et = scoreExpenseTrend(monthlyExpenses);
  const il = scoreInstallmentLoad(activeInstallments, totalRemainingMonths);
  const ds = scoreDebtStatus(debtAlertCount, hasCriticalDebt);

  const score = Math.round(
    (fc.score * WEIGHTS.fixedCommitment +
      et.score * WEIGHTS.expenseTrend +
      il.score * WEIGHTS.installmentLoad +
      ds.score * WEIGHTS.debtStatus) / 100,
  );

  const level: FinancialLevel = score >= 70 ? "healthy" : score >= 40 ? "warning" : "critical";

  return {
    score,
    level,
    factors: {
      fixedCommitment: { ...fc, description: `${fc.value.toFixed(0)}% da renda em fixos` },
      expenseTrend: { ...et, description: `Tendência: ${et.value}` },
      installmentLoad: { ...il, description: `${il.value} parcelas ativas` },
      debtStatus: { ...ds, description: ds.value > 0 ? `${ds.value} alerta(s) de dívida` : "Sem dívidas" },
    },
  };
}
```

```typescript
// src/lib/financial-score.test.ts

import { describe, it, expect } from "vitest";
import { calculateFinancialScore } from "./financial-score";

describe("calculateFinancialScore", () => {
  it("healthy score for low commitment, no debt, no installments", () => {
    const result = calculateFinancialScore({
      income: 10000, fixedExpensesTotal: 4000, installmentsTotal: 0,
      monthlyExpenses: [5000, 5000, 5000],
      activeInstallments: 0, totalRemainingMonths: 0,
      debtAlertCount: 0, hasCriticalDebt: false,
    });
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.level).toBe("healthy");
  });

  it("critical score for high commitment + debt", () => {
    const result = calculateFinancialScore({
      income: 10000, fixedExpensesTotal: 9000, installmentsTotal: 3000,
      monthlyExpenses: [7000, 8500, 10000],
      activeInstallments: 10, totalRemainingMonths: 60,
      debtAlertCount: 2, hasCriticalDebt: true,
    });
    expect(result.score).toBeLessThan(40);
    expect(result.level).toBe("critical");
  });

  it("warning score for moderate situation", () => {
    const result = calculateFinancialScore({
      income: 10000, fixedExpensesTotal: 7000, installmentsTotal: 2000,
      monthlyExpenses: [6000, 6500, 7000],
      activeInstallments: 5, totalRemainingMonths: 25,
      debtAlertCount: 0, hasCriticalDebt: false,
    });
    expect(result.score).toBeGreaterThanOrEqual(40);
    expect(result.score).toBeLessThan(70);
    expect(result.level).toBe("warning");
  });

  it("handles zero income gracefully", () => {
    const result = calculateFinancialScore({
      income: 0, fixedExpensesTotal: 0, installmentsTotal: 0,
      monthlyExpenses: [], activeInstallments: 0, totalRemainingMonths: 0,
      debtAlertCount: 0, hasCriticalDebt: false,
    });
    expect(result.score).toBeGreaterThan(0);
  });

  it("includes factor descriptions in Portuguese", () => {
    const result = calculateFinancialScore({
      income: 10000, fixedExpensesTotal: 5000, installmentsTotal: 0,
      monthlyExpenses: [5000], activeInstallments: 3, totalRemainingMonths: 15,
      debtAlertCount: 0, hasCriticalDebt: false,
    });
    expect(result.factors.fixedCommitment.description).toContain("% da renda");
    expect(result.factors.installmentLoad.description).toContain("parcelas ativas");
  });
});
```

API and dashboard card follow established patterns.

**Verification**: `npx vitest run src/lib/financial-score.test.ts`

**On Failure**:
- If score calculation wrong: verify weights sum to 100
- If trend detection wrong: check monthlyExpenses order (oldest first)

---

#### 3. Adicionar FlexibilityType select no form de edição de categoria -- [x] DONE

**File**: `src/app/categories/page.tsx` (MODIFY)
**Complexity**: Low
**TDD**: NO (UI change, no decision logic)
**Depends On**: Phase 1 Task 1 (schema FlexibilityType)
- **Learning:** O form de edição de categorias é um Dialog inline em `src/app/categories/page.tsx`, nao um componente separado. O componente Select do Radix UI ja existia em `@/components/ui/select`.

**Load Before Implementing**:
1. `src/app/api/categories/[id]/route.ts` (lines 45-79) - PUT handler já atualizado
2. Localizar form de edição: grep "CategoryForm\|editCategory\|category.*edit\|category.*form" para encontrar

**Pre-conditions**:
- [ ] FlexibilityType enum exists in schema (Phase 1)
- [ ] PUT /api/categories/[id] accepts flexibilityType (Phase 1)

**Why**: Sem UI para classificar categorias, o campo FlexibilityType fica vazio e o relatório expandido (#57 Phase 4) não funciona. Este é o ponto de entrada do usuário para configurar a classificação.

**Acceptance Criteria**:
```gherkin
Given the category edit form is open
When the user sees the form
Then there is a FlexibilityType select with options: Essencial, Negociável, Variável, (vazio)

Given a category with flexibilityType "ESSENTIAL"
When the form loads
Then the select shows "Essencial" pre-selected

Given the user changes flexibilityType to "NEGOTIABLE" and saves
When the API responds 200
Then the category is updated and the form reflects the change
```

**Implementation**:

Add a Select field to the category edit form/dialog:
```tsx
// FlexibilityType select options
const flexibilityOptions = [
  { value: "", label: "Não classificada" },
  { value: "ESSENTIAL", label: "Essencial" },
  { value: "NEGOTIABLE", label: "Negociável" },
  { value: "VARIABLE", label: "Variável" },
];

// In the form JSX, after color/icon fields:
<div>
  <Label>Tipo de Flexibilidade</Label>
  <Select
    value={formData.flexibilityType || ""}
    onValueChange={(value) =>
      setFormData({ ...formData, flexibilityType: value || null })
    }
  >
    <SelectTrigger><SelectValue placeholder="Não classificada" /></SelectTrigger>
    <SelectContent>
      {flexibilityOptions.map((opt) => (
        <SelectItem key={opt.value || "empty"} value={opt.value || "none"}>
          {opt.label}
        </SelectItem>
      ))}
    </SelectContent>
  </Select>
</div>
```

Add `flexibilityType` to form state and PUT request body.

**Verification**: Visual verification — open category edit, see FlexibilityType dropdown

**On Failure**:
- If form component not found: grep for category editing patterns, may be inline dialog
- If Select components not available: check `@/components/ui/select` imports
- If save fails: verify PUT handler accepts `flexibilityType` field

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - All project checks pass (13/13 tests pass, TS clean, only pre-existing failures)

### Manual Verification
- [ ] Score cards render on dashboard with color-coded levels
- [x] FlexibilityType dropdown visible in category edit form (implemented in categories/page.tsx)
