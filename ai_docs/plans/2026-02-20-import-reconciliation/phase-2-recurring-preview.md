# Phase 2: Frontend — Recurring Preview + Match Endpoint

## Overview

Ativar o badge de recorrente (dead code) na preview de importação, criar endpoint de matching de recorrentes para mostrar quais transações importadas já existem como recorrentes, e adicionar novos badges para reconciliação na preview.

## Reference Docs for This Phase
- `src/app/import/page.tsx` (lines 49, 140-158, 504-520, 988-1031, 1230-1296) — Import page, ExtendedTransaction type, badge system
- `src/lib/categorizer.ts` (lines 72-132) — detectRecurringTransaction() e RECURRING_PATTERNS
- `src/app/api/import/route.ts` (lines 20-32) — matchesRecurring() function
- `prisma/schema.prisma` (lines 136-156) — RecurringExpense model

## Changes Required

#### 1. Create check-recurring-matches API endpoint -- DONE

**File**: `src/app/api/transactions/check-recurring-matches/route.ts` (CREATE)
**Complexity**: High
**TDD**: YES
**Depends On**: Phase 1 Task 2 (autoGenerate filter removed)
- [x] Completed with TDD: 8 integration tests (RED -> GREEN)
- **Learning:** Followed exact same mock pattern as check-duplicates.test.ts. Auth mocking is handled by integration/setup.ts globally.

**Load Before Implementing**:
1. `src/app/api/import/route.ts` (lines 10-32) — normalizeText() and matchesRecurring() to reuse pattern
2. `src/app/api/transactions/check-duplicates/route.ts` (lines 54-177) — Pattern for POST handler with auth
3. `prisma/schema.prisma` (lines 136-156) — RecurringExpense model

**Pre-conditions**:
- [ ] Directory `src/app/api/transactions/check-recurring-matches/` does not exist yet
- [ ] Phase 1 Task 2 is complete (autoGenerate filter removed from import route)

**Why**: O frontend precisa saber ANTES de importar quais transações matcham com recorrentes e se já existe transação para o mês. Isso permite mostrar badges informativos e deselecionar automaticamente duplicatas de recorrentes.

**Acceptance Criteria**:
```gherkin
Given user has RecurringExpense "SPOTIFY" with origin "Extrato C6" and a transaction in Jan 2026
When check-recurring-matches is called with a transaction "EBN *SPOTIFY" from "Extrato C6" for Jan 2026
Then it returns recurringMatch with the RecurringExpense data and hasExistingTransaction=true

Given user has RecurringExpense "NETFLIX" with origin "Extrato C6" and NO transaction in Feb 2026
When check-recurring-matches is called with a transaction "NETFLIX.COM" from "Extrato C6" for Feb 2026
Then it returns recurringMatch with the RecurringExpense data and hasExistingTransaction=false

Given a transaction "PADARIA DO JOAO" with no matching recurring expense
When check-recurring-matches is called
Then it returns recurringMatch=null
```

**Implementation**:

