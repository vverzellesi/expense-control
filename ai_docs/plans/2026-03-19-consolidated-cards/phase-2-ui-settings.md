# Phase 2: UI Completa + Settings

## Overview

Expandir o formulário de origins em Settings com seletor de tipo e campos financeiros condicionais, completar a UI da página `/cartoes` com barra proporcional e tabela comparativa de taxas, e adicionar testes de integração para o endpoint.

## Reference Docs for This Phase

- `src/app/settings/page.tsx` (linhas 78-84, 422-526, 989-1106) — Estado, handlers e UI de origins
- `src/app/cartoes/page.tsx` (full) — Página skeleton da Fase 1
- `src/lib/cards-summary.ts` (full) — Tipos e lógica de cálculo
- `tests/integration/setup.ts` (full) — Setup de testes de integração
- `tests/integration/api/summary.test.ts` (linhas 1-52) — Padrão de teste de integração
- `src/components/ui/select.tsx` — Select component API (Radix UI)

## Changes Required

#### 1. [x] Expandir formulário de origins em Settings com tipo e campos de cartão
- **Learning:** O formulário de edição inline precisou ser expandido para incluir seletor de tipo e campos financeiros condicionais. A API de origins já aceitava os novos campos (Phase 1), facilitando a integração. HTML entities usados para caracteres acentuados no JSX.

**File**: `src/app/settings/page.tsx` (MODIFY) + `src/types/index.ts` (MODIFY if needed)
**Complexity**: Medium
**TDD**: NO — UI form expansion with conditional fields, no decision logic.
**Depends On**: Phase 1 Task 1

**Load Before Implementing**:
1. `src/app/settings/page.tsx` (linhas 1-40) — Imports
2. `src/app/settings/page.tsx` (linhas 78-84) — Origin state variables
3. `src/app/settings/page.tsx` (linhas 422-526) — Origin handlers (add, edit, delete)
4. `src/app/settings/page.tsx` (linhas 989-1106) — Origin form UI
5. `src/types/index.ts` (linhas 77-90) — Origin and OriginType interfaces

**Pre-conditions**:
- [ ] Phase 1 complete (Origin model has type and financial fields)
- [ ] `src/app/settings/page.tsx` exists with origins tab
- [ ] API `POST /api/origins` and `PUT /api/origins` accept new fields

**Why**: O usuário precisa configurar quais origins são cartões de crédito e informar limite, taxas e dias de fechamento/vencimento para que a página `/cartoes` mostre dados financeiros completos.

**Acceptance Criteria**:
```gherkin
Given the origins tab in Settings
When user adds a new origin
Then a type selector appears with options: Cartão de Crédito, Débito, PIX, Outro
And default is "Outro"

Given the type selector set to "Cartão de Crédito"
When the form expands
Then fields for Limite, Rotativo (%), Parcelamento (%), CET Anual (%), Dia de Fechamento, Dia de Vencimento appear

Given an existing origin being edited
When user clicks edit
Then the edit form shows current type and financial fields populated
And user can change type and financial fields

Given type is NOT "Cartão de Crédito"
When looking at the add/edit form
Then financial fields are hidden
```

**Implementation**:

Add new state variables in Settings component. After line 84 (`const [deletingOrigin, ...`) add:

```typescript
  const [newOriginType, setNewOriginType] = useState<string>("OTHER");
  const [newOriginCreditLimit, setNewOriginCreditLimit] = useState("");
  const [newOriginRotativo, setNewOriginRotativo] = useState("");
  const [newOriginParcelamento, setNewOriginParcelamento] = useState("");
  const [newOriginCet, setNewOriginCet] = useState("");
  const [newOriginBillingDay, setNewOriginBillingDay] = useState("");
  const [newOriginDueDay, setNewOriginDueDay] = useState("");
  const [editOriginType, setEditOriginType] = useState<string>("OTHER");
  const [editOriginCreditLimit, setEditOriginCreditLimit] = useState("");
  const [editOriginRotativo, setEditOriginRotativo] = useState("");
  const [editOriginParcelamento, setEditOriginParcelamento] = useState("");
  const [editOriginCet, setEditOriginCet] = useState("");
  const [editOriginBillingDay, setEditOriginBillingDay] = useState("");
  const [editOriginDueDay, setEditOriginDueDay] = useState("");
```

