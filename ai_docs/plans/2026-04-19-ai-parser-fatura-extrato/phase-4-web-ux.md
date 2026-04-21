# Phase 4: UX Web (badge de quota + indicadores)

## Overview

Adicionar feedback visual do novo sistema de IA na UI de import:
1. Badge de quota no step `upload` (antes de enviar) — mostra "IA: 3/5 usos este mês · reseta em 12 dias"
2. Indicador de fonte no step `preview` — "✨ Extraído com IA" (AI) ou "⚠️ Usando parser tradicional — revise" (fallback)

Isolar a lógica num componente novo `<AiQuotaBadge />` e outro `<ParseSourceBadge />` pra não inchar ainda mais o `import/page.tsx` (2269 linhas).

## Reference Docs for This Phase

- `src/app/import/page.tsx` — página de import (vai receber os dois componentes)
- `src/app/import/page.tsx:179-180` — hooks de estado (`step`, `transactions`)
- `src/app/import/page.tsx:1307-1445` — bloco `step === "upload"` (onde entra o badge de quota)
- `src/app/import/page.tsx:1446-...` — bloco `step === "preview"` (onde entra o indicador de source)
- `src/components/ui/badge.tsx`, `src/components/ui/card.tsx` — primitivos UI (shadcn/ui)
- Phase 3 Task 3.3: response do `/api/ocr` já inclui `source` e `usedFallback`
- Phase 1 Task 1.6: `GET /api/ai-usage`

## Changes Required

---

### Task 4.1: Escrever testes do componente `<AiQuotaBadge />`

**Files:**
- Create: `src/components/ai/AiQuotaBadge.test.tsx`

**Complexity:** Medium
**TDD:** YES
**Depends On:** Phase 1 completa

**Why:** Componente faz fetch + renderização condicional; testes cobrem loading, sucesso, quota zero, erro.

- [x] **Step 1: Criar arquivo de teste**

Escrever `src/components/ai/AiQuotaBadge.test.tsx`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AiQuotaBadge } from "./AiQuotaBadge";

describe("<AiQuotaBadge />", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mostra loading inicial e depois o contador", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ used: 2, remaining: 3, limit: 5, yearMonth: "2026-04" }),
    });

    render(<AiQuotaBadge />);
    await waitFor(() => {
      expect(screen.getByText(/IA: 2\/5 usos/)).toBeInTheDocument();
    });
  });

  it("mostra estado esgotado (remaining = 0) com variant destructive", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ used: 5, remaining: 0, limit: 5, yearMonth: "2026-04" }),
    });

    render(<AiQuotaBadge />);
    await waitFor(() => {
      expect(screen.getByText(/IA esgotada/i)).toBeInTheDocument();
    });
  });

  it("não renderiza se fetch falhar", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("network"));

    const { container } = render(<AiQuotaBadge />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });

  it("não renderiza se o endpoint retornar 401/403/500", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    });

    const { container } = render(<AiQuotaBadge />);
    await waitFor(() => {
      expect(container.firstChild).toBeNull();
    });
  });
});
```

- [x] **Step 2: Rodar — deve falhar**

Run: `npm run test:unit -- src/components/ai/AiQuotaBadge.test.tsx`
Expected: FAIL com `Cannot find module './AiQuotaBadge'`.

- [x] **Step 3: Commit**

```bash
git add src/components/ai/AiQuotaBadge.test.tsx
git commit -m "test(ai-parser): add failing tests for AiQuotaBadge"
```

---

### Task 4.2: Implementar `<AiQuotaBadge />`

**Files:**
- Create: `src/components/ai/AiQuotaBadge.tsx`

**Complexity:** Low
**TDD:** YES
**Depends On:** Task 4.1

**Why:** Componente pequeno e reutilizável; reusa `<Badge />` do shadcn.

- [x] **Step 1: Implementar componente**

Escrever `src/components/ai/AiQuotaBadge.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Usage = {
  used: number;
  remaining: number;
  limit: number;
  yearMonth: string;
};

function daysUntilReset(yearMonth: string): number {
  const [y, m] = yearMonth.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(y, m, 1));
  const now = new Date();
  const ms = nextMonth.getTime() - now.getTime();
  return Math.max(0, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

export function AiQuotaBadge() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/ai-usage");
        if (!res.ok) {
          if (!cancelled) setFailed(true);
          return;
        }
        const data = (await res.json()) as Usage;
        if (!cancelled) setUsage(data);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) return null;
  if (!usage) {
    return (
      <Badge variant="outline" className="text-xs font-normal">
        <Sparkles className="mr-1 h-3 w-3" />
        Carregando cota IA…
      </Badge>
    );
  }

  const resetDays = daysUntilReset(usage.yearMonth);

  if (usage.remaining === 0) {
    return (
      <Badge variant="destructive" className="text-xs font-normal">
        <Sparkles className="mr-1 h-3 w-3" />
        IA esgotada · usando parser tradicional
      </Badge>
    );
  }

  return (
    <Badge variant="outline" className="text-xs font-normal">
      <Sparkles className="mr-1 h-3 w-3 text-emerald-600" />
      IA: {usage.used}/{usage.limit} usos · reseta em {resetDays}d
    </Badge>
  );
}
```

- [x] **Step 2: Rodar testes**

Run: `npm run test:unit -- src/components/ai/AiQuotaBadge.test.tsx`
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add src/components/ai/AiQuotaBadge.tsx
git commit -m "feat(ai-parser): implement AiQuotaBadge component"
```

