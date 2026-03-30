# Insights e Analytics — Plano de Implementação

## Overview

Implementar o milestone "Cluster 6: Insights e Analytics" (issues #71, #56, #57, #54, #58): insights financeiros programáticos, alertas de endividamento, scores de saúde, análise de maiores ofensores e comparativo expandido fixo vs variável. Todas as features usam dados existentes com agregações e regras — sem IA.

## Current State Analysis

- **Dashboard** (`src/app/dashboard/page.tsx:37-586`): 10 seções existentes, busca dados de `/api/summary` e `/api/transactions/unusual`
- **Reports** (`src/app/reports/page.tsx:129-229`): 11 tabs Radix, cada tab com componente + API própria
- **Summary API** (`src/app/api/summary/route.ts:234-339`): 7 queries em Promise.all, já busca billPayments e installments
- **Cards Summary** (`src/lib/cards-summary.ts:28-52`): já calcula `status` (healthy/warning/critical), `limitUsedPercent`, `rates` por cartão
- **FinancialHealthSection** (`src/components/FinancialHealthSection.tsx:21-40`): já calcula comprometimento (income/expense/fixed/installments)
- **FixedVariableTab** (`src/components/reports/FixedVariableTab.tsx:1-209`): classificação binária via `isFixed`
- **BillPayment** (`src/app/api/bill-payments/route.ts:7-56`): CRUD completo com paymentType PARTIAL/FINANCED, amountCarried, interestRate
- **Category** (`prisma/schema.prisma:184-207`): campos `name`, `color`, `icon` — sem `flexibilityType`

## Desired End State

### Dashboard — 6 novos cards:
1. **Projeção do Mês** — gastos até hoje + pendentes (fixos, parcelas) com barra de progresso
2. **Alertas de Parcelas** — parcelas começando (1/N) e acabando (N/N) com impacto financeiro
3. **Alerta de Endividamento** — detecção de fatura parcelada 2+ meses consecutivos
4. **Cobranças Duplicadas** — mesmo valor + merchant similar + mesmo mês
5. **Score do Cartão** — nota 0-100 por cartão com semáforo e recomendação
6. **Score Financeiro** — nota 0-100 geral com fatores detalhados

### Reports — 3 tabs novas/expandidas:
1. **Maiores Gastos** — top 10 merchants com normalização, gráfico de barras
2. **Fixo vs Variável** (expandido) — 3 camadas via FlexibilityType + simulador de redução
3. **Assinaturas** — recorrentes ativas com custo mensal/anual

### Schema:
- Enum `FlexibilityType` (ESSENTIAL/NEGOTIABLE/VARIABLE) em Category

### Verificação:
- `Skill(running-automated-checks)` passa
- Todos os lib modules têm testes unitários
- APIs retornam dados corretos com autenticação

## What We're NOT Doing

- Insights baseados em IA/ML — tudo é programático (regras e agregações)
- Notificações push ou email — apenas cards visuais no dashboard
- Meta de economia automática — Savings Goal já cobre isso
- Gasto incomum por categoria — já existe (Unusual Transactions Card)
- Evolução por categoria — já existe (CategoryTrendsTab)
- Comparação mês a mês — já existe (CategoryVariationCard)
- Novo modelo Card separado — creditLimit já existe em Origin

---

## Related Documentation

| Document | Relevância |
|----------|-----------|
| `ai_docs/research/2026-03-29-insights-analytics-research.md` | Pesquisa completa do codebase com padrões e interfaces |
| `ai_docs/brainstorm/2026-03-29-insights-analytics-design.md` | Design aprovado com decisões de arquitetura |
| `src/lib/cards-summary.ts:28-52` | Interface CardSummary e cálculos existentes de saúde do cartão |
| `src/components/FinancialHealthSection.tsx:21-40` | Cálculo de comprometimento existente |
| `src/app/api/summary/route.ts:234-339` | Padrão de queries agregadas para dashboard |

**Escopo:** Este plano cobre insights/analytics. Não modifica auth, investment tracking, CSV import, ou OCR.

---

## Risks & Mitigations

| Risco | Probabilidade | Impacto | Mitigação |
|-------|--------------|---------|-----------|
| Performance da dashboard com 6 novos endpoints | M | M | Endpoints de insight são leves (agregações simples). Monitorar tempo de load. |
| FlexibilityType migration em produção | L | M | Campo nullable, sem breaking change. Seed pré-popula defaults. Migration SQL atualiza categorias existentes com nomes conhecidos. |
| Falsos positivos no alerta de endividamento | M | M | Severidade escalonada (warning/critical). Texto explicativo no card. |
| Normalização de merchant imprecisa | M | L | Abordagem conservadora (prefixos conhecidos). Sem agrupamento fuzzy. |
| Dados de BillPayment insuficientes para scores | M | M | Score retorna null/N/A quando dados insuficientes. Cards condicionais. |

---

## Phases

| # | Fase | Arquivo | Resumo | Status | Depende de |
|---|------|---------|--------|--------|------------|
| 1 | Fundação + Projeção | `phase-1-foundation-projection.md` | Schema FlexibilityType + merchant normalizer + projeção do mês | complete | — |
| 2 | Alertas no Dashboard | `phase-2-alerts.md` | Installment alerts + debt alert + duplicate detection | complete | Phase 1 |
| 3 | Scores + Classificação | `phase-3-scores.md` | Card score + financial score + category flexibility UI | complete | Phase 2 |
| 4 | Tabs de Reports | `phase-4-report-tabs.md` | Top merchants + fixed/variable expandido + assinaturas | complete | Phase 1 |

---

## Success Criteria Dashboard

### Phase 1: Fundação + Projeção
| Critério | Tipo | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pending |
| `npx prisma migrate deploy` executa sem erro | auto | pending |
| Card de projeção visível no dashboard | manual | pending |

### Phase 2: Alertas no Dashboard
| Critério | Tipo | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pending |
| Cards de alerta renderizam condicionalmente | manual | pending |

### Phase 3: Scores + Classificação
| Critério | Tipo | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pending |
| Score cards renderizam com semáforo visual | manual | pending |

### Phase 4: Tabs de Reports
| Critério | Tipo | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pending |
| 3 novas tabs funcionais em /reports | manual | pending |

### Verificação Final (após todas as fases)
| Critério | Tipo | Status |
|----------|------|--------|
| `Skill(reviewing-code)` | auto | pending |
| `Skill(validating-implementation)` | auto | pending |

---

## Known Executor Risks

| Cenário | Probabilidade | Fallback |
|---------|--------------|----------|
| Category edit form não encontrado como componente separado | M | A edição de categorias pode ser inline na página `/categories` ou no modal. Grep por `PUT.*categories` ou `CategoryForm` para localizar. |
| BillPayment sem dados para calcular debt-alert | M | API retorna array vazio. Card não renderiza (condicional). |
| Origin sem creditLimit preenchido | M | Card score mostra "Limite não configurado" com link para editar. |
| Seed falha por categorias customizadas do usuário | L | Migration usa UPDATE WHERE name IN (...) apenas em categorias default conhecidas. |

---

## Completeness Verification

```
100% Rule Verification:
- [x] Every file mentioned in research is addressed in plan
- [x] No work will be discovered during implementation
- [x] All dependencies between tasks are explicit
- [x] Each phase is independently shippable
- [x] All tasks have Given-When-Then acceptance criteria
- [x] All tasks have Load Before Implementing listed
- [x] No gaps between phases
- [x] No overlaps (no work duplicated)
```

---

## Implementation Notes

### Ordem dos Cards no Dashboard

```
1. FinancialHealthSection (existente)
2. Charts grid (existente)
3. ProjectionCard (Phase 1) ← NOVO
4. InstallmentAlertsCard (Phase 2) ← NOVO
5. DebtAlertCard (Phase 2) ← NOVO
6. Budget alerts (existente)
7. Unusual transactions (existente)
8. DuplicatesCard (Phase 2) ← NOVO
9. Category variation (existente)
10. CardScoreCard (Phase 3) ← NOVO
11. FinancialScoreCard (Phase 3) ← NOVO
12. Budget progress (existente)
13. Fixed expenses + installments (existente)
14. Savings goal (existente)
15. InvestmentDashboardCard (existente)
```

### Nota sobre Integration Tests

O plano foca em unit tests para lib modules. Integration tests para APIs seguem o padrão existente em `tests/integration/api/reports-api.test.ts` (3 cenários: 200, 401, 500). O executor deve criar integration tests quando o escopo do task permitir.

### Padrões a seguir

**API routes:**
```ts
import { getAuthContext, handleApiError } from "@/lib/auth-utils";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    // queries com ctx.ownerFilter
    return NextResponse.json(data);
  } catch (error) {
    return handleApiError(error);
  }
}
```

**Dashboard cards:**
```tsx
<Card>
  <CardHeader><CardTitle className="flex items-center gap-2">
    <Icon className="h-5 w-5" /> Título
  </CardTitle></CardHeader>
  <CardContent>...</CardContent>
</Card>
```

**Exclusões em queries:**
- Sempre excluir `investmentTransaction` dos totais
- Sempre excluir `type: "TRANSFER"` dos totais
- Sempre filtrar `deletedAt: null`

### Code Design Principles

**Project rules are the source of truth.** Antes de implementar:
1. `CLAUDE.md` no root do projeto
2. Padrões existentes nos arquivos referenciados

---

## Learnings

(a ser preenchido durante implementação)

---

## References

- Pesquisa: `ai_docs/research/2026-03-29-insights-analytics-research.md`
- Design: `ai_docs/brainstorm/2026-03-29-insights-analytics-design.md`
- Milestone: https://github.com/vverzellesi/expense-control/milestone/6
- Issues: #71, #56, #57, #54, #58
