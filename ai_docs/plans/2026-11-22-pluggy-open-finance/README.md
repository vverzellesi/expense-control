# Integração Open Finance (Pluggy / MeuPluggy) — Plano de Implementação

> **Revisão 2:** a primeira versão deste plano foi reprovada na revisão do oracle. As correções estão em `contrato-v2.md` (mesmo diretório), que prevalece sobre este arquivo em modelo de dados, regras de sincronização, concorrência e divisão em sessões.

## Overview

Capturar automaticamente as transações de conta e cartão do dono do app via Open Finance, usando a API REST da Pluggy com o conector MeuPluggy (uso pessoal, gratuito), gravar no My Pocket pela mesma lib de importação que o app já usa e categorizar automaticamente. Substitui o fluxo manual de PDF por e-mail.

Prioridades, nesta ordem: (1) segurança e privacidade, (2) não perder nem duplicar dado, (3) simplicidade.

## Decisões já tomadas pelo dono do produto

- A Pluggy é o único terceiro novo aceito no caminho dos dados. Sem MCPs ou bibliotecas de empresas desconhecidas: o cliente da API é escrito aqui, com `fetch`.
- Dados podem passar pela Anthropic (categorização). Não podem passar por serviços de empresas desconhecidas.
- O repositório é PÚBLICO: nenhum segredo, identificador de item/conta, e-mail, CPF, nome de estabelecimento real ou valor real pode ir para o git (código, testes, fixtures, docs, mensagens de commit, descrição de PR).
- Versão enxuta: sem aprovação por Telegram a cada sync e sem arquivo de JSON bruto.
- A primeira sincronização real em produção roda em simulação (dry-run) e o relatório é mostrado ao dono antes de gravar.

## Current State Analysis

- Next.js 14 na Vercel (deploy a cada merge em `main`), Prisma + Postgres (Neon). App multiusuário com cadastro público; a integração Pluggy é de um único usuário (o dono).
- `src/lib/import-service.ts` → `importTransactions(userId, txs, defaultOrigin)`: normaliza sinal, vincula recorrentes, dedup por dia + valor + descrição normalizada (`src/lib/dedup.ts`), cria grupo de parcelas e GERA parcelas futuras, vincula carryover de rotativo. Não é transacional.
- `Transaction` não tem id externo. `Transaction.origin` é string com o nome de um `Origin` do usuário.
- `src/lib/categorizer.ts` → `suggestCategory(desc, userId)` aplica as `CategoryRule` do usuário; `detectInstallment`, `detectTransfer`.
- Não há rotina agendada. `src/auth.config.ts` libera rotas públicas por lista explícita (ex.: webhook do Telegram, validado por segredo com `timingSafeEqual`).
- `src/lib/crypto.ts` usa AES-256-CBC sem autenticação (não será usado para segredos da Pluggy).
- Migrações Prisma não rodam no build (`prisma generate && next build`): são aplicadas manualmente em produção.
- CI: só `unit-tests` passa em `main`; integração e e2e já falham na base (não são regressão).
- Já existe bot de Telegram (`src/lib/telegram/client.ts` → `sendMessage`) vinculado ao usuário via `TelegramLink`.

## Fatos da Pluggy (verificados na documentação) e incertezas

Verificado:
- `POST /auth` com `clientId`/`clientSecret` devolve `apiKey` válida por 2 horas, de acesso amplo; deve ficar só em memória no backend.
- MeuPluggy: até 5 conexões, atualização automática a cada ~24h, autorização para a aplicação vale 1 ano e precisa ser renovada.
- `GET /accounts?itemId`, `GET /transactions?accountId&from&to` (paginado), `GET /bills?accountId`, `GET /items/{id}` (status), `DELETE /items/{id}` (apaga dados e revoga consentimento).
- Transações de cartão trazem `creditCardMetadata` (número/total de parcelas, `billId`, data da compra) e `status` `PENDING|POSTED`; compras recentes podem chegar `PENDING` e sem `billId`.
- Histórico público de incidentes da Pluggy é de disponibilidade/dados faltando (não de vazamento).

Não verificado (a sonda da Fase 0 responde com dados reais):
- Se o banco do dono entrega faturas (`/bills`) via MeuPluggy.
- Se o `id` da transação muda na passagem `PENDING → POSTED`.
- Convenção de sinal de `amount` por tipo de conta (o mapeamento deve se apoiar em `type: DEBIT|CREDIT`, não só no sinal).
- Limites de uso da API.

