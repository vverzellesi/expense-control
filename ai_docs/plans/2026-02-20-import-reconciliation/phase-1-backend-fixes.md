# Phase 1: Backend — Transfer Detection + Import Reconciliation

## Overview

Corrigir 3 bugs no backend: TRANSFER_PATTERNS incompletos no categorizer, filtro `autoGenerate: false` na importação, e check-duplicates sem considerar `recurringExpenseId`. Após esta fase, imports detectam corretamente pagamentos de fatura e reconciliam com todas as recorrentes ativas.

## Reference Docs for This Phase
- `src/lib/categorizer.ts` (lines 134-163) — TRANSFER_PATTERNS e detectTransfer()
- `src/lib/categorizer.test.ts` (lines 348-418) — Testes existentes de detectTransfer
- `src/app/api/import/route.ts` (lines 47-134) — Matching de recorrentes durante import
- `src/app/api/transactions/check-duplicates/route.ts` (lines 77-94) — Lógica de detecção de duplicatas
- `tests/integration/api/import.test.ts` — Testes de integração existentes do import

## Changes Required

#### 1. Add missing TRANSFER_PATTERNS for "PGTO FAT" and "INCLUSAO DE PAGAMENTO" - [x] DONE

**File**: `src/lib/categorizer.ts` (MODIFY)
**Complexity**: Low
**TDD**: YES
**Depends On**: none
- **Learning:** Two regex patterns added cleanly after existing credit card patterns. All 81 categorizer tests pass. No overlap with existing patterns.

**Load Before Implementing**:
1. `src/lib/categorizer.ts` (lines 134-163) — Current TRANSFER_PATTERNS array
2. `src/lib/categorizer.test.ts` (lines 348-418) — Existing detectTransfer tests

**Pre-conditions**:
- [ ] `src/lib/categorizer.ts` exists and has TRANSFER_PATTERNS array
- [ ] `src/lib/categorizer.test.ts` exists

**Why**: "PGTO FAT CARTAO C6" e "INCLUSAO DE PAGAMENTO" não são detectados como transferência, causando pagamentos de fatura contabilizados como despesa em "Outros".

**Acceptance Criteria**:
```gherkin
Given a transaction with description "PGTO FAT CARTAO C6"
When detectTransfer is called
Then it returns true

Given a transaction with description "INCLUSAO DE PAGAMENTO"
When detectTransfer is called
Then it returns true

Given a transaction with description "PGTO FATURA"
When detectTransfer is called
Then it returns true

Given a regular purchase like "PADARIA DO JOAO"
When detectTransfer is called
Then it returns false (no false positives)
```

**Implementation**:

Add two new patterns to TRANSFER_PATTERNS in `src/lib/categorizer.ts`:

```typescript
// In TRANSFER_PATTERNS array, add after the existing patterns (before the closing bracket):
  /PGTO\s*FAT/i,
  /INCLUSAO\s*(DE\s*)?PAGAMENTO/i,
```

The full array becomes (lines 135-150):
```typescript
const TRANSFER_PATTERNS: RegExp[] = [
  // Credit card bill payments
  /PAGTO?\s*(DE\s*)?(FATURA|CARTAO|CART[AÃ]O)/i,
  /PAGAMENTO\s*(DE\s*)?(FATURA|CARTAO|CART[AÃ]O)/i,
  /FATURA\s*(CARTAO|CART[AÃ]O|C6|ITAU|ITAÚ|BTG|NUBANK|BRADESCO|SANTANDER|BB|CAIXA|INTER|NEXT|ORIGINAL|PAN|NEON|DIGIO|WILL|XP)/i,
  /PAG\s*FAT/i,
  /(C6|ITAU|ITAÚ|BTG|NUBANK|BRADESCO|SANTANDER|BB|CAIXA|INTER|NEXT)\s*(CARTAO|CART[AÃ]O|FATURA)/i,
  /DEBITO\s*AUTO(MATICO)?\s*(CARTAO|CART[AÃ]O|FATURA)/i,
  /PGTO\s*FAT/i,
  /INCLUSAO\s*(DE\s*)?PAGAMENTO/i,
  // Internal transfers (between own accounts)
  /TRANSF\s*(ENTRE\s*)?(CONTAS?|PROPRIA|PRÓPRIA)/i,
  /TRANSFERENCIA\s*(ENTRE\s*)?(CONTAS?|PROPRIA|PRÓPRIA)/i,
  /APLICACAO|APLICAÇÃO|RESGATE/i,
  /INVEST(IMENTO)?\s*(CDB|LCI|LCA|TESOURO|POUPANCA|POUPANÇA)/i,
];
```

