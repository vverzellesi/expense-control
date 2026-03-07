# Category Tags (Sub-labels) Implementation Plan

## Overview

Implementar tags customizáveis dentro de categorias (ex: "Combustível", "Estacionamento" dentro de "Automóvel"). Tags são associadas por keywords e aparecem como badges no import preview e sub-labels na listagem de transações. Inclui gestão manual na Settings e sugestão automática durante importação.

## Current State Analysis

- **Category** (`prisma/schema.prisma:158-175`): modelo simples com `name`, `color`, `icon`. Sem sub-classificação.
- **CategoryRule** (`prisma/schema.prisma:225-237`): keyword → categoryId mapping. Padrão a seguir para CRUD + cache + matching.
- **Transaction** (`prisma/schema.prisma:99-134`): tem campo `tags String?` para free-form JSON tags. Nosso `categoryTagId` é diferente — sub-label estruturado da categoria.
- **Import page** (`src/app/import/page.tsx`): ~1580 linhas. Badges renderizados em dois blocos (mobile :1130-1184, desktop :1386-1464). Toast de sugestão de regra em :702-741.
- **Settings page** (`src/app/settings/page.tsx`): 4 abas (budgets, rules, goals, origins). Tab "rules" :613-714 é o modelo para a aba de tags.
- **Transactions page** (`src/app/transactions/page.tsx`): categoria exibida como dot + texto (:525-568). Tags free-form como badges clicáveis (:583-600).

## Desired End State

- Novo modelo `CategoryTag` no Prisma com `name`, `keywords`, `categoryId`, `userId`
- `Transaction.categoryTagId` opcional para persistir tag associada
- API CRUD em `/api/category-tags` seguindo padrão de `/api/rules`
- Função `matchCategoryTag()` em `categorizer.ts` com testes unitários
- Import preview: badge teal "Tag: X" quando CategoryTag casa com descrição
- Import: toast sugerindo criação de tag ao recategorizar
- Import: `categoryTagId` enviado no payload e persistido
- Settings: aba "Tags" para gerenciar tags por categoria
- Listagem: "Automóvel · Combustível" como sub-label

## What We're NOT Doing

- Não alterar o sistema de free-form tags (`transaction.tags`)
- Não adicionar cores customizáveis nos tags (pode ser adicionado depois)
- Não exibir tags no dashboard (apenas import e listagem)
- Não criar tags padrão no `initializeUserDefaults()` (usuário cria manualmente)

---

## Related Documentation

| Document | Relevance |
|----------|-----------|
| `ai_docs/brainstorm/2026-03-03-category-tags-design.md` | Design aprovado com modelo de dados e fluxos |
| `ai_docs/research/2026-03-03-category-tags-research.md` | Pesquisa completa do codebase |
| `src/lib/categorizer.ts` | Padrão de cache + matching a seguir |
| `src/app/api/rules/route.ts` | Padrão de API CRUD a seguir |

**Scope Warning:** Este plano cobre CategoryTags. Não assume comportamento do sistema de free-form tags, budgets ou recurring expenses.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Migration falha com dados existentes | L | H | Campo `categoryTagId` é opcional (nullable), migration segura |
| Import page muito grande para contexto | M | M | Edições focadas em pontos específicos (badges + category change) |
| Conflito com free-form tags na UI | L | M | Usar estilo visual distinto (teal vs blue) e label "Tag:" |
| Multiple tags match mesma transação | M | L | Matching conservador: só aplica se exatamente 1 tag casa |

---

## Phases

| # | Phase | File | Summary | Status | Depends On |
|---|-------|------|---------|--------|------------|
| 1 | Schema + API + Matching | `phase-1-schema-api-matching.md` | Modelo Prisma, CRUD API, função de matching com testes | complete | — |
| 2 | Import — badges + sugestão | `phase-2-import-integration.md` | Badges no preview, sugestão de tag, persistência no import | complete | Phase 1 |
| 3 | Settings + Listagem | `phase-3-settings-listing.md` | Aba de gestão na Settings, sub-label na listagem | complete | Phase 1 |

---

## Success Criteria Dashboard

### Phase 1: Schema + API + Matching

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | complete |
| `npm run db:migrate` executa sem erro | auto | pending (Neon DB inacessível — P1001) |

### Phase 2: Import — badges + sugestão

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | complete |

### Phase 3: Settings + Listagem

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | complete |

### Final Verification (after all phases)

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(reviewing-code)` | auto | complete (plan_compliance: COMPLIANT, quality: APPROVED, security: APPROVED com 1 finding pré-existente) |
| `Skill(validating-implementation)` | auto | complete |

---

## Known Executor Risks

| Scenario | Likelihood | Fallback |
|----------|------------|----------|
| Prisma schema syntax error | L | Verificar schema existente em `prisma/schema.prisma` para padrão exato |
| Import page badge insertion no local errado | M | Buscar por `t.recurringMatchId && !t.recurringAlreadyGenerated` como âncora — inserir logo após |
| Settings tab trigger styling inconsistente | L | Copiar exatamente o padrão de `TabsTrigger value="rules"` |

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

### Padrões do projeto

- API: `getAuthenticatedUserId()` + try/catch + mensagens PT-BR
- Data isolation: `userId` em todas as queries
- Cache: `Map<string, T[]>` por userId, função `invalidate*Cache()`
- Matching: `toUpperCase().includes()` para keywords
- Badges: `<Badge variant="outline" className="text-xs bg-{color}-50 text-{color}-700 border-{color}-200">`
- Toast de sugestão: `toast({ title, description, action: <ToastAction> })`

### Estilo visual dos category tags

Usar **teal** para diferenciar de badges existentes:
- `bg-teal-50 text-teal-700 border-teal-200` (import badges)
- Sub-label na listagem: texto cinza separado por "·"

---

## Learnings

---

## References

- Research: `../research/2026-03-03-category-tags-research.md`
- Design: `../../brainstorm/2026-03-03-category-tags-design.md`
- Similar implementations: `src/app/api/rules/route.ts`, `src/lib/categorizer.ts:1-47`
