# Design: Parcelamento de Faturas

**Data:** 2026-02-05
**Status:** Aprovado

## Visão Geral

Permitir registrar que uma fatura foi paga parcialmente, com duas modalidades:

| Modalidade | Descrição |
|------------|-----------|
| **Rolar Saldo** | Pagar até um limite e jogar o restante para a fatura seguinte |
| **Parcelar** | Pagar entrada + dividir o restante em X parcelas iguais |

**Onde:** Botão "Pagar Fatura" em cada card de fatura na página `/bills`, abrindo um modal.

**Identificação:** Cada registro é vinculado a mês/ano + origin (ex: "Jan/2026 - Nubank").

**Impacto no saldo:** O mês mostra apenas o que foi efetivamente pago, não o que foi consumido.

---

## Modelo de Dados

Novo modelo `BillPayment` para registrar pagamentos de fatura:

```prisma
model BillPayment {
  id              String    @id @default(cuid())

  // Identificação da fatura
  billMonth       Int       // 1-12
  billYear        Int       // Ex: 2026
  origin          String    // Cartão (ex: "Nubank")

  // Valores
  totalBillAmount Float     // Valor total da fatura
  amountPaid      Float     // Valor pago no mês (entrada ou pagamento parcial)
  amountCarried   Float     // Valor rolado/financiado

  // Modalidade
  paymentType     String    // "PARTIAL" (rolar) ou "FINANCED" (parcelar)

  // Parcelamento (quando paymentType = "FINANCED")
  installmentId   String?   // Vínculo com Installment existente
  installment     Installment? @relation(fields: [installmentId], references: [id])

  // Juros
  interestRate    Float?    // Taxa de juros (%) - opcional
  interestAmount  Float?    // Valor dos juros calculado

  // Transações geradas
  entryTransactionId    String?  // Transação da entrada/pagamento
  carryoverTransactionId String? // Transação "Saldo Anterior" criada

  // Vínculo quando importar
  linkedTransactionId   String?  // Transação importada que foi vinculada

  // Metadata
  userId          String
  user            User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([userId])
  @@index([billMonth, billYear, origin])
}
```

**Por que um modelo novo em vez de reaproveitar Installment?**
- Installment é para compras parceladas, não financiamento de fatura
- Precisamos rastrear: fatura original, valor rolado, juros, vínculo com importação
- Mantém separação de conceitos clara

---

## Fluxo do Usuário e UI

### Modal "Pagar Fatura"

Acionado por botão no card da fatura:

```
┌─────────────────────────────────────────────────────┐
│  Pagar Fatura - Janeiro/2026 - Nubank               │
│  Total: R$ 12.000,00                                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  ○ Pagar valor total                                │
│  ● Pagar parcialmente                               │
│                                                     │
│  ┌─────────────────────────────────────────────────┐│
│  │ Como deseja pagar?                              ││
│  │                                                 ││
│  │ ○ Rolar saldo para próxima fatura              ││
│  │   Valor a pagar agora: [R$ 10.000,00]          ││
│  │   Saldo para próxima fatura: R$ 2.000,00       ││
│  │   Juros (%): [    ] (opcional)                 ││
│  │                                                 ││
│  │ ○ Parcelar o restante                          ││
│  │   Entrada: [R$ 4.000,00]                       ││
│  │   Restante: R$ 8.000,00                        ││
│  │   Parcelas: [4x] de R$ 2.000,00                ││
│  │   Juros (%): [    ] (opcional)                 ││
│  └─────────────────────────────────────────────────┘│
│                                                     │
│  [Cancelar]                      [Confirmar]        │
└─────────────────────────────────────────────────────┘
```

### Badge na fatura após registro

```
┌─────────────────────────────────────────────────────┐
│  Janeiro/2026 - Nubank          [Pagamento Parcial] │
│  Total: R$ 12.000,00                                │
│  ├─ Pago: R$ 10.000,00                              │
│  └─ Rolado: R$ 2.000,00 → Fev/2026                  │
└─────────────────────────────────────────────────────┘
```

---

## Transações Geradas

### Modalidade "Rolar Saldo" (pagar R$ 10k de R$ 12k)

| Transação | Mês | Valor | Tipo | Descrição |
|-----------|-----|-------|------|-----------|
| Pagamento | Jan/2026 | -R$ 10.000 | `BILL_PAYMENT` | "Pagamento Fatura Jan/2026 - Nubank" |
| Saldo Anterior | Fev/2026 | -R$ 2.000 | `BILL_CARRYOVER` | "Saldo Anterior Fatura Jan/2026 - Nubank" |

### Modalidade "Parcelar" (entrada R$ 4k + 4x R$ 2k)

| Transação | Mês | Valor | Tipo | Descrição |
|-----------|-----|-------|------|-----------|
| Entrada | Jan/2026 | -R$ 4.000 | `BILL_PAYMENT` | "Entrada Financiamento Fatura Jan/2026 - Nubank" |
| Parcela 1/4 | Fev/2026 | -R$ 2.000 | `FINANCING` | "Financiamento Fatura Jan/2026 (1/4) - Nubank" |
| Parcela 2/4 | Mar/2026 | -R$ 2.000 | `FINANCING` | "Financiamento Fatura Jan/2026 (2/4) - Nubank" |
| Parcela 3/4 | Abr/2026 | -R$ 2.000 | `FINANCING` | "Financiamento Fatura Jan/2026 (3/4) - Nubank" |
| Parcela 4/4 | Mai/2026 | -R$ 2.000 | `FINANCING` | "Financiamento Fatura Jan/2026 (4/4) - Nubank" |