Update `handleAddOrigin` (lines 436-443). Replace the fetch body:

```typescript
        body: JSON.stringify({
          name: newOriginName.trim(),
          type: newOriginType,
          creditLimit: newOriginCreditLimit ? parseFloat(newOriginCreditLimit) : null,
          rotativoRateMonth: newOriginRotativo ? parseFloat(newOriginRotativo) : null,
          parcelamentoRate: newOriginParcelamento ? parseFloat(newOriginParcelamento) : null,
          cetAnual: newOriginCet ? parseFloat(newOriginCet) : null,
          billingCycleDay: newOriginBillingDay ? parseInt(newOriginBillingDay) : null,
          dueDateDay: newOriginDueDay ? parseInt(newOriginDueDay) : null,
        }),
```

After the `setNewOriginName("")` reset (line 455), add resets:

```typescript
      setNewOriginType("OTHER");
      setNewOriginCreditLimit("");
      setNewOriginRotativo("");
      setNewOriginParcelamento("");
      setNewOriginCet("");
      setNewOriginBillingDay("");
      setNewOriginDueDay("");
```

Update `handleEditOrigin` (lines 471-477). Replace the fetch body:

```typescript
        body: JSON.stringify({
          name: editOriginName.trim(),
          type: editOriginType,
          creditLimit: editOriginCreditLimit ? parseFloat(editOriginCreditLimit) : null,
          rotativoRateMonth: editOriginRotativo ? parseFloat(editOriginRotativo) : null,
          parcelamentoRate: editOriginParcelamento ? parseFloat(editOriginParcelamento) : null,
          cetAnual: editOriginCet ? parseFloat(editOriginCet) : null,
          billingCycleDay: editOriginBillingDay ? parseInt(editOriginBillingDay) : null,
          dueDateDay: editOriginDueDay ? parseInt(editOriginDueDay) : null,
        }),
```

Update the `setEditingOrigin` call (lines 1082-1085) to also populate financial fields:

```typescript
                              onClick={() => {
                                setEditingOrigin(origin);
                                setEditOriginName(origin.name);
                                setEditOriginType(origin.type || "OTHER");
                                setEditOriginCreditLimit(origin.creditLimit?.toString() || "");
                                setEditOriginRotativo(origin.rotativoRateMonth?.toString() || "");
                                setEditOriginParcelamento(origin.parcelamentoRate?.toString() || "");
                                setEditOriginCet(origin.cetAnual?.toString() || "");
                                setEditOriginBillingDay(origin.billingCycleDay?.toString() || "");
                                setEditOriginDueDay(origin.dueDateDay?.toString() || "");
                              }}
```

Replace the add origin form (lines 999-1014) with:

```tsx
              <form onSubmit={handleAddOrigin} className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <Input
                      value={newOriginName}
                      onChange={(e) => setNewOriginName(e.target.value)}
                      placeholder="Nome da origem"
                      className="min-h-[44px]"
                    />
                  </div>
                  <div className="w-full sm:w-48">
                    <Select value={newOriginType} onValueChange={setNewOriginType}>
                      <SelectTrigger className="min-h-[44px]">
                        <SelectValue placeholder="Tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CREDIT_CARD">Cartão de Crédito</SelectItem>
                        <SelectItem value="DEBIT">Débito</SelectItem>
                        <SelectItem value="PIX">PIX</SelectItem>
                        <SelectItem value="OTHER">Outro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {newOriginType === "CREDIT_CARD" && (
                  <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 p-4 bg-gray-50 rounded-lg">
                    <div>
                      <Label className="text-xs text-gray-500">Limite (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newOriginCreditLimit}
                        onChange={(e) => setNewOriginCreditLimit(e.target.value)}
                        placeholder="5000"
                        className="min-h-[36px]"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Rotativo (%/mês)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newOriginRotativo}
                        onChange={(e) => setNewOriginRotativo(e.target.value)}
                        placeholder="14.50"
                        className="min-h-[36px]"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Parcelamento (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newOriginParcelamento}
                        onChange={(e) => setNewOriginParcelamento(e.target.value)}
                        placeholder="4.49"
                        className="min-h-[36px]"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">CET Anual (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={newOriginCet}
                        onChange={(e) => setNewOriginCet(e.target.value)}
                        placeholder="84.42"
                        className="min-h-[36px]"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Dia fechamento</Label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={newOriginBillingDay}
                        onChange={(e) => setNewOriginBillingDay(e.target.value)}
                        placeholder="15"
                        className="min-h-[36px]"
                      />
                    </div>
                    <div>
                      <Label className="text-xs text-gray-500">Dia vencimento</Label>
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={newOriginDueDay}
                        onChange={(e) => setNewOriginDueDay(e.target.value)}
                        placeholder="22"
                        className="min-h-[36px]"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-end">
                  <Button type="submit" disabled={originSaving} className="w-full sm:w-auto min-h-[44px]">
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
              </form>
```

