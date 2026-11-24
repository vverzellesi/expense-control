# Contrato v2 — Integração Pluggy (prevalece sobre o README deste diretório)

Incorpora os bloqueios da revisão do oracle (`ai_docs/oracle/2026-11-22-2212-pluggy-open-finance-plan-review.md`) e fatos confirmados na documentação da Pluggy. Onde este arquivo e o README divergirem, vale este arquivo.

## Fatos novos que mudaram o desenho

- O `id` de uma transação da Pluggy NÃO é permanente: perto do fechamento da fatura a Pluggy pode apagar e recriar o registro com outro `id`, sem ligação entre os dois. Reconectar o banco também gera ids novos. A identidade estável, quando existe, é `providerId` (id do banco, presente em conexões Open Finance).
- Endpoint atual: `GET /v2/transactions` (cursor, até 500 por página, filtro `createdAtFrom`). `GET /transactions` paginado por página está obsoleto.
- `PENDING → POSTED` costuma manter o `id`; `billId` só aparece quando a compra entra numa fatura.
- O histórico de migrações em `origin/main` está incompleto (falta a criação de `TelegramPhotoQueue`): `prisma migrate deploy` num banco vazio falha. Bancos de teste devem ser criados com `prisma db push`; a migração nova é SQL aditivo escrito à mão e validado aplicando-o sobre um banco criado a partir do schema da base.

## Garantia que o sistema oferece

Processamento idempotente, sem descarte silencioso: toda transação lida da Pluggy termina com um vínculo persistido e um destino explícito; ambiguidade nunca vira criação nem adoção automática, vira `needs_review`. Não se promete identidade perfeita entre o que entrou por PDF e o que vem da Pluggy.

## Modelo de dados (uma migração aditiva; nenhuma coluna existente muda)

```prisma
model Transaction {
  // ...campos existentes inalterados
  categorySource String? // "rule" | "ai" | "manual"; null = legado
}

model PluggyAccountLink {
  id                   String    @id @default(cuid())
  userId               String
  itemId               String
  pluggyAccountId      String    @unique
  accountType          String    // "BANK" | "CREDIT"
  originId             String    // Origin pessoal do dono (spaceId = null); nome resolvido na escrita
  syncFrom             DateTime  // corte: nada com data anterior é criado
  enabled              Boolean   @default(true)
  lastSuccessfulSyncAt DateTime?
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt
  @@index([userId])
}

model PluggyTransactionLink {
  id                String    @id @default(cuid())
  accountLinkId     String
  externalId        String    // id do registro na Pluggy (não permanente)
  providerId        String?   // id do banco, quando vier
  transactionId     String?   // Transaction local; null quando não há lançamento
  disposition       String    // created | adopted | excluded | pending | needs_review | before_cutoff | superseded
  reasonCode        String?
  sourceStatus      String    // PENDING | POSTED
  sourceDate        DateTime
  purchaseDate      DateTime?
  sourceAmountCents Int
  currencyCode      String
  direction         String    // DEBIT | CREDIT
  sourceDescription String
  billId            String?
  creditKind        String?   // refund | bill_payment | other | unknown
  installmentNumber Int?
  totalInstallments Int?
  firstSeenAt       DateTime  @default(now())
  lastSeenAt        DateTime
  @@unique([accountLinkId, externalId])
  @@index([accountLinkId, providerId])
  @@index([transactionId])
  @@index([accountLinkId, disposition])
}

model PluggySyncRun {
  id         String    @id @default(cuid())
  userId     String
  trigger    String    // cron | manual
  status     String    // running | ok | warning | error | interrupted
  startedAt  DateTime  @default(now())
  finishedAt DateTime?
  counts     Json?
  checks     Json?
  error      String?   // sanitizado: sem ids, descrições ou segredos
  @@index([userId, startedAt])
}

model PluggySyncLease {
  userId     String   @id
  ownerToken String
  expiresAt  DateTime
}
```

Várias linhas de `PluggyTransactionLink` podem apontar para a mesma `Transaction` (ids históricos). O vínculo sobrevive ao soft delete da transação local e nunca a ressuscita.

## Forma do registro mapeado (fronteira entre mapeamento e persistência)

