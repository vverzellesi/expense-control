# Suporte a PDF com Senha — Plano de Implementação

## Overview

Adicionar suporte a PDFs protegidos por senha no fluxo de importação OCR. Elimina a necessidade do usuário remover manualmente a senha do PDF antes de importar faturas/extratos bancários (principalmente C6 Bank). A senha pode ser informada no momento do upload ou salva (criptografada) para uso automático em futuras importações.

## Current State Analysis

- `src/lib/ocr-parser.ts:65-78` — `extractPDFText()` usa `unpdf.extractText()` para extrair texto de PDFs. Erros de senha são capturados genericamente e transformados em "Não foi possível extrair texto do PDF"
- `src/app/api/ocr/route.ts:13-134` — POST handler recebe FormData com campo `file`. Não aceita senha. Erros propagam como status 500
- `src/app/import/page.tsx:645-704` — `processOCR()` envia arquivo para `/api/ocr`. Não tem mecanismo de retry ou input de senha
- `prisma/schema.prisma:334-346` — Modelo `Settings` (key-value por userId) com API REST em `/api/settings/route.ts`
- `src/lib/auth-utils.ts:76-114` — `getAuthContext()` retorna `userId` e `ownerFilter` para isolamento de dados
- `unpdf` aceita segundo parâmetro `options` com campo `password`, passado ao `pdf.js`

## Desired End State

1. Upload de PDF com senha → MyPocket detecta automaticamente e pede a senha
2. Se existe senha salva, tenta silenciosamente antes de pedir
3. Senha incorreta mostra erro claro com opção de tentar novamente
4. Checkbox permite salvar senha (AES-256) para uso futuro
5. Endpoint dedicado para verificar/remover senha salva
6. PDFs sem senha continuam funcionando exatamente como hoje

**Verificação:** Upload de um PDF protegido por senha do C6 Bank → app processa e exibe transações sem o usuário precisar remover a senha manualmente.

## What We're NOT Doing

- Múltiplas senhas por banco (YAGNI — uma senha salva + input avulso é suficiente)
- Integração com APIs bancárias (Pluggy, Open Finance)
- Share Extension iOS ou Apple Shortcuts
- Alterações no schema Prisma (usa modelo Settings existente)
- Seção dedicada na página de configurações (gerenciamento via UI de importação)

---

## Related Documentation

| Document | Relevance |
|----------|-----------|
| `ai_docs/brainstorm/2026-04-02-pdf-password-support-design.md` | Design aprovado com fluxo de decisão, segurança e UI |
| `ai_docs/research/2026-04-02-pdf-password-research.md` | Pesquisa detalhada do codebase (OCR, auth, settings, testes) |
| `src/lib/statement-parser.ts` | Parser de extratos chamado após extração de texto — não modificado |
| `src/app/api/settings/route.ts` | API REST de Settings usada para persistir senha criptografada |

**Scope Warning:** Este plano cobre a cadeia upload → decrypt → extração de texto → resposta + persistência de senha. Não assume comportamento de parsers de extrato (`statement-parser.ts`, `notification-parser.ts`) ou do serviço de importação (`import-service.ts`).

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| `unpdf.extractText` não propagar campo `password` para pdf.js | M | H | On Failure no Task 1.2: usar `getDocument` do pdf.js diretamente como fallback |
| Erro de pdf.js não ter formato `PasswordException` esperado | L | M | Catch genérico + log do erro original para diagnóstico |
| Chave de criptografia ausente (`PDF_ENCRYPTION_KEY`) | M | H | Validação explícita com erro claro; `.env.example` atualizado |
| Senha salva corrompida ou chave trocada | L | M | Try/catch ao decriptar retorna null, forçando input manual |

---

## Phases

| # | Phase | File | Summary | Status | Depends On |
|---|-------|------|---------|--------|------------|
| 1 | Backend: Decrypt + API | `phase-1-backend-decrypt-api.md` | Módulo crypto, detecção de senha em OCR, API aceitando senha | pending | — |
| 2 | Persistência + Frontend | `phase-2-persistence-frontend.md` | API de gerenciamento de senha salva, UI de input de senha | pending | Phase 1 |

---

## Success Criteria Dashboard

### Phase 1: Backend Decrypt + API

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pending |
| Upload de PDF com senha via curl retorna transações | manual | pending |

### Phase 2: Persistência + Frontend

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(running-automated-checks)` | auto | pending |
| Fluxo completo no browser: upload PDF com senha → preview de transações | manual | pending |

### Final Verification (after all phases)

| Criteria | Type | Status |
|----------|------|--------|
| `Skill(reviewing-code)` | auto | pending |
| `Skill(validating-implementation)` | auto | pending |

---

## Known Executor Risks

| Scenario | Likelihood | Fallback |
|----------|------------|----------|
| `unpdf` não aceita `{ password }` no `extractText` | M | Importar `getDocument` de `unpdf/pdfjs` e usar diretamente com `{ password }` |
| Tipo do erro de pdf.js não é `PasswordException` | L | Verificar `error.message` contendo "password" como fallback de detecção |
| `PDF_ENCRYPTION_KEY` não definida em testes | M | Mock do `process.env` no setup de testes |

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

### Decisão: Settings vs User Model

Usar modelo `Settings` existente (key-value) ao invés de adicionar campos ao modelo `User`. Vantagens: sem migration Prisma, API REST já existe, segue padrão do codebase.

A senha é armazenada como JSON `{ encrypted: "hex", iv: "hex" }` na key `pdfPassword`.

### Decisão: unpdf com password vs pdf-lib

Tentar passar `{ password }` diretamente ao `extractText` do unpdf (mais simples, sem dependência extra). Se não funcionar, fallback documentado no plano.

### Padrão de Criptografia

AES-256-CBC com IV aleatório por operação. Chave em `PDF_ENCRYPTION_KEY` (hex, 64 chars = 32 bytes). Módulo `crypto` nativo do Node.js.

### Code Design Principles

**Project rules are the source of truth.** Before writing code, load standards in this order:

1. **Project-specific rules (PRIMARY):**
   - `CLAUDE.md` in project root

2. **Generic guidelines (MANDATORY if no project patterns defined):**
   ```bash
   cat $HOME/.claude/docs/code-principles.md
   cat $HOME/.claude/docs/testing-principles.md
   ```

---

## Learnings

---

## References

- Research: `../research/2026-04-02-pdf-password-research.md`
- Design: `../../brainstorm/2026-04-02-pdf-password-support-design.md`
- Similar crypto: `src/app/api/telegram/webhook/route.ts` (timingSafeEqual)
- Similar settings usage: `src/app/api/settings/route.ts`
