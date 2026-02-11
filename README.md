# MyPocket

Aplicativo de gestão financeira pessoal com categorização inteligente de transações, rastreamento de investimentos e análises detalhadas.

## Funcionalidades

### Transações
- **Categorização automática** - Motor de regras que classifica transações automaticamente com base na descrição
- **Importação CSV multi-banco** - Suporta extratos dos bancos C6, Itaú e BTG com detecção automática de formato
- **Scanner OCR de faturas** - Extração de dados de faturas em PDF e imagens via tesseract.js
- **Detecção de parcelas** - Reconhece padrões como "3/10" ou "PARCELA 3 DE 10" nas descrições
- **Detecção de duplicatas** - Verificação automática ao importar para evitar lançamentos repetidos
- **Soft delete** - Transações deletadas vão para a lixeira e podem ser recuperadas
- **Tags** - Classificação adicional com tags personalizadas

### Despesas Recorrentes
- **Detecção de padrões** - Reconhece 100+ padrões de assinaturas (Netflix, Spotify, etc.)
- **Geração automática** - Cria transações mensais automaticamente ou aguarda importação para vincular
- **Geração em lote** - Gera todas as recorrências pendentes de uma vez

### Orçamentos
- **Limites por categoria** - Define limites de gastos para cada categoria
- **Alertas** - Notificações quando os gastos se aproximam ou ultrapassam o limite

### Faturas de Cartão
- **Pagamento parcial** - Registra pagamentos parciais de faturas
- **Parcelamento de fatura** - Calcula juros e gera parcelas para faturas financiadas
- **Detecção de saldo anterior** - Identifica saldos carregados entre faturas (rotativo, pagamento mínimo)

### Investimentos
- **Portfólio completo** - Gerencia investimentos por categoria (Renda Fixa, Ações, FIIs, etc.)
- **Aportes e resgates** - Registra movimentações com vínculo ao fluxo de caixa
- **Atualização de valores** - Acompanha valor atual vs. investido com cálculo de rentabilidade
- **Metas** - Define e acompanha metas por ativo
- **Snapshots mensais** - Histórico de evolução patrimonial

### Relatórios (11 abas de análise)
- **Visão Geral** - Métricas consolidadas do período
- **Evolução Anual** - Comparativo ano a ano
- **Origens** - Gastos por meio de pagamento
- **Parcelas** - Timeline e progresso de parcelamentos
- **Tendências por Categoria** - Evolução de gastos ao longo do tempo
- **Economia** - Meta vs. realizado de poupança
- **Fixo vs. Variável** - Breakdown de despesas
- **Calendário Heatmap** - Padrões de gastos diários
- **Investimentos** - Análise do portfólio
- **Patrimônio Líquido** - Evolução de ativos
- **Crescimento de Recorrentes** - Análise de assinaturas

### Outros
- **Projeção financeira** - Projeções baseadas em despesas recorrentes
- **Meta de economia** - Acompanhamento mensal de metas de poupança
- **Exportação CSV** - Exporta transações para planilha
- **Onboarding** - Tutorial interativo para novos usuários
- **Emails transacionais** - Boas-vindas e recuperação de senha

## Tech Stack

| Tecnologia | Uso |
|---|---|
| **Next.js 14** | Framework full-stack com App Router |
| **TypeScript** | Tipagem estática com strict mode |
| **Prisma** | ORM com PostgreSQL (Neon) |
| **NextAuth.js 5** | Autenticação (credenciais + OAuth) |
| **Tailwind CSS** | Estilização |
| **Radix UI** | Componentes acessíveis (18 primitivos) |
| **Recharts** | Visualização de dados (14 tipos de gráfico) |
| **tesseract.js** | OCR para leitura de faturas |
| **papaparse** | Parsing de arquivos CSV |
| **unpdf** | Extração de texto de PDFs |
| **sharp** | Processamento de imagens |
| **Zod** | Validação de schemas |
| **Resend** | Envio de emails |
| **Vitest** | Testes unitários e de integração |
| **Playwright** | Testes end-to-end |

## Getting Started

### Pré-requisitos

