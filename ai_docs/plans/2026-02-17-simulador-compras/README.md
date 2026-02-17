# Simulador de Compras - Implementation Plan

## Overview

Pagina `/simulador` onde o usuario descreve uma compra e ve instantaneamente como ela afeta seu fluxo financeiro nos proximos meses. Usa dados reais do app (renda, despesas fixas, parcelas) para mostrar impacto. Inclui lista de desejos com simulacoes salvas, comparacao de cenarios, e conversao em transacao real.

## Current State Analysis

- Paginas seguem padrao `"use client"` + `useState`/`useEffect` + `fetch()` (ex: `src/app/investments/page.tsx`)
- API routes usam `getAuthenticatedUserId()` de `src/lib/auth-utils.ts`
- `GET /api/projection` (`src/app/api/projection/route.ts:26`) ja calcula projecao mensal com parcelas + recorrentes - logica similar necessaria
- `POST /api/transactions` (`src/app/api/transactions/route.ts`) suporta criacao de parcelas com `isInstallment: true` - reutilizavel para "Registrar Compra"
- Recharts usado em `src/components/Charts/` com `ResponsiveContainer` + `useMediaQuery`
- Sidebar em `src/components/Sidebar.tsx:30` - array estatico de navigation items
- Prisma com PostgreSQL, models com `userId` e `@@index([userId])`
- `amount` na API de transactions = valor **por parcela** (nao total)

## Desired End State

- Navegar para `/simulador` via sidebar
- Preencher descricao, valor, parcelas e categoria -> grafico atualiza em tempo real
- Grafico de barras empilhadas mostrando despesas atuais + simulacao + linha de renda
- 3 cards de resumo: parcela mensal, mes mais apertado, comprometimento antes/depois
- Salvar/carregar multiplas simulacoes com efeito cumulativo
- Comparacao automatica de 3 cenarios (a vista, escolhido, parcelado longo)
- Converter simulacao em transacao real via POST /api/transactions existente

## What We're NOT Doing

- Notificacoes ou alertas automaticos baseados em simulacoes
- Historico de simulacoes ja registradas como compra
- Integracao com budgets (comparacao com orcamento por categoria)
- Simulacao de investimentos ou rendimentos
- Compartilhamento de simulacoes entre usuarios

---

## Related Documentation

| Document | Relevance |
|----------|-----------|
| `ai_docs/brainstorm/2026-02-17-simulador-compras-design.md` | Design aprovado com specs detalhadas |
| `ai_docs/research/2026-02-17-simulador-compras-research.md` | Pesquisa de codebase com padroes encontrados |
| `src/app/api/projection/route.ts` | Logica de projecao financeira existente (referencia) |
| `src/app/api/transactions/route.ts` | Criacao de parcelas (reutilizado em "Registrar Compra") |

**Scope Warning:** Este plano cobre o Simulador de Compras. Nao modifica o sistema de projecao, transacoes, ou budgets existentes.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Prisma Simulation model conflita com Category relation existente | M | H | Verificar que Category nao tem campo `simulations` antes de adicionar |
| Calculo de renda media impreciso (meses sem income) | M | M | Usar apenas meses com income > 0 na media |
| Recharts stacked bar com zona vermelha nao suportada nativamente | L | M | Usar ReferenceArea do Recharts para zona vermelha |
| amount na API de transactions espera valor por parcela, nao total | H | H | Documentado no plano - calcular `totalAmount / totalInstallments` antes de enviar |

---

## Phases

| # | Phase | File | Summary | Status | Depends On |
|---|-------|------|---------|--------|------------|
| 1 | Data Layer + Pagina Base | `phase-1-data-layer.md` | Model Prisma, endpoint baseline, pagina com form + grafico basico | complete | - |
| 2 | Logica de Simulacao + Visualizacao | `phase-2-simulation-logic.md` | Engine de calculo, 3 cards resumo, grafico aprimorado | complete | Phase 1 |
| 3 | Persistencia + Multi-Simulacao | `phase-3-persistence.md` | CRUD API, chips com toggle, efeito cumulativo | complete | Phase 2 |
| 4 | Cenarios + Registro de Compra | `phase-4-scenarios-registration.md` | Comparacao de cenarios, dialog de registro, fluxo completo | complete | Phase 3 |

---

## Success Criteria Dashboard

### Phase 1: Data Layer + Pagina Base

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pass |
| Navegar para /simulador e ver grafico com dados baseline | manual | pending |

