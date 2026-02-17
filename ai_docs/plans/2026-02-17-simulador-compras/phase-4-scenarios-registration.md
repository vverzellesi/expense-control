# Phase 4: Cenarios + Registro de Compra

## Overview

Adiciona comparacao automatica de 3 cenarios (a vista, parcelado escolhido, parcelado longo), dialog de registro de compra que converte simulacao em transacao real, e barra de acoes (salvar, registrar, descartar). Ao final: feature completa - usuario simula, compara cenarios, e registra compra real.

## Reference Docs for This Phase
- `src/lib/simulation-engine.ts` - Calculation engine to reuse for scenarios
- `src/app/api/transactions/route.ts` (lines 250-310) - Installment creation logic
- `src/app/simulador/page.tsx` - Current page state
- `src/components/ui/dialog.tsx` - Dialog component
- `src/components/ui/alert-dialog.tsx` - AlertDialog for confirmations
- `src/types/index.ts` (search for `Simulation`) - Type

## Changes Required

#### 1. Create scenario generation logic and ScenarioComparison component -- DONE

- [x] Task 1 complete
  - **Learning:** `generateScenarios` reuses `calculateSimulation` per scenario config. The "recommended" badge logic uses tightestMonth.freeBalance as the decision metric. When totalInstallments >= 24, only 2 scenarios are generated (a vista + chosen) since long-term would duplicate.

**File**: `src/lib/simulation-engine.ts` (MODIFY), `src/components/simulator/ScenarioComparison.tsx` (CREATE)
**Complexity**: High
**TDD**: YES (for generation logic)
**Depends On**: none (extends simulation engine)

**Load Before Implementing**:
1. `src/lib/simulation-engine.ts` (full file) - `calculateSimulation` and types
2. `src/types/index.ts` (search for `BaselineMonth`) - Input types
3. `src/components/ui/card.tsx` - Card, CardContent
4. `src/components/ui/badge.tsx` - Badge component

**Pre-conditions**:
- [ ] `calculateSimulation` works correctly (Phase 2)
- [ ] `BaselineMonth` type available

**Why**: Auto-generates 3 comparison scenarios so user can see trade-offs between paying upfront vs. more installments. Core decision-making feature of the simulator.

**Acceptance Criteria**:
```gherkin
Given a simulation of R$3000 in 6x
When scenarios are generated
Then scenario 1 is "A vista" (1x R$3000)
And scenario 2 is "6x (escolhido)" (6x R$500)
And scenario 3 is "12x" (12x R$250)

Given 3 generated scenarios
When one has negative free balance in any month
Then that scenario gets a "Risco" badge (red)

Given 3 generated scenarios
When comparing minimum free balance across all months
Then the scenario with highest minimum gets "Recomendado" badge (emerald)

Given the user clicks a scenario card
When the scenario is different from current form
Then onSelectScenario is called to update the form installments
```

**Implementation**:

Add to `src/lib/simulation-engine.ts`:
```typescript
export interface Scenario {
  id: string;
  name: string;
  totalAmount: number;
  totalInstallments: number;
  monthlyAmount: number;
  tightestMonth: { label: string; freeBalance: number } | null;
  avgCommitment: number;
  isOriginal: boolean;
  hasRisk: boolean;
  isRecommended: boolean;
}

export function generateScenarios(
  totalAmount: number,
  totalInstallments: number,
  baseline: BaselineMonth[],
  averageIncome: number,
): Scenario[] {
  if (totalAmount <= 0 || totalInstallments <= 0) return [];

  const longInstallments = Math.min(totalInstallments * 2, 24);
  const configs = [
    { name: "A vista", installments: 1 },
    { name: `${totalInstallments}x (escolhido)`, installments: totalInstallments },
    ...(totalInstallments > 1 && longInstallments !== totalInstallments
      ? [{ name: `${longInstallments}x`, installments: longInstallments }]
      : []),
  ];

  const scenarios: Scenario[] = configs.map((config, i) => {
    const monthlyAmount = totalAmount / config.installments;
    const result = calculateSimulation(baseline, averageIncome, [
      { totalAmount, totalInstallments: config.installments, isActive: true },
    ]);

    return {
      id: `scenario-${i}`,
      name: config.name,
      totalAmount,
      totalInstallments: config.installments,
      monthlyAmount,
      tightestMonth: result.tightestMonth,
      avgCommitment: result.commitmentAfter,
      isOriginal: i === 1,
      hasRisk: result.months.some((m) => m.isOverBudget),
      isRecommended: false,
    };
  });

  // Mark recommended: highest minimum free balance
  let bestIdx = 0;
  let bestMinBalance = -Infinity;
  for (let i = 0; i < scenarios.length; i++) {
    const minBalance = scenarios[i].tightestMonth?.freeBalance ?? Infinity;
    if (minBalance > bestMinBalance) {
      bestMinBalance = minBalance;
      bestIdx = i;
    }
  }
  if (scenarios.length > 0) {
    scenarios[bestIdx].isRecommended = true;
  }

  return scenarios;
}
```