```ts
interface MappedPluggyTransaction {
  externalId: string
  providerId: string | null
  accountType: "BANK" | "CREDIT"
  sourceStatus: "PENDING" | "POSTED"
  sourceDate: string            // YYYY-MM-DD no fuso America/Sao_Paulo
  purchaseDate: string | null   // YYYY-MM-DD
  ledgerDate: string            // data que vai para Transaction.date
  description: string           // texto do banco, só com trim
  amountCents: number           // inteiro positivo, na moeda da conta
  currencyCode: string
  direction: "DEBIT" | "CREDIT"
  type: "EXPENSE" | "INCOME" | "TRANSFER"
  creditKind: "refund" | "bill_payment" | "other" | "unknown" | null
  billId: string | null
  installmentNumber: number | null
  totalInstallments: number | null
  preDisposition: null | { disposition: "excluded" | "needs_review" | "pending"; reasonCode: string }
}
```

Regras do mapeamento (puro, sem banco):
- Direção vem de `type: DEBIT|CREDIT` da Pluggy, nunca só do sinal. Valor em centavos inteiros.
- Moeda diferente de BRL: usar o valor na moeda da conta quando a Pluggy informar; senão `needs_review / foreign_currency`.
- `PENDING` → `preDisposition pending`.
- Conta bancária: `DEBIT → EXPENSE`, `CREDIT → INCOME`; `detectTransfer` → `TRANSFER`.
- Cartão: `DEBIT → EXPENSE`. `CREDIT` classificado em `creditKind`: estorno reconhecido por padrão de descrição → `INCOME` (convenção já usada em `src/lib/statement-parser.ts`); pagamento de fatura → `excluded / bill_payment_credit`; qualquer outro crédito → `needs_review / credit_unknown`.
- Descrição com cara de saldo/juros de rotativo (`isCarryoverTransaction`) → `needs_review / carryover` (o vínculo automático de carryover com tolerância de ±50% NÃO é usado no caminho Pluggy).
- Padrões de exclusão do usuário (recebidos como argumento; vêm de `Settings`, chave `pluggy.excludePatterns`, nunca do código) → `excluded / user_pattern`.
- Parcelas: `creditCardMetadata` quando existir; senão `detectInstallment(descrição)`.
- `ledgerDate` = `sourceDate` por padrão, isolado numa função única para ser ajustado depois da sonda com dados reais. Aritmética de meses sem transbordo de fim de mês (31/01 + 1 mês = 28/02 ou 29/02).

## Decisão por registro (persistência, dentro de transação de banco)

Leitura: a cada execução, ler TODO o intervalo `[syncFrom, agora]` de cada conta (limitado a 13 meses), página a página. Falha em qualquer página invalida a conta inteira naquela execução: nada é decidido com leitura incompleta. Vínculos `pending` mais antigos que o intervalo são revisitados individualmente por id.

Para cada registro, em ordem, numa transação curta que (a) pega `pg_advisory_xact_lock` do usuário e (b) confere que o lease ainda é do worker:

1. Já existe vínculo com o mesmo `externalId` → atualiza `lastSeenAt`/`sourceStatus`. Se era `pending` e virou `POSTED`, segue para o passo 3 em diante reutilizando o vínculo. Se valor ou data divergem do que foi visto antes, registra `divergence` no run e NÃO altera a transação local.
2. Não existe, mas há vínculo da mesma conta com o mesmo `providerId` → registro recriado: novo vínculo apontando para a mesma `transactionId` (`adopted / provider_id_match`); o antigo vira `superseded`.
3. `preDisposition` definido → grava vínculo com esse destino, sem transação.
4. `ledgerDate < syncFrom` → `before_cutoff`.
5. Registro recriado sem `providerId`: entre transações cujo vínculo não foi visto nesta leitura completa, uma única com mesma conta, data, valor, descrição normalizada e parcela → religa (`adopted / recreated_match`). Mais de uma → `needs_review / ambiguous_recreated`.
6. Parcela N/T: candidatas = transações pessoais do dono, mesmo origin, `isInstallment`, mesmo N e T, valor igual (±1 centavo), não apagadas e ainda sem vínculo Pluggy. Uma candidata → `adopted / installment_projection`. Várias: desempata por data de compra e descrição normalizada; se as restantes forem indistinguíveis em todos os campos comparados, adota a mais antiga; se forem distinguíveis e nenhuma casar de forma única → `needs_review / ambiguous_installment`.
7. Lançamento legado igual: transação pessoal do dono sem vínculo, mesmo origin, mesmo dia, mesmo valor e mesma descrição normalizada → exatamente uma: `adopted / legacy_match`. Mesmo origin, dia e valor mas descrição diferente → `needs_review / possible_duplicate`.
8. Caso contrário → `created`: cria a `Transaction` (escopo pessoal: `userId` do dono, `spaceId null`), com categoria de `suggestCategory` (`categorySource = rule`) e vínculo com recorrente ativa pela mesma regra de hoje. Se for parcela com N < T, cria o grupo `Installment` e as projeções N+1..T NA MESMA transação de banco (tudo ou nada). Duas compras idênticas no mesmo dia com ids diferentes são DUAS transações: o dedup textual nunca veta criação no caminho Pluggy.

