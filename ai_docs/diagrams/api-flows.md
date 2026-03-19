# API Flows - Diagramas de Sequencia

## 1. Criacao de Transacao com Parcelas

```mermaid
sequenceDiagram
    participant C as Client
    participant API as POST /api/transactions
    participant DB as Prisma/DB

    C->>API: { description, amount, type, isInstallment, totalInstallments }
    API->>API: getAuthenticatedUserId()
    API->>API: Normalizar tags (array->JSON string)

    alt isInstallment && totalInstallments > 1
        API->>DB: installment.create({ totalAmount, installmentAmount, startDate })
        DB-->>API: installment record
        loop i = 0 to totalInstallments-1
            API->>API: Calcular data: startDate + i meses
            API->>DB: transaction.create({ desc + "(i+1/total)", amount com sinal, installmentId })
        end
        API-->>C: 201 transactions[0]
    else Transacao simples
        API->>DB: transaction.create({ amount com sinal, isFixed })
        DB-->>API: transaction record
        API-->>C: 201 transaction
    end
```

## 2. Importacao CSV

```mermaid
sequenceDiagram
    participant C as Client
    participant CSV as csv-parser.ts
    participant CAT as categorizer.ts
    participant API as POST /api/import
    participant DB as Prisma/DB

    C->>CSV: parseCSV(fileContent, origin)
    CSV->>CSV: detectBank(headers) -> c6|itau|btg
    loop cada linha
        CSV->>CSV: parseBankRow() -> { date, description, amount }
        CSV->>CAT: detectInstallment(description)
        CAT-->>CSV: { current, total } ou null
        CSV->>CAT: suggestCategory(description)
        CAT-->>CSV: category ou null
    end
    CSV-->>C: ParsedTransaction[]

    C->>API: { transactions[], origin }
    API->>API: getAuthenticatedUserId()
    API->>DB: recurringExpense.findMany({ autoGenerate: false, isActive: true })
    DB-->>API: recurring candidates

    loop cada transacao
        API->>API: Ajustar sinal do amount
        API->>API: matchesRecurring() - keywords em comum
        alt match exato (1 resultado)
            API->>DB: transaction.create({ recurringExpenseId, isFixed: true })
        else sem match
            API->>DB: transaction.create({ dados normais })
        end
        API->>API: isCarryoverTransaction() check
        alt e saldo rotativo
            API->>DB: billPayment.findFirst() do mes anterior
            API->>DB: billPayment.update({ interestRate, interestAmount })
        end
    end
    API-->>C: { created, linkedRecurring, carryoverLinked }
```

## 3. Auto-Categorizacao

```mermaid
sequenceDiagram
    participant Caller as CSV Parser / OCR Route
    participant CAT as categorizer.ts
    participant Cache as In-Memory Map
    participant DB as Prisma/DB

    Caller->>CAT: suggestCategory(description, userId)
    CAT->>Cache: getRules(userId)

    alt cache miss
        Cache->>DB: categoryRule.findMany({ userId, include: category })
        DB-->>Cache: rules[]
        Cache->>Cache: Armazenar no Map
    end

    Cache-->>CAT: rules[]
    CAT->>CAT: description.toUpperCase()
    loop cada rule
        CAT->>CAT: upperDesc.includes(rule.keyword.toUpperCase())
        alt match encontrado
            CAT-->>Caller: category object
        end
    end
    CAT-->>Caller: null (sem match)

    Note over CAT,Cache: Cache invalidado via invalidateRulesCache()<br/>quando rules sao adicionadas/removidas
```

## 4. Gestao de Investimentos (Deposito)

```mermaid
sequenceDiagram
    participant C as Client
    participant API as POST /api/investments/[id]/deposit
    participant DB as Prisma/DB

    C->>API: { amount, date, notes }
    API->>API: getAuthenticatedUserId()
    API->>DB: investment.findFirst({ id, userId })
    DB-->>API: investment record

    rect rgb(240, 248, 255)
        Note over API,DB: prisma.$transaction() - atomico
        API->>DB: transaction.create({ type: EXPENSE, amount: -amount, desc: "Aporte - nome" })
        DB-->>API: cashflow transaction
        API->>DB: investmentTransaction.create({ type: DEPOSIT, amount, linkedTransactionId })
        DB-->>API: inv transaction
        API->>DB: investment.update({ currentValue += amount, totalInvested += amount })
        DB-->>API: updated investment
    end

    API->>API: Calcular totalReturn, returnPercent, goalProgress
    API-->>C: 200 { investment com metricas }
```

## 5. Geracao de Despesas Recorrentes

