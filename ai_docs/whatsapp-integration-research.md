# Pesquisa: Integração WhatsApp para MyPocket

**Data:** 2026-03-14
**Contexto:** App com <10 usuários, poucas mensagens/dia. Já existe integração com Telegram.

---

## Resumo Executivo

Para o cenário atual (~10 usuários, poucas mensagens/dia), a integração com WhatsApp via Cloud API da Meta seria **praticamente gratuita**. O custo estimado é de **R$ 0,00 a R$ 5,00/mês** com o volume de uso esperado.

---

## Opções de Integração

### Opção 1: WhatsApp Cloud API (Meta) — Recomendada

A API oficial da Meta, hospedada nos servidores deles. Sem necessidade de infraestrutura adicional.

**Prós:**
- Sem custo de infraestrutura (Meta hospeda)
- SDK oficial Node.js/TypeScript disponível
- Webhook similar ao Telegram (fácil adaptar código existente)
- 1.000 conversas de serviço gratuitas/mês
- Mensagens de serviço (resposta ao usuário em 24h) são **gratuitas**

**Contras:**
- Requer conta Meta Business e app no Meta Developers
- Processo de verificação do número de telefone
- Precisa de um número de telefone dedicado (não pode ser o pessoal)
- Templates de mensagem precisam ser aprovados pela Meta
- Mais burocrático que Telegram

### Opção 2: BSPs (Twilio, etc.)

Provedores intermediários que facilitam o acesso à API.

**Prós:**
- Setup mais simples
- SDKs mais maduros

**Contras:**
- Custo mensal adicional (Twilio: $0.005/msg + taxa Meta)
- Desnecessário para volume baixo
- Mais uma dependência externa

---

## Custos Detalhados — Cloud API (Meta direta)

### Modelo de Precificação (desde julho/2025)

A Meta cobra **por mensagem template enviada**, baseado em:
1. **Categoria** da mensagem
2. **País** do destinatário (Brasil)
3. **Volume** mensal

### Categorias e Custos (Brasil, USD)

| Categoria | Custo por msg | Quando se aplica |
|-----------|--------------|------------------|
| **Service** | **Grátis** | Resposta dentro de 24h após msg do usuário |
| **Utility** | $0.0068 (~R$ 0.04) | Notificações transacionais fora da janela de 24h |
| **Utility (dentro da janela 24h)** | **Grátis** | Templates utilitários enviados dentro de 24h |
| **Marketing** | $0.0625 (~R$ 0.37) | Promoções, campanhas (não usaríamos) |
| **Authentication** | $0.0315 (~R$ 0.19) | Códigos de login (não usaríamos) |

### Cenário MyPocket

No nosso caso de uso (usuário envia mensagem → bot responde):

1. **Usuário envia despesa** → abre janela de 24h → resposta é **gratuita** (Service)
2. **Usuário envia CSV** → abre janela de 24h → resposta é **gratuita** (Service)
3. **Usuário consulta resumo** → abre janela de 24h → resposta é **gratuita** (Service)

**Todas as interações do MyPocket são iniciadas pelo usuário**, então caem na categoria Service → **custo zero para Meta**.

### Estimativa Mensal

| Item | Custo |
|------|-------|
| Infraestrutura Cloud API | $0 (Meta hospeda) |
| Mensagens de serviço (resposta em 24h) | $0 (grátis) |
| BSP/provedor intermediário | $0 (uso direto da Meta) |
| Número de telefone dedicado | $0 (usa número próprio no WhatsApp Business) |
| **Total estimado** | **$0/mês** |

> **Nota:** O único cenário com custo seria se o bot enviasse mensagens proativas (sem o usuário ter mandado mensagem antes), o que exigiria templates aprovados e cobrança por mensagem. No nosso caso isso não se aplica.

---

## Esforço de Implementação

### O que já existe (reaproveitável do Telegram)

A integração Telegram atual é bem modular e boa parte pode ser reaproveitada:

| Componente | Reaproveitável? | Observação |
|-----------|----------------|------------|
| `parser.ts` (parsing de despesas) | 100% | Lógica independente de plataforma |
| `queries.ts` (consultas de dados) | 100% | Lógica independente de plataforma |
| `commands.ts` (lógica de negócio) | ~70% | Precisa adaptar formatação de respostas |
| `bot.ts` (roteador de mensagens) | ~50% | Fluxo similar, API diferente |
| `client.ts` (API wrapper) | 0% | API completamente diferente |
| Modelos Prisma (Link, Token, PendingImport) | ~80% | Criar equivalentes WhatsApp |
| Webhook route | ~30% | Verificação diferente (Meta usa GET challenge) |
| Testes | ~60% | Adaptar mocks para API do WhatsApp |

### Diferenças Técnicas Relevantes

