# Phase 3: Rule Suggestion on Recategorize

## Overview

Quando o usuário muda a categoria de uma transação manualmente na preview de importação, o sistema sugere criar uma regra de categorização automática. Extrai a keyword significativa da descrição (removendo prefixos como IFD*, MP *, EC *) e oferece um toast com opção de criar regra via `POST /api/rules`.

## Reference Docs for This Phase
- `src/app/import/page.tsx` (lines 1310-1335) — Category select (desktop), onde a mudança acontece
- `src/app/import/page.tsx` (lines 1043-1067) — Category select (mobile)
- `src/app/api/rules/route.ts` (lines 35-73) — POST /api/rules endpoint
- `src/lib/categorizer.ts` (lines 33-47) — suggestCategory() para entender rules
- `src/components/ui/use-toast.ts` — Toast system

## Changes Required

#### 1. Create keyword extraction utility and rule suggestion handler -- DONE

**File**: `src/app/import/page.tsx` (MODIFY)
**Complexity**: Medium
**TDD**: NO (UI interaction logic -- keyword extraction is simple string manipulation inline)
**Depends On**: none
**Status**: COMPLETE

**Load Before Implementing**:
1. `src/app/import/page.tsx` (lines 160-177, 573-577, 1310-1335) — ImportPage component, updateTransaction, category select
2. `src/app/api/rules/route.ts` (lines 35-73) — POST /api/rules request format
3. `src/components/ui/use-toast.ts` — Toast API (action property)

**Pre-conditions**:
- [x] `src/app/import/page.tsx` exists
- [x] Toast system supports `action` property for interactive toasts
- [x] `/api/rules` POST endpoint accepts `{ keyword, categoryId }` (userId extracted from auth server-side)

**Why**: Quando o usuário muda a categoria de uma transação na preview de importação, isso indica que a regra de categorização está faltando. Sugerir automaticamente a criação de uma regra evita que o problema se repita nas próximas importações.

**Acceptance Criteria**:
```gherkin
Given a transaction "IFD*TORO BURGERS" categorized as "Outros"
When the user changes the category to "Alimentação"
Then a toast appears: "Criar regra 'TORO BURGERS' → Alimentação?"
And the toast has a "Criar regra" button

Given the user clicks "Criar regra" on the toast
When the API call succeeds
Then a success toast appears: "Regra criada com sucesso"
And future transactions with "TORO BURGERS" will be auto-categorized

Given a transaction "NETFLIX.COM 0800123456"
When the user changes the category
Then the suggested keyword is "NETFLIX" (without the ".COM 0800123456" suffix)

Given a transaction with description shorter than 3 characters after extraction
When the user changes the category
Then no suggestion toast is shown
```

**Implementation**:

1. Add import for `ToastAction` at the top of the file (around line 25, near the existing `useToast` import):

```typescript
import { ToastAction } from "@/components/ui/toast";
```

2. Add keyword extraction function inside the component (after `removeTransaction`, around line 615):

```typescript
  function extractKeyword(description: string): string {
    // Remove known prefixes from bank statements
    let keyword = description
      .replace(/^(IFD\*|MP\s*\*|EC\s*\*|PDV\*|PG\s*\*|PAG\*|PIX\s+)/i, "")
      .trim();

    // Remove trailing installment info
    keyword = keyword
      .replace(/\s*[-–]\s*Parcela.*$/i, "")
      .replace(/\s*\d+\s*[\/\\]\s*\d+\s*$/i, "")
      .trim();

    // Remove trailing transaction codes (common in bank statements)
    keyword = keyword
      .replace(/\s+\d{6,}$/i, "")  // trailing numbers (6+ digits)
      .replace(/\s+[A-Z]{2,3}\d{2,}$/i, "")  // codes like "SP01234"
      .trim();

    // Take first meaningful words (max 3 words, at least 3 chars each)
    const words = keyword.split(/\s+/).filter(w => w.length >= 3);
    if (words.length > 3) {
      keyword = words.slice(0, 3).join(" ");
    }

    return keyword;
  }

  async function suggestRule(description: string, categoryId: string) {
    const keyword = extractKeyword(description);
    if (keyword.length < 3) return;

    const category = categories.find(c => c.id === categoryId);
    if (!category) return;

    toast({
      title: "Criar regra de categorização?",
      description: `"${keyword.toUpperCase()}" → ${category.name}`,
      action: (
        <ToastAction
          altText="Criar regra"
          onClick={async () => {
            try {
              const res = await fetch("/api/rules", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  keyword: keyword.toUpperCase(),
                  categoryId,
                }),
              });

              if (res.ok) {
                toast({
                  title: "Regra criada",
                  description: `Transações com "${keyword.toUpperCase()}" serão categorizadas automaticamente`,
                });
              }
            } catch (error) {
              console.error("Error creating rule:", error);
            }
          }}
        >
          Criar regra
        </ToastAction>
      ),
    });
  }
```

3. Update the category `onValueChange` handlers to trigger rule suggestion.

In the desktop category select (around line 1313):

```typescript
                          <Select
                            value={t.categoryId || ""}
                            onValueChange={(value) => {
                              updateTransaction(index, {
                                categoryId: value || undefined,
                              });
                              if (value && value !== t.categoryId) {
                                suggestRule(t.description, value);
                              }
                            }}
                          >
```

In the mobile category select (around line 1046):

```typescript
                            <Select
                              value={t.categoryId || ""}
                              onValueChange={(value) => {
                                updateTransaction(index, {
                                  categoryId: value || undefined,
                                });
                                if (value && value !== t.categoryId) {
                                  suggestRule(t.description, value);
                                }
                              }}
                            >
```

4. Need to check if the toast `action` prop is supported. If the toast component uses `@/components/ui/use-toast`, check the Toaster component for `action` rendering. If not supported, use a separate state-based confirmation dialog instead. Load `src/components/ui/use-toast.ts` and `src/components/ui/toaster.tsx` to verify.

**Verification**: `npx next build` + manual test: import CSV, change a category, verify toast appears

**On Failure**:
- If toast `action` renders but `onClick` doesn't fire: verify `ToastAction` from `@/components/ui/toast` accepts `onClick` prop (it extends Radix `Toast.Action`). If not, wrap in `asChild` with a Button.
- If `POST /api/rules` fails with 401: the endpoint requires auth — add credentials to fetch
- If keyword extraction produces empty string: the description was all prefix/numbers — skip suggestion silently

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` -- TypeScript compiles clean (no new errors), all tests pass (pre-existing failures only in utils.test.ts timezone issue)

### Manual Verification (only if automation impossible)
- [ ] Import CSV, change category of a transaction in preview -> toast appears suggesting rule creation
- [ ] Click "Criar regra" in toast -> rule is created, subsequent imports use the rule

### Learnings
- Toast system fully supports `action` property via Radix UI primitives; `ToastAction` extends `ToastPrimitives.Action` which supports `onClick`
- The `POST /api/rules` endpoint extracts `userId` from auth session server-side, not from the request body -- plan incorrectly listed `userId` as a body parameter
- Mobile category select is inside expandable card (`isExpanded &&`), desktop is in standard `TableCell` -- line numbers shifted from plan due to Phase 1/2 changes
- `extractKeyword` and `suggestRule` are defined inside the component to access `categories` state and `toast` from `useToast()` hook
