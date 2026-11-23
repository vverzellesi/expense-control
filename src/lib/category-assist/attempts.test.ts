// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ATTEMPTS_SETTING_KEY, mergeAttempts, parseAttempts, recentAttemptIds, recordAttempts } from "./attempts";
import { fakeDb, OWNER } from "./test-helpers";

const NOW = new Date("2026-04-01T12:00:00.000Z");

describe("tentativas", () => {
  it("valor ausente ou inválido vira vazio; entradas inválidas são ignoradas", () => {
    expect(parseAttempts(null)).toEqual({});
    expect(parseAttempts("não é json")).toEqual({});
    expect(parseAttempts("[1,2]")).toEqual({});
    expect(parseAttempts(JSON.stringify({ tx_test_1: "2026-03-20", tx_test_2: 5, tx_test_3: "ontem" }))).toEqual({ tx_test_1: "2026-03-20" });
  });

  it("janela de 30 dias", () => {
    const attempts = { tx_test_1: "2026-03-20", tx_test_2: "2026-03-02", tx_test_3: "2026-03-03" };
    expect(Array.from(recentAttemptIds(attempts, NOW)).sort()).toEqual(["tx_test_1", "tx_test_3"]);
  });

  it("acrescenta as de hoje e limpa as antigas", () => {
    const merged = mergeAttempts({ tx_test_1: "2026-01-01", tx_test_2: "2026-03-20" }, ["tx_test_3"], NOW);
    expect(merged).toEqual({ tx_test_2: "2026-03-20", tx_test_3: "2026-04-01" });
  });

  it("reaplicar não renova a data de quem ainda está na janela", () => {
    expect(mergeAttempts({ tx_test_1: "2026-03-20" }, ["tx_test_1"], NOW)).toEqual({ tx_test_1: "2026-03-20" });
  });

  it("grava em Settings com a chave do dono", async () => {
    const { db, settingsUpsert, attempts } = fakeDb({ attempts: JSON.stringify({ tx_test_1: "2026-01-01" }) });
    await recordAttempts(db, OWNER, ["tx_test_2"], NOW);
    expect(settingsUpsert.mock.calls[0][0]).toMatchObject({ where: { key_userId: { key: ATTEMPTS_SETTING_KEY, userId: OWNER } } });
    expect(JSON.parse(attempts()!)).toEqual({ tx_test_2: "2026-04-01" });
  });
});
