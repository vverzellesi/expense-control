import { describe, expect, it, vi } from "vitest";
import { acquirePluggyLease, assertPluggyLeaseHeld, PluggyLeaseLostError, renewPluggyLease } from "./lease";

function fakeDb(rows: unknown[], count = 1) {
  const calls: string[] = [];
  const tx = {
    $executeRaw: vi.fn(async (strings: TemplateStringsArray) => {
      calls.push(strings.join("?").includes("pg_advisory_xact_lock") ? "lock" : "exec");
      return count;
    }),
    $queryRaw: vi.fn(async () => {
      calls.push("query");
      return rows;
    }),
  };
  const db = { $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)) };
  return { db: db as never, tx: tx as never, calls };
}

describe("lease (unitário)", () => {
  it("pega o advisory lock antes de tentar adquirir", async () => {
    const { db, calls } = fakeDb([]);
    expect(await acquirePluggyLease(db, "user_test_1")).toBeNull();
    expect(calls).toEqual(["lock", "query"]);
  });

  it("devolve o token quando a linha volta com ele", async () => {
    let captured = "";
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(async (_s: TemplateStringsArray, ...values: unknown[]) => {
        captured = values[1] as string;
        return [{ ownerToken: captured }];
      }),
    };
    const db = { $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx) } as never;
    const token = await acquirePluggyLease(db, "user_test_1");
    expect(token).toBe(captured);
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("renovação devolve false quando nenhuma linha muda; TTL inválido é recusado", async () => {
    expect(await renewPluggyLease(fakeDb([], 0).db, "user_test_1", "tok")).toBe(false);
    await expect(acquirePluggyLease(fakeDb([]).db, "user_test_1", 0)).rejects.toThrow();
  });

  it("conferência sem linha válida lança PluggyLeaseLostError", async () => {
    await expect(assertPluggyLeaseHeld(fakeDb([]).tx, "user_test_1", "tok")).rejects.toBeInstanceOf(PluggyLeaseLostError);
    await expect(assertPluggyLeaseHeld(fakeDb([{ ok: 1 }]).tx, "user_test_1", "tok")).resolves.toBeUndefined();
  });
});