`src/components/simulator/ScenarioComparison.tsx`:
```typescript
"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Scenario } from "@/lib/simulation-engine";

interface ScenarioComparisonProps {
  scenarios: Scenario[];
  onSelectScenario: (totalInstallments: number) => void;
}

export function ScenarioComparison({ scenarios, onSelectScenario }: ScenarioComparisonProps) {
  if (scenarios.length === 0) return null;

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-3">Comparacao de cenarios</h3>
      <div className="grid gap-4 md:grid-cols-3">
        {scenarios.map((scenario) => (
          <Card
            key={scenario.id}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              scenario.isOriginal && "border-emerald-500 border-2",
            )}
            onClick={() => onSelectScenario(scenario.totalInstallments)}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900">{scenario.name}</h4>
                <div className="flex gap-1">
                  {scenario.hasRisk && (
                    <Badge variant="destructive" className="text-xs">
                      Risco
                    </Badge>
                  )}
                  {scenario.isRecommended && (
                    <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                      Recomendado
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Parcela:</span>
                  <span className="font-medium">
                    {formatCurrency(scenario.monthlyAmount)}/mes
                  </span>
                </div>
                {scenario.tightestMonth && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Mes mais apertado:</span>
                    <span className={cn(
                      "font-medium",
                      scenario.tightestMonth.freeBalance < 0 ? "text-red-600" : "text-gray-900"
                    )}>
                      {scenario.tightestMonth.label}
                    </span>
                  </div>
                )}
                {scenario.tightestMonth && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Saldo no pior mes:</span>
                    <span className={cn(
                      "font-medium",
                      scenario.tightestMonth.freeBalance < 0 ? "text-red-600" : "text-gray-900"
                    )}>
                      {formatCurrency(scenario.tightestMonth.freeBalance)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Comprometimento:</span>
                  <span className={cn(
                    "font-medium",
                    scenario.avgCommitment > 100 ? "text-red-600" :
                    scenario.avgCommitment > 80 ? "text-yellow-600" : "text-gray-900"
                  )}>
                    {scenario.avgCommitment.toFixed(0)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Verification**: `npm run test:unit -- --grep "generateScenarios"`

**On Failure**:
- If scenarios empty: Verify totalAmount > 0 and totalInstallments > 0
- If Badge import fails: Check `@/components/ui/badge` exists and exports `Badge`

---

#### 2. Create RegisterPurchaseDialog and action bar -- DONE

- [x] Task 2 complete
  - **Learning:** Dialog sends `amount = totalAmount / totalInstallments` (per-installment amount) to POST /api/transactions, matching the API's expectation. SimulatorActions uses sticky bottom positioning for persistent visibility.

**File**: `src/components/simulator/RegisterPurchaseDialog.tsx` (CREATE), `src/components/simulator/SimulatorActions.tsx` (CREATE)
**Complexity**: Medium
**TDD**: NO (UI dialog)
**Depends On**: Task 1

**Load Before Implementing**:
1. `src/app/api/transactions/route.ts` (lines 250-310) - How installments are created
2. `src/components/ui/dialog.tsx` - Dialog component API
3. `src/components/ui/input.tsx` - Input component
4. `src/components/ui/select.tsx` - Select component
5. `src/lib/utils.ts` - `formatCurrency`

**Pre-conditions**:
- [ ] Task 1 complete (ScenarioComparison exists)
- [ ] Phase 1-3 complete (page has form state, saved simulations)

**Why**: Converts a simulation into a real transaction using the existing POST /api/transactions endpoint. Shows confirmation dialog with editable fields (date, origin, category) before creating.

**Acceptance Criteria**:
```gherkin
Given a user clicks "Registrar compra"
When the dialog opens
Then it shows simulation summary: description, amount, installments
And pre-filled fields: date (today), origin (empty), category (from simulation)

Given a user confirms the registration
When POST /api/transactions is called
Then isInstallment=true if totalInstallments > 1
And amount = totalAmount / totalInstallments (per installment)
And totalInstallments is set correctly

