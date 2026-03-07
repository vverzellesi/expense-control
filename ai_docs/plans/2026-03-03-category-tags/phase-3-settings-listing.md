# Phase 3: Settings + Listagem

## Overview

Adicionar aba "Tags" na página de Settings para gestão de CategoryTags por categoria (CRUD), e exibir o sub-label "Categoria · Tag" na listagem de transações.

## Reference Docs for This Phase

- `src/app/settings/page.tsx` (lines 1-60) — Imports, state declarations, component structure
- `src/app/settings/page.tsx` (lines 438-461) — TabsList with 4 tabs
- `src/app/settings/page.tsx` (lines 613-714) — Rules tab (pattern to follow)
- `src/app/transactions/page.tsx` (lines 518-600) — Transaction rendering with category + tags
- `src/types/index.ts` — CategoryTag interface

## Changes Required

#### 1. Add Tags management tab to Settings page - [x] DONE

**File**: `src/app/settings/page.tsx` (MODIFY)
**Complexity**: High
**TDD**: NO (UI component, no decision logic)
**Depends On**: Phase 1 tasks 1-3

**Load Before Implementing**:
1. `src/app/settings/page.tsx` (lines 1-60) — Imports and state declarations
2. `src/app/settings/page.tsx` (lines 438-461) — TabsList structure
3. `src/app/settings/page.tsx` (lines 613-714) — Rules TabsContent (pattern to replicate)
4. `src/app/settings/page.tsx` (lines 150-200) — fetchData function
5. `src/types/index.ts` — CategoryTag interface

**Pre-conditions**:
- [x] Phase 1 completed (API endpoints exist)
- [x] `src/app/settings/page.tsx` has 4 tabs (budgets, rules, goals, origins)

**Why**: Users need a UI to manage tags manually — create, view, edit keywords, and delete tags. The Settings page is the natural location since it already manages rules and budgets.

**Acceptance Criteria**:
```gherkin
Given the Settings page loads
When the user sees the tabs
Then a 5th tab "Tags" is visible

Given the user clicks the Tags tab
When tags exist
Then tags are shown grouped by category
And each tag shows its name, keywords, and a delete button

Given the user fills in the tag form (name, keywords, category)
When they click "Adicionar"
Then the tag is created via API
And the tags list refreshes to include the new tag

Given the user clicks delete on a tag
When confirmed
Then the tag is removed via API
And the tags list refreshes
```

**Implementation**:

**1. Add imports** — Add `CategoryTag` to the type import:
```typescript
import type { Category, Budget, CategoryRule, SavingsHistory, Origin, CategoryTag } from "@/types";
```

Add `Layers` icon to lucide-react import (for tab icon):
```typescript
// Add Layers to the existing lucide-react import
```

**2. Add interface and state** — After `RuleWithCategory` interface (around line 38):
```typescript
interface TagWithCategory extends CategoryTag {
  category: Category;
}
```

Add state declarations after existing state (around line 46):
```typescript
const [categoryTags, setCategoryTags] = useState<TagWithCategory[]>([]);

// Tag form
const [tagName, setTagName] = useState("");
const [tagKeywords, setTagKeywords] = useState("");
const [tagCategoryId, setTagCategoryId] = useState("");
const [tagSaving, setTagSaving] = useState(false);

// Tag delete
const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
```

**3. Fetch tags in fetchData** — In the `fetchData` function, add alongside other fetch calls:
```typescript
const tagsRes = await fetch("/api/category-tags");
const tagsData = await tagsRes.json();
setCategoryTags(tagsData);
```

