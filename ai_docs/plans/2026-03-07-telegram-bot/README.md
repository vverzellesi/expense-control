# Bot Telegram MyPocket — Plano de Implementação

## Overview

Integrar um bot Telegram ao MyPocket para registrar despesas, importar faturas CSV e consultar orçamentos/gastos via chat. Inclui deduplicação centralizada para evitar transações duplicadas tanto no bot quanto no app web.

## Current State Analysis

- **Sem deduplicação:** importar o mesmo CSV duas vezes cria duplicatas (`src/app/api/import/route.ts:166-186` cria transações incondicionalmente)
- **Sem integração Telegram:** nenhum modelo, endpoint ou lógica de bot existe
- **Settings extensível:** página de settings (`src/app/settings/page.tsx:528-554`) usa tabs Radix — nova aba é direta
- **Middleware restritivo:** `src/auth.config.ts:11-28` bloqueia todas as rotas não-auth — webhook precisa de exceção
- **Summary endpoint reutilizável:** `GET /api/summary` retorna totais, breakdown por categoria e alertas de orçamento — ideal para consultas do bot
- **Categorizer reutilizável:** `src/lib/categorizer.ts:95-109` faz auto-categorização por keywords — bot pode usar diretamente
- **CSV parser reutilizável:** `src/lib/csv-parser.ts:151` detecta banco e parseia — bot pode chamar diretamente

## Desired End State

1. Módulo de deduplicação centralizado previne transações duplicatas em toda a aplicação
2. Bot Telegram funcional com: vinculação por deep link, registro de despesas via texto, importação CSV, consultas de resumo/categorias/transações
3. Nova aba "Telegram" na página de settings com botão de vincular/desvincular
4. Webhook seguro integrado ao Next.js sem dependências externas pesadas

**Verificação:** Enviar mensagem de texto com dados de transação no Telegram → transação aparece no dashboard web. Importar mesmo CSV via bot e via web → sem duplicatas.

## What We're NOT Doing

- Interface de IA/NLP — apenas comandos e formatos estruturados
- Notificações proativas do bot (alertas de orçamento, lembretes)
- Suporte a WhatsApp ou outros mensageiros
- OCR de prints/fotos via bot (apenas texto e CSV)
- Paginação server-side no endpoint de transações existente

---

## Related Documentation

| Document | Relevância |
|----------|-----------|
| `ai_docs/brainstorm/2026-03-07-telegram-bot-design.md` | Design validado com todas as decisões |
| `ai_docs/research/2026-03-07-telegram-bot-research.md` | Pesquisa detalhada do codebase |
| `ai_docs/diagrams/api-flows.md` | Fluxos de API existentes |
| `ai_docs/diagrams/data-models.md` | Diagrama ER das entidades |
| `src/app/api/import/route.ts` | Fluxo de importação a ser modificado com dedup |
| `src/app/api/summary/route.ts` | Queries do dashboard a reutilizar para consultas do bot |

**Scope Warning:** Este plano cobre o bot Telegram, dedup, e a aba de settings. Não assume comportamento de investments, recurring expenses, ou OCR.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Telegram webhook não alcançável em dev local | H | M | Usar ngrok/localtunnel para expor URL local; endpoint de setup aceita URL customizada |
| Dedup falso positivo (pular transação legítima) | L | H | Match exato (description case-insensitive + amount + date mesmo dia) — conservador por design |
| Middleware bloqueia webhook requests | M | H | Adicionar exceção explícita em auth.config.ts; testar com request sem session |
| Telegram File API timeout para CSVs grandes | L | M | Limitar tamanho de arquivo (20MB — limite do Telegram); timeout generoso no fetch |
| Schema migration quebra banco existente | L | H | Novos modelos apenas (additive) — sem alteração em modelos existentes |

---

## Phases

