# Phase 2: Import — badges + sugestão

## Overview

Integrar CategoryTags no fluxo de importação: buscar tags do usuário, aplicar matching automático após categorização, renderizar badge teal no preview (mobile e desktop), sugerir criação de tag ao recategorizar, e enviar `categoryTagId` no payload de importação.

## Reference Docs for This Phase

- `src/app/import/page.tsx` (lines 141-163) — ExtendedTransaction type
- `src/app/import/page.tsx` (lines 670-741) — extractKeyword() + suggestRule()
- `src/app/import/page.tsx` (lines 770-810) — handleImport payload
- `src/app/import/page.tsx` (lines 1130-1184) — Mobile badge rendering
- `src/app/import/page.tsx` (lines 1386-1464) — Desktop badge rendering
- `src/app/api/import/route.ts` (lines 149-168) — Transaction creation
- `src/lib/categorizer.ts` — matchCategoryTag() from Phase 1

## Changes Required

#### 1. Add tag matching to import flow and badge rendering -- DONE

**File**: `src/app/import/page.tsx` (MODIFY)
**Complexity**: High
**TDD**: NO (UI rendering + state management, no isolated logic)
**Depends On**: Phase 1 tasks 1-3
- **Learning:** O handler de mudança de categoria usa `updateTransaction(index, {...})` como spread, então a tag matching precisa ser computada antes da chamada e passada junto com `categoryId`, `categoryTagId` e `categoryTagName` no mesmo objeto de updates.

**Load Before Implementing**:
1. `src/app/import/page.tsx` (lines 141-163) — ExtendedTransaction type to extend
2. `src/app/import/page.tsx` (lines 165-180) — State declarations
3. `src/app/import/page.tsx` (lines 485-580) — processCSV auto-categorization loop
4. `src/app/import/page.tsx` (lines 702-741) — suggestRule pattern to replicate
5. `src/app/import/page.tsx` (lines 770-787) — handleImport payload mapping
6. `src/app/import/page.tsx` (lines 1130-1184) — Mobile badge block
7. `src/app/import/page.tsx` (lines 1386-1464) — Desktop badge block
8. `src/types/index.ts` — CategoryTag interface from Phase 1

**Pre-conditions**:
- [x] Phase 1 completed (CategoryTag model, API, matchCategoryTag function exist)
- [x] `src/app/import/page.tsx` exists with current badge structure

**Why**: This is the core user-facing integration. Tags are matched automatically during CSV processing, shown as badges in the preview, and persisted on import.

**Acceptance Criteria**:
```gherkin
Given a CSV is processed and a transaction matches a CategoryTag keyword
When the import preview renders
Then a teal badge with "Tag: {tagName}" appears on the transaction (desktop)
And a teal badge with "{tagName}" appears (mobile)

Given a user changes a transaction's category in the preview
When the new category has no tag matching the description
Then a toast suggests creating a tag for that description
And the toast has a button to create the tag via API

Given selected transactions include ones with matched tags
When the user clicks Import
Then categoryTagId is included in the import payload

Given a user changes a transaction's category
When a tag from the new category matches the description
Then the tag badge updates to show the new match
```

**Implementation**:

**1. Extend ExtendedTransaction type** (after `recurringAlreadyGenerated?: boolean;` around line 162):
```typescript
  // Category tag fields
  categoryTagId?: string;
  categoryTagName?: string;
```

**2. Add state for category tags** (after categories state, around line 167):
```typescript
const [categoryTags, setCategoryTags] = useState<CategoryTag[]>([]);
```

Add `CategoryTag` to the import from `@/types`:
```typescript
import type { Category, ImportedTransaction, SpecialTransactionType, CategoryTag } from "@/types";
```

**3. Fetch tags alongside categories** — In the `useEffect` that fetches categories (find `fetch("/api/categories")`), add after categories are fetched:
```typescript
const tagsRes = await fetch("/api/category-tags");
if (tagsRes.ok) {
  const tagsData = await tagsRes.json();
  setCategoryTags(tagsData);
}
```

**4. Add matchTag helper function** (before `suggestRule` function, around line 700):
```typescript
function matchTag(description: string, categoryId: string): { id: string; name: string } | null {
  const tagsForCategory = categoryTags.filter(t => t.categoryId === categoryId);
  if (tagsForCategory.length === 0) return null;

  const upperDesc = description.toUpperCase();
  const matches = tagsForCategory.filter(tag => {
    const keywords = tag.keywords.split(",").map(k => k.trim().toUpperCase()).filter(k => k.length > 0);
    return keywords.some(keyword => upperDesc.includes(keyword));
  });

  if (matches.length === 1) {
    return { id: matches[0].id, name: matches[0].name };
  }
  return null;
}
```

**5. Apply tag matching in processCSV** — After category is assigned to each transaction (after the for loop that matches rules), before pushing to parsedTransactions:
```typescript
// Match category tag
let categoryTagId: string | undefined;
let categoryTagName: string | undefined;
if (categoryId) {
  const tagMatch = matchTag(description, categoryId);
  if (tagMatch) {
    categoryTagId = tagMatch.id;
    categoryTagName = tagMatch.name;
  }
}
```

Add to the transaction object being pushed:
```typescript
categoryTagId,
categoryTagName,
```

**6. Update category change handler** — In the function that handles category changes (find where `suggestRule` is called on category change), add tag matching after updating categoryId:
```typescript
// After setting new categoryId, match tag
const tagMatch = matchTag(t.description, newCategoryId);
// Update transaction with tag match
updatedTransaction.categoryTagId = tagMatch?.id;
updatedTransaction.categoryTagName = tagMatch?.name;
```

