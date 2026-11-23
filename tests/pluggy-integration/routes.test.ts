import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { createOwner, createTestClient, noonUtc, resetDatabase, type Owner } from "./helpers";

// A rota usa o singleton de @/lib/db (adapter Neon); aqui ele aponta para o Postgres descartável.
// O cliente é montado aqui mesmo: importar ./helpers dentro da factory criaria um ciclo
// (helpers → store → dedup → @/lib/db) e o import nunca terminaria.
vi.mock("@/lib/db", async () => {
  const { PrismaClient } = await import("@prisma/client");
  const url = process.env.PLUGGY_TEST_DATABASE_URL ?? "";
  if (!["localhost", "127.0.0.1", "[::1]", "::1"].includes(new URL(url).hostname)) {
    throw new Error("Refusing to run the Pluggy integration suite against a non-local database");
  }
  const client = new PrismaClient({ datasourceUrl: url });
  return { default: client, prisma: client };
});

const authState: { ctx: { userId: string; spaceId: string | null; permissions: null; ownerFilter: Record<string, string> } | null } = {
  ctx: null,
};

vi.mock("@/lib/auth-utils", () => ({
  getAuthContext: async () => {
    if (!authState.ctx) throw new Error("Unauthorized");
    return authState.ctx;
  },
  unauthorizedResponse: () => NextResponse.json({ error: "unauthorized" }, { status: 401 }),
  forbiddenResponse: () => NextResponse.json({ error: "forbidden" }, { status: 403 }),
  handleApiError: (error: unknown) =>
    NextResponse.json({ error: error instanceof Error ? error.message : "error" }, { status: 500 }),
}));

const { POST: importPOST } = await import("@/app/api/import/route");
const { PUT: transactionPUT } = await import("@/app/api/transactions/[id]/route");
const { importTransactions } = await import("@/lib/import-service");

const db: PrismaClient = createTestClient();

afterAll(async () => {
  await db.$disconnect();
});

let owner: Owner;

beforeEach(async () => {
  await resetDatabase(db);
  owner = await createOwner(db, { syncFrom: "2026-03-01" });
  authState.ctx = { userId: owner.userId, spaceId: null, permissions: null, ownerFilter: { userId: owner.userId } };
});