**Observações:**
- As parcelas usam o sistema `Installment` existente (com `installmentId`)
- Tipos `BILL_PAYMENT`, `BILL_CARRYOVER`, `FINANCING` já existem em `/src/types/index.ts`
- Categoria: criar "Pagamento de Fatura" ou deixar sem categoria

---

## Detecção na Importação

### Padrões a detectar

```typescript
const CARRYOVER_PATTERNS = [
  /SALDO\s*ANTERIOR/i,
  /SALDO\s*FATURA\s*ANT/i,
  /SALDO\s*ROTATIVO/i,
  /ROTATIVO/i,
  /FINANC(?:IAMENTO)?\s*FATURA/i,
  /PARCELAMENTO\s*FATURA/i,
  /PGTO\s*MINIMO/i,
  /PAGAMENTO\s*MINIMO/i,
];
```

### Fluxo de vinculação automática

```
1. Usuário importa fatura Fev/2026 - Nubank
2. Sistema encontra transação: "SALDO ROTATIVO - R$ 2.150,00"
3. Busca BillPayment pendente:
   - origin = "Nubank"
   - billMonth/Year = Jan/2026 (mês anterior)
   - amountCarried ≈ R$ 2.000
   - linkedTransactionId = null (ainda não vinculado)
4. Match encontrado!
5. Ações automáticas:
   - Vincula: BillPayment.linkedTransactionId = transação importada
   - Marca transação "Saldo Anterior" criada como deletedAt (soft delete)
   - Calcula juros: (2.150 - 2.000) / 2.000 = 7,5%
   - Atualiza: BillPayment.interestRate = 7.5, interestAmount = 150
6. Usuário vê na importação: "Vinculado ao saldo rolado de Jan/2026"
```

### Tolerância para match

- Mesmo origin (cartão)
- Mês anterior ao período da fatura sendo importada
- Valor dentro de margem (ex: ±50% para considerar juros altos)

---

## Impacto no Resumo e Projeções

### Dashboard e Saldo Mensal

| Cenário | Antes | Depois |
|---------|-------|--------|
| Fatura Jan: R$ 12k, pagou R$ 10k | Despesas: R$ 12k | Despesas: R$ 10k |
| Saldo rolado para Fev | - | Projeção Fev: +R$ 2k em despesas |

### Página de Faturas (`/bills`)

```
Fatura Fevereiro/2026 - Nubank
├── Transações do período: R$ 8.000,00
├── Saldo anterior (Jan/2026): R$ 2.000,00  ← Campo separado
├── Juros: R$ 150,00
└── Total: R$ 10.150,00
```

### API `/api/bills` - Mudanças

```typescript
// Resposta atual
{
  bills: [{
    label: "Fevereiro 2026",
    total: 8000,
    transactions: [...]
  }]
}

// Resposta nova
{
  bills: [{
    label: "Fevereiro 2026",
    total: 10150,           // Inclui saldo anterior + juros
    transactionTotal: 8000, // Só transações do período
    carryover: {            // Novo campo
      amount: 2000,
      interest: 150,
      fromBill: "Janeiro/2026",
      billPaymentId: "..."
    },
    transactions: [...]
  }]
}
```

### Projeção (`/api/projection`)

- Inclui parcelas futuras de financiamentos de fatura
- Já funciona via sistema de Installments existente

---

## API Endpoints

### Novos endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `POST` | `/api/bill-payments` | Registrar pagamento de fatura (parcial/parcelado) |
| `GET` | `/api/bill-payments` | Listar pagamentos registrados |
| `GET` | `/api/bill-payments/:id` | Detalhes de um pagamento |
| `PUT` | `/api/bill-payments/:id` | Atualizar (ex: informar juros depois) |
| `DELETE` | `/api/bill-payments/:id` | Cancelar (remove transações geradas) |

### POST `/api/bill-payments` - Request

```typescript
{
  // Identificação da fatura
  billMonth: 1,
  billYear: 2026,
  origin: "Nubank",
  totalBillAmount: 12000,

  // Modalidade
  paymentType: "PARTIAL" | "FINANCED",

  // Valores
  amountPaid: 10000,      // Entrada ou pagamento parcial

  // Se FINANCED
  installments?: 4,       // Número de parcelas

  // Opcional
  interestRate?: 7.5,     // Taxa de juros %
}
```

### Modificações em endpoints existentes

| Endpoint | Mudança |
|----------|---------|
| `/api/bills` | Incluir campo `carryover` na resposta |
| `/api/import` | Detectar e vincular saldo anterior automaticamente |
| `/api/summary` | Considerar apenas `amountPaid` no mês do pagamento |

---

## Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `prisma/schema.prisma` | Adicionar modelo `BillPayment` |
| `src/app/api/bill-payments/route.ts` | CRUD de pagamentos |
| `src/app/api/bill-payments/[id]/route.ts` | GET/PUT/DELETE por ID |
| `src/components/BillPaymentModal.tsx` | Modal de pagamento |
| `src/lib/carryover-detector.ts` | Detecção de padrões na importação |

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/app/bills/page.tsx` | Botão "Pagar Fatura" + badge |
| `src/app/api/bills/route.ts` | Campo `carryover` na resposta |
| `src/app/api/import/route.ts` | Vinculação automática |
| `src/app/api/summary/route.ts` | Considerar pagamentos parciais |
| `src/types/index.ts` | Interface `BillPayment` |

## Ordem de Implementação

1. Modelo de dados (Prisma)
2. API `/api/bill-payments` (CRUD básico)
3. Geração de transações (pagamento + saldo/parcelas)
4. UI: Modal de pagamento
5. UI: Badge na fatura
6. Modificar `/api/bills` para incluir carryover
7. Detecção na importação
8. Cálculo automático de juros