| Aspecto | Telegram | WhatsApp Cloud API |
|---------|----------|--------------------|
| Webhook setup | Header secret + POST | GET verification challenge + POST |
| Botões inline | `InlineKeyboardMarkup` | `interactive` messages com buttons/lists |
| Envio de msg | `sendMessage` simples | Graph API (`POST /v18.0/{phone_id}/messages`) |
| Edição de msg | `editMessageText` | Não suportado (precisa enviar nova msg) |
| Download arquivo | File API do Telegram | Media API do Graph (requer download com token) |
| Formatação | Markdown/HTML | Limitado (negrito, itálico, monospace) |
| Limite botões | Muitos (inline keyboard) | Máx 3 botões por mensagem |
| Identificador | `chatId` (numérico) | Número de telefone (string) |

### Arquitetura Sugerida

```
src/lib/messaging/           # Camada abstrata (novo)
  ├── types.ts               # Interface comum (Message, Button, etc.)
  ├── telegram/              # Implementação Telegram (mover de src/lib/telegram/)
  │   ├── client.ts
  │   └── adapter.ts         # Adapta para interface comum
  └── whatsapp/              # Implementação WhatsApp (novo)
      ├── client.ts           # Wrapper da Graph API
      └── adapter.ts          # Adapta para interface comum

src/app/api/whatsapp/
  ├── webhook/route.ts        # Webhook (GET verify + POST messages)
  ├── link/route.ts           # Vinculação de conta
  └── setup/route.ts          # Setup admin
```

### Estimativa de Esforço

| Fase | Descrição | Complexidade |
|------|-----------|-------------|
| 1 | Setup Meta Business + Cloud API | Baixa (burocrático) |
| 2 | Client WhatsApp (Graph API wrapper) | Média |
| 3 | Webhook + verificação | Baixa |
| 4 | Vinculação de conta | Baixa (reusar lógica) |
| 5 | Registro de despesas | Média (adaptar botões) |
| 6 | Import CSV | Média (media download diferente) |
| 7 | Consultas (resumo, categorias, transações) | Baixa (reusar queries) |
| 8 | Testes | Média |

### Desafios Específicos do WhatsApp

1. **Sem edição de mensagem** — No Telegram, editamos a mensagem original após confirmação. No WhatsApp, precisaremos enviar mensagem nova.
2. **Limite de 3 botões** — A seleção de categoria no Telegram usa inline keyboard com muitos botões. No WhatsApp, precisaremos usar `list` messages (até 10 itens) ou paginação.
3. **Verificação do webhook** — Meta usa um flow de verificação com GET challenge diferente do Telegram.
4. **Templates aprovados** — Se quisermos enviar mensagens proativas no futuro, precisaremos submeter templates para aprovação.

---

## Requisitos para Começar

1. **Conta Meta Business** (gratuita) — [business.facebook.com](https://business.facebook.com)
2. **App no Meta Developers** (gratuito) — [developers.facebook.com](https://developers.facebook.com)
3. **Número de telefone dedicado** — Um chip/número que não esteja usando WhatsApp pessoal
4. **Verificação do negócio** — Meta pode pedir documentos (CNPJ ou equivalente)
5. **Variáveis de ambiente necessárias:**
   - `WHATSAPP_PHONE_NUMBER_ID` — ID do número no Meta
   - `WHATSAPP_ACCESS_TOKEN` — Token de acesso (system user)
   - `WHATSAPP_VERIFY_TOKEN` — Token para verificação do webhook
   - `WHATSAPP_API_VERSION` — Versão da Graph API (ex: v18.0)

---

## Conclusão

Para o cenário do MyPocket (<10 usuários, interações iniciadas pelo usuário), a integração com WhatsApp via Cloud API da Meta seria **essencialmente gratuita**. O esforço de implementação é moderado, com boa parte da lógica reaproveitável do Telegram. A principal complexidade está nas diferenças de UX (botões, edição de mensagens) e no setup burocrático inicial com a Meta.

---

## Fontes

- [WhatsApp Business Platform Pricing](https://business.whatsapp.com/products/platform-pricing)
- [WhatsApp Business API Pricing: Complete Guide 2026 (SpurNow)](https://www.spurnow.com/en/blogs/whatsapp-business-api-pricing-explained)
- [WhatsApp API Pricing 2026 (respond.io)](https://respond.io/blog/whatsapp-business-api-pricing)
- [WhatsApp Cloud API Webhooks Setup](https://developers.facebook.com/docs/whatsapp/cloud-api/guides/set-up-webhooks/)
- [WhatsApp Node.js SDK (GitHub)](https://github.com/WhatsApp/WhatsApp-Nodejs-SDK)
- [WhatsApp API Pricing Update July 2025 (ycloud)](https://www.ycloud.com/blog/whatsapp-api-pricing-update)
- [WhatsApp Pricing Update January 2026 (Authkey)](https://authkey.io/blogs/whatsapp-pricing-update-2026/)