Given the transaction is created successfully
When the response is 201
Then the simulation is removed from saved list (if saved)
And user is redirected to /dashboard with success toast

Given the user cancels
When the dialog closes
Then no transaction is created
```

**Implementation**:

`src/components/simulator/RegisterPurchaseDialog.tsx`:
```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import type { Category } from "@/types";

interface RegisterPurchaseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  description: string;
  totalAmount: number;
  totalInstallments: number;
  categoryId: string;
  categories: Category[];
  onSuccess: () => void;
}

export function RegisterPurchaseDialog({
  open,
  onOpenChange,
  description,
  totalAmount,
  totalInstallments,
  categoryId: initialCategoryId,
  categories,
  onSuccess,
}: RegisterPurchaseDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [origin, setOrigin] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState(initialCategoryId);

  const installmentAmount = totalAmount / totalInstallments;

  async function handleRegister() {
    setLoading(true);
    try {
      const isInstallment = totalInstallments > 1;

      const body: Record<string, unknown> = {
        description,
        amount: installmentAmount,
        date,
        type: "EXPENSE",
        origin: origin || "Simulador",
        categoryId: selectedCategoryId || null,
        isFixed: false,
        isInstallment,
      };

      if (isInstallment) {
        body.totalInstallments = totalInstallments;
        body.installmentAmount = installmentAmount;
      }

      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro ao registrar compra");
      }

      toast({ title: "Compra registrada com sucesso!" });
      onSuccess();
      router.push("/dashboard");
    } catch (error) {
      toast({
        title: "Erro ao registrar compra",
        description: error instanceof Error ? error.message : "Tente novamente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Registrar compra</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Summary */}
          <div className="rounded-lg bg-gray-50 p-4">
            <p className="font-medium text-gray-900">{description}</p>
            <p className="text-sm text-gray-500 mt-1">
              {totalInstallments > 1
                ? `${totalInstallments}x ${formatCurrency(installmentAmount)} (total: ${formatCurrency(totalAmount)})`
                : formatCurrency(totalAmount)}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-date">Data da primeira parcela</Label>
            <Input
              id="reg-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-origin">Origem / Banco</Label>
            <Input
              id="reg-origin"
              placeholder="Ex: Cartao Nubank"
              value={origin}
              onChange={(e) => setOrigin(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-category">Categoria</Label>
            <Select value={selectedCategoryId} onValueChange={setSelectedCategoryId}>
              <SelectTrigger id="reg-category">
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleRegister} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
            {loading ? "Registrando..." : "Confirmar compra"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

`src/components/simulator/SimulatorActions.tsx`:
```typescript
"use client";

import { Button } from "@/components/ui/button";
import { ShoppingCart, Save, Trash2 } from "lucide-react";

interface SimulatorActionsProps {
  hasSimulation: boolean;
  isSaved: boolean;
  onSave: () => void;
  onRegister: () => void;
  onDiscard: () => void;
}

export function SimulatorActions({
  hasSimulation,
  isSaved,
  onSave,
  onRegister,
  onDiscard,
}: SimulatorActionsProps) {
  if (!hasSimulation) return null;

  return (
    <div className="sticky bottom-0 border-t bg-white p-4 -mx-4 md:-mx-6 flex gap-3 justify-end">
      <Button variant="ghost" onClick={onDiscard} className="text-gray-500">
        <Trash2 className="h-4 w-4 mr-2" />
        Descartar
      </Button>
      {!isSaved && (
        <Button variant="outline" onClick={onSave}>
          <Save className="h-4 w-4 mr-2" />
          Salvar simulacao
        </Button>
      )}
      <Button onClick={onRegister} className="bg-emerald-600 hover:bg-emerald-700">
        <ShoppingCart className="h-4 w-4 mr-2" />
        Registrar compra
      </Button>
    </div>
  );
}
```

**Verification**: `npm run build`

**On Failure**:
- If Dialog imports fail: Check `@/components/ui/dialog` exports (DialogFooter may not exist - use `div` with flex)
- If `useToast` path wrong: Grep for `useToast` to find correct import path
- If transaction creation fails: Check amount is per-installment (not total)

---

#### 3. Wire scenarios, registration dialog, and action bar into page -- DONE

- [x] Task 3 complete
  - **Learning:** The plan referenced `debouncedInstallments` but the page only debounces amount (not installments). Used `totalInstallments` directly since installment changes are from slider/select (not rapid typing). Kept the existing edit-mode buttons (Atualizar/Cancelar) alongside the new action bar since they serve different flows.

**File**: `src/app/simulador/page.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO (state wiring)
**Depends On**: Task 1, Task 2

**Load Before Implementing**:
1. `src/app/simulador/page.tsx` (full file) - Current page
2. `src/components/simulator/ScenarioComparison.tsx` (full file) - Component API
3. `src/components/simulator/RegisterPurchaseDialog.tsx` (full file) - Component API
4. `src/components/simulator/SimulatorActions.tsx` (full file) - Component API
5. `src/lib/simulation-engine.ts` (search for `generateScenarios`) - Function signature

**Pre-conditions**:
- [ ] Task 1 complete (ScenarioComparison, generateScenarios)
- [ ] Task 2 complete (RegisterPurchaseDialog, SimulatorActions)
- [ ] Phase 3 complete (saved simulations, chips)

**Why**: Final integration. Wires scenario generation from form state, register dialog open/close state, and action bar. Connects "Register Purchase" flow end-to-end: dialog -> POST /api/transactions -> remove saved -> redirect.

**Acceptance Criteria**:
```gherkin
Given the user has filled a simulation form
When totalAmount > 0 and totalInstallments >= 1
Then ScenarioComparison shows 3 scenarios below the chart
And SimulatorActions bar appears at bottom

Given the user clicks a scenario card
When the scenario has different installments
Then the form's totalInstallments updates to match
And chart/cards recalculate with new installments

Given the user clicks "Registrar compra"
When the dialog opens and user confirms
Then POST /api/transactions creates the installment transaction
And if simulation was saved, DELETE /api/simulations/:id removes it
And user is redirected to /dashboard

Given the user clicks "Descartar"
When the form had data
Then all form fields are cleared and simulation removed from display
```

**Implementation**:

Add to page imports:
```typescript
import { generateScenarios, Scenario } from "@/lib/simulation-engine";
import { ScenarioComparison } from "@/components/simulator/ScenarioComparison";
import { RegisterPurchaseDialog } from "@/components/simulator/RegisterPurchaseDialog";
import { SimulatorActions } from "@/components/simulator/SimulatorActions";
```

Add state:
```typescript
const [showRegisterDialog, setShowRegisterDialog] = useState(false);
```

Add scenarios memo:
```typescript
const scenarios = useMemo(() => {
  if (!simulationData || debouncedAmount <= 0) return [];
  return generateScenarios(
    debouncedAmount,
    debouncedInstallments,
    simulationData.months,
    simulationData.averageIncome,
  );
}, [simulationData, debouncedAmount, debouncedInstallments]);
```

Add handlers:
```typescript
function handleSelectScenario(newInstallments: number) {
  setTotalInstallments(newInstallments);
}

async function handleRegisterSuccess() {
  // Remove from saved simulations if it was saved
  if (selectedSimulationId) {
    await fetch(`/api/simulations/${selectedSimulationId}`, { method: "DELETE" });
    setSavedSimulations((prev) => prev.filter((s) => s.id !== selectedSimulationId));
  }
  setShowRegisterDialog(false);
}
```

Add to JSX (after chart, before closing div):
```tsx
{/* Scenarios comparison */}
{scenarios.length > 0 && (
  <ScenarioComparison
    scenarios={scenarios}
    onSelectScenario={handleSelectScenario}
  />
)}

{/* Register Purchase Dialog */}
<RegisterPurchaseDialog
  open={showRegisterDialog}
  onOpenChange={setShowRegisterDialog}
  description={description}
  totalAmount={totalAmount}
  totalInstallments={totalInstallments}
  categoryId={categoryId}
  categories={categories}
  onSuccess={handleRegisterSuccess}
/>

{/* Action bar */}
<SimulatorActions
  hasSimulation={totalAmount > 0 && description.length > 0}
  isSaved={!!selectedSimulationId}
  onSave={handleSave}
  onRegister={() => setShowRegisterDialog(true)}
  onDiscard={handleNew}
/>
```

**Verification**: `npm run build`

**On Failure**:
- If generateScenarios import fails: Check export in simulation-engine.ts
- If Dialog doesn't close after success: Ensure handleRegisterSuccess sets showRegisterDialog to false
- If redirect doesn't work: Check `useRouter` is imported from `next/navigation`

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - All project checks pass (build OK, 25/25 simulation tests pass, 5 pre-existing timezone failures in utils.test.ts ignored per context)

### Manual Verification
- [ ] 3 scenario cards appear when simulation has value
- [ ] Clicking a scenario updates form installments and recalculates
- [ ] "Registrar compra" opens dialog with correct summary
- [ ] Confirming creates transaction and redirects to dashboard
- [ ] "Descartar" clears form and removes simulation from display
