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

Cinco fluxos principais da aplicacao. Transacoes com parcelas usam fan-out loop para criar N registros. Importacao CSV faz deteccao de banco, auto-categorizacao e linking com recorrentes. Investimentos usam transacoes atomicas (prisma.$transaction) para manter consistencia entre cash-flow e portfolio.