| # | Phase | File | Summary | Status | Depends On |
|---|-------|------|---------|--------|------------|
| 1 | Schema + Deduplicação | `phase-1-schema-dedup.md` | Modelos Prisma + módulo dedup + integração na importação | complete | — |
| 2 | Core do Bot + Webhook | `phase-2-bot-core.md` | Cliente Telegram, webhook endpoint, handler principal | complete | Phase 1 |
| 3 | Vinculação via Deep Link | `phase-3-linking.md` | API de tokens, comando /start, aba Settings | complete | Phase 2 |
| 4 | Registro de Despesas | `phase-4-expense-registration.md` | Parser de mensagens, confirmação com keyboard, criação de transação | complete | Phase 3 |
| 5 | CSV Import + Consultas | `phase-5-csv-queries.md` | Importação CSV via bot, menu de consultas | complete | Phase 4 |

---

## Success Criteria Dashboard

### Phase 1: Schema + Deduplicação
| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pass |
| `npm run db:generate` executa sem erros | auto | pass |

### Phase 2: Core do Bot + Webhook
| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pass |

### Phase 3: Vinculação via Deep Link
| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pass |
| Vincular conta via deep link no Telegram (requer bot token real) | manual | pending |

### Phase 4: Registro de Despesas
| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pass |

### Phase 5: CSV Import + Consultas
| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pass |
| Enviar CSV via Telegram e verificar importação no dashboard | manual | pending |

### Final Verification (after all phases)
| Criteria | Type | Status |
|----------|------|--------|
| `Skill(reviewing-code)` | auto | pass |
| `Skill(validating-implementation)` | auto | pending |

---

## Known Executor Risks

| Scenario | Likelihood | Fallback |
|----------|------------|----------|
| Prisma migration path differs between PostgreSQL and SQLite | M | Usar `db:push` em dev, `db:migrate` para criação formal |
| `parseCSV` requer `origin` como segundo parâmetro | M | Verificar signature antes de chamar; origin pode ser "Telegram" |
| Settings page é muito grande (~1200 linhas) | H | Executor deve usar Edit cirúrgico com strings únicas para inserir tab |
| Telegram API types não disponíveis sem lib | L | Definir tipos inline para Update, Message, CallbackQuery |
| Setup endpoint chamado por usuário não-admin | M | Endpoint protegido por `TELEGRAM_SETUP_SECRET` header |

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
- API routes: `getAuthenticatedUserId()` para rotas autenticadas, validação de `TELEGRAM_WEBHOOK_SECRET` para webhook
- Prisma queries sempre filtram por `userId`
- Textos de UI e respostas do bot em PT-BR
- Amounts: negativo para despesas, positivo para receitas
- Datas: append `T12:00:00` para evitar timezone issues

### Telegram API
- Usar `fetch` direto ao invés de dependência externa
- Base URL: `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/`
- Webhook secret via header `X-Telegram-Bot-Api-Secret-Token`
- File download: `https://api.telegram.org/file/bot${TOKEN}/${file_path}`

### Code Design Principles
**Project rules are the source of truth.** Before writing code, load:
1. `CLAUDE.md` in project root
2. `$HOME/.claude/docs/code-principles.md` (fallback)

---

## Learnings

1. **Prisma/DB:** Projeto usa PostgreSQL com Neon adapter (driverAdapters preview). `db:generate` funciona sem DATABASE_URL mas `db:push` e `build` requerem a variável.
2. **Dedup:** Match exato (description case-insensitive + amount + mesmo dia) é conservador e evita falsos positivos.
3. **Middleware:** Exceção no auth usa `===` (match exato) ao invés de `startsWith` para evitar bypass em sub-rotas.
4. **Telegram sem lib:** Tipos definidos inline, `fetch` direto para API — funcional sem dependência externa.
5. **Settings page:** ~1200 linhas — edição cirúrgica com strings de contexto únicas funciona bem.
6. **Category change flow:** `handleShowCategories` e `handleSetCategory` precisam preservar as linhas de dados (📝💰📅) da despesa no texto da mensagem, senão `handleConfirmExpense` não consegue parsear os dados após troca de categoria.
7. **MapIterator spread:** `[...map.entries()]` não funciona com o target ES do projeto; usar `Array.from(map.entries())`.

---

## References

- Research: `../research/2026-03-07-telegram-bot-research.md`
- Brainstorm: `../brainstorm/2026-03-07-telegram-bot-design.md`
- Similar: `src/app/api/import/route.ts` (import flow), `src/app/api/summary/route.ts` (dashboard queries)