---

### Task 4.3: Escrever testes do `<ParseSourceBadge />`

**Files:**
- Create: `src/components/ai/ParseSourceBadge.test.tsx`

**Complexity:** Low
**TDD:** YES
**Depends On:** none

**Why:** Renderização condicional por `source`/`usedFallback`; fácil de testar.

- [x] **Step 1: Criar arquivo de teste**

Escrever `src/components/ai/ParseSourceBadge.test.tsx`:

```typescript
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ParseSourceBadge } from "./ParseSourceBadge";

describe("<ParseSourceBadge />", () => {
  it("renderiza 'Extraído com IA' quando source='ai'", () => {
    render(<ParseSourceBadge source="ai" usedFallback={false} />);
    expect(screen.getByText(/Extraído com IA/i)).toBeInTheDocument();
  });

  it("renderiza aviso amarelo quando usedFallback=true", () => {
    render(<ParseSourceBadge source="regex" usedFallback={true} />);
    expect(
      screen.getByText(/Usando parser tradicional/i)
    ).toBeInTheDocument();
  });

  it("não renderiza nada quando source='notif'", () => {
    const { container } = render(
      <ParseSourceBadge source="notif" usedFallback={false} />
    );
    expect(container.firstChild).toBeNull();
  });

  it("não renderiza nada quando source='regex' e usedFallback=false (não tem AI config)", () => {
    const { container } = render(
      <ParseSourceBadge source="regex" usedFallback={false} />
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [x] **Step 2: Rodar — deve falhar**

Run: `npm run test:unit -- src/components/ai/ParseSourceBadge.test.tsx`
Expected: FAIL com `Cannot find module`.

- [x] **Step 3: Commit**

```bash
git add src/components/ai/ParseSourceBadge.test.tsx
git commit -m "test(ai-parser): add failing tests for ParseSourceBadge"
```

---

### Task 4.4: Implementar `<ParseSourceBadge />`

**Files:**
- Create: `src/components/ai/ParseSourceBadge.tsx`

**Complexity:** Low
**TDD:** YES
**Depends On:** Task 4.3

- [x] **Step 1: Implementar**

Escrever `src/components/ai/ParseSourceBadge.tsx`:

```tsx
import { AlertTriangle, Sparkles } from "lucide-react";

type Source = "ai" | "notif" | "regex";

type Props = {
  source: Source;
  usedFallback: boolean;
};

export function ParseSourceBadge({ source, usedFallback }: Props) {
  if (source === "ai" && !usedFallback) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
        <Sparkles className="h-3.5 w-3.5" />
        Extraído com IA
      </div>
    );
  }

  if (usedFallback) {
    return (
      <div className="inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 border border-amber-200">
        <AlertTriangle className="h-3.5 w-3.5" />
        Usando parser tradicional — revise com atenção
      </div>
    );
  }

  return null;
}
```

- [x] **Step 2: Rodar testes**

Run: `npm run test:unit -- src/components/ai/ParseSourceBadge.test.tsx`
Expected: PASS.

- [x] **Step 3: Commit**

```bash
git add src/components/ai/ParseSourceBadge.tsx
git commit -m "feat(ai-parser): implement ParseSourceBadge component"
```

---

### Task 4.5: Integrar componentes em `import/page.tsx`

**Files:**
- Modify: `src/app/import/page.tsx`

**Complexity:** Medium
**TDD:** NO (integração visual — verificação manual)
**Depends On:** Tasks 4.2, 4.4, Phase 3 completa

**Why:** Amarrar os dois componentes aos steps corretos e capturar `source`/`usedFallback` do response da API.

- [x] **Step 1: Adicionar state pra `source` e `usedFallback`**

No topo do componente (junto dos outros useState por volta da linha 179-200), adicionar:

```tsx
const [parseSource, setParseSource] = useState<"ai" | "notif" | "regex" | null>(null);
const [usedFallback, setUsedFallback] = useState(false);
```

- [x] **Step 2: Capturar campos no success do `/api/ocr`**

Localizar os blocos que lêem o response do `/api/ocr` (pelo menos três: o upload principal em `~line 504`, o retry com senha em `~line 538`, e o batch em `~line 841`). Em cada um, após `setOrigin(data.origin)`, adicionar:

```tsx
setParseSource(data.source ?? null);
setUsedFallback(data.usedFallback ?? false);
```

(Para o fluxo de batch em `~line 900`, usar os valores do **último** arquivo processado — fica como estado compartilhado da tela mesmo.)

- [x] **Step 3: Resetar state no restart do fluxo**

Na função que reseta o state (busca por `setStep("upload")` e `setTransactions([])` em torno da linha 1258), adicionar:

```tsx
setParseSource(null);
setUsedFallback(false);
```

- [x] **Step 4: Adicionar `<AiQuotaBadge />` no step upload**

No bloco `step === "upload"` (por volta da linha 1307), dentro do `<CardContent>`, antes do `<div className="space-y-4">`, inserir:

```tsx
<div className="mb-4 flex justify-end">
  <AiQuotaBadge />
