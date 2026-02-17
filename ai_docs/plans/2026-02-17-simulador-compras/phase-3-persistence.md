# Phase 3: Persistencia + Multi-Simulacao

## Overview

Adiciona CRUD de simulacoes salvas no banco (API), componente de chips para gerenciar a lista de desejos, e logica cumulativa para multiplas simulacoes ativas no grafico. Ao final: usuario salva/carrega/toggle multiplas simulacoes, com efeito cumulativo visivel no grafico.

## Reference Docs for This Phase
- `prisma/schema.prisma` (search for `Simulation`) - Model criado na Phase 1
- `src/app/api/transactions/route.ts` (lines 1-50) - CRUD API pattern
- `src/app/simulador/page.tsx` - Pagina atual
- `src/lib/simulation-engine.ts` - Calculation engine (accepts multiple SimulationInput)
- `src/types/index.ts` (search for `Simulation`) - Type definition

## Changes Required

#### 1. Create CRUD API endpoints for simulations -- [x] DONE

**File**: `src/app/api/simulations/route.ts` (CREATE), `src/app/api/simulations/[id]/route.ts` (CREATE)
**Complexity**: Medium
**TDD**: YES
**Depends On**: none (uses Prisma Simulation model from Phase 1)
- **Learning:** Integration test pattern follows bill-payments.test.ts exactly. `Promise.resolve({ id })` pattern works for Next.js 14 dynamic route params in tests. Added `simulation` model to shared mock prisma client.

**Load Before Implementing**:
1. `src/app/api/transactions/route.ts` (lines 1-95) - CRUD pattern with auth
2. `src/lib/auth-utils.ts` (full file) - Auth helpers
3. `src/lib/db.ts` (full file) - Prisma client
4. `prisma/schema.prisma` (search for `model Simulation`) - Model fields

**Pre-conditions**:
- [ ] Simulation model exists in Prisma schema
- [ ] `npm run db:push` has been run (table exists)

**Why**: Enables persistence of simulations (lista de desejos). Users save simulations to compare later or convert to real purchases.

**Acceptance Criteria**:
```gherkin
Given an authenticated user
When POST /api/simulations with valid body {description, totalAmount, totalInstallments, categoryId?}
Then a new Simulation is created and returned with status 201

Given an authenticated user with saved simulations
When GET /api/simulations
Then all simulations for that user are returned ordered by createdAt desc

Given an authenticated user
When PATCH /api/simulations/:id with {isActive: false}
Then the simulation's isActive is updated

Given an authenticated user
When DELETE /api/simulations/:id
Then the simulation is deleted

Given an unauthenticated request
When any simulation endpoint is called
Then response status is 401
```

**Implementation**:

`src/app/api/simulations/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();

    const simulations = await prisma.simulation.findMany({
      where: { userId },
      include: { category: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(simulations);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching simulations:", error);
    return NextResponse.json({ error: "Erro ao buscar simulacoes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const body = await request.json();

    const { description, totalAmount, totalInstallments, categoryId } = body;

    if (!description || !totalAmount || !totalInstallments) {
      return NextResponse.json(
        { error: "Descricao, valor total e parcelas sao obrigatorios" },
        { status: 400 },
      );
    }

    const simulation = await prisma.simulation.create({
      data: {
        description,
        totalAmount: parseFloat(totalAmount),
        totalInstallments: parseInt(totalInstallments),
        categoryId: categoryId || null,
        userId,
      },
      include: { category: true },
    });

    return NextResponse.json(simulation, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error creating simulation:", error);
    return NextResponse.json({ error: "Erro ao criar simulacao" }, { status: 500 });
  }
}
```

`src/app/api/simulations/[id]/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getAuthenticatedUserId();
    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.simulation.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Simulacao nao encontrada" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};
    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.totalAmount !== undefined) updateData.totalAmount = parseFloat(body.totalAmount);
    if (body.totalInstallments !== undefined) updateData.totalInstallments = parseInt(body.totalInstallments);
    if (body.categoryId !== undefined) updateData.categoryId = body.categoryId || null;

    const updated = await prisma.simulation.update({
      where: { id },
      data: updateData,
      include: { category: true },
    });

    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error updating simulation:", error);
    return NextResponse.json({ error: "Erro ao atualizar simulacao" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const userId = await getAuthenticatedUserId();
    const { id } = await params;

    const existing = await prisma.simulation.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Simulacao nao encontrada" }, { status: 404 });
    }

    await prisma.simulation.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error deleting simulation:", error);
    return NextResponse.json({ error: "Erro ao deletar simulacao" }, { status: 500 });
  }
}
```

**Verification**: `npm run test:unit -- --grep "simulations"`

**On Failure**:
- If Prisma errors: Verify `npm run db:push` was run after Phase 1
- If `params` type error in [id] route: Check Next.js 14 dynamic route param pattern (may need `Promise<{id: string}>`)
- If 404 on existing simulation: Ensure `userId` filter is included in findFirst

---