Add tests to `src/lib/categorizer.test.ts` in the `detectTransfer > credit card payments` describe block:

```typescript
    it('should detect PGTO FAT abbreviation', () => {
      expect(detectTransfer('PGTO FAT CARTAO C6')).toBe(true)
      expect(detectTransfer('PGTO FAT')).toBe(true)
    })

    it('should detect INCLUSAO DE PAGAMENTO', () => {
      expect(detectTransfer('INCLUSAO DE PAGAMENTO')).toBe(true)
      expect(detectTransfer('INCLUSAO PAGAMENTO')).toBe(true)
    })
```

**Verification**: `npx vitest run src/lib/categorizer.test.ts`

**On Failure**:
- If regex conflicts with existing patterns: check the order — first match wins in detectTransfer, but all patterns are independent (no overlap)
- If test file not found: `ls src/lib/categorizer.test.ts`

---

#### 2. Remove `autoGenerate: false` filter from import route recurring matching - [x] DONE

**File**: `src/app/api/import/route.ts` (MODIFY)
**Complexity**: Low
**TDD**: YES
**Depends On**: none
- **Learning:** Integration tests use `vitest.integration.config.ts` config (not default). Added 4 new tests: autoGenerate matching, existing month blocking, query shape verification (no autoGenerate filter), and deletedAt filter on transactions include. All 30 import integration tests pass.

**Load Before Implementing**:
1. `src/app/api/import/route.ts` (lines 47-59) — Current recurring expense query
2. `tests/integration/api/import.test.ts` (full file) — Existing integration tests

**Pre-conditions**:
- [ ] `src/app/api/import/route.ts` exists
- [ ] Import route uses `autoGenerate: false` filter at line 51

**Why**: Recorrentes com `autoGenerate: true` são ignoradas durante importação. Quando o sistema gera a transação automaticamente E o extrato é importado, a importação não sabe que a transação já existe, criando duplicatas.

**Acceptance Criteria**:
```gherkin
Given a RecurringExpense with autoGenerate=true and an existing transaction in January
When importing a CSV with a matching transaction for January
Then the imported transaction is NOT created (recurring already has a transaction for this month)

Given a RecurringExpense with autoGenerate=true and NO transaction in February
When importing a CSV with a matching transaction for February
Then the imported transaction is created and linked to the recurring expense via recurringExpenseId

Given a RecurringExpense with a soft-deleted transaction (deletedAt != null) in January
When importing a CSV with a matching transaction for January
Then the imported transaction is created and linked (soft-deleted transactions don't count as existing)
```

**Implementation**:

In `src/app/api/import/route.ts`, change the recurring expense query (lines 48-59):

```typescript
    // Fetch ALL active recurring expenses for matching (not just autoGenerate=false)
    const recurringToMatch = await prisma.recurringExpense.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        transactions: {
          select: { id: true, date: true },
          where: { deletedAt: null },
        },
      },
    });
```

Key changes:
1. Removed `autoGenerate: false` filter — now matches ALL active recurring expenses
2. Added `where: { deletedAt: null }` to the transactions include — only consider non-deleted transactions when checking "already has transaction for this month"

**Verification**: `npx vitest run tests/integration/api/import.test.ts`

**On Failure**:
- If integration tests fail on auth: check if test setup mocks `getAuthenticatedUserId`
- If Prisma error on `where` inside `include`: verify syntax matches Prisma 5.x nested where format

---

#### 3. Add `recurringExpenseId` and `origin` awareness to check-duplicates - [x] DONE

**File**: `src/app/api/transactions/check-duplicates/route.ts` (MODIFY)
**Complexity**: Medium
**TDD**: YES
**Depends On**: none
- **Learning:** Created new integration test file `tests/integration/api/check-duplicates.test.ts` with 5 tests. Used `Record<string, unknown>` for dynamic Prisma `where` to avoid type issues. Frontend `origin` state was already in scope of `checkDuplicates` function. Recurring duplicate check uses keyword matching (same normalize+split logic as import route).

**Load Before Implementing**:
1. `src/app/api/transactions/check-duplicates/route.ts` (full file) — Current duplicate detection
2. `src/app/api/import/route.ts` (lines 96-126) — How recurring matching works

**Pre-conditions**:
- [ ] `src/app/api/transactions/check-duplicates/route.ts` exists
- [ ] The `TransactionToCheck` interface is defined at lines 5-12