**4. Add handleSaveTag function** — After `handleDeleteRule` function:
```typescript
async function handleSaveTag(e: React.FormEvent) {
  e.preventDefault();

  if (!tagName.trim() || !tagKeywords.trim() || !tagCategoryId) {
    toast({
      title: "Erro",
      description: "Preencha todos os campos",
      variant: "destructive",
    });
    return;
  }

  setTagSaving(true);

  try {
    const res = await fetch("/api/category-tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: tagName.trim(),
        keywords: tagKeywords.trim().toLowerCase(),
        categoryId: tagCategoryId,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || "Erro ao criar tag");
    }

    toast({
      title: "Sucesso",
      description: "Tag criada com sucesso",
    });
    setTagName("");
    setTagKeywords("");
    setTagCategoryId("");
    fetchData();
  } catch (error) {
    toast({
      title: "Erro",
      description: error instanceof Error ? error.message : "Erro ao criar tag",
      variant: "destructive",
    });
  } finally {
    setTagSaving(false);
  }
}

async function handleDeleteTag() {
  if (!deletingTagId) return;

  try {
    await fetch(`/api/category-tags/${deletingTagId}`, {
      method: "DELETE",
    });

    toast({
      title: "Sucesso",
      description: "Tag excluída com sucesso",
    });
    setDeletingTagId(null);
    fetchData();
  } catch (error) {
    toast({
      title: "Erro",
      description: "Erro ao excluir tag",
      variant: "destructive",
    });
  }
}
```

**5. Add TabsTrigger** — After the "origins" TabsTrigger (around line 459):
```tsx
<TabsTrigger value="tags" className="min-h-[44px] flex-1 sm:flex-initial">
  <Layers className="mr-2 h-4 w-4" />
  <span className="hidden sm:inline">Tags</span>
</TabsTrigger>
```

**6. Add TabsContent** — After the origins TabsContent closing tag (at the end of the Tabs component):
```tsx
<TabsContent value="tags" className="space-y-6">
  {/* Add Tag Form */}
  <Card>
    <CardHeader>
      <CardTitle>Nova Tag</CardTitle>
      <CardDescription>
        Tags são sub-labels dentro de categorias. Use keywords para identificar transações automaticamente.
      </CardDescription>
    </CardHeader>
    <CardContent>
      <form onSubmit={handleSaveTag} className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Label>Nome</Label>
            <Input
              value={tagName}
              onChange={(e) => setTagName(e.target.value)}
              placeholder="Ex: Combustível, Estacionamento"
              className="min-h-[44px]"
            />
          </div>
          <div className="flex-1">
            <Label>Keywords (separadas por vírgula)</Label>
            <Input
              value={tagKeywords}
              onChange={(e) => setTagKeywords(e.target.value)}
              placeholder="Ex: shell, ipiranga, posto"
              className="min-h-[44px]"
            />
          </div>
        </div>
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <Label>Categoria</Label>
            <Select
              value={tagCategoryId}
              onValueChange={setTagCategoryId}
            >
              <SelectTrigger className="min-h-[44px]">
                <SelectValue placeholder="Selecione uma categoria" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={tagSaving} className="w-full sm:w-auto min-h-[44px]">
              <Plus className="mr-2 h-4 w-4" />
              Adicionar
            </Button>
          </div>
        </div>
      </form>
    </CardContent>
  </Card>

  {/* Tags List grouped by category */}
  <Card>
    <CardHeader>
      <CardTitle>Tags por Categoria ({categoryTags.length})</CardTitle>
    </CardHeader>
    <CardContent>
      {categoryTags.length === 0 ? (
        <div className="text-center text-gray-500">
          Nenhuma tag configurada
        </div>
      ) : (
        <div className="space-y-4">
          {/* Group tags by category */}
          {categories
            .filter(c => categoryTags.some(t => t.categoryId === c.id))
            .map(category => (
              <div key={category.id}>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <h4 className="font-medium text-sm">{category.name}</h4>
                </div>
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 ml-5">
                  {categoryTags
                    .filter(t => t.categoryId === category.id)
                    .map(tag => (
                      <div
                        key={tag.id}
                        className="flex items-center justify-between rounded-lg border p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-sm">{tag.name}</div>
                          <div className="text-xs text-gray-500 truncate">
                            {tag.keywords}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="min-h-[44px] min-w-[44px] flex-shrink-0"
                          onClick={() => setDeletingTagId(tag.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    ))}
                </div>
              </div>
            ))}
        </div>
      )}
    </CardContent>
  </Card>
</TabsContent>
```