**7. Add suggestTag function** (after `suggestRule` function):
```typescript
async function suggestTag(description: string, categoryId: string) {
  // Don't suggest if a tag already matches
  const existingMatch = matchTag(description, categoryId);
  if (existingMatch) return;

  const keyword = extractKeyword(description);
  if (keyword.length < 3) return;

  const category = categories.find(c => c.id === categoryId);
  if (!category) return;

  toast({
    title: "Criar tag para esta categoria?",
    description: `"${keyword}" em ${category.name}`,
    action: (
      <ToastAction
        altText="Criar tag"
        onClick={async () => {
          try {
            const res = await fetch("/api/category-tags", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: keyword,
                keywords: keyword.toLowerCase(),
                categoryId,
              }),
            });

            if (res.ok) {
              const newTag = await res.json();
              setCategoryTags(prev => [...prev, newTag]);
              toast({
                title: "Tag criada",
                description: `Tag "${keyword}" adicionada em ${category.name}`,
              });
            }
          } catch (error) {
            console.error("Error creating tag:", error);
          }
        }}
      >
        Criar tag
      </ToastAction>
    ),
  });
}
```

**8. Call suggestTag on category change** — In the category change handler, after `suggestRule(description, newCategoryId)`, add:
```typescript
suggestTag(t.description, newCategoryId);
```

**9. Add badge rendering — Mobile** (after the `recurringMatchId && !recurringAlreadyGenerated` badge around line 1162):
```typescript
{t.categoryTagName && (
  <Badge variant="outline" className="text-xs bg-teal-50 text-teal-700 border-teal-200">
    <Tag className="h-3 w-3 mr-1" />
    {t.categoryTagName}
  </Badge>
)}
```

**10. Add badge rendering — Desktop** (after the `recurringMatchId && !recurringAlreadyGenerated` badge around line 1435):
```typescript
{t.categoryTagName && (
  <Badge variant="outline" className="text-xs bg-teal-50 text-teal-700 border-teal-200">
    <Tag className="h-3 w-3 mr-1" />
    Tag: {t.categoryTagName}
  </Badge>
)}
```

Ensure `Tag` icon is imported from lucide-react (check existing imports — it's already imported on the settings page but may need to be added here).

**11. Update handleImport payload** — In the `handleImport` function (around line 774), add to the transaction mapping:
```typescript
categoryTagId: t.categoryTagId || undefined,
```

**Verification**: `npx tsc --noEmit 2>&1 | head -20`

**On Failure**:
- If Tag icon not found in imports: Add `Tag` to the lucide-react import at top of file
- If type error on categoryTagId: Verify ExtendedTransaction was updated
- If badges don't render: Check that `categoryTagName` is being set in processCSV

---

#### 2. Persist categoryTagId in import API route -- DONE

**File**: `src/app/api/import/route.ts` (MODIFY)
**Complexity**: Low
**TDD**: NO (simple field passthrough, no logic)
**Depends On**: Phase 1 task 1
- **Learning:** A validação de `categoryTagId` segue o mesmo padrão de `recurringExpenseId` — verificar que pertence ao usuário e que o `categoryId` bate com o tag. Uso de `Set` com chave composta `id:categoryId` é eficiente para validação em lote.

**Load Before Implementing**:
1. `src/app/api/import/route.ts` (lines 149-168) — Transaction creation block
2. `src/app/api/import/route.ts` (lines 34-50) — Request body parsing

**Pre-conditions**:
- [x] Phase 1 migration completed (categoryTagId column exists on Transaction)

**Why**: Persists the tag assignment when transactions are imported. Without this, tags are visual-only in the preview.

**Acceptance Criteria**:
```gherkin
Given a transaction payload includes categoryTagId
When the import API creates the transaction
Then the transaction record has categoryTagId set

Given a transaction payload does NOT include categoryTagId
When the import API creates the transaction
Then the transaction record has categoryTagId as null
```

**Implementation**:

First, validate `categoryTagId` ownership (similar to existing `recurringExpenseId` validation at lines 97-102). Before the transaction creation loop, fetch user's tags:
```typescript
// Add after the recurringToMatch fetch, before the transaction loop:
const userTagIds = new Set(
  (await prisma.categoryTag.findMany({
    where: { userId },
    select: { id: true, categoryId: true },
  })).map(t => `${t.id}:${t.categoryId}`)
);
```

Then in the transaction creation block (around line 149-168), validate and add `categoryTagId`:
```typescript
// Validate frontend-provided categoryTagId belongs to user and matches category
let validatedTagId: string | null = null;
if (t.categoryTagId) {
  const tagKey = `${t.categoryTagId}:${t.categoryId || ""}`;
  if (userTagIds.has(tagKey)) {
    validatedTagId = t.categoryTagId;
  }
}

const transaction = await prisma.transaction.create({
  data: {
    userId,
    description: t.description,
    amount,
    date: transactionDate,
    type,
    origin: transactionOrigin,
    categoryId: t.categoryId || null,
    categoryTagId: validatedTagId,  // Validated against user ownership + category match
    isFixed: matchedRecurringId !== null,
    isInstallment: t.isInstallment || false,
    currentInstallment: t.currentInstallment || null,
    totalInstallments: t.totalInstallments || null,
    recurringExpenseId: matchedRecurringId,
  },
  include: {
    category: true,
    recurringExpense: true,
  },
});
```

**Verification**: `npx tsc --noEmit 2>&1 | head -20`

**On Failure**:
- If Prisma type error: Ensure `npm run db:generate` was run after migration
- If field not recognized: Check schema has `categoryTagId` on Transaction model

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` — TypeScript compiles cleanly for modified files. Pre-existing test failures in `utils.test.ts` (timezone issues) are unrelated.