In the origin card list, update the display to show origin type badge. Replace the `<Wallet>` icon + name span (lines 1073-1076) with:

```tsx
                            <div className="flex items-center gap-3 min-w-0 flex-1">
                              <Wallet className="h-4 w-4 text-gray-500 flex-shrink-0" />
                              <div className="min-w-0">
                                <span className="font-medium truncate block">{origin.name}</span>
                                {origin.type === "CREDIT_CARD" && (
                                  <span className="text-xs text-emerald-600">Cartão de Crédito</span>
                                )}
                              </div>
                            </div>
```

**Verification**: `npm run build`

**On Failure**:
- If Select component not found: Verify import from `@/components/ui/select`
- If Label not found: Verify import from `@/components/ui/label` (already imported at line 8)
- If origin.type is undefined: Ensure GET /api/origins returns the new fields (Phase 1 Task 1)

---

#### 2. [x] Completar UI da página `/cartoes` com barra proporcional e cards detalhados
- **Learning:** Recharts BarChart com layout="vertical" e stackOffset="expand" funciona bem para barra proporcional. O componente ProportionalBar foi extraído como componente separado para manter o código organizado.

**File**: `src/app/cartoes/page.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO — UI rendering with Recharts, no decision logic.
**Depends On**: Phase 1 Task 3

**Load Before Implementing**:
1. `src/app/cartoes/page.tsx` (full) — Current skeleton page
2. `src/components/Charts/CategoryPieChart.tsx` (full) — Recharts pattern
3. `src/lib/cards-summary.ts` (types section) — CardSummary types
4. `src/components/Charts/OriginsPieChart.tsx` (full) — Another Recharts example

**Pre-conditions**:
- [ ] Phase 1 Task 3 complete (skeleton page exists)
- [ ] `recharts` package installed (already in project)

**Why**: A barra proporcional mostra visualmente o peso de cada cartão no total. Os cards detalhados completam o breakdown de cada cartão. Ambos são core da feature conforme o design aprovado.

**Acceptance Criteria**:
```gherkin
Given multiple credit cards with transactions
When the page loads
Then a horizontal stacked bar shows the proportion of each card
And each segment has a color and shows card name + percentage

Given a card with breakdown data
When viewing the card
Then it shows total, parcelas, gastos novos, fixos with values
And limit progress bar appears when creditLimit is set
And projection section shows estimated next month when > 0
```

**Implementation**:

Replace the entire `src/app/cartoes/page.tsx` with the complete UI (this replaces the Phase 1 skeleton). The complete implementation adds:

1. A proportional stacked bar using Recharts `BarChart` with horizontal layout
2. Enhanced card grid with full breakdown details
3. Color assignments per card

Add imports at the top:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Wallet, Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { CardsSummaryResponse, CardSummary } from "@/lib/cards-summary";
```

Add the CARD_COLORS constant and the proportional bar component before the main component:

```tsx
const CARD_COLORS = [
  "#10B981", // emerald
  "#3B82F6", // blue
  "#F59E0B", // amber
  "#8B5CF6", // violet
  "#EF4444", // red
  "#06B6D4", // cyan
  "#EC4899", // pink
  "#F97316", // orange
];

function ProportionalBar({ cards, totalAllCards }: { cards: CardSummary[]; totalAllCards: number }) {
  if (totalAllCards === 0) return null;

  const barData = [
    cards.reduce(
      (acc, card, i) => {
        acc[card.name] = card.currentMonth.total;
        return acc;
      },
      {} as Record<string, number>
    ),
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Distribuição por Cartão</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={50}>
          <BarChart data={barData} layout="vertical" stackOffset="expand" barSize={32}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              formatter={(value: number, name: string) => [
                `${formatCurrency(value)} (${Math.round((value / totalAllCards) * 100)}%)`,
                name,
              ]}
            />
            {cards.map((card, i) => (
              <Bar key={card.id} dataKey={card.name} stackId="a" fill={CARD_COLORS[i % CARD_COLORS.length]} radius={i === 0 ? [4, 0, 0, 4] : i === cards.length - 1 ? [0, 4, 4, 0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3">
          {cards.map((card, i) => (
            <div key={card.id} className="flex items-center gap-1.5 text-sm">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: CARD_COLORS[i % CARD_COLORS.length] }}
              />
              <span className="text-gray-600">
                {card.name} ({totalAllCards > 0 ? Math.round((card.currentMonth.total / totalAllCards) * 100) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

The main component structure remains the same from Phase 1 skeleton but with the ProportionalBar added between the total card and the grid. Insert `<ProportionalBar>` after the total card:

```tsx
          {/* Proportional Bar */}
          <ProportionalBar cards={data.cards} totalAllCards={data.totals.totalAllCards} />
```

The full card grid remains as in Phase 1 (already has breakdown, progress, projection). No changes needed to individual cards.

**Verification**: `npm run build`

**On Failure**:
- If Recharts import fails: Verify `recharts` is in `package.json` dependencies (it is)
- If BarChart layout="vertical" doesn't work: Use horizontal BarChart with custom rendering
- If Tooltip type error: Cast `value` parameter explicitly

---

#### 3. [x] Tabela comparativa de taxas, banner de onboarding, e testes de integração
- **Learning:** Os testes de integração usam `vitest.integration.config.ts` (não o config padrão). O mock de prisma precisa cobrir origin.findMany, transaction.findMany (chamado 2x), e recurringExpense.findMany. O cálculo de limitUsedPercent arredonda para 2 casas decimais internamente.

**File**: `src/app/cartoes/page.tsx` (MODIFY) + `tests/integration/api/cards-summary.test.ts` (CREATE)
**Complexity**: High
**TDD**: YES (for integration tests)
**Depends On**: Task 2

**Load Before Implementing**:
1. `src/app/cartoes/page.tsx` (full) — Current page to add table and banner
2. `tests/integration/setup.ts` (full) — Integration test setup
3. `tests/integration/api/summary.test.ts` (linhas 1-52) — Test pattern reference
4. `src/lib/cards-summary.ts` (full) — Types and function to test

**Pre-conditions**:
- [ ] Task 2 complete (full page UI exists)
- [ ] `tests/integration/api/` directory exists
- [ ] `tests/integration/setup.ts` exists

**Why**: A tabela comparativa de taxas é o diferencial que permite ao usuário escolher o melhor cartão para parcelar. O banner de onboarding guia usuários que ainda não preencheram taxas. Testes de integração garantem que o endpoint funciona corretamente com mocks.

**Acceptance Criteria**:
```gherkin
Given no credit card has rates configured
When viewing the cards page
Then a banner appears suggesting to configure rates in Settings
And the rates table is NOT shown

Given at least one credit card has rates configured
When viewing the cards page
Then a comparison table shows: Cartão, Rotativo, Parcelamento, CET Anual, Melhor para
And the card with lowest parcelamentoRate shows "Melhor para parcelar"
And cells without data show "—"

Given authenticated request with credit card origins and transactions
When GET /api/cards/summary?month=3&year=2026 is called
Then response contains cards with currentMonth, projection, and rates data
And totals are calculated correctly