```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

interface TransactionToCheck {
  description: string;
  amount: number;
  date: string;
  origin?: string;
}

interface RecurringMatch {
  index: number;
  recurringExpenseId: string;
  recurringDescription: string;
  recurringAmount: number;
  hasExistingTransaction: boolean;
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function matchesRecurring(
  transactionDesc: string,
  recurringDesc: string
): boolean {
  const normalizedTransaction = normalizeText(transactionDesc);
  const normalizedRecurring = normalizeText(recurringDesc);

  const keywords = normalizedRecurring.split(/\s+/).filter((k) => k.length > 2);
  return keywords.some((keyword) => normalizedTransaction.includes(keyword));
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const body = await request.json();
    const { transactions, origin } = body as {
      transactions: TransactionToCheck[];
      origin?: string;
    };

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Transacoes nao fornecidas" },
        { status: 400 }
      );
    }

    // Fetch all active recurring expenses
    const recurringExpenses = await prisma.recurringExpense.findMany({
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

    const matches: RecurringMatch[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      const dateStr = !t.date.includes("T") ? t.date + "T12:00:00" : t.date;
      const transactionDate = new Date(dateStr);
      const transactionMonth = transactionDate.getMonth();
      const transactionYear = transactionDate.getFullYear();
      const transactionOrigin = origin || t.origin || "";

      const matchingRecurring = recurringExpenses.filter((recurring) => {
        // Origin must match if both sides have a non-empty value
        if (transactionOrigin && recurring.origin && recurring.origin !== transactionOrigin) {
          return false;
        }

        // Description must match
        if (!matchesRecurring(t.description, recurring.description)) {
          return false;
        }

        return true;
      });

      // Only use if exactly one match (conservative)
      if (matchingRecurring.length === 1) {
        const recurring = matchingRecurring[0];

        // Check if recurring already has a transaction for this month
        const hasExistingTransaction = recurring.transactions.some((tx) => {
          const txDate = new Date(tx.date);
          return (
            txDate.getMonth() === transactionMonth &&
            txDate.getFullYear() === transactionYear
          );
        });

        matches.push({
          index: i,
          recurringExpenseId: recurring.id,
          recurringDescription: recurring.description,
          recurringAmount: recurring.defaultAmount,
          hasExistingTransaction,
        });
      }
    }

    return NextResponse.json({
      matches,
      hasMatches: matches.length > 0,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error checking recurring matches:", error);
    return NextResponse.json(
      { error: "Erro ao verificar recorrentes" },
      { status: 500 }
    );
  }
}
```

**Verification**: `npx vitest run tests/integration/`

**On Failure**:
- If auth fails in tests: check `getAuthenticatedUserId` mock pattern in existing integration tests
- If Prisma `where` inside `include` fails: remove the nested where and filter in JS

---

#### 2. Activate recurring badge and add recurring match preview in import page -- DONE

**File**: `src/app/import/page.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO (UI component, no decision logic -- verified manually)
**Depends On**: Task 1
- [x] Completed: ExtendedTransaction type extended, detectRecurringTransaction activated, checkRecurringMatches function added, badges added in mobile+desktop views, summary counters added
- **Learning:** The isRecurring badge was already present in both mobile and desktop views but never populated. Added recurringName display to existing badge text.

**Load Before Implementing**:
1. `src/app/import/page.tsx` (lines 49, 140-158, 205-267, 504-520) — Import, type definition, checkDuplicates, CSV processing
2. `src/app/import/page.tsx` (lines 988-1031, 1230-1296) — Badge sections (mobile + desktop)
3. `src/lib/categorizer.ts` (lines 119-132) — detectRecurringTransaction signature

**Pre-conditions**:
- [ ] `src/app/import/page.tsx` exists
- [ ] Task 1 endpoint is created at `src/app/api/transactions/check-recurring-matches/route.ts`
- [ ] `detectRecurringTransaction` is already imported at line 49

**Why**: O badge "Recorrente" no preview é dead code — `isRecurring`/`recurringName` nunca são setados. Ativar via `detectRecurringTransaction()` durante parsing CSV. Adicionar novos campos para tracking de match com recorrentes cadastradas.

**Acceptance Criteria**:
```gherkin
Given a CSV with a transaction "NETFLIX.COM 0800123456"
When the CSV is parsed for preview
Then the transaction shows a "Recorrente: Netflix" badge (blue)

Given a CSV with a transaction matching a RecurringExpense that already has a transaction this month
When the preview is displayed
Then the transaction shows a "Recorrente já gerada" badge (yellow/amber) and is deselected