## Desired End State

1. Todo dia, sem ação humana, as transações `POSTED` novas da conta e do cartão entram no My Pocket com origin correto, categoria sugerida e parcelas tratadas, sem duplicar o que já existe.
2. Cada execução deixa um registro auditável (contagens por destino e conferências) e alerta o dono quando algo não fecha, quando o item está desatualizado/com erro ou quando o consentimento está perto de vencer.
3. O que as regras não categorizam é categorizado por IA (Anthropic), restrito às categorias existentes do usuário, e marcado como sugestão de IA.
4. Existe um comando para desligar tudo: apagar o item na Pluggy (revoga o consentimento).
5. Nenhum segredo ou dado pessoal no git; CI falha se um segredo aparecer.

## What We're NOT Doing

- UI de conexão (Pluggy Connect widget) nem suporte a outros usuários: integração de usuário único, sem rota acessível por sessão de usuário.
- Webhooks da Pluggy (polling diário basta e reduz superfície de ataque).
- Aprovação por Telegram, arquivo de payload bruto, investimentos, iniciação de pagamento.
- Refatorar `importTransactions` além do mínimo necessário para aceitar id externo.
- Backfill de meses já importados por PDF (corte por data de início, por conta).

## Arquitetura

```
Vercel Cron (1x/dia) ──Bearer CRON_SECRET──▶ /api/cron/pluggy-sync
                                               │
                         src/lib/pluggy/sync.ts (orquestra, idempotente)
                           ├─ client.ts   → api.pluggy.ai (auth em memória, timeout, retry, zod)
                           ├─ mapper.ts   → PluggyTx → ImportTransaction + externalId (puro)
                           ├─ rules.ts    → exclusões/transferências (genéricas + do usuário, via banco)
                           ├─ reconcile.ts→ invariantes e conferência de fatura
                           └─ import-service (lib existente) → Postgres
                         PluggySyncRun (auditoria) ─▶ alerta Telegram (só contagens)
```

### Modelo de dados (migração aditiva, compatível com o código atual)

- `Transaction.externalSource String?`, `Transaction.externalId String?`, `@@unique([userId, externalSource, externalId])` (nulos não colidem no Postgres).
- `Transaction.categorySource String?` (`rule | ai | manual`; nulo = legado).
- `PluggyAccountLink`: `userId`, `itemId`, `pluggyAccountId` (unique), `accountType` (`BANK|CREDIT`), `originName`, `syncFrom` (data de corte), `enabled`. É a única fonte de "qual usuário, qual item, qual origin". Populado por script local, nunca por rota HTTP.
- `PluggySyncRun`: `userId`, `startedAt`, `finishedAt`, `status` (`ok|warning|error`), `counts` (JSON), `checks` (JSON), `error` (string sanitizada). Sem payload bruto, sem descrições.
- Exclusões específicas do usuário (ex.: padrões de descrição de pagamento de fatura) ficam em `Settings` (chave `pluggy.excludePatterns`, JSON), nunca no código.

### Regras de sincronização (núcleo de correção)

1. Janela: reler sempre os últimos 45 dias (ou desde `syncFrom`, o que for mais recente no primeiro uso; nunca antes de `syncFrom`).
2. Só importar `POSTED`. `PENDING` é contado e ignorado (entra quando virar `POSTED`).
3. Para cada transação da Pluggy, exatamente um destino, e a soma dos destinos = total lido (invariante; violação → `status=error`, nada é marcado como concluído):
   - `already_synced`: já existe `externalId` igual. Nunca sobrescreve campos editáveis; se valor/data divergirem, registra `divergence` no run.
   - `adopted`: existe transação sem `externalId` que é a mesma (parcela futura pré-gerada com mesmo origin + N/T + valor ±0,01 no mesmo mês; ou match exato do dedup atual). Grava o `externalId` nela; não cria outra.
   - `excluded`: bate em regra de exclusão (pagamento de fatura no extrato, linhas de parcelamento de fatura já cobertas por `BillPayment`, padrões do usuário).
   - `pending`, `before_cutoff`.
   - `created`: via `importTransactions`, que passa a aceitar `externalSource/externalId/categorySource` por item e a gravá-los na criação.