#### 2. Create SimulationChips component for saved simulations -- [x] DONE

**File**: `src/components/simulator/SimulationChips.tsx` (CREATE)
**Complexity**: Medium
**TDD**: NO (UI component)
**Depends On**: Task 1
- **Learning:** lucide-react `Check`, `Plus`, `X` icons all available. Component compiles cleanly with build verification.

**Load Before Implementing**:
1. `src/types/index.ts` (search for `Simulation`) - Simulation type
2. `src/components/ui/badge.tsx` - Badge component for chip styling
3. `src/components/ui/button.tsx` - Button component

**Pre-conditions**:
- [ ] Task 1 complete (API endpoints exist)
- [ ] `Simulation` type exists in `src/types/index.ts`

**Why**: UI for managing saved simulations as chips. Each chip shows simulation name, toggle for active/inactive, X to delete. Supports selecting a chip to load into form, and cumulative toggle for chart.

**Acceptance Criteria**:
```gherkin
Given a user has 3 saved simulations
When SimulationChips renders
Then 3 chips are displayed plus a "+ Nova simulacao" chip

Given a chip is clicked
When the chip is not currently selected
Then onSelect is called with that simulation's data

Given the toggle on a chip is clicked
When the simulation was active
Then onToggle is called with the simulation id and isActive=false

Given the X on a chip is clicked
When confirmed
Then onDelete is called with the simulation id

Given "+ Nova simulacao" is clicked
When any simulation was selected
Then onNew is called to clear the form
```

**Implementation**:
```typescript
"use client";

import { X, Plus, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/utils";
import type { Simulation } from "@/types";

interface SimulationChipsProps {
  simulations: Simulation[];
  selectedId: string | null;
  onSelect: (simulation: Simulation) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

export function SimulationChips({
  simulations,
  selectedId,
  onSelect,
  onToggle,
  onDelete,
  onNew,
}: SimulationChipsProps) {
  if (simulations.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {simulations.map((sim) => (
        <div
          key={sim.id}
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
            selectedId === sim.id
              ? "border-emerald-500 bg-emerald-50"
              : "border-gray-200 bg-white hover:border-gray-300",
            !sim.isActive && "opacity-50",
          )}
        >
          {/* Toggle checkbox */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggle(sim.id, !sim.isActive);
            }}
            className={cn(
              "flex h-4 w-4 items-center justify-center rounded border",
              sim.isActive
                ? "border-emerald-500 bg-emerald-500 text-white"
                : "border-gray-300",
            )}
          >
            {sim.isActive && <Check className="h-3 w-3" />}
          </button>

          {/* Chip label */}
          <button
            onClick={() => onSelect(sim)}
            className="truncate max-w-[150px]"
            title={`${sim.description} - ${formatCurrency(sim.totalAmount)} em ${sim.totalInstallments}x`}
          >
            {sim.description}
          </button>

          {/* Delete button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete(sim.id);
            }}
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}

      {/* New simulation chip */}
      <button
        onClick={onNew}
        className="flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-500 hover:border-emerald-400 hover:text-emerald-600 transition-colors"
      >
        <Plus className="h-3.5 w-3.5" />
        Nova simulacao
      </button>
    </div>
  );
}
```

**Verification**: `npm run build`

**On Failure**:
- If `Check` icon not found: Verify lucide-react exports it (may need `CheckIcon`)
- If truncation doesn't work: Ensure parent has defined width

---

#### 3. Wire multi-simulation state and cumulative effect in page -- [x] DONE

**File**: `src/app/simulador/page.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO (state management wiring)
**Depends On**: Task 1, Task 2
- **Learning:** `useToast` import from `@/components/ui/use-toast` works. Simulations fetch is added alongside existing data/categories fetch in parallel. Save button shows "Atualizar simulacao" vs "Salvar simulacao" contextually. Added "Cancelar edicao" ghost button when editing.

**Load Before Implementing**:
1. `src/app/simulador/page.tsx` (full file) - Current page state
2. `src/components/simulator/SimulationChips.tsx` (full file) - Chips component
3. `src/lib/simulation-engine.ts` (full file) - `calculateSimulation` accepts multiple inputs
4. `src/types/index.ts` (search for `Simulation`) - Type

**Pre-conditions**:
- [ ] Task 1 complete (API endpoints)
- [ ] Task 2 complete (SimulationChips component)
- [ ] Phase 2 complete (simulation engine, cards, chart)

**Why**: Integrates saved simulations into the page. Fetches from API, manages selection state, passes all active simulations (saved + current form) to calculation engine for cumulative chart effect.

**Acceptance Criteria**:
```gherkin
Given a user has 2 saved active simulations and fills the form with a 3rd
When the chart renders
Then all 3 simulations' installments are stacked cumulatively

Given a user toggles a saved simulation to inactive
When the chart re-renders
Then that simulation's installments are removed from the stack

Given a user clicks a saved simulation chip
When the form loads
Then description, amount, installments, and category are populated from that simulation

