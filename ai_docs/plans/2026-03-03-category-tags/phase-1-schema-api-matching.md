# Phase 1: Schema + API + Matching

## Overview

Criar o modelo `CategoryTag` no Prisma, adicionar `categoryTagId` na Transaction, implementar API CRUD seguindo o padrão de `/api/rules`, e criar a função de matching com testes unitários. Após esta fase, tags podem ser criados via API e o matching funciona end-to-end.

## Reference Docs for This Phase

- `prisma/schema.prisma` — Schema atual com Category (:158-175), Transaction (:99-134), CategoryRule (:225-237)
- `src/app/api/rules/route.ts` — Padrão de API CRUD a seguir
- `src/lib/categorizer.ts` (lines 1-47) — Padrão de cache e matching
- `src/types/index.ts` — Interfaces TypeScript (Category :53-58, CategoryRule :84-89, Transaction :14-35)
- `src/lib/auth-utils.ts` — getAuthenticatedUserId(), unauthorizedResponse()
- `src/lib/db.ts` — Prisma client singleton

## Changes Required

#### ~~1. Add CategoryTag model to Prisma schema and categoryTagId to Transaction~~ [x]

**File**: `prisma/schema.prisma` (MODIFY)
**Complexity**: Low
**TDD**: NO (schema definition, no logic)
**Depends On**: none

**Load Before Implementing**:
1. `prisma/schema.prisma` (lines 99-134) — Transaction model to add categoryTagId
2. `prisma/schema.prisma` (lines 158-175) — Category model to add relation
3. `prisma/schema.prisma` (lines 16-48) — User model to add relation
4. `prisma/schema.prisma` (lines 225-237) — CategoryRule model as pattern reference

**Pre-conditions**:
- [ ] `prisma/schema.prisma` exists and is valid

**Why**: Foundation data model. CategoryTag stores name + keywords per category. Transaction.categoryTagId persists the tag assignment.

**Acceptance Criteria**:
```gherkin
Given the updated schema
When running `npx prisma validate`
Then validation passes without errors

Given the updated schema
When running `npm run db:migrate`
Then migration creates CategoryTag table and adds categoryTagId column to Transaction
```

**Implementation**:

Add to User model (after `categoryRules CategoryRule[]` on line 34):
```prisma
  categoryTags      CategoryTag[]
```

Add to Transaction model (after line 116 `tags String?`):
```prisma
  categoryTagId      String?
  categoryTag        CategoryTag?  @relation(fields: [categoryTagId], references: [id], onDelete: SetNull)
```

Add to Category model (after line 165 `categoryRules CategoryRule[]`):
```prisma
  categoryTags      CategoryTag[]
```

Add new model after CategoryRule (after line 237):
```prisma
model CategoryTag {
  id         String        @id @default(cuid())
  name       String
  keywords   String // Comma-separated: "shell,ipiranga,posto"
  categoryId String
  category   Category      @relation(fields: [categoryId], references: [id])
  transactions Transaction[]

  // User relationship
  userId String?
  user   User?  @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([name, categoryId, userId])
  @@index([userId])
  @@index([categoryId])
}
```

**Verification**: `npx prisma validate && npx prisma migrate dev --name add-category-tags`

**On Failure**:
- If validation fails: Check for typos in relation names, ensure all referenced models exist
- If migration fails: Check if database has conflicting state, try `npx prisma db push` as alternative

**Learning**: Schema validou sem erros. Migração não pôde ser executada pois o banco remoto Neon estava inacessível (P1001). `prisma generate` executado com sucesso para gerar os tipos do client. Migração pendente para quando o banco estiver disponível.

---

#### ~~2. Add CategoryTag TypeScript interface and update Transaction type~~ [x]

**File**: `src/types/index.ts` (MODIFY)
**Complexity**: Low
**TDD**: NO (type definitions, no logic)
**Depends On**: 1

