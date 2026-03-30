# Phase 2: Alertas no Dashboard

## Overview

Implementar os 3 cards de alerta no dashboard: alertas de parcelas (começando/acabando), alerta de ciclo de endividamento, e detecção de cobranças duplicadas. Cada alerta tem API própria e renderização condicional (só aparece quando há dados).

## Reference Docs for This Phase
- `src/app/api/bill-payments/route.ts` (lines 7-56) - GET handler de BillPayment
- `src/app/api/summary/route.ts` (lines 234-339) - Padrão de queries
- `src/types/index.ts` (lines 398-416) - BillPayment interface
- `src/app/dashboard/page.tsx` (lines 37-77, 109-128) - SummaryData e fetch
- `src/lib/merchant-normalizer.ts` - normalizeMerchant (criado na Phase 1)
- `ai_docs/research/2026-03-29-insights-analytics-research.md` - Sections 4, 11

## Changes Required

#### 1. Criar API de installment-alerts + card no dashboard [DONE]

**File**: `src/app/api/insights/installment-alerts/route.ts` (CREATE), `src/app/dashboard/page.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO (API wiring + component, queries verified via integration)
**Depends On**: none
- **Learning:** handleApiError requer segundo parâmetro (context string). Validação defensiva no dashboard necessária para compatibilidade com mocks de teste que retornam shape diferente.

**Load Before Implementing**:
1. `src/app/api/summary/route.ts` (lines 234-339) - Query pattern
2. `src/app/dashboard/page.tsx` (lines 37-77) - SummaryData, state pattern
3. `src/types/index.ts` (lines 59-64) - Transaction/Installment types

**Pre-conditions**:
- [ ] Directory `src/app/api/insights/` exists (created in Phase 1)

**Why**: Alertas de parcelas (issue #71) informam quando uma parcela acaba (liberando orçamento) ou começa (comprometendo). Alto valor, baixo esforço.

**Acceptance Criteria**:
```gherkin
Given a transaction with currentInstallment=10 and totalInstallments=10 in the current month
When the installment-alerts API is called
Then it returns an "ending" alert with description and freed amount per month

Given a transaction with currentInstallment=1 in the current month
When the installment-alerts API is called
Then it returns a "starting" alert with description and committed amount per month

Given no installments starting or ending this month
When the installment-alerts API is called
Then it returns empty arrays for both ending and starting

Given the dashboard loads and there are installment alerts
When alerts are available
Then an InstallmentAlertsCard renders with bell icon and alert list
```

**Implementation**:

```typescript
// src/app/api/insights/installment-alerts/route.ts

import { getAuthContext, handleApiError } from "@/lib/auth-utils";
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

    // Find installment transactions in the current month
    const installmentTxs = await prisma.transaction.findMany({
      where: {
        ...ctx.ownerFilter,
        isInstallment: true,
        type: "EXPENSE",
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
      },
      include: { category: true, installment: true },
    });

    const ending: Array<{
      description: string;
      currentInstallment: number;
      totalInstallments: number;
      monthlyAmount: number;
      categoryName: string | null;
    }> = [];

    const starting: Array<{
      description: string;
      currentInstallment: number;
      totalInstallments: number;
      monthlyAmount: number;
      totalCommitment: number;
      endDate: string;
      categoryName: string | null;
    }> = [];

    for (const tx of installmentTxs) {
      const total = tx.installment?.totalInstallments || tx.totalInstallments;
      const current = tx.currentInstallment;
      if (!total || !current) continue;

      const monthlyAmount = Math.abs(tx.amount);

      if (current === total) {
        ending.push({
          description: tx.description,
          currentInstallment: current,
          totalInstallments: total,
          monthlyAmount,
          categoryName: tx.category?.name || null,
        });
      }

      if (current === 1) {
        const remainingMonths = total - 1;
        const endMonth = new Date(year, month - 1 + remainingMonths, 1);
        starting.push({
          description: tx.description,
          currentInstallment: current,
          totalInstallments: total,
          monthlyAmount,
          totalCommitment: monthlyAmount * total,
          endDate: endMonth.toISOString(),
          categoryName: tx.category?.name || null,
        });
      }
    }

    return NextResponse.json({ ending, starting });
  } catch (error) {
    return handleApiError(error);
  }
}
```

Dashboard card — add fetch + conditional card with bell icon, lists ending and starting alerts with formatted amounts. Pattern:
```tsx
// State: installmentAlerts: { ending: [...], starting: [...] } | null
// Fetch: /api/insights/installment-alerts?month=X&year=Y
// Render conditionally when ending.length > 0 || starting.length > 0
// Card border-blue-500, Bell icon
// Ending: "Parcela X (10/10) termina. Libera {formatCurrency(amount)}/mês"
// Starting: "Nova parcela: X — compromete {formatCurrency(amount)}/mês até {date}"
```

**Verification**: `curl -s http://localhost:3000/api/insights/installment-alerts?month=3&year=2026 | jq .`

