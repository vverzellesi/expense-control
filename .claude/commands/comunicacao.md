---
description: Gera mensagem de lançamento de feature no formato WhatsApp (MyPocket)
argument-hint: [nome/descrição da feature]
---

Você vai gerar uma mensagem de comunicação de nova feature pra ser enviada via WhatsApp aos usuários do MyPocket.

## Diretrizes, template e exemplos

@ai_docs/comunicacao-features.md

## Feature a comunicar

$ARGUMENTS

## Instruções

1. **Se `$ARGUMENTS` estiver vazio ou for genérico** (ex: só "nova feature"), pergunte ao usuário antes de escrever:
   - Qual o nome da feature?
   - O que ela faz (2-3 bullets do que muda pro usuário)?
   - Como o usuário ativa/usa?

2. **Siga ESTRITAMENTE** o template em `ai_docs/comunicacao-features.md`. Use os exemplos do "Bot do Telegram" e "Espaço Família" como referência de tom, tamanho e qualidade.

3. **Regras não-negociáveis:**
   - Tom friendly, voz da empresa (NUNCA primeira pessoa — nada de "me conta", "me atualiza")
   - Máximo ~20 linhas visíveis no WhatsApp
   - 1-2 emojis por bloco, não mais
   - Separadores `━━━━━━━━━━━━━━━`
   - Bold com `*texto*`, itálico com `_texto_` (formatação WhatsApp, NÃO markdown)
   - Sem headers (`#`), sem tabelas, sem listas aninhadas
   - CTA no fechamento convidando a testar + pedindo feedback
   - Mencionar explicitamente que a feature já está disponível

4. **Entregue a mensagem dentro de um bloco de código** (três crases) pra preservar a formatação bruta pronta pra copiar-colar no WhatsApp.

5. **Depois de gerar, valide contra o checklist:**
   - [ ] Abertura com nome do app + título (1 linha, 1 emoji)
   - [ ] Separador visual
   - [ ] 2-4 blocos de funcionalidade (emoji + título em *bold* + 2-3 linhas)
   - [ ] Seção "Como ativar/usar" com passos numerados
   - [ ] Separador visual
   - [ ] Frase de contexto (sincronização, segurança, privacidade)
   - [ ] CTA final
   - [ ] Sem "me conta", "me atualiza", "prezado cliente"
   - [ ] Formatação WhatsApp correta (não Markdown)

6. Se o usuário pedir ajustes (mais curto, mais técnico, outro tom), itere na mensagem — não gere versões alternativas sem pedir.