**Load Before Implementing**:
1. `src/types/index.ts` (lines 14-35) — Transaction interface
2. `src/types/index.ts` (lines 53-58) — Category interface
3. `src/types/index.ts` (lines 84-89) — CategoryRule interface as pattern

**Pre-conditions**:
- [ ] Task 1 migration completed

**Why**: TypeScript types for frontend consumption. CategoryTag interface enables type-safe API calls and component props.

**Acceptance Criteria**:
```gherkin
Given the updated types file
When TypeScript compiles
Then no type errors related to CategoryTag or Transaction.categoryTagId
```

**Implementation**:

Add after CategoryRule interface (after line 89):
```typescript
export interface CategoryTag {
  id: string;
  name: string;
  keywords: string;
  categoryId: string;
  category?: Category;
}
```

Add to Transaction interface (after line 31 `tags: string | null;`):
```typescript
  categoryTagId: string | null;
  categoryTag?: CategoryTag | null;
```

**Verification**: `npx tsc --noEmit 2>&1 | head -20`

**On Failure**:
- If type errors: Check that CategoryTag interface matches Prisma model exactly
- If import errors: Verify no circular references

**Learning**: Tipos adicionados sem erros. O único erro de TypeScript pré-existente é em `csv-parser.test.ts` (userId em Category), não relacionado às mudanças.

---

#### ~~3. Create CategoryTag API endpoints and matching function with tests~~ [x]

**File**: `src/app/api/category-tags/route.ts` (CREATE), `src/app/api/category-tags/[id]/route.ts` (CREATE), `src/lib/categorizer.ts` (MODIFY), `src/lib/categorizer.test.ts` (MODIFY)
**Complexity**: High
**TDD**: YES
**Depends On**: 1, 2

**Load Before Implementing**:
1. `src/app/api/rules/route.ts` (full file) — API CRUD pattern to follow exactly
2. `src/lib/categorizer.ts` (lines 1-47) — Cache + matching pattern
3. `src/lib/categorizer.test.ts` (first 50 lines) — Test pattern
4. `src/lib/auth-utils.ts` (full file) — Auth utilities
5. `src/lib/db.ts` (full file) — Prisma client

**Pre-conditions**:
- [ ] Prisma client regenerated after migration (`npm run db:generate`)
- [ ] `src/app/api/category-tags/` directory does not exist

**Why**: CRUD API enables frontend to manage tags. Matching function enables automatic tag assignment during import. Tests validate matching logic.

**Acceptance Criteria**:
```gherkin
Given an authenticated user
When POST /api/category-tags with { name: "Combustível", keywords: "shell,ipiranga,posto", categoryId: "cat1" }
Then response status is 201
And response body contains the created tag with category included

Given an authenticated user with existing tags
When GET /api/category-tags?categoryId=cat1
Then response contains all tags for that category

Given an authenticated user
When PUT /api/category-tags/tag1 with { name: "Gasolina", keywords: "shell,ipiranga" }
Then response contains the updated tag

Given an authenticated user
When DELETE /api/category-tags/tag1
Then response is { success: true }

Given a transaction description "SHELL COMBUSTIVEL SP" and category "Automóvel" has tag "Combustível" with keywords "shell,ipiranga,posto"
When matchCategoryTag is called
Then it returns the "Combustível" tag

Given a transaction description "UBER TRIP" and category "Transporte" has no matching tags
When matchCategoryTag is called
Then it returns null

Given a transaction description matches keywords of two different tags in the same category
When matchCategoryTag is called
Then it returns null (conservative: no match on ambiguity)
```

**Implementation**:

