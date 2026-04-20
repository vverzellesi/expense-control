# AI Parser de Fatura/Extrato — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o parser atual de fatura/extrato (OCR + regex de 1424 linhas) por extração via Gemini 2.5 Flash-Lite multimodal, com quota mensal por usuário e fallback automático para o pipeline existente.

**Architecture:** Pipeline unificado `parseFileForImport(buffer, mime, filename, userId)` consumido tanto pelo endpoint `/api/ocr` quanto pelo bot do Telegram. Stages: (1) notification-parser regex pra push screenshots, (2) AI com quota-check → Gemini multimodal, (3) fallback `processFile` + `parseStatementText` do pipeline atual. Quota de 5 calls/mês/usuário em modelo Prisma dedicado (`AiUsage`).

**Tech Stack:** Next.js 14 App Router · TypeScript strict · Prisma + PostgreSQL (Neon via driverAdapters) · `@google/genai` (Gemini SDK) · Vitest (unit/integration) · Playwright (E2E)

---

## Overview

Hoje o `statement-parser.ts` (1424 linhas) precisa ganhar código novo a cada banco novo e quebra em variações de layout. Essa dor é amplificada por múltiplos usuários com bancos diferentes. Este plano troca o parser por IA multimodal (Gemini), que generaliza sem regex por banco, limitada a 5 calls/mês/usuário (~R$ 0,06/usuário/mês, projeto cabe no free tier do Gemini até ordem de magnitude de 100s de usuários).

## Current State Analysis

- **Pipeline duplicado:** `src/app/api/ocr/route.ts:112-140` e `src/lib/telegram/commands.ts:755-780` repetem `processFile → parseStatementText → parseNotificationText`. Oportunidade de consolidar.
- **Tesseract.js no caminho feliz:** lento e pobre em qualidade pra faturas digitais. Gemini processa PDF nativamente, tesseract vira fallback.
- **Database é PostgreSQL (Neon via driverAdapters):** `prisma/schema.prisma:7-10` — a CLAUDE.md menciona SQLite mas está desatualizada.
- **Zero infraestrutura de quota:** sem rate limiting por usuário hoje. Novo modelo necessário.
- **Sem SDK Gemini instalado:** adicionar `@google/genai` (SDK oficial novo; `@google/generative-ai` é legacy).
- **UI atual de import:** `src/app/import/page.tsx` (2269 linhas) já tem fluxo completo de upload + preview. Vai ganhar badge de quota e indicador de "extraído com IA".

## Desired End State

1. Upload de fatura/extrato via web ou Telegram roda Gemini Flash-Lite primeiro (quota permitindo) e devolve transações extraídas.
2. Quota esgotada → fallback silencioso pro pipeline atual (tesseract + regex) com aviso amarelo na UI.
3. Usuário vê quantas calls restam no mês no modal de upload.
4. AI e quota desligam automaticamente se `GEMINI_API_KEY` não estiver configurada (dev/self-host).
5. Todos os testes (`npm run test:all`) passam.
6. Endpoint `GET /api/ai-usage` disponível e funcionando.

**Verificação:** Upload de uma fatura PDF nova (ex: Inter, Bradesco — bancos fora do regex atual) → transações aparecem corretamente extraídas, badge mostra "4/5 usos". Remover `GEMINI_API_KEY` do env → mesmo upload cai no fallback regex com aviso.

## What We're NOT Doing

- Screenshots de notificação push ("Compra aprovada R$ X em Y") — permanecem 100% no `notification-parser.ts` regex
- Importação CSV — `csv-parser.ts` continua como está
- BYOK (usuário trazendo própria API key) — key é app-wide
- Monetização de quota extra paga
- Admin override de quota por usuário (coluna `monthlyLimit` em User) — futuro
- Cleanup script pra rows antigas de `AiUsage`
- Página `/settings/ai` com histórico mensal — futuro
- E2E Playwright completo — marca como v1.5 se sobrar tempo
- Retry ladder Flash-Lite → Flash (Abordagem B do brainstorm) — só se Flash-Lite falhar muito em produção
- Refactor do `statement-parser.ts` de 1424 linhas — ele vira fallback e decai naturalmente

---

## Related Documentation

