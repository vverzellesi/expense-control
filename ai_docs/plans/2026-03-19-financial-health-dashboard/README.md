# Dashboard de Saúde Financeira Mensal

## Overview

Criar seção de saúde financeira no topo do dashboard existente, substituindo os 3 cards KPI atuais (Receita/Despesa/Saldo) por 4 metric cards com indicador semáforo + barra de comprometimento segmentada. Reorganizar seções do dashboard removendo redundâncias (resumo semanal e detalhamento semanal).

## Current State Analysis

- **Dashboard page** (`src/app/dashboard/page.tsx:76-814`): Componente client-side com 11 seções, incluindo 3 cards KPI no topo (linhas 169-247), resumo semanal (447-488) e detalhamento semanal (677-805)
- **API Summary** (`src/app/api/summary/route.ts:193-701`): Retorna todos os dados necessários — `summary.income`, `summary.expense`, `fixedExpenses[]`, `upcomingInstallments[]`
- **Componentes UI**: Card, Progress, Badge já disponíveis em `src/components/ui/`
- **SummaryData interface** (`src/app/dashboard/page.tsx:36-74`): Tipagem completa do response da API
- **Testes existentes** (`src/app/dashboard/DashboardPage.test.tsx`): 2 testes para visibilidade do InvestmentDashboardCard

## Desired End State

Dashboard com nova seção de saúde financeira no topo contendo:
1. 4 metric cards (Renda, Fixas, Comprometimento %, Sobra) com semáforo de cores
2. Barra horizontal segmentada (fixas/parcelas/variável/sobra)
3. Seções reorganizadas por relevância, sem resumo/detalhamento semanal
4. Testes unitários para lógica de cálculo e renderização

Verificação: `npm run test:unit` passa, `npm run build` compila sem erros.

## What We're NOT Doing

- Não alteramos a API `/api/summary` — todos os cálculos são frontend
- Não adicionamos nova rota ou página
- Não modificamos modelos Prisma
- Não implementamos filtro de mês/ano (usa o mês atual como o dashboard já faz)
- Não removemos os cards de Despesas Fixas e Parcelas Futuras (mantêm detalhe útil)

---

## Related Documentation

| Document | Relevance |
|----------|-----------|
| `ai_docs/brainstorm/2026-03-19-financial-health-dashboard-design.md` | Design aprovado com layout e cálculos |
| `src/app/api/summary/route.ts:235-340` | Queries que alimentam os dados usados |
| `src/components/ui/card.tsx` | Padrão de Card component usado |
| `src/components/ui/progress.tsx` | Progress bar (referência, não usado diretamente) |

**Scope Warning:** Este plano cobre apenas o frontend do dashboard. Não assume comportamento da API summary além do que está documentado na interface SummaryData.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Dados de parcelas do mês incompletos (upcomingInstallments só tem futuras) | M | L | Filtrar por mês atual; se vazio, barra mostra 3 segmentos |
| Remoção de seções quebra testes existentes | L | L | Testes existentes não verificam seções removidas |
| Variável negativa quando fixas+parcelas > expense | L | L | Math.max(0, ...) no cálculo |

---

## Phases

| # | Phase | File | Summary | Status | Depends On |
|---|-------|------|---------|--------|------------|
| 1 | Saúde Financeira | `phase-1-financial-health.md` | Componente + integração no dashboard + testes | complete | — |

---

## Success Criteria Dashboard

### Phase 1: Saúde Financeira

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pending |
| Verificar visualmente que a barra e os cards renderizam no dashboard | manual | pending |

### Final Verification (after all phases)

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(reviewing-code)` | auto | pending |
| `Skill(validating-implementation)` | auto | pending |

---

## Known Executor Risks

| Scenario | Likelihood | Fallback |
|----------|------------|----------|
| Import de ícones (Receipt, Percent, PiggyBank) não disponíveis no lucide-react | L | Verificar com grep antes; usar ícones alternativos |
| Linhas do dashboard mudaram desde a pesquisa | L | Usar grep para localizar seções por comentário (ex: "Summary Cards") |

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

### Padrões a seguir
- Client components com `"use client"` directive
- Cards usando `Card/CardHeader/CardTitle/CardContent` de `@/components/ui/card`
- Cores semânticas: emerald para positivo, red para negativo, amber para warning
- `formatCurrency()` de `@/lib/utils` para valores monetários
- Grid responsivo: `grid-cols-2 lg:grid-cols-4` para mobile-first
- Testes com Vitest + React Testing Library

### Cálculos
- `fixedTotal` = sum(Math.abs(fixedExpenses[].amount))
- `installmentsTotal` = sum(Math.abs(upcomingInstallments filtradas pelo mês atual[].amount))
- `variableTotal` = max(0, expense - fixedTotal - installmentsTotal)
- `available` = income - expense
- `commitmentPercentage` = income > 0 ? expense / income * 100 : 0
- Semáforo: <70% verde, 70-90% amarelo, >90% vermelho

---

## Learnings

- TypeScript `as const` necessário em helpers de teste para literais de tipo (ex: `type: "EXPENSE" as const`)
- Ícone `Zap` ainda usado pela seção Gastos Incomuns — não removível. `Wallet` e `Calendar` removidos com sucesso.
- Tipos `WeeklySummary`/`WeeklyBreakdown` mantidos no import pois `SummaryData` os referencia (contrato da API)
- Strings de UI em PT-BR devem usar acentuação correta ("Mês", "Disponível", "Variável")

---

## References

- Design: `ai_docs/brainstorm/2026-03-19-financial-health-dashboard-design.md`
- Issue: #46
- Padrão de cards: `src/app/dashboard/page.tsx:169-247`
- Padrão de progress: `src/app/dashboard/page.tsx:567-576`