- Node.js 18+
- npm
- Conta no [Neon](https://console.neon.tech) (PostgreSQL serverless) ou outro PostgreSQL
- Conta no [Resend](https://resend.com) (para envio de emails - opcional)

### Variáveis de ambiente

Copie o arquivo `.env.example` para `.env` e configure:

```bash
cp .env.example .env
```

| Variável | Descrição | Obrigatória |
|---|---|---|
| `DATABASE_URL` | Connection string do PostgreSQL (Neon recomendado) | Sim |
| `AUTH_SECRET` | Secret do NextAuth - gere com `openssl rand -base64 32` | Sim |
| `AUTH_TRUST_HOST` | Defina como `true` | Sim |
| `RESEND_API_KEY` | API key do Resend para envio de emails | Não |

### Instalação

```bash
# Instalar dependências
npm install

# Gerar Prisma Client
npm run db:generate

# Executar migrations do banco
npm run db:migrate

# Seed de categorias e regras padrão
npm run db:seed

# Iniciar servidor de desenvolvimento
npm run dev
```

A aplicação estará disponível em `http://localhost:3000`.

### Conta demo

Para popular o banco com dados de exemplo:

```bash
npm run db:seed-demo
```

## Scripts disponíveis

### Desenvolvimento

| Comando | Descrição |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run build` | Build de produção (Prisma generate + migrate + Next.js build) |
| `npm start` | Servidor de produção |
| `npm run lint` | Executar ESLint |

### Banco de dados

| Comando | Descrição |
|---|---|
| `npm run db:generate` | Gerar Prisma Client após alterações no schema |
| `npm run db:migrate` | Criar e executar migrations |
| `npm run db:push` | Aplicar schema diretamente (sem migration) |
| `npm run db:seed` | Seed de categorias e regras padrão |
| `npm run db:seed-demo` | Seed com dados de demonstração |

### Testes

| Comando | Descrição |
|---|---|
| `npm test` | Testes unitários em watch mode |
| `npm run test:unit` | Testes unitários com coverage |
| `npm run test:integration` | Testes de integração (requer DB de teste) |
| `npm run test:e2e` | Testes E2E com Playwright |
| `npm run test:e2e:ui` | Testes E2E com interface visual do Playwright |
| `npm run test:all` | Executar todos os testes |

## Estrutura do projeto

```
src/
├── app/                          # Next.js App Router
│   ├── api/                      # API REST (48 endpoints)
│   │   ├── auth/                 # Autenticação (register, forgot/reset-password)
│   │   ├── transactions/         # CRUD + trash, duplicates, unusual, make-recurring
│   │   ├── categories/           # CRUD de categorias
│   │   ├── recurring/            # CRUD + generate, pending, suggestions
│   │   ├── budgets/              # CRUD de orçamentos
│   │   ├── installments/         # CRUD de parcelas
│   │   ├── origins/              # CRUD de origens/meios de pagamento
│   │   ├── rules/                # CRUD de regras de categorização
│   │   ├── investments/          # CRUD + deposit, withdraw, value, summary, snapshots
│   │   ├── investment-categories/ # CRUD de categorias de investimento
│   │   ├── bill-payments/        # CRUD de pagamentos de fatura
│   │   ├── bills/                # Consulta de faturas
│   │   ├── reports/              # 8 endpoints analíticos
│   │   ├── import/               # Importação CSV
│   │   ├── export/               # Exportação CSV
│   │   ├── ocr/                  # Processamento OCR
│   │   ├── summary/              # Resumo do dashboard
│   │   ├── savings-history/      # Histórico de economia
│   │   ├── projection/           # Projeções financeiras
│   │   └── settings/             # Configurações do usuário
│   ├── auth/                     # Páginas de autenticação
│   ├── dashboard/                # Dashboard principal
│   ├── transactions/             # Gestão de transações
│   ├── recurring/                # Despesas recorrentes
│   ├── bills/                    # Faturas de cartão
│   ├── installments/             # Parcelamentos
│   ├── import/                   # Importação de dados
│   ├── categories/               # Gestão de categorias
│   ├── investments/              # Módulo de investimentos
│   ├── reports/                  # Relatórios e analytics
│   ├── projection/               # Projeções financeiras
│   ├── trash/                    # Lixeira de transações
│   └── settings/                 # Configurações
├── components/
│   ├── landing/                  # Landing page (Hero, FAQ, Benefits, etc.)
│   ├── Charts/                   # 14 componentes de gráficos (Recharts)
│   ├── reports/                  # 11 abas de relatórios
│   ├── emails/                   # Templates de email (Welcome, PasswordReset)
│   ├── ui/                       # 18 primitivos UI (Radix UI + Tailwind)
│   ├── AppLayout.tsx             # Layout principal com sidebar
│   ├── Sidebar.tsx               # Navegação lateral
│   ├── TransactionForm.tsx       # Formulário de transações
│   ├── BillPaymentModal.tsx      # Modal de pagamento de fatura
│   ├── OnboardingModal.tsx       # Onboarding de novos usuários
│   ├── Investment*.tsx           # Componentes de investimento
│   └── ...
├── lib/                          # Utilitários e lógica de negócio
│   ├── categorizer.ts            # Motor de categorização automática
│   ├── csv-parser.ts             # Parser CSV multi-banco (C6, Itaú, BTG)
│   ├── statement-parser.ts       # Parser de texto de extrato bancário
│   ├── ocr-parser.ts             # Processamento OCR (tesseract.js + unpdf)
│   ├── carryover-detector.ts     # Detector de saldo anterior em faturas
│   ├── bill-payment-transactions.ts # Geração de transações de fatura
│   ├── auth-utils.ts             # Helpers de autenticação
│   ├── email.tsx                 # Utilitários de email
│   ├── db.ts                     # Singleton Prisma com adapter Neon
│   ├── utils.ts                  # formatCurrency, formatDate, cn
│   ├── hooks.ts                  # React hooks customizados
│   └── constants.ts              # Constantes da aplicação
├── types/                        # Interfaces TypeScript para todos os modelos
prisma/
├── schema.prisma                 # Schema com 17 modelos
├── migrations/                   # Migrations do banco
├── seed.ts                       # Seed de categorias e regras
└── seed-demo.ts                  # Seed de dados de demonstração
tests/
├── integration/api/              # Testes de integração dos endpoints
├── e2e/                          # Testes E2E (Playwright)
├── mocks/                        # Mocks compartilhados (Prisma client)
└── setup.ts                      # Setup do ambiente de testes
```

## Modelos de dados

### Domínio principal
- **Transaction** - Transação com vínculo a categoria, parcela e recorrência
- **Category** - Classificação com cor e ícone
- **RecurringExpense** - Padrões de despesas mensais automáticas
- **Installment** - Agrupador de parcelas
- **Origin** - Meios de pagamento (banco, cartão)
- **Budget** - Limites de gasto por categoria
- **CategoryRule** - Regras de categorização por palavra-chave
- **Settings** - Preferências do usuário
- **SavingsHistory** - Histórico de metas de economia

### Investimentos
- **Investment** - Ativo com valor atual, investido, resgatado e meta
- **InvestmentCategory** - Tipo de investimento (Renda Fixa, Ações, FIIs, etc.)
- **InvestmentTransaction** - Aportes e resgates com vínculo ao fluxo de caixa
- **InvestmentSnapshot** - Snapshot mensal do portfólio para histórico

### Faturas
- **BillPayment** - Pagamento de fatura (parcial ou financiado) com juros

### Autenticação (NextAuth.js)
- **User**, **Account**, **Session**, **VerificationToken**, **PasswordResetCode**

## API

A API REST segue o padrão de rotas do Next.js App Router com 48 endpoints organizados por recurso.

### Filtros de transações

Os endpoints de transação suportam os seguintes query parameters:

| Parâmetro | Tipo | Descrição |
|---|---|---|
| `month` | number | Mês (1-12) |
| `year` | number | Ano |
| `startDate` | string | Data inicial (ISO) |
| `endDate` | string | Data final (ISO) |
| `categoryId` | string | Filtrar por categoria |
| `origin` | string | Filtrar por origem/meio de pagamento |
| `type` | string | `INCOME` ou `EXPENSE` |
| `isFixed` | boolean | Despesas fixas |
| `isInstallment` | boolean | Parcelamentos |
| `search` | string | Busca na descrição |
| `tag` | string | Filtrar por tag |
| `includeDeleted` | boolean | Incluir deletados |

## Testes

### Estrutura

- **Testes unitários** (`src/lib/*.test.ts`) - Co-localizados com os arquivos fonte
- **Testes de integração** (`tests/integration/`) - Testes dos endpoints da API
- **Testes E2E** (`tests/e2e/`) - Fluxos completos com Playwright

### Configuração

- **Vitest** para unitários e integração (jsdom para componentes, node para API)
- **Playwright** para E2E (Chromium, Firefox, Mobile Chrome)
- Coverage com v8 para funções em `/src/lib/`

### Cobertura

| Área | Expectativa |
|---|---|
| Utilitários (`/src/lib/`) | Alta cobertura |
| Rotas da API | Happy path + casos de erro |
| E2E | Fluxos críticos (auth, transações, importação) |

## Localização

- **Idioma**: Português (Brasil)
- **Moeda**: BRL (Real Brasileiro)
- **Formato de data**: DD/MM/YYYY
- **Tema visual**: Emerald (#10b981)

## License

Private project.