Given a CSV with a transaction matching a RecurringExpense with NO transaction this month
When the preview is displayed
Then the transaction shows a "Vincular à recorrente" badge (blue) and remains selected
```

**Implementation**:

1. Update the import from `@/lib/categorizer` at line 49 to include `detectRecurringTransaction`:

```typescript
import { detectTransfer, detectInstallment, detectRecurringTransaction } from "@/lib/categorizer";
```

2. Add new fields to `ExtendedTransaction` type (around line 140):

```typescript
type ExtendedTransaction = ImportedTransaction & {
  categoryId?: string;
  selected: boolean;
  transactionKind?: string;
  isEditing?: boolean;
  editedDescription?: string;
  isRecurring?: boolean;
  recurringName?: string;
  originalDate?: Date;
  isDuplicate?: boolean;
  specialType?: SpecialTransactionType;
  specialTypeWarning?: string;
  isRelatedInstallment?: boolean;
  relatedInstallmentInfo?: {
    relatedTransactionId: string;
    relatedDescription: string;
    relatedInstallment: number;
  };
  // NEW: Recurring match fields
  recurringMatchId?: string;
  recurringMatchDescription?: string;
  recurringAlreadyGenerated?: boolean;
};
```

3. In `processCSV()`, after installment detection (around line 435), add recurring detection:

```typescript
      // Check for recurring pattern (activate dead badge)
      const recurringInfo = detectRecurringTransaction(description);
```

And in the parsedTransactions.push (around line 507), add:

```typescript
        isRecurring: recurringInfo.isRecurring,
        recurringName: recurringInfo.recurringName,
```

4. Create a new function `checkRecurringMatches()` after `checkDuplicates()`:

```typescript
  async function checkRecurringMatches(parsedTransactions: ExtendedTransaction[]) {
    try {
      const res = await fetch("/api/transactions/check-recurring-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transactions: parsedTransactions.map((t) => ({
            description: t.description,
            amount: t.amount,
            date: t.date instanceof Date ? t.date.toISOString() : t.date,
          })),
          origin,
        }),
      });

      if (!res.ok) return parsedTransactions;

      const data = await res.json();

      if (!data.hasMatches) return parsedTransactions;

      const matchMap = new Map<number, typeof data.matches[0]>();
      for (const match of data.matches) {
        matchMap.set(match.index, match);
      }

      return parsedTransactions.map((t, index) => {
        const match = matchMap.get(index);
        if (!match) return t;

        return {
          ...t,
          recurringMatchId: match.recurringExpenseId,
          recurringMatchDescription: match.recurringDescription,
          recurringAlreadyGenerated: match.hasExistingTransaction,
          // Deselect if recurring already has transaction for this month
          selected: match.hasExistingTransaction ? false : t.selected,
        };
      });
    } catch (error) {
      console.error("Error checking recurring matches:", error);
      return parsedTransactions;
    }
  }
```

5. In `processCSV()`, after `checkDuplicates()` call (line 528), add recurring check:

```typescript
    // Check for duplicates
    const transactionsWithDuplicates = await checkDuplicates(parsedTransactions);
    // Check for recurring matches
    const transactionsWithRecurring = await checkRecurringMatches(transactionsWithDuplicates);
    setTransactions(transactionsWithRecurring);
    setStep("preview");
```

6. Add new badge in desktop view (after the existing `isRecurring` badge around line 1262-1267):

```typescript
                              {t.recurringAlreadyGenerated && (
                                <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  Recorrente já gerada
                                </Badge>
                              )}
                              {t.recurringMatchId && !t.recurringAlreadyGenerated && (
                                <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                  <Link2 className="h-3 w-3 mr-1" />
                                  Vincular à recorrente
                                </Badge>
                              )}
```

7. Add same badges in mobile view (after the existing `isRecurring` badge around line 1004-1008):

```typescript
                            {t.recurringAlreadyGenerated && (
                              <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                Já gerada
                              </Badge>
                            )}
                            {t.recurringMatchId && !t.recurringAlreadyGenerated && (
                              <Badge variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                <Link2 className="h-3 w-3 mr-1" />
                                Vincular
                              </Badge>
                            )}
```

8. Add summary counter (around line 704-707):

```typescript
  const recurringAlreadyCount = transactions.filter((t) => t.recurringAlreadyGenerated).length;
  const recurringMatchCount = transactions.filter((t) => t.recurringMatchId && !t.recurringAlreadyGenerated).length;