**`src/app/api/category-tags/route.ts`** (CREATE):
```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";
import { invalidateTagsCache } from "@/lib/categorizer";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const categoryId = request.nextUrl.searchParams.get("categoryId");

    const tags = await prisma.categoryTag.findMany({
      where: {
        userId,
        ...(categoryId ? { categoryId } : {}),
      },
      include: { category: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(tags);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching category tags:", error);
    return NextResponse.json(
      { error: "Erro ao buscar tags de categoria" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const body = await request.json();
    const { name, keywords, categoryId } = body;

    if (!name || !keywords || !categoryId) {
      return NextResponse.json(
        { error: "Nome, keywords e categoryId são obrigatórios" },
        { status: 400 }
      );
    }

    // Verify category belongs to user
    const category = await prisma.category.findFirst({
      where: { id: categoryId, userId },
    });

    if (!category) {
      return NextResponse.json(
        { error: "Categoria não encontrada" },
        { status: 404 }
      );
    }

    const tag = await prisma.categoryTag.create({
      data: {
        name,
        keywords: keywords.toLowerCase(),
        categoryId,
        userId,
      },
      include: { category: true },
    });

    invalidateTagsCache();

    return NextResponse.json(tag, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error creating category tag:", error);
    return NextResponse.json(
      { error: "Erro ao criar tag de categoria" },
      { status: 500 }
    );
  }
}
```

**`src/app/api/category-tags/[id]/route.ts`** (CREATE):
```typescript
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";
import { invalidateTagsCache } from "@/lib/categorizer";

export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getAuthenticatedUserId();
    const { id } = params;
    const body = await request.json();
    const { name, keywords } = body;

    if (!name && !keywords) {
      return NextResponse.json(
        { error: "Informe name ou keywords para atualizar" },
        { status: 400 }
      );
    }

    // Verify tag belongs to user
    const existing = await prisma.categoryTag.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Tag não encontrada" },
        { status: 404 }
      );
    }

    const data: { name?: string; keywords?: string } = {};
    if (name) data.name = name;
    if (keywords) data.keywords = keywords.toLowerCase();

    const tag = await prisma.categoryTag.update({
      where: { id },
      data,
      include: { category: true },
    });

    invalidateTagsCache();

    return NextResponse.json(tag);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error updating category tag:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar tag de categoria" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getAuthenticatedUserId();
    const { id } = params;

    // Verify tag belongs to user
    const existing = await prisma.categoryTag.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Tag não encontrada" },
        { status: 404 }
      );
    }

    await prisma.categoryTag.delete({
      where: { id },
    });

    invalidateTagsCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error deleting category tag:", error);
    return NextResponse.json(
      { error: "Erro ao excluir tag de categoria" },
      { status: 500 }
    );
  }
}
```

**Add to `src/lib/categorizer.ts`** — After the rules cache block (after `invalidateRulesCache`, around line 31), add:

```typescript
// Cache category tags per user
interface TagWithCategory {
  id: string;
  name: string;
  keywords: string;
  categoryId: string;
  category: Category;
}

const tagsCacheByUser: Map<string, TagWithCategory[]> = new Map();

export async function getCategoryTags(userId?: string): Promise<TagWithCategory[]> {
  const cacheKey = userId || "_global";
  const cached = tagsCacheByUser.get(cacheKey);
  if (cached) return cached;

  const tags = await prisma.categoryTag.findMany({
    where: userId ? { userId } : undefined,
    include: { category: true },
  });

  tagsCacheByUser.set(cacheKey, tags as TagWithCategory[]);
  return tags as TagWithCategory[];
}

export function invalidateTagsCache(userId?: string) {
  if (userId) {
    tagsCacheByUser.delete(userId);
  } else {
    tagsCacheByUser.clear();
  }
}

export async function matchCategoryTag(
  description: string,
  categoryId: string,
  userId?: string
): Promise<TagWithCategory | null> {
  const allTags = await getCategoryTags(userId);
  const categoryTags = allTags.filter((t) => t.categoryId === categoryId);

  if (categoryTags.length === 0) return null;

  const upperDesc = description.toUpperCase();
  const matches: TagWithCategory[] = [];

  for (const tag of categoryTags) {
    const keywords = tag.keywords.split(",").map((k) => k.trim().toUpperCase()).filter((k) => k.length > 0);
    const hasMatch = keywords.some((keyword) => upperDesc.includes(keyword));
    if (hasMatch) {
      matches.push(tag);
    }
  }

  // Conservative: only return if exactly one tag matches
  if (matches.length === 1) {
    return matches[0];
  }

  return null;
}
```