Given a user clicks "+ Nova simulacao"
When the form was populated from a saved simulation
Then all form fields are cleared

Given a user clicks "Salvar simulacao"
When the form has valid data
Then POST /api/simulations is called and the chip appears in the list
```

**Implementation**:

Key state additions to `src/app/simulador/page.tsx`:
```typescript
import { SimulationChips } from "@/components/simulator/SimulationChips";
import type { Simulation } from "@/types";
import { useToast } from "@/components/ui/use-toast";

// New state
const [savedSimulations, setSavedSimulations] = useState<Simulation[]>([]);
const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
const { toast } = useToast();

// Fetch saved simulations in useEffect (alongside existing fetches)
const simRes = await fetch("/api/simulations");
const sims = await simRes.json();
setSavedSimulations(sims);

// Build combined simulation inputs for calculation
const simulationInputs = useMemo(() => {
  const inputs = savedSimulations
    .map((s) => ({
      totalAmount: s.totalAmount,
      totalInstallments: s.totalInstallments,
      isActive: s.isActive,
    }));

  // Add current form as unsaved simulation (if not editing a saved one)
  if (debouncedAmount > 0 && !selectedSimulationId) {
    inputs.push({
      totalAmount: debouncedAmount,
      totalInstallments: totalInstallments,
      isActive: true,
    });
  }

  return inputs;
}, [savedSimulations, debouncedAmount, totalInstallments, selectedSimulationId]);

// Update calculation to use all inputs
const simulationResult = useMemo(() => {
  if (!simulationData || simulationInputs.length === 0) return null;
  const hasActive = simulationInputs.some((s) => s.isActive && s.totalAmount > 0);
  if (!hasActive) return null;
  return calculateSimulation(simulationData.months, simulationData.averageIncome, simulationInputs);
}, [simulationData, simulationInputs]);

// Handlers
async function handleSave() {
  if (!description || totalAmount <= 0) return;
  try {
    const isEditing = !!selectedSimulationId;
    const url = isEditing
      ? `/api/simulations/${selectedSimulationId}`
      : "/api/simulations";
    const method = isEditing ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, totalAmount, totalInstallments, categoryId: categoryId || null }),
    });
    if (!res.ok) throw new Error("Failed to save");
    const saved = await res.json();

    if (isEditing) {
      setSavedSimulations((prev) =>
        prev.map((s) => (s.id === saved.id ? saved : s)),
      );
    } else {
      setSavedSimulations((prev) => [saved, ...prev]);
    }
    handleNew();
    toast({ title: isEditing ? "Simulacao atualizada" : "Simulacao salva" });
  } catch {
    toast({ title: "Erro ao salvar simulacao", variant: "destructive" });
  }
}

async function handleToggle(id: string, isActive: boolean) {
  try {
    await fetch(`/api/simulations/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive }),
    });
    setSavedSimulations((prev) =>
      prev.map((s) => (s.id === id ? { ...s, isActive } : s)),
    );
  } catch {
    toast({ title: "Erro ao atualizar", variant: "destructive" });
  }
}

async function handleDelete(id: string) {
  try {
    await fetch(`/api/simulations/${id}`, { method: "DELETE" });
    setSavedSimulations((prev) => prev.filter((s) => s.id !== id));
    if (selectedSimulationId === id) handleNew();
  } catch {
    toast({ title: "Erro ao deletar", variant: "destructive" });
  }
}

function handleSelect(sim: Simulation) {
  setSelectedSimulationId(sim.id);
  setDescription(sim.description);
  setTotalAmount(sim.totalAmount);
  setTotalInstallments(sim.totalInstallments);
  setCategoryId(sim.categoryId || "");
}

function handleNew() {
  setSelectedSimulationId(null);
  setDescription("");
  setTotalAmount(0);
  setTotalInstallments(1);
  setCategoryId("");
}
```

Add chips and save button in JSX (between form and cards):
```tsx
<SimulationChips
  simulations={savedSimulations}
  selectedId={selectedSimulationId}
  onSelect={handleSelect}
  onToggle={handleToggle}
  onDelete={handleDelete}
  onNew={handleNew}
/>
```

Add save button in the form section or as an action:
```tsx
<Button
  variant="outline"
  onClick={handleSave}
  disabled={!description || totalAmount <= 0}
>
  Salvar simulacao
</Button>
```

**Verification**: `npm run build`

**On Failure**:
- If `useToast` not found: Check import path (may be `@/components/ui/use-toast` or `@/hooks/use-toast`)
- If fetch fails silently: Add error logging in catch blocks
- If saved simulations don't appear: Verify GET /api/simulations returns array

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` - All project checks pass (build OK, 12/12 integration tests pass, unit tests pass except pre-existing timezone failures)

### Manual Verification
- [ ] Save a simulation -> chip appears in the list
- [ ] Toggle chip off -> simulation removed from chart calculation
- [ ] Toggle chip on -> simulation added back to chart
- [ ] Click chip -> form populates with saved data
- [ ] Multiple active simulations show cumulative effect in chart