Vínculos cujo registro não apareceu numa leitura completa e não foram religados ficam como estão e entram em `checks.missing_upstream`; nada é apagado automaticamente.

Simulação (dry-run): calcula as mesmas decisões só com leituras; não grava run, lease, vínculo nem transação; não chama Telegram nem IA.

## Concorrência

- `PluggySyncLease`: aquisição atômica (insert, ou update condicional quando expirado), renovação periódica, e conferência do `ownerToken` dentro de cada transação de escrita. Worker que perdeu o lease para imediatamente.
- Funções de persistência recebem o cliente de banco por parâmetro (`PrismaClient` ou `Prisma.TransactionClient`); nada de singleton dentro delas.
- Run: `running` no início; só vira `ok/warning/error` depois de persistir os resultados; run `running` com lease expirado é marcado `interrupted` pelo próximo.

## Segurança (além do README)

- Dono único: variável `PLUGGY_OWNER_USER_ID`; o sync recusa qualquer `PluggyAccountLink` de outro usuário e qualquer origin que não seja pessoal desse dono.
- `/api/import`: entrada validada por lista explícita de campos; campos internos novos nunca são aceitos do request; `categoryId` de outro usuário é descartado.
- Cron: `GET`, runtime Node, `dynamic = "force-dynamic"`, `Cache-Control: no-store`, segredo obrigatório mesmo com sessão autenticada, sem query/body que selecione usuário, resposta só com contagens, erro real devolve 500 (não mascarar como sucesso).
- Logs e erros: caminho como template (`/items/{id}`), nunca corpo, cabeçalho, id, descrição ou valor. Nada de `console.error(error)` cru no caminho Pluggy.
- Previews da Vercel e CI não recebem segredos da Pluggy nem banco de produção.
- CI: varredura de segredos (gitleaks) e checagem de que nenhum arquivo sob `personal/` está rastreado.
- Desligamento: desativa os links e espera/impede escritas, só depois apaga o item na Pluggy e confere o resultado.
- IA: descrição passa por redação de identificadores (CPF/CNPJ, telefone, e-mail, sequências longas de dígitos, nomes após "PIX"/"TED" quando reconhecíveis); descrição que não puder ser minimizada fica sem IA. Entrada como campo estruturado de tamanho limitado, modelo sem ferramentas, saída = chave efêmera de categoria permitida ou abstenção, resolvida para id no servidor. Só registros com vínculo Pluggy do dono. Atualização condicional (`categoryId null` e `updatedAt` igual), para não sobrescrever edição humana. Edição manual de categoria grava `categorySource = manual`. Teto de chamadas reservado atomicamente; falha da IA não afeta a ingestão.

## Divisão em sessões (sem sobreposição de arquivos)

| Sessão | Dona de | Depende de |
|---|---|---|
| S1 · Persistência e decisão | `prisma/schema.prisma`, migração nova, `src/lib/pluggy/store.ts`, `src/lib/pluggy/lease.ts`, `src/app/api/import/route.ts` (validação), marcação de `categorySource = manual` nas rotas de edição, suíte de integração em Postgres real (`tests/pluggy-integration/**`, config e workflow próprios), `ai_docs/diagrams/data-models.md` | — |
| S2 · API, mapeamento e sonda | `src/lib/pluggy/{client,types,mapper,rules}.ts`, `scripts/pluggy/probe.ts`, `.env.example`, workflow de varredura de segredos | — (paralela à S1) |
| S3 · Sincronização e operação | `src/lib/pluggy/{sync,reconcile,alerts}.ts`, rota cron, `src/auth.config.ts`, `vercel.json`, `scripts/pluggy/{link,sync,review,revoke}.ts`, diagramas de rotas e fluxos | S1 e S2 em `main` |
| S4 · Categorização por IA | `src/lib/ai-categorizer/**` e o gancho no fim do sync | S3 em `main` |