| Document | Relevância |
|----------|-----------|
| `ai_docs/brainstorm/2026-04-19-ai-parser-fatura-extrato-design.md` | Design validado com decisões e custos |
| `src/app/api/ocr/route.ts` | Endpoint web de OCR — será refatorado na Phase 3 |
| `src/lib/telegram/commands.ts` | Bot do Telegram — também será refatorado na Phase 3 |
| `src/lib/ocr-parser.ts` | `processFile`, `processImageOCR` — permanecem como fallback |
| `src/lib/statement-parser.ts` | Parser regex atual — permanece como fallback |
| `src/lib/notification-parser.ts` | Parser de push notifications — usado no STEP 1 |
| `src/app/import/page.tsx` | UI de import — badge e indicador adicionados na Phase 4 |
| `prisma/schema.prisma` | Schema PostgreSQL — novo modelo `AiUsage` na Phase 1 |
| `src/types/index.ts:133-168` | `ImportedTransaction`, `StatementParseResult` — tipos reusados |
| https://ai.google.dev/gemini-api/docs/pricing | Pricing oficial Gemini |
| https://ai.google.dev/gemini-api/docs/document-processing | Tokenização e limites de PDF |
| https://ai.google.dev/gemini-api/docs/structured-output | Structured output nativo (JSON schema) |

**Scope Warning:** Este plano cobre parser AI, quota, pipeline unificado e UX (web + Telegram). Não toca categorização (`suggestCategory`), detecção de parcelas (`detectInstallment`), detecção de recorrência (`detectRecurringTransaction`), dedup, nem CSV import.

---

## Phases

| Fase | Arquivo | Escopo |
|---|---|---|
| 1 | [phase-1-foundation.md](phase-1-foundation.md) | Modelo `AiUsage` + migration + módulo `ai-quota.ts` + endpoint `GET /api/ai-usage` |
| 2 | [phase-2-ai-parser.md](phase-2-ai-parser.md) | `gemini-client.ts`, `invoice-parser.ts`, `schema.ts`, `prompt.ts` + tests com fixtures |
| 3 | [phase-3-unified-pipeline.md](phase-3-unified-pipeline.md) | `parse-pipeline.ts` + refactor de `/api/ocr/route.ts` e `telegram/commands.ts` |
| 4 | [phase-4-web-ux.md](phase-4-web-ux.md) | Badge de quota no modal de import + indicador de source (AI/regex/notif) |
| 5 | [phase-5-telegram-ux.md](phase-5-telegram-ux.md) | Mensagens do bot com info de AI/quota/fallback |

**Ordem obrigatória:** 1 → 2 → 3 → 4 → 5. Fase 3 depende de 1 e 2. Fase 4 depende de 3. Fase 5 depende de 3.

---

## Deploy Checklist (após Phase 5)

**GATE OBRIGATÓRIO antes de habilitar IA em produção:**

- [ ] **Calibração manual passou** — rodar `tsx tests/calibration/run.ts` localmente com `GEMINI_API_KEY` de dev, usando ao menos 5 faturas/extratos reais (anonimizados, não versionados) de bancos variados (Nubank, Itaú, C6, BTG, Inter). Accuracy ≥ 80% em cada documento. Registrar resultados em `ai_docs/ai-parser-calibration/YYYY-MM-DD.md` (só métricas, nunca dados reais). Se algum banco ficar abaixo, ajustar prompt ou fixtures e repetir.

**Deploy:**

- [ ] Criar API key no Google AI Studio (https://aistudio.google.com/apikey)
- [ ] Adicionar como `GEMINI_API_KEY` em produção (Vercel env var, NUNCA em código)
- [ ] Adicionar `AI_MONTHLY_QUOTA=5` em produção (valor default se omitido)
- [ ] Rodar `npx prisma migrate deploy` contra o banco de produção (`pgcrypto` já vem habilitado no Neon)
- [ ] Verificar endpoint: `GET /api/ai-usage` responde com `{ used: 0, remaining: 5, limit: 5, yearMonth: "..." }`

**Smoke test em produção:**

- [ ] Upload de 1 fatura real → preview mostra "✨ Extraído com IA" + amounts **negativos** pra despesas
- [ ] Upload de 1 PDF com senha → flow de senha funciona (pipeline pula AI via preflight)
- [ ] Upload de 1 screenshot de notificação push → usa `notif` parser (não consome quota)
- [ ] Forçar erro: temporariamente setar `GEMINI_API_KEY=invalid` → upload cai no fallback regex, badge mostra aviso

**Comunicação:**

- [ ] Anunciar pros beta users que IA está habilitada
- [ ] Monitorar logs da primeira semana — distribuição de `source` no logging estruturado, tempo médio de call

## Rollback Plan

Se IA causar problemas em produção:

1. Unset `GEMINI_API_KEY` na Vercel → deploy não necessário, pipeline cai automaticamente no fallback
2. Se quiser desativar completamente: set `AI_MONTHLY_QUOTA=0`
3. Código do fallback (regex + tesseract) permanece intacto e sempre funcional

Sem necessidade de revert de migration ou código.