**7. Add delete confirmation AlertDialog** — In the existing AlertDialog section (where `deletingRuleId` dialog exists), add another one:
```tsx
<AlertDialog open={!!deletingTagId} onOpenChange={() => setDeletingTagId(null)}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Excluir tag?</AlertDialogTitle>
      <AlertDialogDescription>
        Transações vinculadas a esta tag perderão a associação.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancelar</AlertDialogCancel>
      <AlertDialogAction onClick={handleDeleteTag}>
        Excluir
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Verification**: `npx tsc --noEmit 2>&1 | head -20`

**On Failure**:
- If Layers icon not found: Use `Tag` icon instead (already imported)
- If tab doesn't render: Verify TabsTrigger value matches TabsContent value ("tags")
- If fetchData error: Ensure `/api/category-tags` endpoint is working from Phase 1

---

#### 2. Show category tag as sub-label in transaction listing - [x] DONE

**File**: `src/app/transactions/page.tsx` (MODIFY)
**Complexity**: Low
**TDD**: NO (UI display only)
**Depends On**: Phase 1 task 1

**Load Before Implementing**:
1. `src/app/transactions/page.tsx` (lines 518-568) — Transaction card rendering with category display
2. `src/app/transactions/page.tsx` (lines 1-30) — Imports and fetch calls

**Pre-conditions**:
- [x] Phase 1 migration completed (categoryTagId column exists)
- [x] Transaction listing fetches transactions with includes

**Why**: Users need to see the tag sub-label alongside the category name to have visual feedback that their tags are being applied.

**Acceptance Criteria**:
```gherkin
Given a transaction has a categoryTag assigned
When the transaction listing renders on desktop
Then the category name shows as "Automóvel · Combustível"

Given a transaction has a categoryTag assigned
When the transaction listing renders on mobile
Then the category badge shows as "Automóvel · Combustível"

Given a transaction has NO categoryTag
When the transaction listing renders
Then only the category name shows (no change from current behavior)
```

**Implementation**:

**1. Update the transactions API fetch** — Find where transactions are fetched (look for `fetch("/api/transactions")`). The API likely already uses `include: { category: true }`. Add `categoryTag: true` to the include:

In the transactions API route (`src/app/api/transactions/route.ts`), add to the Prisma query include:
```typescript
include: {
  category: true,
  categoryTag: true,  // <-- ADD THIS
  // ... other existing includes
}
```

**2. Update desktop category display** — In the transaction card, find the existing desktop category name (around line 560-562, inside `{transaction.category && (...)}`):
```tsx
{transaction.category && (
  <>
    <span className="hidden sm:inline">-</span>
    <span className="hidden sm:inline">
      {transaction.category.name}
      {transaction.categoryTag && (
        <span className="text-gray-400"> · {transaction.categoryTag.name}</span>
      )}
    </span>
  </>
)}
```

**3. Update mobile category display** — In the mobile badge (around line 566-568):
```tsx
{transaction.category && (
  <span className="sm:hidden text-xs bg-gray-100 px-1.5 py-0.5 rounded">
    {transaction.category.name}
    {transaction.categoryTag && ` · ${transaction.categoryTag.name}`}
  </span>
)}
```

Note: Both display blocks are INSIDE `{transaction.category && (...)}` guards, so `categoryTag` is only rendered when a category exists. The `transaction.categoryTag` check handles the case where category exists but no tag is assigned.

**Verification**: `npx tsc --noEmit 2>&1 | head -20`

**On Failure**:
- If `categoryTag` not available on transaction object: Ensure the API route includes `categoryTag: true` in Prisma query
- If TypeScript error on `transaction.categoryTag`: The type from API response may need explicit typing — check that Transaction interface includes `categoryTag`

## Learnings

- **Task 1**: O `Layers` icon do lucide-react funcionou corretamente para a aba Tags. Seguiu o mesmo padrão das outras abas (TabsTrigger + TabsContent). O fetch de tags foi adicionado ao `Promise.all` existente no `fetchData` para paralelismo.
- **Task 2**: A API de transações (`/api/transactions/route.ts`) precisou do `categoryTag: true` no include do Prisma para que o frontend recebesse os dados da tag. O tipo `Transaction` em `@/types` já possuía `categoryTag?: CategoryTag | null` desde a Phase 1, então nenhuma mudança de tipos foi necessária no frontend.
- **Nota**: ESLint não está configurado no projeto (sem `.eslintrc` na raiz), o `npm run lint` pede configuração interativa. 5 falhas de teste são pré-existentes em `utils.test.ts` e `csv-parser.test.ts`.

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` — TypeScript compila sem erros novos, testes passam sem regressões
