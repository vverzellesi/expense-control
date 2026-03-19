# Comunicação de Novas Features — WhatsApp

Diretrizes e templates para mensagens de lançamento de features enviadas via WhatsApp aos usuários do MyPocket.

---

## Diretrizes

### Tom e Estilo
- **Friendly e acessível** — tom de empresa próxima, não comunicado corporativo
- **Convidar a testar** — sempre incluir um CTA claro pedindo feedback ou convidando a experimentar
- Usar "você" (nunca "prezado cliente" ou linguagem formal)
- **Sem primeira pessoa** — não usar "me conta", "me atualiza". Usar "conte", "compartilhe". A voz é da empresa, não de uma pessoa
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

Teste e conte o que achou! Dúvidas ou sugestões, é só responder aqui 👇
```

### Espaço Família (março/2026)

```
*🏠 MyPocket — Novidade: Espaço Família*

Agora você pode gerenciar finanças junto com quem divide as contas! Criamos o *Espaço Família* — um espaço compartilhado onde vocês veem tudo junto: transações, orçamentos, categorias e investimentos.

━━━━━━━━━━━━━━━

*👥 Espaço compartilhado*
Crie um espaço e convide seu parceiro(a) ou família. Cada pessoa mantém sua conta pessoal e pode alternar pro espaço compartilhado com um clique na barra lateral.

*🔒 Privacidade por transação*
Tem um gasto que é só seu? Marque como privado e ele fica visível só pra você, mesmo dentro do espaço compartilhado.

*🎯 Papéis e permissões*
Três níveis de acesso: _Admin_ (controle total), _Membro_ (registra e consulta) e _Limitado_ (só visualiza). Você decide o que cada pessoa pode fazer.

*📲 Como ativar*
1. Acesse _Configurações → Espaços_
2. Clique em _Criar Espaço Família_
3. Convide por e-mail ou compartilhe o link de convite

━━━━━━━━━━━━━━━

Tudo fica sincronizado — o que um registra no espaço, o outro vê na hora. E se quiser, dá pra migrar transações que já existem na sua conta pessoal pro espaço compartilhado.

Teste com quem divide as contas e conte o que acharam! Sugestões são super bem-vindas 👇
```

