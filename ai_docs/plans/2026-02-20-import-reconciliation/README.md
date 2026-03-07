# Import Reconciliation & Transfer Detection Plan

## Overview

Corrigir bugs de detecção de transferências e duplicatas na importação de transações, implementar reconciliação bidirecional entre recorrentes e importação (preview + backend), e sugerir regras de categorização ao recategorizar manualmente.

## Current State Analysis

- **TRANSFER_PATTERNS** (`src/lib/categorizer.ts:135-148`): O regex `PAGTO?\s*` na linha 137 casa com "PAGTO" mas o pattern `/PAG\s*FAT/i` na linha 140 não casa com "PGTO FAT" (falta o "A"). "INCLUSAO DE PAGAMENTO" não tem pattern nenhum.
- **Import route** (`src/app/api/import/route.ts:48-53`): Filtra `autoGenerate: false`, ignorando recorrentes auto-geradas durante matching. Resultado: duplicatas quando extrato é importado após auto-geração.
- **Check-duplicates** (`src/app/api/transactions/check-duplicates/route.ts:77-94`): Não usa `recurringExpenseId` nem `origin` na busca de duplicatas.
- **Import preview** (`src/app/import/page.tsx:1004-1008, 1262-1267`): Badge "Recorrente" existe mas `isRecurring`/`recurringName` nunca são setados (dead code). `detectRecurringTransaction()` é importado mas não chamado.
- **matchesRecurring()** (`src/app/api/import/route.ts:20-32`): Matching muito loose — qualquer keyword > 2 chars faz match.

## Desired End State

1. `detectTransfer("PGTO FAT CARTAO C6")` retorna `true`
2. `detectTransfer("INCLUSAO DE PAGAMENTO")` retorna `true`
3. Import route reconcilia com TODAS as recorrentes ativas (não só `autoGenerate: false`)
4. Check-duplicates considera `recurringExpenseId` para detectar transações já vinculadas
5. Preview de importação mostra badges de recorrente ativando `detectRecurringTransaction()`
6. Preview mostra quais transações já existem como recorrentes no mês (via novo endpoint)
7. Ao mudar categoria manualmente, sistema sugere criar regra de categorização

## What We're NOT Doing

- Script de recategorização de transações existentes (correção de dados manual)
- Fase 2 (F2.1-F2.3): tipo de importação + origin, resumo com totais, fatura por cartão
- Fase 3 (F3.x): atualização automática de valores, anomalias
- Fase 4 (F4.x): parcelas sem número, categorização de PIX
- Refactor do CSV parser duplicado (import page vs csv-parser.ts)
- Melhoria do `matchesRecurring()` (loose matching) — escopo de F1.1 é corrigir o filtro de `autoGenerate`, não reescrever o matching

---

## Related Documentation

| Document | Relevance |
|----------|-----------|
| `ai_docs/research/transaction-analysis-2026-02.md` | Research document completo com análise de 324 transações |
| `ai_docs/research/2026-02-20-import-categorizer-research.md` | Pesquisa detalhada do código atual |
| `src/lib/carryover-detector.ts` | Sistema de detecção de saldo rolado (não alterado) |
| `src/app/api/recurring/pending/route.ts` | Endpoint de recorrentes pendentes (contexto) |

**Scope Warning:** Este plano cobre F1.1 (reconciliação), F1.2 (TRANSFER_PATTERNS), F1.3 (sugestão de regra). Não assume comportamento de billing cycles, OCR import, ou CSV parser server-side.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| TRANSFER_PATTERNS novos casam com transações legítimas | L | M | Patterns são específicos: `PGTO\s*FAT` e `INCLUSAO\s*DE\s*PAGAMENTO` |
| Remover filtro `autoGenerate` causa false matches na importação | M | M | O matching ainda requer: origin exato + keyword match + sem transação no mês |
| Badge de recorrente no preview confunde usuário | L | L | Badge informativo, não altera seleção. Tooltip com nome da assinatura |
| Sugestão de regra com keyword errada | M | L | Usuário confirma antes de criar. Extração remove prefixos conhecidos |

---

## Phases

| # | Phase | File | Summary | Status | Depends On |
|---|-------|------|---------|--------|------------|
| 1 | Backend: Transfer detection + Import reconciliation | `phase-1-backend-fixes.md` | Fix TRANSFER_PATTERNS, remover filtro autoGenerate, fix check-duplicates | complete | — |
| 2 | Frontend: Recurring preview + Match endpoint | `phase-2-recurring-preview.md` | Ativar badge recorrente, novo endpoint check-recurring-matches, badges na preview | complete | Phase 1 |
| 3 | Rule suggestion on recategorize | `phase-3-rule-suggestion.md` | Sugerir criação de regra ao mudar categoria manualmente | complete | — |

---

## Success Criteria Dashboard

### Phase 1: Backend fixes

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | complete |
| Testes unitários para novos TRANSFER_PATTERNS | auto | complete |
| Teste de integração para import com autoGenerate=true | auto | complete |

### Phase 2: Recurring preview

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | complete |
| Verificar badges de recorrente visíveis na preview de importação | manual | pending |

### Phase 3: Rule suggestion

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | complete |
| Verificar toast de sugestão ao mudar categoria na preview | manual | pending |

### Final Verification (after all phases)

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(reviewing-code)` | auto | pending |
| `Skill(validating-implementation)` | auto | pending |

---

## Known Executor Risks

| Scenario | Likelihood | Fallback |
|----------|------------|----------|
| Import test file pode ter path diferente | L | Grep for `import.test` in tests/ |
| Prisma mock pattern em testes de integração pode variar | M | Ler `tests/mocks/` para entender padrão atual |
| `detectRecurringTransaction` import pode mudar de path | L | Grep for `detectRecurringTransaction` exports |

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

- Testes usam Vitest com `vi.mock` para Prisma
- UI text em Português (Brasil)
- Currency: BRL, Date: DD/MM/YYYY
- Import page tem ~1400 linhas — edições devem ser cirúrgicas
- Badge system usa `Badge variant="outline"` com classes Tailwind para cores

### Code Design Principles

**Project rules are the source of truth.** Before writing code, load standards in this order:

1. **Project-specific rules (PRIMARY):**
   - `CLAUDE.md` in project root

---

## Learnings

- Phase 1: PGTO FAT and INCLUSAO DE PAGAMENTO patterns added cleanly. Prisma 5.x nested where inside include works for filtering. Added deletedAt: null filter for soft-deleted transactions.
- Phase 2: isRecurring/recurringName fields and badges already existed but were never populated. detectRecurringTransaction was imported but never called.
- Phase 3: Toast system supports action property via Radix UI. POST /api/rules extracts userId from auth session, not request body. extractKeyword/suggestRule defined inside component to access state.

---

## References

- Research: `ai_docs/research/transaction-analysis-2026-02.md`
- Code research: `ai_docs/research/2026-02-20-import-categorizer-research.md`
- Similar implementations: `src/app/import/page.tsx:988-1031` (badge system), `src/app/api/import/route.ts:96-126` (recurring matching)