### Phase 2: Logica de Simulacao + Visualizacao

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pass |
| Preencher form e ver impacto reativo no grafico + cards | manual | pending |

### Phase 3: Persistencia + Multi-Simulacao

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pass |
| Salvar, carregar, toggle multiplas simulacoes com efeito cumulativo | manual | pending |

### Phase 4: Cenarios + Registro de Compra

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pass |
| Registrar compra simulada e ver transacao criada no dashboard | manual | pending |

### Final Verification (after all phases)

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(reviewing-code)` | auto | pass |
| `Skill(validating-implementation)` | auto | pass |

---

## Known Executor Risks

| Scenario | Likelihood | Fallback |
|----------|------------|----------|
| Category model ja tem relacao `simulations` de outro feature | L | Grep `simulations` no schema antes de adicionar |
| `useMediaQuery` hook nao encontrado no path esperado | L | Grep `useMediaQuery` para localizar path correto |
| Recharts nao suporta ReferenceArea com fill customizado | M | Usar div overlay posicionado sobre o chart via CSS |
| `POST /api/transactions` mudou interface desde pesquisa | L | Ler route.ts antes de implementar RegisterPurchaseDialog |

---

## Completeness Verification

```
100% Rule Verification:
- [x] Every file mentioned in research is addressed in plan
- [x] No work will be discovered during implementation
- [x] All dependencies between tasks are explicit
- [x] Each phase is independently shippable
- [x] All tasks have Given-When-Then acceptance criteria
- [x] All tasks have Reference Docs listed
- [x] No gaps between phases (nothing falls through cracks)
- [x] No overlaps (no work duplicated across tasks)
```

---

## Implementation Notes

### Patterns to Follow
- Pages: `"use client"` + `useState`/`useEffect` + `fetch()`
- API routes: `getAuthenticatedUserId()` + try/catch + `unauthorizedResponse()`
- Prisma: `userId` field + `@@index([userId])` + `User` relation
- UI: Radix primitives (Card, Dialog, Select, Button, Badge)
- Charts: Recharts `ResponsiveContainer` + `useMediaQuery` for mobile
- Formatting: `formatCurrency()` from `@/lib/utils`
- Colors: emerald for branding, `#22c55e` green, `#ef4444` red

### Code Design Principles
- Project rules from `CLAUDE.md` (root) are primary
- UI text in Portuguese (pt-BR)
- Currency: BRL, Date: DD/MM/YYYY
- Path alias: `@/*` -> `./src/*`

---

## Learnings

### Phase 1
- DB is PostgreSQL (Neon), not SQLite as CLAUDE.md states. `prisma generate` works locally but `prisma db push/migrate` requires network.
- `vi.hoisted()` is required for mock objects in `vi.mock` factories since `vi.mock` is hoisted above `const` declarations.
- Pre-existing test failures: 5 timezone-related tests in `utils.test.ts` and 1 type error in `csv-parser.test.ts` — none related to our changes.

### Phase 2
- Plan code had division-by-zero risk in `monthlyInstallment` reducer when `totalInstallments=0`. Added guard.
- `npx next build` is the reliable build verification; `npm run build` includes `prisma migrate deploy` which may fail without network.
- The `"in" operator` type narrowing works cleanly for distinguishing `BaselineMonth` vs `SimulatedMonth`.

### Phase 3
- Integration test pattern follows `bill-payments.test.ts` exactly. `Promise.resolve({ id })` works for Next.js 14 dynamic route params.
- Added `simulation` model to shared mock prisma client for test reuse.
- `useToast` imports from `@/components/ui/use-toast`. Parallel fetch for simulations with existing data/categories.

### Phase 4
- `generateScenarios` reuses `calculateSimulation` per scenario config. "Recommended" badge uses `tightestMonth.freeBalance` as metric.
- `RegisterPurchaseDialog` sends per-installment amount (`totalAmount / totalInstallments`) to POST /api/transactions, matching API expectation.
- Plan referenced `debouncedInstallments` but page only debounces amount. Used `totalInstallments` directly since installment changes come from slider/select.

---

## References

- Research: `../research/2026-02-17-simulador-compras-research.md`
- Design: `../../brainstorm/2026-02-17-simulador-compras-design.md`
- Similar: `src/app/api/projection/route.ts` (projection logic), `src/app/investments/page.tsx` (CRUD page pattern)