Given no credit card origins exist
When GET /api/cards/summary is called
Then response has empty cards array and zero totals
```

**Implementation**:

Add the rates table and banner components to `src/app/cartoes/page.tsx`. Add after the cards grid (before the closing `</>` of the else branch):

```tsx
          {/* Rates Banner or Table */}
          {(() => {
            const hasAnyRates = data.cards.some(
              (c) => c.rates.rotativoRateMonth !== null || c.rates.parcelamentoRate !== null || c.rates.cetAnual !== null
            );

            if (!hasAnyRates) {
              return (
                <Card className="border-dashed border-amber-300 bg-amber-50">
                  <CardContent className="flex items-center gap-3 p-6">
                    <Info className="h-5 w-5 text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        Configure as taxas dos seus cartões
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Vá em Configurações → Origens e edite cada cartão para informar taxas de juros. Isso permite comparar custos entre cartões.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            // Find best card for installments (lowest parcelamentoRate)
            const cardsWithParcelamento = data.cards.filter((c) => c.rates.parcelamentoRate !== null);
            const bestForParcelamento = cardsWithParcelamento.length > 0
              ? cardsWithParcelamento.reduce((best, c) =>
                  (c.rates.parcelamentoRate ?? Infinity) < (best.rates.parcelamentoRate ?? Infinity) ? c : best
                )
              : null;

            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Comparativo de Taxas</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium text-gray-500">Cartão</th>
                          <th className="text-right py-2 px-4 font-medium text-gray-500">Rotativo (%/mês)</th>
                          <th className="text-right py-2 px-4 font-medium text-gray-500">Parcelamento (%)</th>
                          <th className="text-right py-2 px-4 font-medium text-gray-500">CET Anual (%)</th>
                          <th className="text-left py-2 pl-4 font-medium text-gray-500">Melhor para</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cards.map((card) => (
                          <tr key={card.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium">{card.name}</td>
                            <td className="text-right py-2 px-4 text-gray-600">
                              {card.rates.rotativoRateMonth !== null ? `${card.rates.rotativoRateMonth}%` : "—"}
                            </td>
                            <td className="text-right py-2 px-4 text-gray-600">
                              {card.rates.parcelamentoRate !== null ? `${card.rates.parcelamentoRate}%` : "—"}
                            </td>
                            <td className="text-right py-2 px-4 text-gray-600">
                              {card.rates.cetAnual !== null ? `${card.rates.cetAnual}%` : "—"}
                            </td>
                            <td className="py-2 pl-4">
                              {bestForParcelamento?.id === card.id && (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                  Parcelar
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
```

Create `tests/integration/api/cards-summary.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import "../setup"; // Mocks auth (getAuthContext, etc.)

// Mock prisma with inline factory
vi.mock("@/lib/db", () => ({
  default: {
    origin: {
      findMany: vi.fn(),
    },
    transaction: {
      findMany: vi.fn(),
    },
    recurringExpense: {
      findMany: vi.fn(),
    },
  },
}));

// Import route handler and prisma mock after mocking
import { GET } from "@/app/api/cards/summary/route";
import prisma from "@/lib/db";

// Type assertion for mocked prisma
const mockPrisma = prisma as unknown as {
  origin: { findMany: ReturnType<typeof vi.fn> };
  transaction: { findMany: ReturnType<typeof vi.fn> };
  recurringExpense: { findMany: ReturnType<typeof vi.fn> };
};

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, "http://localhost:3000"));
}

describe("GET /api/cards/summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty cards when no credit card origins exist", async () => {
    mockPrisma.origin.findMany.mockResolvedValue([]);

    const response = await GET(createRequest("/api/cards/summary?month=3&year=2026"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cards).toEqual([]);
    expect(data.totals.totalAllCards).toBe(0);
    expect(data.totals.projectedNextMonth).toBe(0);
  });

  it("returns card summary with breakdown for current month", async () => {
    mockPrisma.origin.findMany.mockResolvedValue([
      {
        id: "card-1",
        name: "Cartão C6",
        type: "CREDIT_CARD",
        creditLimit: 5000,
        billingCycleDay: 15,
        dueDateDay: 22,
        rotativoRateMonth: 14.5,
        parcelamentoRate: 4.49,
        cetAnual: 84.42,
      },
    ]);

    // Current month transactions
    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([
        // Current month transactions
        { origin: "Cartão C6", amount: -200, isInstallment: true, isFixed: false },
        { origin: "Cartão C6", amount: -150, isInstallment: false, isFixed: true },
        { origin: "Cartão C6", amount: -100, isInstallment: false, isFixed: false },
      ])
      .mockResolvedValueOnce([
        // Future installments for next month
        { origin: "Cartão C6", amount: -200 },
      ]);

    mockPrisma.recurringExpense.findMany.mockResolvedValue([
      { origin: "Cartão C6", defaultAmount: -150 },
    ]);

    const response = await GET(createRequest("/api/cards/summary?month=3&year=2026"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cards).toHaveLength(1);

    const card = data.cards[0];
    expect(card.name).toBe("Cartão C6");
    expect(card.currentMonth.total).toBe(450);
    expect(card.currentMonth.installmentTotal).toBe(200);
    expect(card.currentMonth.fixedTotal).toBe(150);
    expect(card.currentMonth.newExpenseTotal).toBe(100);
    expect(card.currentMonth.transactionCount).toBe(3);
    expect(card.currentMonth.limitUsedPercent).toBe(9);
    expect(card.currentMonth.status).toBe("healthy");

    // Projection
    expect(card.projection.installmentTotal).toBe(200);
    expect(card.projection.fixedTotal).toBe(150);
    expect(card.projection.estimatedTotal).toBe(350);

    // Rates
    expect(card.rates.rotativoRateMonth).toBe(14.5);
    expect(card.rates.parcelamentoRate).toBe(4.49);

    // Totals
    expect(data.totals.totalAllCards).toBe(450);
    expect(data.totals.projectedNextMonth).toBe(350);
  });

  it("returns critical status when limit is over 80%", async () => {
    mockPrisma.origin.findMany.mockResolvedValue([
      {
        id: "card-1",
        name: "Cartão C6",
        type: "CREDIT_CARD",
        creditLimit: 1000,
        billingCycleDay: null,
        dueDateDay: null,
        rotativoRateMonth: null,
        parcelamentoRate: null,
        cetAnual: null,
      },
    ]);

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([
        { origin: "Cartão C6", amount: -900, isInstallment: false, isFixed: false },
      ])
      .mockResolvedValueOnce([]);

    mockPrisma.recurringExpense.findMany.mockResolvedValue([]);

    const response = await GET(createRequest("/api/cards/summary?month=3&year=2026"));
    const data = await response.json();

    expect(data.cards[0].currentMonth.status).toBe("critical");
    expect(data.cards[0].currentMonth.limitUsedPercent).toBe(90);
  });

  it("handles card without credit limit", async () => {
    mockPrisma.origin.findMany.mockResolvedValue([
      {
        id: "card-1",
        name: "Cartão C6",
        type: "CREDIT_CARD",
        creditLimit: null,
        billingCycleDay: null,
        dueDateDay: null,
        rotativoRateMonth: null,
        parcelamentoRate: null,
        cetAnual: null,
      },
    ]);

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([
        { origin: "Cartão C6", amount: -500, isInstallment: false, isFixed: false },
      ])
      .mockResolvedValueOnce([]);

    mockPrisma.recurringExpense.findMany.mockResolvedValue([]);

    const response = await GET(createRequest("/api/cards/summary?month=3&year=2026"));
    const data = await response.json();

    expect(data.cards[0].currentMonth.limitUsedPercent).toBeNull();
    expect(data.cards[0].currentMonth.status).toBe("healthy");
  });

  it("uses current month when no params provided", async () => {
    mockPrisma.origin.findMany.mockResolvedValue([]);

    const response = await GET(createRequest("/api/cards/summary"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.cards).toEqual([]);
  });
});
```

**Verification**: `npx vitest run tests/integration/api/cards-summary.test.ts`

**On Failure**:
- If import path errors: Verify `@/app/api/cards/summary/route` exists (created in Phase 1 Task 2)
- If mock doesn't work: Ensure `vi.mock('@/lib/db')` is before imports of the route handler
- If type errors on mock: Adjust the mockPrisma type assertion to match the queries used in cards-summary.ts

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` — Build compila, typecheck passa (1 erro pré-existente em csv-parser.test.ts), 5/5 testes de integração passam, 10/10 testes unitários passam

### Manual Verification
- [ ] Barra proporcional renderiza com cores distintas por cartão
- [ ] Settings permite configurar tipo e taxas de cartão de crédito