**Add to `src/lib/categorizer.test.ts`** — Add test suite for `matchCategoryTag`.

First, ensure the existing mock at the top of the test file includes `categoryTag`:
```typescript
// In the existing vi.mock("./db", ...) block, add to the mocked prisma object:
categoryTag: {
  findMany: vi.fn(),
},
```

Then add import at the top alongside existing imports:
```typescript
import { matchCategoryTag, invalidateTagsCache } from "./categorizer";
```

Add test suite:
```typescript
describe("matchCategoryTag", () => {
  const mockTags = [
    { id: "tag1", name: "Combustível", keywords: "shell,ipiranga,posto", categoryId: "cat1", category: { id: "cat1", name: "Automóvel", color: "#000", icon: null } },
  ];

  beforeEach(() => {
    // Clear tag cache between tests to prevent stale data
    invalidateTagsCache();
  });

  it("should match a tag when keyword is found in description", async () => {
    vi.mocked(prisma.categoryTag.findMany).mockResolvedValue(mockTags as never);

    const result = await matchCategoryTag("SHELL COMBUSTIVEL SP", "cat1", "user1");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("Combustível");
  });

  it("should return null when no keywords match", async () => {
    vi.mocked(prisma.categoryTag.findMany).mockResolvedValue(mockTags as never);

    const result = await matchCategoryTag("UBER TRIP", "cat1", "user2");
    expect(result).toBeNull();
  });

  it("should return null when multiple tags match (ambiguity)", async () => {
    const ambiguousTags = [
      { id: "tag1", name: "Combustível", keywords: "shell", categoryId: "cat1", category: { id: "cat1", name: "Automóvel", color: "#000", icon: null } },
      { id: "tag2", name: "Lavagem", keywords: "shell", categoryId: "cat1", category: { id: "cat1", name: "Automóvel", color: "#000", icon: null } },
    ];
    vi.mocked(prisma.categoryTag.findMany).mockResolvedValue(ambiguousTags as never);

    const result = await matchCategoryTag("SHELL SERVICOS", "cat1", "user3");
    expect(result).toBeNull();
  });

  it("should only match tags from the specified category", async () => {
    const crossCategoryTags = [
      { id: "tag1", name: "Combustível", keywords: "shell", categoryId: "cat1", category: { id: "cat1", name: "Automóvel", color: "#000", icon: null } },
      { id: "tag2", name: "Restaurante", keywords: "shell", categoryId: "cat2", category: { id: "cat2", name: "Alimentação", color: "#000", icon: null } },
    ];
    vi.mocked(prisma.categoryTag.findMany).mockResolvedValue(crossCategoryTags as never);

    const result = await matchCategoryTag("SHELL COMBUSTIVEL", "cat1", "user4");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("tag1");
  });
});
```

**Verification**: `npm run test:unit -- --run categorizer`

**On Failure**:
- If API type errors: Verify Prisma client was regenerated (`npm run db:generate`)
- If test fails on import: Ensure mock setup matches prisma client structure
- If cache test fails: Clear module cache with `vi.resetModules()` before each test

**Learning**: O padrão de params em Next.js 14 App Router usa `Promise<{ id: string }>` (com await), não o padrão síncrono que o plano sugeria. Adaptado para seguir o padrão já existente em `src/app/api/categories/[id]/route.ts`. TDD RED-GREEN confirmado: 4 testes falharam antes da implementação, 85/85 passaram após.

## Success Criteria

### Automated Verification
- [x] `Skill(running-automated-checks)` — All project checks pass (lint N/A - sem config ESLint, typecheck OK exceto erro pré-existente, testes 85/85)
- [ ] `npm run db:migrate` — Migration pendente (banco remoto inacessível)