## Ordem de ativação

Validar a migração em Postgres descartável → conferir estado das migrações em produção (somente leitura) → aplicar a migração aditiva em produção → publicar código com a integração desligada (`PLUGGY_SYNC_ENABLED` ausente) → sonda com credenciais reais → cadastrar vínculos (contas → origins, corte) → simulação contra produção e relatório ao dono → aprovação → primeira gravação → reexecução deve criar 0 → ligar o agendamento → IA por último.

## Limitação conhecida

Importar por PDF/CSV um período que a Pluggy já cobriu pode duplicar (descrições diferentes). Depois da ativação, a importação manual dos origins vinculados deve ser evitada; a próxima sincronização marca `possible_duplicate` apenas quando o lançamento manual entra antes do registro da Pluggy.


## Emenda 1 — correções da segunda revisão do oracle (prevalece sobre as seções acima)

Fonte: `ai_docs/oracle/2026-11-22-2222-pluggy-contrato-v2-review.md`.

### Decisão por registro
1. **Identidade canônica primeiro.** Antes de qualquer passo, resolver a identidade do registro: vínculo com o mesmo `externalId`; senão, vínculos com o mesmo `providerId` NÃO nulo na mesma linhagem de conta (a conta e as que ela substitui). `null` nunca é identidade. Se a identidade canônica ainda não tem `transactionId` (era `pending`, `needs_review` etc.), o registro segue pelos passos 3 a 8 com os dados atuais, mesmo que id, valor e data tenham mudado juntos; um registro recriado nunca termina como `adopted` com `transactionId null`.
2. **Um para um.** Presença na leitura completa é calculada por transação canônica, considerando todos os ids históricos dela. Cada candidata (a religar, a adotar) é reservada uma única vez por execução. Relação ambígua → `needs_review`.
3. **Reconexão.** `PluggyAccountLink` ganha `replacesAccountLinkId String?`. Buscas por `providerId`, por registro recriado e por candidatas legadas percorrem a linhagem inteira.
4. **Parcelas.** Mesmo com candidata única, a adoção exige evidência da compra: data compatível (data da projeção = data da compra + (N−1) meses, ±3 dias, ou início do grupo = data da compra ±3 dias) OU descrição normalizada igual depois de remover o marcador de parcela. Sem evidência → `needs_review / unconfirmed_installment`. Empate entre grupos, inclusive indistinguíveis → `needs_review / ambiguous_installment` (não existe mais "adota a mais antiga").
5. **Legado.** Mais de uma correspondência exata → `needs_review / ambiguous_legacy`.
6. **Projeções sem duplicar.** Processar as parcelas de uma mesma compra em ordem crescente de N. Antes de criar grupo, procurar o grupo já criado para a mesma compra (mesma linhagem de conta, data da compra, T, valor e descrição normalizada) e reutilizá-lo. Antes de criar a projeção de número K num grupo, conferir sob o lock que ela não existe. A simulação reproduz reservas e projeções em memória, para dar as mesmas decisões da execução real.
7. **Escopo pessoal em tudo.** Categoria sugerida, regra, recorrente e grupo de parcelas só valem se forem pessoais do dono (`spaceId null`); o que vier de espaço compartilhado é descartado (categoria nula, sem vínculo).

### Concorrência
- Aquisição, troca de dono e toda escrita usam a MESMA exclusão mútua (`pg_advisory_xact_lock` do usuário). Dentro dela, conferir token E validade do lease com o relógio do banco (`now()`), e reconferir `enabled` do link.
- Importação manual: `importTransactions` passa a pular linhas cujo origin é gerenciado pela Pluggy (link ativo do usuário) com data a partir de `syncFrom`, devolvendo a contagem `skippedPluggyManaged`. Isso substitui a "limitação conhecida".