**Why**: Quando uma transação já está vinculada a uma recorrente (via `recurringExpenseId`), a detecção de duplicatas deveria considerar isso. Também, transações de banks diferentes com mesma descrição/valor/data não devem ser duplicatas.

**Acceptance Criteria**:
```gherkin
Given an existing transaction linked to RecurringExpense "SPOTIFY" in January
And the import has a transaction "EBN *SPOTIFY" in January with similar amount
When check-duplicates is called with origin "Extrato C6"
Then the transaction is flagged as duplicate (existing recurring transaction covers this month)

Given an existing transaction from "Extrato C6" with description "COMPRA XYZ" amount -50.00
And the import has a transaction "COMPRA XYZ" amount -50.00 from "Cartao Itau"
When check-duplicates is called with origin "Cartao Itau"
Then the transaction is NOT flagged as duplicate (different origins)
```

**Implementation**:

Update the interface to accept `origin`:

```typescript
interface TransactionToCheck {
  description: string;
  amount: number;
  date: string;
  origin?: string;
  isInstallment?: boolean;
  currentInstallment?: number;
  totalInstallments?: number;
}
```

Update the POST handler to extract `origin` from request body:

```typescript
    const { transactions, origin } = body as { transactions: TransactionToCheck[]; origin?: string };
```

Update the duplicate check query (lines 78-94) to include `origin` when provided:

```typescript
      // Check for exact duplicates (same date, description, amount, and optionally origin)
      const duplicateWhere: Record<string, unknown> = {
        userId,
        description: {
          contains: t.description.slice(0, 50),
        },
        amount: {
          gte: t.amount - 0.01,
          lte: t.amount + 0.01,
        },
        date: {
          gte: new Date(transactionDate.getTime() - 24 * 60 * 60 * 1000),
          lte: new Date(transactionDate.getTime() + 24 * 60 * 60 * 1000),
        },
        deletedAt: null,
      };

      // If origin is provided, only match duplicates from same origin
      if (origin) {
        duplicateWhere.origin = origin;
      }

      const existing = await prisma.transaction.findFirst({
        where: duplicateWhere,
      });
```

Also, after the standard duplicate check, add a recurring-based duplicate check:

```typescript
      // Also check if a recurring expense already has a transaction for this month
      // that is linked to a recurring expense (via recurringExpenseId)
      if (!existing && origin) {
        const recurringDuplicates = await prisma.transaction.findMany({
          where: {
            userId,
            recurringExpenseId: { not: null },
            origin,
            date: {
              gte: new Date(transactionDate.getFullYear(), transactionDate.getMonth(), 1),
              lt: new Date(transactionDate.getFullYear(), transactionDate.getMonth() + 1, 1),
            },
            deletedAt: null,
          },
          include: { recurringExpense: true },
        });

        // Check if any recurring transaction matches by keyword (reuse normalize+keyword logic)
        const normalizedDesc = t.description.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const isRecurringDuplicate = recurringDuplicates.some((rt) => {
          if (!rt.recurringExpense) return false;
          const keywords = rt.recurringExpense.description
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .trim()
            .split(/\s+/)
            .filter((k: string) => k.length > 2);
          return keywords.some((kw: string) => normalizedDesc.includes(kw));
        });

        if (isRecurringDuplicate) {
          duplicates.push(i);
          continue;
        }
      }
```

Update the frontend call in `src/app/import/page.tsx` to send `origin`:

```typescript
  async function checkDuplicates(parsedTransactions: ExtendedTransaction[]) {
    try {
      const res = await fetch("/api/transactions/check-duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: parsedTransactions.map((t) => ({
            description: t.description,
            amount: t.amount,
            date: t.date instanceof Date ? t.date.toISOString() : t.date,
            isInstallment: t.isInstallment,
            currentInstallment: t.currentInstallment,
            totalInstallments: t.totalInstallments,
          })),
          origin,  // <-- ADD THIS
        }),
      });
```

**Verification**: `npx vitest run src/lib/categorizer.test.ts && npx vitest run tests/integration/`

**On Failure**:
- If Prisma type errors on `duplicateWhere`: use explicit Prisma `where` type from `@prisma/client`
- If `origin` is undefined in frontend: check that `origin` state is set before `checkDuplicates` is called (it is — set in `processCSV` before `checkDuplicates`)

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` — All project checks pass (pre-existing failures in utils.test.ts timezone and bill-payments.test.ts unrelated to this phase)

### Manual Verification (only if automation impossible)
- [ ] None — all verifiable via tests