4. Parcelas: usar `creditCardMetadata` (N, T) quando existir; senão `detectInstallment(descrição)`. Data da parcela = data da compra + (N−1) meses, para casar com as futuras pré-geradas.
5. Tipo: `DEBIT → EXPENSE`, `CREDIT → INCOME`; `detectTransfer` e regras → `TRANSFER`. Estorno em cartão (`CREDIT` em conta de crédito) entra como `INCOME` no mesmo origin, com alerta no run.
6. Categoria: `suggestCategory` → `categorySource=rule`; sem regra → nulo (fila da IA).
7. Idempotência e concorrência: unique no banco é a garantia final; lock por usuário (advisory lock do Postgres ou linha de run "em andamento" com expiração) impede duas execuções simultâneas; reexecutar a mesma janela não cria nada.
8. Conferência de fatura: quando `/bills` existir, soma das transações com aquele `billId` vs `totalAmount` da fatura (tolerância R$ 0,05); senão, pular a conferência e registrar `bill_check=unavailable`.
9. Saúde: `item.status` diferente de atualizado, `lastUpdatedAt` > 48h, ou consentimento a < 30 dias de vencer → `warning` + alerta.

### Segurança

- Segredos só em variáveis de ambiente (Vercel, marcadas como sensíveis; `.env` local gitignorado): `PLUGGY_CLIENT_ID`, `PLUGGY_CLIENT_SECRET`, `CRON_SECRET`, `ANTHROPIC_API_KEY`. `.env.example` só com placeholders. `apiKey` da Pluggy só em memória, nunca persistida nem logada.
- Rota `/api/cron/pluggy-sync`: liberada no `authorized` por caminho exato; exige `Authorization: Bearer <CRON_SECRET>` com comparação em tempo constante; 503 se não configurada; 401 sem detalhe; resposta só com contagens; sem parâmetros que escolham usuário/item (tudo vem de `PluggyAccountLink`). Feature flag `PLUGGY_SYNC_ENABLED` (desligada por padrão).
- Cliente HTTP: host fixo `https://api.pluggy.ai` (sem URL vinda de entrada), timeout, retry com backoff só em 429/5xx, validação de resposta com zod, erros sanitizados (método + caminho sem query + status), nunca logar corpo, cabeçalhos ou ids.
- Nenhuma chamada à Pluggy a partir do navegador; nenhum dado da Pluggy em `NEXT_PUBLIC_*`.
- Alerta por Telegram contém só contagens e tipos de alerta (sem valores, descrições ou nomes).
- Git: fixtures 100% sintéticas; varredura de segredos no CI (gitleaks) e teste que falha se `.env.example` tiver valor com cara de segredo real; scripts locais imprimem dados só no terminal e gravam relatórios apenas em `personal/` (gitignorado, conferido com `git check-ignore`).
- IA de categorização: envia apenas descrição, sinal e faixa de valor, mais a lista de nomes de categoria; nunca ids, conta, saldo ou dados pessoais. Saída validada contra as categorias do usuário.
- Desligamento: `scripts/pluggy/revoke.ts` (`DELETE /items/{id}`, com confirmação) + desativar links.

## Phases

| # | Phase | Summary | Depends On |
|---|-------|---------|------------|
| 0 | Sonda somente leitura | `scripts/pluggy/probe.ts`: com credenciais reais no `.env` local, lista item, contas, faturas e formato das transações (campos, sinais, status, ids), sem gravar no banco; relatório em `personal/`. Roda fora do git, pelo orquestrador. | credenciais do dono |
| 1 | Base da integração | Migração aditiva; `src/lib/pluggy/{client,types,mapper,rules,sync,reconcile}.ts`; extensão mínima de `importTransactions` e `dedup` para id externo/adoção; scripts `scripts/pluggy/{probe,link,sync,revoke}.ts` (dry-run por padrão); testes unitários com API simulada; gitleaks no CI; diagramas atualizados. | — |
| 2 | Agendamento, conferência e alertas | Rota cron + `vercel.json`; lock; `PluggySyncRun`; conferência de fatura; checagem de saúde/consentimento; alerta Telegram; página mínima somente leitura do último run em Configurações (opcional). | 1 em `main` |
| 3 | Categorização por IA | `src/lib/ai-categorizer/` (Anthropic, saída estruturada restrita às categorias do usuário, lote pequeno, teto mensal de chamadas); roda ao fim do sync para `categoryId=null`; marca `categorySource=ai`; sugere `CategoryRule` quando o mesmo estabelecimento se repete (criação da regra só após confirmação na tela de regras). Sem chave configurada, não faz nada. | 1 em `main` |
| 4 | Ativação em produção | Aplicar migração em prod; variáveis na Vercel; `link.ts` (contas → origins, data de corte); `sync.ts --dry-run` contra prod e relatório ao dono; após aprovação, primeira gravação; ligar a flag do cron; conferir no dia seguinte. | 0, 1, 2 |