### Leitura e cobertura
- O limite superior da leitura é fixado no início da execução. Não há teto de 13 meses: lê-se desde `syncFrom`; se o provedor devolver menos histórico que isso, o run registra `coverage_truncated` e não declara cobertura completa.
- `GET /v2/transactions` exige `accountId`, não aceita `pageSize` e devolve `{ results, next }`; só o valor de `after` é aproveitado de `next`. Se não houver filtro por data da transação, lê-se tudo e filtra-se do nosso lado. `createdAtFrom` é filtro de criação do registro, não de data financeira, e não é usado para delimitar cobertura. Cursor repetido = erro.
- Pendente que some (404 ou ausente numa leitura completa) vira `needs_review / pending_vanished`.

### Moeda e estornos
- O mapeamento recebe a moeda da conta. Só entra no razão valor em BRL: conta BRL com valor na moeda da conta. Qualquer caso sem equivalência em BRL → `needs_review / foreign_currency`.
- Estorno em cartão reconhecido por padrão continua entrando como `INCOME` no mesmo origin, por consistência com o histórico já importado (convenção de `src/lib/statement-parser.ts`), e é contado à parte no run (`refunds_as_income`). O oracle recomenda tratar estorno como redução de despesa; isso muda a semântica dos totais do app inteiro e fica como decisão de produto pendente, fora desta entrega.

### IA
- Transação com `categorySource = manual` nunca é selecionada nem atualizada pela IA, inclusive quando o usuário deixou a categoria vazia de propósito.


## Emenda 2 — fatos da sonda com dados reais (prevalece sobre tudo acima)

Medido em 22/11/2026 numa conexão real via MeuPluggy (uma conta corrente e um cartão, 12 meses de histórico, 11 faturas). Nenhum dado pessoal é reproduzido aqui.

### Fatos
- `providerId` não vem em nenhuma transação. Toda religação de registro recriado depende de campos.
- Sinal de `amount`: conta corrente usa débito negativo e crédito positivo; cartão usa débito positivo e crédito negativo. Só `type` é confiável.
- Cartão: tudo que pertence ao ciclo ainda aberto vem como `PENDING` e sem `billId`; vira `POSTED` com `billId` no fechamento. `PENDING` aqui significa "ainda não faturado", não "autorização temporária".
- Parcelas: a descrição NÃO traz "N/T"; número e total vêm em `creditCardMetadata`, junto com `purchaseDate`. Para N > 1, `date` é a data de lançamento na fatura, não a da compra. A parcela 1 pode diferir alguns centavos das demais (resto da divisão).
- Existem compras legítimas idênticas (mesmo dia, valor e descrição), até 4 iguais.
- Compras em moeda estrangeira trazem `amountInAccountCurrency` em BRL.
- `operationType` classifica créditos do cartão (`PAGAMENTO_FATURA`, `ESTORNO`, `OUTROS`).
- O total da fatura NÃO é a soma das transações com aquele `billId`: ele inclui o saldo da fatura anterior e parcelas de fatura parcelada que não vêm como transação. Vale `total(n) = total(n−1) + débitos(n) − créditos(n) + resíduo(n)`, com resíduo ≥ 0 igual às parcelas não expostas. Encargos e IOF de rotativo vêm como débitos normais.
- Cada pagamento de fatura aparece duas vezes: débito na conta corrente e crédito no cartão, com o mesmo valor e poucos dias de diferença.
- Tarifa mensal estornada: débito de tarifa e crédito de estorno do mesmo valor no mesmo ciclo; em um mês o estorno não veio.

