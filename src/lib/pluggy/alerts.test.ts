import { describe, expect, it, vi } from "vitest";
import { buildAlertMessage, sendSyncAlert, shouldAlert, type AlertSummary } from "./alerts";

const warning: AlertSummary = {
  status: "warning",
  newNeedsReview: 2,
  alerts: { item_stale: 1, bill_residue_negative: 1, codigo_desconhecido: 3 },
};

function fakeDb(chatId: string | null) {
  return { telegramLink: { findUnique: vi.fn().mockResolvedValue(chatId ? { chatId } : null) } };
}

describe("buildAlertMessage", () => {
  it("não manda nada quando o run terminou ok e não há revisão nova", () => {
    expect(buildAlertMessage({ status: "ok", newNeedsReview: 0, alerts: {} })).toBeNull();
    expect(shouldAlert({ status: "ok", newNeedsReview: 0, alerts: {} })).toBe(false);
  });

  it("avisa itens novos em revisão mesmo com run ok", () => {
    const text = buildAlertMessage({ status: "ok", newNeedsReview: 4, alerts: {} });
    expect(text).toContain("Novos itens para revisar: 4");
  });

  it("leva só status, contagens e tipos de alerta", () => {
    const text = buildAlertMessage(warning)!;
    expect(text).toContain("concluída com avisos");
    expect(text).toContain("conexão sem atualização há mais de 48 horas: 1");
    expect(text).toContain("fatura com resíduo negativo: 1");
    expect(text).toContain("outro alerta: 3");
    expect(text).not.toContain("codigo_desconhecido");
  });
});

describe("sendSyncAlert", () => {
  it("nunca inclui valores, descrições, nomes ou ids da execução", async () => {
    // Dados que existiriam na execução (fixture sintética) e não podem aparecer na mensagem.
    const fixture = ["LOJA EXEMPLO", "acc_test_1", "item_test_1", "bill_test_1", "123,45", "R$", "Cartão Teste", "user_test_1"];
    const send = vi.fn().mockResolvedValue({ ok: true });
    const db = fakeDb("chat_test_1");
    const result = await sendSyncAlert(db as never, "user_test_1", { status: "error", newNeedsReview: 1, alerts: { account_read_failed: 1, missing_upstream: 7 } }, { send });
    expect(result.sent).toBe(true);
    const [chatId, text] = send.mock.calls[0];
    expect(chatId).toBe("chat_test_1");
    for (const value of fixture) expect(text).not.toContain(value);
    expect(text).not.toMatch(/\d+[.,]\d{2}/);
  });

  it("sem vínculo do Telegram, não envia", async () => {
    const send = vi.fn();
    expect(await sendSyncAlert(fakeDb(null) as never, "user_test_1", warning, { send })).toEqual({ sent: false, reason: "owner_not_linked" });
    expect(send).not.toHaveBeenCalled();
  });

  it("sem bot configurado, não consulta nem envia", async () => {
    const db = fakeDb("chat_test_1");
    expect(await sendSyncAlert(db as never, "user_test_1", warning, { env: {} })).toEqual({ sent: false, reason: "telegram_not_configured" });
    expect(db.telegramLink.findUnique).not.toHaveBeenCalled();
  });

  it("falha no envio é engolida", async () => {
    const send = vi.fn().mockRejectedValue(new Error("rede"));
    expect(await sendSyncAlert(fakeDb("chat_test_1") as never, "user_test_1", warning, { send })).toEqual({ sent: false, reason: "send_failed" });
    const rejected = vi.fn().mockResolvedValue({ ok: false });
    expect((await sendSyncAlert(fakeDb("chat_test_1") as never, "user_test_1", warning, { send: rejected })).sent).toBe(false);
  });

  it("run ok sem revisão nova não consulta o banco", async () => {
    const db = fakeDb("chat_test_1");
    const send = vi.fn();
    expect((await sendSyncAlert(db as never, "user_test_1", { status: "ok", newNeedsReview: 0, alerts: {} }, { send })).reason).toBe("not_needed");
    expect(db.telegramLink.findUnique).not.toHaveBeenCalled();
  });
});