```mermaid
sequenceDiagram
    participant C as Client
    participant API as POST /api/recurring/[id]/generate
    participant DB as Prisma/DB

    C->>API: { month, year, amount? }
    API->>API: getAuthenticatedUserId()
    API->>DB: recurringExpense.findFirst({ id, userId })
    DB-->>API: recurring record

    API->>API: Verificar autoGenerate == true
    API->>DB: transaction.findFirst({ recurringExpenseId, mesmo mes/ano })
    DB-->>API: null (nao existe ainda)

    API->>API: day = min(dayOfMonth, ultimoDiaDoMes)
    API->>API: date = new Date(year, month-1, day)
    API->>DB: transaction.create({ desc, amount com sinal, isFixed: true, recurringExpenseId })
    DB-->>API: transaction record
    API-->>C: 201 transaction
```

## 6. Criação de Espaço Compartilhado

```mermaid
sequenceDiagram
    participant C as Client
    participant API as POST /api/spaces
    participant DB as Prisma/DB

    C->>API: { name }
    API->>API: getAuthenticatedUserId()
    API->>DB: spaceMember.findFirst({ userId }) - verifica limite de 1 espaço
    DB-->>API: null (sem espaço existente)

    rect rgb(240, 248, 255)
        Note over API,DB: prisma.$transaction() - atômico
        API->>DB: space.create({ name, createdBy: userId })
        DB-->>API: space record
        API->>DB: spaceMember.create({ spaceId, userId, role: ADMIN })
        DB-->>API: member record
    end

    API-->>C: 201 { space com members }
```

## 7. Convite para Espaço

```mermaid
sequenceDiagram
    participant C as Client
    participant API as POST /api/spaces/[spaceId]/invites
    participant DB as Prisma/DB

    C->>API: { email, role }
    API->>API: getAuthenticatedUserId()
    API->>DB: spaceMember.findFirst({ spaceId, userId, role: ADMIN })
    DB-->>API: admin member (autorizado)

    API->>API: Gerar código único (nanoid 8 chars)
    API->>API: Calcular expiresAt (7 dias)
    API->>DB: spaceInvite.create({ spaceId, email, code, role, status: PENDING, expiresAt })
    DB-->>API: invite record
    API-->>C: 201 { invite com code }
```

## 8. Aceitar Convite

```mermaid
sequenceDiagram
    participant C as Client
    participant API as POST /api/spaces/[spaceId]/invites (accept)
    participant DB as Prisma/DB

    C->>API: { code }
    API->>API: getAuthenticatedUserId()
    API->>DB: spaceInvite.findFirst({ code, status: PENDING })
    DB-->>API: invite record

    API->>API: Verificar não expirado (expiresAt > now)
    API->>DB: spaceMember.findFirst({ userId }) - verifica limite de 1 espaço
    DB-->>API: null (sem espaço existente)

    rect rgb(240, 248, 255)
        Note over API,DB: prisma.$transaction() - atômico
        API->>DB: spaceMember.create({ spaceId, userId, role: invite.role })
        DB-->>API: member record
        API->>DB: spaceInvite.update({ status: ACCEPTED })
        DB-->>API: updated invite
    end

    API-->>C: 200 { space com members }
```

## 9. Alternância de Contexto (Pessoal / Espaço)

```mermaid
sequenceDiagram
    participant C as Client
    participant API as PUT /api/spaces/active
    participant Cookie as Cookie Store
    participant DB as Prisma/DB

    C->>API: { spaceId | null }
    API->>API: getAuthenticatedUserId()

    alt spaceId fornecido
        API->>DB: spaceMember.findFirst({ spaceId, userId })
        DB-->>API: member record (autorizado)
        API->>Cookie: Set active-space-id = spaceId
    else null (contexto pessoal)
        API->>Cookie: Delete active-space-id
    end

    API-->>C: 200 { activeSpaceId }

    Note over C,Cookie: Todas as APIs subsequentes leem<br/>active-space-id do cookie para filtrar dados
```

## 10. Verificação de Permissões por Role

```mermaid
sequenceDiagram
    participant C as Client
    participant API as GET /api/spaces/active/permissions
    participant Cookie as Cookie Store
    participant DB as Prisma/DB

    C->>API: request
    API->>API: getAuthenticatedUserId()
    API->>Cookie: Ler active-space-id

    alt contexto pessoal (sem cookie)
        API-->>C: 200 { isPersonal: true, role: null, permissions: full }
    else contexto de espaço
        API->>DB: spaceMember.findFirst({ spaceId, userId })
        DB-->>API: member com role
        API->>API: Mapear role -> permissões
        Note over API: ADMIN: tudo<br/>MEMBER: CRUD transações, ver membros<br/>LIMITED: apenas ver dados
        API-->>C: 200 { isPersonal: false, role, permissions }
    end
```

Dez fluxos principais da aplicação. Transações com parcelas usam fan-out loop para criar N registros. Importação CSV faz detecção de banco, auto-categorização e linking com recorrentes. Investimentos usam transações atômicas (prisma.$transaction) para manter consistência entre cash-flow e portfolio. Os fluxos de espaços compartilhados (6-10) cobrem criação, convites, aceitação, alternância de contexto e verificação de permissões por role.