function jsonRequest(url: string, method: string, body: unknown) {
  return new NextRequest(new URL(url, "http://localhost"), {
    method,
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

describe("/api/import", () => {
  it("ignora campos internos forjados e descarta categoryId alheio", async () => {
    const mine = await db.category.create({ data: { name: "Minha", color: "#111", userId: owner.userId } });
    const strangerUser = await db.user.create({ data: { email: "stranger@example.test" } });
    const foreign = await db.category.create({ data: { name: "Alheia", color: "#222", userId: strangerUser.id } });
    const res = await importPOST(
      jsonRequest("/api/import", "POST", {
        origin: "Importação Teste",
        transactions: [
          {
            description: "COMPRA UM",
            amount: 10,
            date: "2026-02-10",
            type: "EXPENSE",
            categoryId: mine.id,
            categorySource: "ai",
            userId: strangerUser.id,
            spaceId: "space_forjado",
            deletedAt: "2026-01-01",
            externalId: "ext_forjado",
          },
          { description: "COMPRA DOIS", amount: 20, date: "2026-02-11", type: "EXPENSE", categoryId: foreign.id },
        ],
      })
    );
    expect(res.status).toBe(201);
    const txs = await db.transaction.findMany({ orderBy: { description: "asc" } });
    expect(txs).toHaveLength(2);
    expect(txs[1]).toMatchObject({
      description: "COMPRA UM",
      categoryId: mine.id,
      categorySource: null,
      userId: owner.userId,
      spaceId: null,
      deletedAt: null,
      amount: -10,
    });
    expect(txs[0]).toMatchObject({ description: "COMPRA DOIS", categoryId: null });
    expect(await db.pluggyTransactionLink.count()).toBe(0);
  });

  it("aceita categoria do espaço ativo", async () => {
    const space = await db.space.create({ data: { name: "Espaço", createdBy: owner.userId } });
    const creator = await db.user.create({ data: { email: "member@example.test" } });
    const spaceCat = await db.category.create({ data: { name: "Do Espaço", color: "#333", userId: creator.id, spaceId: space.id } });
    authState.ctx = { userId: owner.userId, spaceId: space.id, permissions: null, ownerFilter: { spaceId: space.id } };
    const res = await importPOST(
      jsonRequest("/api/import", "POST", {
        transactions: [{ description: "COMPRA", amount: 5, date: "2026-02-10", categoryId: spaceCat.id }],
      })
    );
    expect(res.status).toBe(201);
    expect((await db.transaction.findFirstOrThrow()).categoryId).toBe(spaceCat.id);
  });

  it("descarta categoria do usuário que pertence a outro espaço (não ativo)", async () => {
    const space = await db.space.create({ data: { name: "Outro Espaço", createdBy: owner.userId } });
    const otherSpaceCat = await db.category.create({ data: { name: "De Outro Espaço", color: "#444", userId: owner.userId, spaceId: space.id } });
    const res = await importPOST(
      jsonRequest("/api/import", "POST", {
        transactions: [{ description: "COMPRA", amount: 5, date: "2026-02-10", categoryId: otherSpaceCat.id }],
      })
    );
    expect(res.status).toBe(201);
    expect((await db.transaction.findFirstOrThrow()).categoryId).toBeNull();
  });

  it("rejeita corpo inválido", async () => {
    const res = await importPOST(jsonRequest("/api/import", "POST", { transactions: [{ description: "X", amount: "dez" }] }));
    expect(res.status).toBe(400);
    expect(await db.transaction.count()).toBe(0);
  });

  it("pula linhas de origin sincronizado pela Pluggy a partir do corte e informa a contagem", async () => {
    const res = await importPOST(
      jsonRequest("/api/import", "POST", {
        origin: owner.originName,
        transactions: [
          { description: "ANTES DO CORTE", amount: 10, date: "2026-02-28" },
          { description: "NO CORTE", amount: 11, date: "2026-03-01" },
          { description: "DEPOIS", amount: 12, date: "2026-03-15" },
          { description: "OUTRO ORIGIN", amount: 13, date: "2026-03-15", origin: "Conta Manual" },
        ],
      })
    );
    const body = await res.json();
    expect(body.skippedPluggyManaged).toBe(2);
    expect(body.count).toBe(2);
    const descs = (await db.transaction.findMany()).map((t) => t.description).sort();
    expect(descs).toEqual(["ANTES DO CORTE", "OUTRO ORIGIN"]);
  });

  it("origin sem vínculo ativo segue como antes", async () => {
    await db.pluggyAccountLink.update({ where: { id: owner.accountLinkId }, data: { enabled: false } });
    const result = await importTransactions(
      owner.userId,
      [{ description: "DEPOIS", amount: 12, date: "2026-03-15" }],
      owner.originName
    );
    expect(result.skippedPluggyManaged).toBe(0);
    expect(result.created).toHaveLength(1);
  });
});

describe("PUT /api/transactions/[id] marca categorySource = manual", () => {
  async function tx(categoryId: string | null) {
    return db.transaction.create({
      data: {
        userId: owner.userId,
        description: "COMPRA",
        amount: -10,
        date: noonUtc("2026-02-10"),
        type: "EXPENSE",
        origin: "Conta Manual",
        categoryId,
        categorySource: categoryId ? "rule" : null,
      },
    });
  }
  const put = (id: string, categoryId: string | null, description = "COMPRA") =>
    transactionPUT(
      jsonRequest("/api/transactions/" + id, "PUT", {
        description,
        amount: 10,
        date: "2026-02-10",
        type: "EXPENSE",
        origin: "Conta Manual",
        categoryId,
      }),
      { params: Promise.resolve({ id }) }
    );

  it("ao trocar e ao limpar a categoria; não muda quando a categoria fica igual", async () => {
    const a = await db.category.create({ data: { name: "A", color: "#111", userId: owner.userId } });
    const b = await db.category.create({ data: { name: "B", color: "#222", userId: owner.userId } });

    const t1 = await tx(a.id);
    expect((await put(t1.id, b.id)).status).toBe(200);
    expect(await db.transaction.findUniqueOrThrow({ where: { id: t1.id } })).toMatchObject({ categoryId: b.id, categorySource: "manual" });

    const t2 = await tx(a.id);
    await put(t2.id, null);
    expect(await db.transaction.findUniqueOrThrow({ where: { id: t2.id } })).toMatchObject({ categoryId: null, categorySource: "manual" });

    const t3 = await tx(a.id);
    await put(t3.id, a.id, "COMPRA EDITADA");
    expect(await db.transaction.findUniqueOrThrow({ where: { id: t3.id } })).toMatchObject({ categoryId: a.id, categorySource: "rule" });
  });
});