### Regras que mudam
1. **Pendentes do cartão entram como lançamento provisório** (opção `importPending`, padrão ligado): criam `Transaction` com vínculo `created` e `sourceStatus = PENDING`. O destino `pending` só existe com a opção desligada.
2. **Atualização a partir da fonte.** Quando o mesmo registro reaparece com status, valor ou data diferentes: se a transação local ainda tem exatamente o valor e a data vistos da última vez (ninguém editou), ela é atualizada para os valores novos e o vínculo guarda os novos valores da fonte; se foi editada, registra `divergence` e não mexe. Categoria e demais campos nunca são sobrescritos.
3. **Registro recriado (sem `providerId`).** Chave = linhagem da conta + dia do lançamento + valor em centavos + descrição normalizada + N/T. Agrupar por chave os vínculos não vistos na leitura completa e os registros novos; parear em ordem determinística até o menor dos dois tamanhos (registros de chave idêntica são intercambiáveis, então isso não é ambiguidade). Novos que sobram seguem para os passos seguintes; antigos que sobram caem na regra 4.
4. **Registro que some numa leitura completa e não é religado.** Se o vínculo era provisório (`sourceStatus = PENDING`): soft delete da transação local, vínculo `superseded / provisional_vanished`, contado no run. Se era `POSTED`: nada é apagado, entra em `missing_upstream`.
5. **Data do lançamento (`ledgerDate`).** Parcela com data de compra: data da compra + (N−1) meses, sem transbordo de fim de mês (mesma convenção das projeções e do histórico). Demais casos: `sourceDate`.
6. **Parcelas.** Tolerância de valor na adoção e na identidade do grupo: até `max(1, T)` centavos. Ao adotar uma projeção, o valor dela passa a ser o da fonte (contado como `projection_amount_corrected`). Identidade do grupo: linhagem da conta + data da compra + T + descrição normalizada.
7. **Créditos no cartão**, por `operationType` primeiro: `PAGAMENTO_FATURA` → `excluded / bill_payment_credit`, salvo descrição de parcelamento de compra, que vai para `needs_review / purchase_installment_plan`; `ESTORNO` → estorno (`INCOME`); o resto cai na descrição e, sem reconhecimento, em `needs_review / credit_unknown`.
8. **Encargos são despesa.** Juros, encargos, IOF, multa, tarifa e anuidade entram como `EXPENSE` mesmo que casem com padrões de rotativo. Só linha de saldo transportado vai para `needs_review / carryover`.
9. **Regras de lote (puras, sobre a lista mapeada):** (a) estorno integral de tarifa: crédito `ESTORNO` de mesmo valor que um débito de tarifa na mesma conta e na mesma fatura (ou até 35 dias), um para um → os dois `excluded / offsetting_refund`; tarifa sem par continua despesa. (b) pagamento de fatura: débito na conta corrente de mesmo valor que um crédito `bill_payment` do cartão do mesmo item, até 4 dias de diferença, um para um → débito `excluded / bill_payment_debit`.
10. **Padrões do usuário** ganham ação: `{ pattern, accountType?, action: "exclude" | "transfer" }`.
11. **Conferência de fatura** (S3): calcular e guardar o resíduo por fatura; resíduo negativo além de 5 centavos é `warning` (estado impossível); resíduo positivo é informativo. Não tratar total igual como prova de completude nem total diferente como erro.
12. **IA** (S4): só transações de cartão na primeira versão; lançamentos da conta corrente têm o nome da contraparte como descrição e ficam só com as regras.

### Limite conhecido
Parcelas de fatura parcelada e de parcelamento de compra não vêm pela Pluggy. Continuam dependendo do registro manual de pagamento parcial/parcelado de fatura que o app já tem.


## Emenda 3 — regras acrescentadas durante a implementação da persistência (PR #115)

- **Corte do cartão por fatura.** `PluggyAccountLink.cutoffBillDueDate`: registro com `billId` de fatura que vence até o corte → `before_cutoff`; registro sem `billId` em `PENDING` ou de fatura posterior segue normalmente, qualquer que seja a data; `billId` fora do mapa de faturas → `needs_review / unknown_bill`; `POSTED` sem fatura → `needs_review / missing_bill`. Conta corrente continua com corte por data (`syncFrom`).
- **Reclassificação tardia.** Vínculo `created` cujo registro volta com destino prévio `excluded` (par de pagamento de fatura ou de estorno de tarifa que só fechou depois): se a transação está intocada, soft delete e vínculo `excluded`, contado em `reclassified_excluded`; se foi editada ou tem categoria manual, só `divergence`. `excluded` que deixa de ser → `needs_review / exclusion_reverted`.
- **Provisório que some e volta.** O soft delete feito pelo sistema é carimbado no vínculo (`systemDeletedAt`); se o registro reaparece e o carimbo ainda é o do sistema, a transação é restaurada.
- **Custo.** Decisão em memória, escrita só do que mudou, `lastSeenAt` em lote: uma execução sem novidades faz um número constante de consultas.
- **Nunca apagar `PluggyAccountLink`**, só desativar: apagar leva junto o histórico de vínculos.
- **Importação manual** pula linhas de origin sincronizado a partir do corte (`skippedPluggyManaged`).