## Success Criteria

### Phase 1
| Criteria | Type |
|---|---|
| `npm run test:unit` verde, com testes novos para client (auth, paginação, retry, sanitização de erro), mapper (sinal, parcelas, estorno), rules, sync (cada destino, invariante, idempotência em reexecução, adoção de parcela futura, PENDING→POSTED com id igual e com id diferente) | auto |
| `npm run lint` e `npx tsc --noEmit` sem erros novos | auto |
| Migração só adiciona colunas/tabelas/índices; app atual funciona com a migração aplicada e código antigo | auto + revisão |
| `rg` por segredos/identificadores reais no diff retorna vazio; gitleaks verde | auto |
| `sync.ts` sem `--apply` não escreve nada (teste) | auto |

### Phase 2
| Criteria | Type |
|---|---|
| Rota: 503 sem configuração, 401 com segredo errado/ausente, 200 só com segredo certo e flag ligada; nunca devolve dados de transação (testes) | auto |
| Duas execuções concorrentes não duplicam (teste) | auto |
| Alertas disparam nos cenários: fatura não fecha, item desatualizado, consentimento vencendo, invariante violado (testes) | auto |

### Phase 3
| Criteria | Type |
|---|---|
| Saída da IA fora das categorias do usuário é descartada; payload enviado não contém ids/valores exatos (testes) | auto |
| Sem `ANTHROPIC_API_KEY` o sync termina normalmente | auto |

### Phase 4
| Criteria | Type |
|---|---|
| Dry-run em prod revisado e aprovado pelo dono antes da primeira gravação | manual |
| Reexecução logo após a primeira gravação cria 0 transações | auto |
| Soma por fatura confere (ou conferência indisponível registrada) | auto |

## Risks & Mitigations

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Segredo ou dado pessoal vazar no repo público | B | A | Fixtures sintéticas, gitleaks no CI, relatórios só em `personal/`, revisão do diff antes de cada push |
| Duplicar transações (descrição da Pluggy ≠ PDF; parcelas futuras pré-geradas) | M | A | Corte por data por conta, adoção de parcelas, unique por id externo, dry-run revisado, reexecução = 0 |
| Pluggy entregar dados incompletos (histórico de incidentes) | M | A | Janela de 45 dias relida todo dia, conferência de fatura, alerta de item desatualizado |
| Rota de cron abusada | B | M | Segredo + tempo constante + flag + sem parâmetros + só contagens na resposta + lock |
| `id` mudar em PENDING→POSTED | M | M | Só importar POSTED; fallback de adoção por dedup |
| `importTransactions` não transacional falhar no meio | B | M | Idempotência por id externo: a próxima execução completa o que faltou; run fica `error` |
| Consentimento de 1 ano expirar silenciosamente | A | M | Alerta a 30 dias e em erro de status |
| Migração em produção | B | A | Só aditiva, aplicada antes do merge, testada em banco local |
| Timeout da função na Vercel | B | M | Janela limitada, paginação, `maxDuration` explícito; execução retomável |

## Perguntas para a revisão

1. O conjunto de destinos/invariante e a regra de adoção de parcelas são suficientes para garantir "nem perde nem duplica"? Que caso real quebra isso?
2. Importar só `POSTED` é a escolha certa, dado o objetivo de visão diária?
3. Vercel Cron com `CRON_SECRET` é o melhor agendador aqui (repo público, app multiusuário), ou há opção mais segura e simples?
4. Guardar `itemId` e ids de conta em tabela no Postgres (em claro) é aceitável, ou devem ficar só em variável de ambiente/cifrados?
5. A categorização por IA dentro do app (Anthropic, payload mínimo) é melhor do que uma rotina agendada do Claude lendo o banco? Algum risco de injeção de prompt via descrição de transação que o plano não cobre?
6. Falta algum controle de segurança relevante para um app pessoal em repo público?

