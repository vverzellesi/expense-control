import { describe, it, expect } from "vitest";
import { parseNotificationText } from "./notification-parser";

describe("parseNotificationText", () => {
  describe("C6 Bank purchase notification", () => {
    it("extracts transaction from C6 credit purchase notification", () => {
      const text =
        "Compra no crédito aprovada Sua compra no cartão final 6604 no valor de R$ 27,90, dia 14/03/2026 às 16:58, em KALIMERA HORTIFRUIT JUNDIAI BRA, foi aprovada.";

      const result = parseNotificationText(text, 85);

      expect(result).not.toBeNull();
      expect(result!.transactions).toHaveLength(1);

      const t = result!.transactions[0];
      expect(t.description).toBe("KALIMERA HORTIFRUIT JUNDIAI BRA");
      expect(t.amount).toBe(-27.9);
      expect(t.type).toBe("EXPENSE");
      expect(t.date.getDate()).toBe(14);
      expect(t.date.getMonth()).toBe(2); // March = 2
      expect(t.date.getFullYear()).toBe(2026);
      expect(t.transactionKind).toBe("COMPRA CREDITO");
    });

    it("extracts transaction from C6 debit purchase notification", () => {
      const text =
        "Compra no débito aprovada Sua compra no cartão final 6604 no valor de R$ 150,00, dia 10/02/2026 às 09:30, em SUPERMERCADO EXTRA SAO PAULO BRA, foi aprovada.";

      const result = parseNotificationText(text, 90);

      expect(result).not.toBeNull();
      const t = result!.transactions[0];
      expect(t.description).toBe("SUPERMERCADO EXTRA SAO PAULO BRA");
      expect(t.amount).toBe(-150);
      expect(t.type).toBe("EXPENSE");
      expect(t.transactionKind).toBe("COMPRA DEBITO");
    });
  });

  describe("generic purchase notification patterns", () => {
    it("extracts from 'compra aprovada' pattern with 'em' establishment", () => {
      const text =
        "Compra aprovada de R$ 45,99 em FARMACIA DROGASIL dia 12/03/2026";

      const result = parseNotificationText(text, 80);

      expect(result).not.toBeNull();
      const t = result!.transactions[0];
      expect(t.description).toBe("FARMACIA DROGASIL");
      expect(t.amount).toBe(-45.99);
      expect(t.date.getDate()).toBe(12);
      expect(t.date.getMonth()).toBe(2);
    });

    it("extracts from notification with 'no valor de' pattern", () => {
      const text =
        "Compra no cartão final 1234 no valor de R$ 89,50, dia 01/03/2026 às 14:20, em POSTO SHELL CENTRO, foi aprovada.";

      const result = parseNotificationText(text, 80);

      expect(result).not.toBeNull();
      const t = result!.transactions[0];
      expect(t.description).toBe("POSTO SHELL CENTRO");
      expect(t.amount).toBe(-89.5);
    });

    it("handles amounts with thousands separator", () => {
      const text =
        "Compra aprovada no valor de R$ 1.250,00 em CASAS BAHIA dia 05/01/2026";

      const result = parseNotificationText(text, 80);

      expect(result).not.toBeNull();
      const t = result!.transactions[0];
      expect(t.amount).toBe(-1250);
    });
  });

  describe("PIX notification patterns", () => {
    it("extracts PIX sent notification", () => {
      const text =
        "PIX enviado de R$ 200,00 para JOAO SILVA em 14/03/2026 às 10:00";

      const result = parseNotificationText(text, 85);

      expect(result).not.toBeNull();
      const t = result!.transactions[0];
      expect(t.description).toBe("PIX para JOAO SILVA");
      expect(t.amount).toBe(-200);
      expect(t.type).toBe("EXPENSE");
      expect(t.transactionKind).toBe("PIX ENVIADO");
    });

    it("extracts PIX received notification", () => {
      const text =
        "PIX recebido de R$ 500,00 de MARIA SANTOS em 14/03/2026 às 11:30";

      const result = parseNotificationText(text, 85);

      expect(result).not.toBeNull();
      const t = result!.transactions[0];
      expect(t.description).toBe("PIX de MARIA SANTOS");
      expect(t.amount).toBe(500);
      expect(t.type).toBe("INCOME");
      expect(t.transactionKind).toBe("PIX RECEBIDO");
    });
  });

  describe("edge cases", () => {
    it("returns null for non-notification text", () => {
      const text = "Este é um texto qualquer sem notificação de compra";
      const result = parseNotificationText(text, 80);
      expect(result).toBeNull();
    });

    it("returns null for empty text", () => {
      const result = parseNotificationText("", 80);
      expect(result).toBeNull();
    });

    it("handles OCR artifacts in notification text", () => {
      // OCR might introduce minor errors
      const text =
        "Compra no crédito aprovada Sua compra no cartao final 6604 no valor de R$ 27,90, dia 14/03/2026 as 16:58, em KALIMERA HORTIFRUIT JUNDIAI BRA, foi aprovada.";

      const result = parseNotificationText(text, 70);

      expect(result).not.toBeNull();
      const t = result!.transactions[0];
      expect(t.description).toBe("KALIMERA HORTIFRUIT JUNDIAI BRA");
      expect(t.amount).toBe(-27.9);
    });

    it("returns bank name when detectable", () => {
      const text =
        "C6 Bank Compra no crédito aprovada no valor de R$ 50,00, dia 14/03/2026 às 10:00, em PADARIA CENTRAL, foi aprovada.";

      const result = parseNotificationText(text, 85);

      expect(result).not.toBeNull();
      expect(result!.bank).toBe("C6 Bank");
    });

    it("handles multiline OCR text", () => {
      const text =
        "Compra no\ncrédito aprovada\nSua compra no cartão final 6604\nno valor de R$ 27,90, dia 14/03/2026\nàs 16:58, em KALIMERA HORTIFRUIT\nJUNDIAI BRA, foi aprovada.";

      const result = parseNotificationText(text, 75);

      expect(result).not.toBeNull();
      const t = result!.transactions[0];
      expect(t.description).toBe("KALIMERA HORTIFRUIT JUNDIAI BRA");
      expect(t.amount).toBe(-27.9);
    });

    it("does not false-positive on generic text with 'nu' or 'bb'", () => {
      // "MANUAL" contains "nu", "HOBBY" contains "BB" - should not detect as bank
      const text =
        "Compra aprovada de R$ 10,00 em MANUAL HOBBY dia 01/01/2026";

      const result = parseNotificationText(text, 80);

      expect(result).not.toBeNull();
      expect(result!.bank).toBe("Notificação");
    });
  });
});
