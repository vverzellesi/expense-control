# Comunicação de Novas Features — WhatsApp

Diretrizes e templates para mensagens de lançamento de features enviadas via WhatsApp aos usuários do MyPocket.

---

## Diretrizes

### Tom e Estilo
- **Friendly e acessível** — como se fosse um amigo contando uma novidade, não um comunicado corporativo
- **Convidar a testar** — sempre incluir um CTA claro pedindo feedback ou convidando a experimentar
- Usar "você" (nunca "prezado cliente" ou linguagem formal)
- Manter entusiasmo sem exagero — 1 a 2 emojis por bloco, não mais
- Frases curtas e diretas. Evitar parágrafos longos

### Estrutura da Mensagem
1. **Abertura** — Nome do app + título da novidade (1 linha, com emoji)
2. **Separador visual** — Linha de ━ para dar respiro
3. **Blocos de funcionalidade** — Cada feature em um bloco com emoji + título em bold + descrição curta (2-3 linhas)
4. **Como ativar/usar** — Passos numerados, simples e diretos
5. **Separador visual**
6. **Fechamento** — Frase de contexto (sincronização, segurança, etc.)
7. **CTA** — Convite para testar + pedido de feedback

### Formatação WhatsApp
- Bold: `*texto*`
- Itálico: `_texto_`
- Riscado: `~texto~`
- Monospace: ``` `texto` ``` ou blocos com três crases
- Sem suporte a links clicáveis com texto âncora — usar URL direta quando necessário
- Sem suporte a headers (#), tabelas ou markdown avançado
- Listas com • (bullet unicode) ou números
- Separadores com ━ (unicode box drawing)

### Boas Práticas
- Máximo ~20 linhas visíveis (WhatsApp trunca mensagens longas com "Ler mais")
- Testar a mensagem no próprio WhatsApp antes de enviar em massa
- Incluir exemplo prático quando a feature envolve input do usuário
- Sempre mencionar que a feature já está disponível (senão o usuário espera)
- Fechar com pergunta ou convite — gera resposta e engajamento

---

## Template Base

```
*🚀 MyPocket — [Título da Novidade]*

[Frase de abertura — 1 linha, friendly, dizendo o que mudou]

━━━━━━━━━━━━━━━

*[emoji] [Nome da funcionalidade 1]*
[Descrição em 2-3 linhas. Incluir exemplo se aplicável.]

*[emoji] [Nome da funcionalidade 2]*
[Descrição em 2-3 linhas.]

*[emoji] Como ativar*
1. [Passo 1]
2. [Passo 2]
3. [Passo 3]

━━━━━━━━━━━━━━━

[Frase de contexto — segurança, sincronização, etc.]

[CTA — convite para testar + pedido de feedback]
```

---

## Mensagens Enviadas

### Bot do Telegram (março/2026)

```
*🚀 MyPocket — Novidade: Bot do Telegram*

Agora dá pra registrar gastos, importar extratos e consultar suas finanças *direto pelo Telegram*. Sem precisar abrir o app!

━━━━━━━━━━━━━━━

*💬 Registre gastos por mensagem*
Mande algo como:
_PIX Restaurante 45,90_
O bot categoriza automaticamente e pede sua confirmação. Um toque e tá lançado!

*📎 Importe extratos pelo chat*
Envie o CSV do seu banco (C6, Itaú ou BTG) direto no chat. O bot detecta duplicatas, mostra um resumo e importa tudo pra você.

*📊 Consulte suas finanças*
Use /menu no bot pra ver:
• Resumo do mês (receitas, despesas, saldo)
• Gastos por categoria vs. orçamento
• Últimas transações

*🔗 Como ativar*
1. Acesse _Configurações → Telegram_ no MyPocket
2. Clique em _Vincular Telegram_
3. Abra o link e pronto — conta conectada!

━━━━━━━━━━━━━━━

Tudo fica sincronizado. O que você lançar pelo Telegram aparece no dashboard, e se importar o mesmo extrato duas vezes, o bot já ignora as duplicatas.

Testa lá e me conta o que achou! Se tiver qualquer dúvida ou sugestão, é só responder aqui 👇
```