```

9. Add summary text in the header area (around line 823, after the duplicateCount display):

```typescript
                    {recurringAlreadyCount > 0 && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <RefreshCw className="h-4 w-4" />
                        {recurringAlreadyCount} recorrente(s) já gerada(s)
                      </span>
                    )}
                    {recurringMatchCount > 0 && (
                      <span className="flex items-center gap-1 text-blue-600">
                        <Link2 className="h-4 w-4" />
                        {recurringMatchCount} a vincular com recorrente
                      </span>
                    )}
```

**Verification**: `npx next build` (verify no TypeScript errors) + manual verification in browser

**On Failure**:
- If `detectRecurringTransaction` is not imported: it is NOT in the current import at line 49. Update the import to: `import { detectTransfer, detectInstallment, detectRecurringTransaction } from "@/lib/categorizer"`. This is a required change.
- If TypeScript errors on new fields: verify `ExtendedTransaction` type was updated correctly
- If badges don't show: verify `recurringInfo.isRecurring` is set correctly in the push call

---

#### 3. Send recurringMatchId in import request for server-side linking -- DONE

**File**: `src/app/import/page.tsx` (MODIFY)
**Complexity**: Low
**TDD**: NO (wiring change, no decision logic)
**Depends On**: Task 2
- [x] Completed: handleImport sends recurringExpenseId, import route uses frontend-provided ID with fallback to server-side matching
- **Learning:** The import route already handles the matchedRecurringId variable; wrapping existing logic in if(!matchedRecurringId) + else for linkedCount was clean.

**Load Before Implementing**:
1. `src/app/import/page.tsx` (lines 629-683) — handleImport function
2. `src/app/api/import/route.ts` (lines 72-155) — How import processes transactions

**Pre-conditions**:
- [ ] Task 2 is complete (recurringMatchId is set on transactions)

**Why**: Quando o preview identifica um match com recorrente, o frontend deve enviar o `recurringExpenseId` para que o backend vincule diretamente, sem precisar refazer o matching server-side.

**Acceptance Criteria**:
```gherkin
Given a transaction in preview with recurringMatchId set
When the user clicks "Importar"
Then the import request includes recurringExpenseId for that transaction

Given a transaction in preview WITHOUT recurringMatchId
When the user clicks "Importar"
Then the import request does NOT include recurringExpenseId (server-side matching still applies)
```

**Implementation**:

In `handleImport()`, update the transaction mapping (around line 648):

```typescript
          transactions: selectedTransactions.map((t) => ({
            description: t.description,
            amount: t.amount,
            date: t.date,
            type: t.type || "EXPENSE",
            categoryId: t.categoryId,
            isInstallment: t.isInstallment,
            currentInstallment: t.currentInstallment,
            totalInstallments: t.totalInstallments,
            recurringExpenseId: t.recurringMatchId || undefined,
          })),
```

In `src/app/api/import/route.ts`, use the frontend-provided `recurringExpenseId` when available (around line 94):

```typescript
      // Try to match with a recurring expense
      let matchedRecurringId: string | null = t.recurringExpenseId || null;

      // Only do server-side matching if frontend didn't already identify a match
      if (!matchedRecurringId) {
        const matches = recurringToMatch.filter((recurring) => {
```

And update the `linkedCount` logic:

```typescript
      if (!matchedRecurringId) {
        const matches = recurringToMatch.filter((recurring) => {
          // ... existing filter logic
        });

        if (matches.length === 1) {
          matchedRecurringId = matches[0].id;
          matches[0].transactions.push({ id: "temp", date: transactionDate });
          linkedCount++;
        }
      } else {
        linkedCount++;
      }
```

**Verification**: `npx next build`

**On Failure**:
- If TypeScript error on `t.recurringExpenseId`: the import route receives generic objects — no type checking on request body fields
- If linking fails: verify the `recurringExpenseId` value is a valid cuid from the check-recurring-matches response

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` -- All project checks pass (pre-existing failures only: utils.test.ts timezone, bill-payments.test.ts, csv-parser.test.ts)

### Manual Verification (only if automation impossible)
- [ ] Import a CSV with a known recurring transaction (e.g., NETFLIX) — verify "Recorrente: Netflix" badge appears
- [ ] Import a CSV where a recurring transaction was already auto-generated — verify "Recorrente já gerada" badge and transaction is deselected