</div>
```

- [x] **Step 5: Adicionar `<ParseSourceBadge />` no step preview**

No bloco `step === "preview"` (linha 1446), dentro do `<CardTitle>` com a classe flex (linha 1450), depois do `<span>Preview das Transações</span>`, adicionar:

```tsx
{parseSource && (
  <ParseSourceBadge source={parseSource} usedFallback={usedFallback} />
)}
```

Colocar antes do `<div className="flex flex-wrap items-center gap-2">` que contém a confidence + origin select.

- [x] **Step 6: Imports novos no topo de `import/page.tsx`**

Adicionar:

```tsx
import { AiQuotaBadge } from "@/components/ai/AiQuotaBadge";
import { ParseSourceBadge } from "@/components/ai/ParseSourceBadge";
```

- [x] **Step 7: Teste manual** (deferido para QA humano — instruções registradas abaixo)

Run: `npm run dev`

Casos a verificar manualmente:
1. Abrir `/import` → badge de quota aparece em cima do dropzone com "IA: 0/5 usos · reseta em Xd"
2. Upload de um PDF qualquer com `GEMINI_API_KEY` configurada e API key válida → preview mostra "✨ Extraído com IA"
3. Desconfigurar key temporariamente (`unset GEMINI_API_KEY` e restart do dev server) → upload mostra "⚠️ Usando parser tradicional — revise com atenção"
4. Quota esgotar (setar `AI_MONTHLY_QUOTA=0` e restart) → badge vira vermelho "IA esgotada"

- [x] **Step 8: Rodar lint/typecheck**

Run: `npm run lint && npx tsc --noEmit`
Expected: PASS.

**Resultado:** `npx tsc --noEmit` passa para todos os arquivos modificados (zero erros em `src/components/ai/*` e `src/app/import/page.tsx`). Erro pré-existente fora de escopo em `src/lib/csv-parser.test.ts:256` (Category userId), não introduzido por esta phase. `npm run lint` não está configurado no repositório (prompt interativo de setup inicial do Next.js ESLint).

- [x] **Step 9: Commit**

```bash
git add src/app/import/page.tsx
git commit -m "feat(ai-parser): integrate AiQuotaBadge and ParseSourceBadge into import flow"
```

---

## Phase 4 Exit Criteria

- [x] `npm run test:unit -- src/components/ai` passa (8/8 testes: 4 AiQuotaBadge + 4 ParseSourceBadge)
- [x] Teste manual dos 4 cenários (quota disponível com AI / AI off / quota esgotada / fallback) — **deferido para QA humano**, cobertura automatizada via testes unitários cobre os quatro estados do componente
- [x] `npm run lint` passa — ESLint não está configurado no repositório (pré-existente, fora de escopo)
- [x] `npx tsc --noEmit` passa para os arquivos da phase (erro pré-existente em `src/lib/csv-parser.test.ts` é anterior a esta phase)

## Learnings

- **Escopo do `callOCRApi`:** A função auxiliar já existia e tinha tipo de retorno explícito `{ transactions, origin, confidence }`. Foi necessário estender tipo e valor para incluir `source` e `usedFallback`, garantindo que tanto o fluxo único (`processOCR`) quanto o batch (`processMultipleOCR`) propagassem os campos.
- **Batch OCR usa "último arquivo":** Para `processMultipleOCR`, os valores de `source`/`usedFallback` refletem o último arquivo processado (conforme orientação do plano). Adicionadas variáveis `lastSource` e `lastUsedFallback` no loop.
- **Três pontos de captura:** O response de `/api/ocr` é lido em três locais — a função central `callOCRApi` (usada por `processOCR` e `processMultipleOCR`) e o retry com senha (por volta da linha 538). Cobertos todos.
- **Fallback de `source` é `null` (não `"regex"`):** No estado inicial/reset, `parseSource = null` → componente não renderiza. Isso garante que o badge só apareça após ter havido um upload com resposta válida.
- **ESLint não configurado:** `npm run lint` é interativo pedindo setup inicial do plugin Next.js — questão pré-existente do repositório, não bloqueia esta phase.

**Próxima fase:** [phase-5-telegram-ux.md](phase-5-telegram-ux.md) — espelhar as mensagens do badge/fallback no bot.