## Emenda 4 — categorização por rotina do dono, sem chave de API (prevalece sobre as seções acima)

- **Decisão do dono:** a categorização do que as regras não resolvem não usa chave de API de provedor de IA. Ela é feita por uma rotina do Claude Code na máquina do dono, com a assinatura dele. O app não chama nenhum provedor de IA para isso.
- **Removido:** o cliente HTTP do provedor, as variáveis de ambiente da IA, o gancho no fim da sincronização (`checks.ai` e `checks.aiSkipped` deixam de existir) e as opções `--ai`/`--no-ai` de `scripts/pluggy/sync.ts`.
- **Fluxo:** `scripts/pluggy/categorize.ts --export` (somente leitura) grava em `personal/` os pendentes, com chaves efêmeras, descrição minimizada e faixa de valor, e à parte um mapa privado chave → id. A rotina escreve um arquivo de decisões `{ exportacao, decisoes: [{ chave, categoria | null, confianca }] }`; `--apply-decisions <arquivo>` valida contra o mapa da última exportação (exportação diferente recusa o arquivo; chave desconhecida, categoria fora da lista ou formato inválido descarta o item), simula por padrão e grava com `--apply` só confiança alta. Instruções da rotina: `.claude/skills/mypocket-categorizar/SKILL.md`.
- **Mantido:** seleção (cartão por padrão; conta corrente só com `--incluir-conta`), minimização da descrição, nunca selecionar `categorySource = manual`, escrita condicional (categoria e origem de categoria ainda nulas, `updatedAt` igual, vínculo ativo, categoria pessoal do dono) gravando `categorySource = "ai"`. Código em `src/lib/category-assist/`.
- **Tentativas:** abstenções e confianças não altas ficam em `Settings` (`pluggy.categorizeAttempts`, id → dia) e não são reexportadas por 30 dias; entradas antigas são limpas a cada gravação. Sem migração.

## Emenda 5 — exportação com histórico, valor exato e regras pessoais (prevalece sobre a Emenda 4 no que divergir)

- **Decisão do dono:** os dados podem passar pela Anthropic (a rotina roda na assinatura dele); a preocupação é com provedores desconhecidos. O arquivo exportado continua só em `personal/`, e o arquivo de pendentes continua sem ids do banco.
- **Item exportado:** além de `chave`, `descricao` e `faixaDeValor`, traz `valor` (reais, positivo, 2 casas), `data` (YYYY-MM-DD no fuso de negócio), `conta` (`cartao` | `conta`) e `historico`: até 3 `{ categoria, vezes }` com as categorias pessoais que o dono já usou em despesas pessoais não apagadas e já ocorridas com a mesma descrição (normalização do dedup, sem marcador de parcela), comparando a descrição do lançamento e a da fonte no vínculo. Categoria dada pela própria rotina (`categorySource = "ai"`) não conta; receitas ficam fora; parcelas de uma compra e lançamentos de uma recorrência contam uma vez. Uma leitura do histórico, agrupada em memória.
- **Flags novas de `--export`:** `--incluir-pessoas` exporta transferências e carteiras entre pessoas (documentos, telefones, e-mails e sequências longas de dígitos continuam removidos); `--refazer-tentadas` ignora a janela de 30 dias das tentativas. Sem as flags, nada muda.
- **Rotina:** ordem de decisão regras pessoais do dono (`personal/pluggy/regras-categorizacao.md`, texto livre, prevalecem) → histórico (unânime, ou uma única categoria com 2+ ocorrências e as demais com 1, é confiança alta; dividido não decide sozinho) → descrição, abstendo-se na dúvida. Comando padrão `--export --incluir-conta --incluir-pessoas --prod`. O resumo lista as abstenções mais caras e sugere linhas para o arquivo de regras. Detalhes em `.claude/skills/mypocket-categorizar/SKILL.md`.