**On Failure**:
- If empty results: verify test data has installment transactions with currentInstallment set
- If auth fails: verify getAuthContext import

---

#### 2. Criar debt-detector.ts com testes + API + card de endividamento [DONE]

**File**: `src/lib/debt-detector.ts` (CREATE), `src/lib/debt-detector.test.ts` (CREATE), `src/app/api/insights/debt-alert/route.ts` (CREATE), `src/app/dashboard/page.tsx` (MODIFY)
**Complexity**: High
**TDD**: YES
**Depends On**: none
- **Learning:** Map iteration com `for...of` requer `Array.from(map.entries())` no target ES5 do TypeScript (strict mode). Parâmetros de callback em `.sort()` e `.find()` precisam de tipos explícitos.

**Load Before Implementing**:
1. `src/types/index.ts` (lines 398-416) - BillPayment interface
2. `src/app/api/bill-payments/route.ts` (lines 7-56) - BillPayment GET pattern
3. `src/app/api/summary/route.ts` (lines 234-339) - Auth and query pattern

**Pre-conditions**:
- [ ] BillPayment model exists in database
- [ ] Directory `src/app/api/insights/` exists

**Why**: Alerta de endividamento (issue #58) detecta o padrão mais perigoso: parcelar fatura repetidamente. Detecção precoce pode evitar meses de sofrimento financeiro. Alta prioridade no milestone.

**Acceptance Criteria**:
```gherkin
Given BillPayments for origin "C6" with paymentType "FINANCED" in 3 consecutive months
When analyzeDebtPattern is called
Then severity is "critical" and consecutiveMonths is 3

Given BillPayments for origin "Itaú" always paid in full (no BillPayment records)
When analyzeDebtPattern is called
Then no alert is generated for that origin

Given mixed BillPayments: month 1 PARTIAL, month 2 full, month 3 PARTIAL
When analyzeDebtPattern is called
Then no consecutive pattern detected (reset on full payment)

Given BillPayments with growing amountCarried over 3 months
When analyzeDebtPattern is called
Then the alert includes the growth trend data
```

**Implementation**:

```typescript
// src/lib/debt-detector.ts

export type DebtSeverity = "warning" | "critical";

export interface DebtAlert {
  origin: string;
  severity: DebtSeverity;
  consecutiveMonths: number;
  installmentPercentages: number[]; // % of bill that are installments per month
  amountCarriedTrend: number[]; // amountCarried over the months
  totalCarried: number;
  recommendation: string;
}

interface BillPaymentData {
  billMonth: number;
  billYear: number;
  origin: string;
  totalBillAmount: number;
  amountPaid: number;
  amountCarried: number;
  paymentType: string; // "PARTIAL" | "FINANCED"
}

export function analyzeDebtPattern(
  billPayments: BillPaymentData[],
  currentMonth: number,
  currentYear: number,
): DebtAlert[] {
  // Group by origin
  const byOrigin = new Map<string, BillPaymentData[]>();
  for (const bp of billPayments) {
    const existing = byOrigin.get(bp.origin) || [];
    existing.push(bp);
    byOrigin.set(bp.origin, existing);
  }

  const alerts: DebtAlert[] = [];

  for (const [origin, payments] of byOrigin) {
    // Sort by date (newest first)
    const sorted = payments.sort((a, b) => {
      const dateA = a.billYear * 12 + a.billMonth;
      const dateB = b.billYear * 12 + b.billMonth;
      return dateB - dateA;
    });

    // Count consecutive months with PARTIAL or FINANCED from most recent
    let consecutiveMonths = 0;
    const installmentPercentages: number[] = [];
    const amountCarriedTrend: number[] = [];

    // Check last 6 months backwards (usar Date para evitar bugs em boundaries de ano)
    for (let i = 0; i < 6; i++) {
      const targetDate = new Date(currentYear, currentMonth - 1 - i, 1);
      const normalizedMonth = targetDate.getMonth() + 1;
      const targetYear = targetDate.getFullYear();

      const payment = sorted.find(
        (p) => p.billMonth === normalizedMonth && p.billYear === targetYear,
      );

      if (payment && (payment.paymentType === "PARTIAL" || payment.paymentType === "FINANCED")) {
        consecutiveMonths++;
        const pct = payment.totalBillAmount > 0
          ? (payment.amountCarried / payment.totalBillAmount) * 100
          : 0;
        installmentPercentages.push(Math.round(pct));
        amountCarriedTrend.push(payment.amountCarried);
      } else {
        break; // Consecutive streak broken
      }
    }

    if (consecutiveMonths >= 2) {
      const severity: DebtSeverity = consecutiveMonths >= 3 ? "critical" : "warning";
      const totalCarried = amountCarriedTrend[0] || 0; // Most recent

      const recommendation = severity === "critical"
        ? "Para quebrar o ciclo, pague a fatura integral por 2 meses consecutivos."
        : "Atenção: fatura parcelada por 2 meses seguidos. Tente pagar integral no próximo mês.";

      alerts.push({
        origin,
        severity,
        consecutiveMonths,
        installmentPercentages: installmentPercentages.reverse(),
        amountCarriedTrend: amountCarriedTrend.reverse(),
        totalCarried,
        recommendation,
      });
    }
  }

  return alerts.sort((a, b) => {
    if (a.severity === "critical" && b.severity !== "critical") return -1;
    if (b.severity === "critical" && a.severity !== "critical") return 1;
    return b.consecutiveMonths - a.consecutiveMonths;
  });
}
```

```typescript
// src/lib/debt-detector.test.ts

import { describe, it, expect } from "vitest";
import { analyzeDebtPattern } from "./debt-detector";

describe("analyzeDebtPattern", () => {
  it("detects critical pattern with 3+ consecutive financed months", () => {
    const payments = [
      { billMonth: 1, billYear: 2026, origin: "C6", totalBillAmount: 5000, amountPaid: 3000, amountCarried: 2000, paymentType: "FINANCED" },
      { billMonth: 2, billYear: 2026, origin: "C6", totalBillAmount: 5500, amountPaid: 3000, amountCarried: 2500, paymentType: "FINANCED" },
      { billMonth: 3, billYear: 2026, origin: "C6", totalBillAmount: 6000, amountPaid: 3000, amountCarried: 3000, paymentType: "PARTIAL" },
    ];

    const alerts = analyzeDebtPattern(payments, 3, 2026);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].consecutiveMonths).toBe(3);
    expect(alerts[0].origin).toBe("C6");
  });

  it("detects warning with 2 consecutive months", () => {
    const payments = [
      { billMonth: 2, billYear: 2026, origin: "Itaú", totalBillAmount: 3000, amountPaid: 2000, amountCarried: 1000, paymentType: "PARTIAL" },
      { billMonth: 3, billYear: 2026, origin: "Itaú", totalBillAmount: 3500, amountPaid: 2000, amountCarried: 1500, paymentType: "PARTIAL" },
    ];

    const alerts = analyzeDebtPattern(payments, 3, 2026);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("warning");
    expect(alerts[0].consecutiveMonths).toBe(2);
  });

  it("returns no alert when streak is broken by full payment", () => {
    const payments = [
      { billMonth: 1, billYear: 2026, origin: "C6", totalBillAmount: 3000, amountPaid: 2000, amountCarried: 1000, paymentType: "PARTIAL" },
      // Month 2: paid in full (no BillPayment record)
      { billMonth: 3, billYear: 2026, origin: "C6", totalBillAmount: 3000, amountPaid: 2000, amountCarried: 1000, paymentType: "PARTIAL" },
    ];

    const alerts = analyzeDebtPattern(payments, 3, 2026);
    // Only month 3 is consecutive (month 2 has no record = full payment)
    expect(alerts).toHaveLength(0);
  });

  it("returns empty for no bill payments", () => {
    expect(analyzeDebtPattern([], 3, 2026)).toEqual([]);
  });

  it("sorts critical before warning", () => {
    const payments = [
      { billMonth: 2, billYear: 2026, origin: "A", totalBillAmount: 1000, amountPaid: 500, amountCarried: 500, paymentType: "PARTIAL" },
      { billMonth: 3, billYear: 2026, origin: "A", totalBillAmount: 1000, amountPaid: 500, amountCarried: 500, paymentType: "PARTIAL" },
      { billMonth: 1, billYear: 2026, origin: "B", totalBillAmount: 2000, amountPaid: 1000, amountCarried: 1000, paymentType: "FINANCED" },
      { billMonth: 2, billYear: 2026, origin: "B", totalBillAmount: 2000, amountPaid: 1000, amountCarried: 1000, paymentType: "FINANCED" },
      { billMonth: 3, billYear: 2026, origin: "B", totalBillAmount: 2000, amountPaid: 1000, amountCarried: 1000, paymentType: "FINANCED" },
    ];

    const alerts = analyzeDebtPattern(payments, 3, 2026);
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].origin).toBe("B");
  });

  it("includes amount carried trend", () => {
    const payments = [
      { billMonth: 1, billYear: 2026, origin: "X", totalBillAmount: 5000, amountPaid: 3000, amountCarried: 2000, paymentType: "FINANCED" },
      { billMonth: 2, billYear: 2026, origin: "X", totalBillAmount: 5500, amountPaid: 3000, amountCarried: 2500, paymentType: "FINANCED" },
      { billMonth: 3, billYear: 2026, origin: "X", totalBillAmount: 6000, amountPaid: 3000, amountCarried: 3000, paymentType: "FINANCED" },
    ];

    const alerts = analyzeDebtPattern(payments, 3, 2026);
    expect(alerts[0].amountCarriedTrend).toEqual([2000, 2500, 3000]);
  });
});
```

API route (`src/app/api/insights/debt-alert/route.ts`):
```typescript
// Query BillPayments from last 6 months for the user
// Call analyzeDebtPattern(payments, currentMonth, currentYear)
// Return { alerts: DebtAlert[] }
```

Dashboard card — conditional, border-red for critical, border-orange for warning:
```tsx
// Render only when debtAlerts.length > 0
// Title: "Alerta de Endividamento" with AlertTriangle icon
// Per alert: origin name, severity badge, consecutive months count
// "Nos últimos {n} meses, {origin}: {percentages}"
// Recommendation text
```

**Verification**: `npx vitest run src/lib/debt-detector.test.ts`

**On Failure**:
- If month normalization wrong: check modulo arithmetic for year boundaries
- If no alerts returned: verify BillPayment test data has PARTIAL/FINANCED paymentType
- If sorting wrong: verify severity comparison logic

---

#### 3. Criar API de duplicates + card no dashboard [DONE]

**File**: `src/app/api/insights/duplicates/route.ts` (CREATE), `src/app/dashboard/page.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO (simple aggregation query, tested via integration)
**Depends On**: Phase 1 Task 2 (merchant-normalizer)

**Load Before Implementing**:
1. `src/lib/merchant-normalizer.ts` - normalizeMerchant function (Phase 1)
2. `src/app/api/summary/route.ts` (lines 234-339) - Query and auth pattern
3. `src/app/dashboard/page.tsx` (lines 37-77) - State pattern

**Pre-conditions**:
- [ ] `src/lib/merchant-normalizer.ts` exists (Phase 1)
- [ ] Directory `src/app/api/insights/` exists

**Why**: Detecção de cobranças duplicadas (issue #71) ajuda o usuário a identificar cobranças indevidas. Mesmo valor + merchant normalizado similar + mesmo mês = flag para revisão.

**Acceptance Criteria**:
```gherkin
Given two transactions with same amount and same normalized merchant in the same month
When the duplicates API is called
Then they appear as a duplicate group

Given transactions with different amounts but same merchant
When the duplicates API is called
Then they are NOT flagged as duplicates

Given no duplicate patterns in the month
When the duplicates API is called
Then it returns an empty array
```

**Implementation**:

```typescript
// src/app/api/insights/duplicates/route.ts

import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import { normalizeMerchant } from "@/lib/merchant-normalizer";
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

    const transactions = await prisma.transaction.findMany({
      where: {
        ...ctx.ownerFilter,
        type: "EXPENSE",
        isInstallment: false, // Excluir parcelas (falso positivo)
        deletedAt: null,
        date: { gte: startDate, lte: endDate },
        investmentTransaction: null,
      },
      select: { id: true, description: true, amount: true, date: true, origin: true },
    });

    // Group by normalized merchant + amount
    const groups = new Map<string, typeof transactions>();
    for (const tx of transactions) {
      const key = `${normalizeMerchant(tx.description)}|${Math.abs(tx.amount).toFixed(2)}`;
      const existing = groups.get(key) || [];
      existing.push(tx);
      groups.set(key, existing);
    }

    // Filter groups with 2+ transactions (potential duplicates)
    const duplicates = Array.from(groups.entries())
      .filter(([, txs]) => txs.length >= 2)
      .map(([key, txs]) => {
        const [merchant] = key.split("|");
        return {
          merchant,
          amount: Math.abs(txs[0].amount),
          count: txs.length,
          transactions: txs.map((t) => ({
            id: t.id,
            description: t.description,
            date: t.date,
            origin: t.origin,
          })),
        };
      })
      .sort((a, b) => b.amount - a.amount);

    return NextResponse.json({ duplicates });
  } catch (error) {
    return handleApiError(error);
  }
}
```

Dashboard card — conditional, border-amber:
```tsx
// State: duplicates: { duplicates: DuplicateGroup[] } | null
// Render only when duplicates.length > 0
// Title: "Possíveis Cobranças Duplicadas" with AlertCircle icon
// Per group: merchant name, amount, count, dates
// "Revise: {merchant} cobrado {count}x por {formatCurrency(amount)}"
```

**Verification**: `npx vitest run src/lib/merchant-normalizer.test.ts` (dependency verified)

**On Failure**:
- If normalizeMerchant not found: verify Phase 1 created the file
- If no duplicates found: this is expected with varied data — test with intentional duplicates
- If grouping wrong: verify key format uses normalized merchant + absolute amount

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - All project checks pass (typecheck clean, 485/488 tests pass, 3 pre-existing failures in recurring/page.test.tsx)

### Manual Verification
- [ ] Alert cards render conditionally on dashboard (only when data exists)
