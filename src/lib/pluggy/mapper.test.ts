import { describe, expect, it } from "vitest";
import { mapPluggyTransaction, PluggyMappingError } from "./mapper";
import { compileExcludePatterns } from "./rules";
import type { PluggyTransaction } from "./types";

// Registros 100% sintéticos.
function pluggyTx(overrides: Partial<PluggyTransaction> = {}): PluggyTransaction {
  return {
    id: "tx_test_1",
    accountId: "acc_test_1",
    description: "  LOJA EXEMPLO  ",
    currencyCode: "BRL",
    amount: -123.45,
    date: "2026-03-10T00:00:00.000Z",
    type: "DEBIT",
    status: "POSTED",
    providerId: "prov_test_1",
    ...overrides,
  };
}

const BANK = { type: "BANK" as const, currencyCode: "BRL" };
const CARD = { type: "CREDIT" as const, currencyCode: "BRL" };

describe("mapPluggyTransaction - forma e valores", () => {
  it("débito em conta: forma completa do contrato", () => {
    expect(mapPluggyTransaction(pluggyTx(), BANK)).toEqual({
      externalId: "tx_test_1",
      providerId: "prov_test_1",
      accountType: "BANK",
      sourceStatus: "POSTED",
      sourceDate: "2026-03-10",
      purchaseDate: null,
      ledgerDate: "2026-03-10",
      description: "LOJA EXEMPLO",
      amountCents: 12345,
      currencyCode: "BRL",
      direction: "DEBIT",
      type: "EXPENSE",
      creditKind: null,
      billId: null,
      installmentNumber: null,
      totalInstallments: null,
      preDisposition: null,
    });
  });

  it("direção vem de type, não do sinal", () => {
    const credit = mapPluggyTransaction(pluggyTx({ type: "CREDIT", amount: -50 }), BANK);
    expect(credit.direction).toBe("CREDIT");
    expect(credit.type).toBe("INCOME");
    expect(credit.amountCents).toBe(5000);
    const debit = mapPluggyTransaction(pluggyTx({ type: "DEBIT", amount: 50 }), BANK);
    expect(debit.type).toBe("EXPENSE");
    expect(debit.amountCents).toBe(5000);
  });

  it("centavos inteiros sem erro de ponto flutuante", () => {
    expect(mapPluggyTransaction(pluggyTx({ amount: 0.29 }), BANK).amountCents).toBe(29);
    expect(mapPluggyTransaction(pluggyTx({ amount: -1234.56 }), BANK).amountCents).toBe(123456);
    expect(mapPluggyTransaction(pluggyTx({ amount: 19.99 }), BANK).amountCents).toBe(1999);
  });

  it("valor zero vai para revisão", () => {
    expect(mapPluggyTransaction(pluggyTx({ amount: 0 }), BANK).preDisposition).toEqual({
      disposition: "needs_review",
      reasonCode: "zero_amount",
    });
  });

  it("providerId vazio ou ausente vira null", () => {
    expect(mapPluggyTransaction(pluggyTx({ providerId: "  " }), BANK).providerId).toBeNull();
    expect(mapPluggyTransaction(pluggyTx({ providerId: undefined }), BANK).providerId).toBeNull();
    expect(mapPluggyTransaction(pluggyTx({ providerId: null }), BANK).providerId).toBeNull();
  });

  it("PENDING vira preDisposition pending", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ status: "PENDING" }), CARD);
    expect(mapped.sourceStatus).toBe("PENDING");
    expect(mapped.preDisposition).toEqual({ disposition: "pending", reasonCode: "pending" });
  });

  it("transferência entre contas próprias", () => {
    expect(mapPluggyTransaction(pluggyTx({ description: "TRANSF ENTRE CONTAS" }), BANK).type).toBe("TRANSFER");
  });

  it("recusa tipo de conta desconhecido e data inválida sem expor dados", () => {
    expect(() => mapPluggyTransaction(pluggyTx(), { type: "INVESTMENT" as never, currencyCode: "BRL" })).toThrow(PluggyMappingError);
    try {
      mapPluggyTransaction(pluggyTx({ date: "data-ruim" }), BANK);
      throw new Error("esperava erro");
    } catch (error) {
      expect(error).toBeInstanceOf(PluggyMappingError);
      expect((error as Error).message).not.toContain("tx_test_1");
      expect((error as Error).message).not.toContain("LOJA");
    }
  });
});

describe("mapPluggyTransaction - moeda", () => {
  it("compra em moeda estrangeira com valor na moeda da conta (BRL) entra em BRL", () => {
    const mapped = mapPluggyTransaction(
      pluggyTx({ currencyCode: "USD", amount: -10, amountInAccountCurrency: -55.3 }),
      CARD
    );
    expect(mapped.amountCents).toBe(5530);
    expect(mapped.currencyCode).toBe("BRL");
    expect(mapped.preDisposition).toBeNull();
  });

  it("moeda estrangeira sem equivalência em BRL vai para revisão", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ currencyCode: "USD", amount: -10, amountInAccountCurrency: null }), CARD);
    expect(mapped.currencyCode).toBe("USD");
    expect(mapped.amountCents).toBe(1000);
    expect(mapped.preDisposition).toEqual({ disposition: "needs_review", reasonCode: "foreign_currency" });
  });

  it("conta em outra moeda vai para revisão mesmo com amountInAccountCurrency", () => {
    const mapped = mapPluggyTransaction(
      pluggyTx({ currencyCode: "USD", amount: -10, amountInAccountCurrency: -10 }),
      { type: "BANK", currencyCode: "USD" }
    );
    expect(mapped.preDisposition).toEqual({ disposition: "needs_review", reasonCode: "foreign_currency" });
  });

  it("PENDING prevalece sobre moeda estrangeira (será reavaliado ao virar POSTED)", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ status: "PENDING", currencyCode: "EUR", amount: -5 }), CARD);
    expect(mapped.preDisposition).toEqual({ disposition: "pending", reasonCode: "pending" });
  });
});

describe("mapPluggyTransaction - cartão", () => {
  it("compra no cartão é despesa", () => {
    expect(mapPluggyTransaction(pluggyTx(), CARD).type).toBe("EXPENSE");
  });

  it("estorno no cartão é INCOME sem destino prévio", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ type: "CREDIT", amount: 20, description: "ESTORNO LOJA EXEMPLO" }), CARD);
    expect(mapped.type).toBe("INCOME");
    expect(mapped.creditKind).toBe("refund");
    expect(mapped.preDisposition).toBeNull();
  });

  it("pagamento de fatura como crédito no cartão é excluído", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ type: "CREDIT", amount: 500, description: "PAGAMENTO RECEBIDO" }), CARD);
    expect(mapped.creditKind).toBe("bill_payment");
    expect(mapped.preDisposition).toEqual({ disposition: "excluded", reasonCode: "bill_payment_credit" });
  });

  it("crédito desconhecido no cartão vai para revisão", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ type: "CREDIT", amount: 5, description: "CREDITO EXEMPLO" }), CARD);
    expect(mapped.creditKind).toBe("unknown");
    expect(mapped.preDisposition).toEqual({ disposition: "needs_review", reasonCode: "credit_unknown" });
  });

  it("rotativo vai para revisão", () => {
    expect(mapPluggyTransaction(pluggyTx({ description: "JUROS ROTATIVO" }), CARD).preDisposition).toEqual({
      disposition: "needs_review",
      reasonCode: "carryover",
    });
  });

  it("padrão do usuário recebido como argumento exclui (lista crua ou compilada)", () => {
    const raw = [{ pattern: "loja exemplo", accountType: "CREDIT" as const }];
    expect(mapPluggyTransaction(pluggyTx(), CARD, { excludePatterns: raw }).preDisposition).toEqual({
      disposition: "excluded",
      reasonCode: "user_pattern",
    });
    expect(mapPluggyTransaction(pluggyTx(), CARD, { excludePatterns: compileExcludePatterns(raw) }).preDisposition).toEqual({
      disposition: "excluded",
      reasonCode: "user_pattern",
    });
    expect(mapPluggyTransaction(pluggyTx(), BANK, { excludePatterns: raw }).preDisposition).toBeNull();
  });

  it("parcela por creditCardMetadata, com billId e data da compra", () => {
    const mapped = mapPluggyTransaction(
      pluggyTx({
        description: "LOJA EXEMPLO",
        date: "2026-03-10T00:00:00.000Z",
        creditCardMetadata: {
          installmentNumber: 3,
          totalInstallments: 10,
          purchaseDate: "2026-01-10T00:00:00.000Z",
          billId: "bill_test_1",
        },
      }),
      CARD
    );
    expect(mapped.installmentNumber).toBe(3);
    expect(mapped.totalInstallments).toBe(10);
    expect(mapped.purchaseDate).toBe("2026-01-10");
    expect(mapped.billId).toBe("bill_test_1");
    expect(mapped.ledgerDate).toBe(mapped.sourceDate);
  });

  it("metadado prevalece sobre a descrição", () => {
    const mapped = mapPluggyTransaction(
      pluggyTx({ description: "LOJA EXEMPLO PARCELA 1/2", creditCardMetadata: { installmentNumber: 4, totalInstallments: 6 } }),
      CARD
    );
    expect([mapped.installmentNumber, mapped.totalInstallments]).toEqual([4, 6]);
  });

  it("metadado de pagamento à vista (1/1) não é parcela", () => {
    const mapped = mapPluggyTransaction(
      pluggyTx({ description: "LOJA EXEMPLO 2/3", creditCardMetadata: { installmentNumber: 1, totalInstallments: 1 } }),
      CARD
    );
    expect([mapped.installmentNumber, mapped.totalInstallments]).toEqual([null, null]);
  });

  it("sem metadado, parcela pela descrição (detectInstallment)", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ description: "LOJA EXEMPLO - Parcela 2/5", creditCardMetadata: null }), CARD);
    expect([mapped.installmentNumber, mapped.totalInstallments]).toEqual([2, 5]);
  });

  it("metadado inválido cai no fallback pela descrição", () => {
    const mapped = mapPluggyTransaction(
      pluggyTx({ description: "LOJA EXEMPLO PARC 3/4", creditCardMetadata: { installmentNumber: 7, totalInstallments: 4 } }),
      CARD
    );
    expect([mapped.installmentNumber, mapped.totalInstallments]).toEqual([3, 4]);
  });

  it("conta bancária não interpreta números da descrição como parcela", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ description: "PIX EXEMPLO 3/10" }), BANK);
    expect([mapped.installmentNumber, mapped.totalInstallments]).toEqual([null, null]);
  });
});

describe("mapPluggyTransaction - datas", () => {
  it("meia-noite UTC cai no mesmo dia em São Paulo", () => {
    expect(mapPluggyTransaction(pluggyTx({ date: "2026-04-01T00:00:00.000Z" }), CARD).sourceDate).toBe("2026-04-01");
  });

  it("instante de madrugada UTC cai no dia anterior em São Paulo", () => {
    expect(mapPluggyTransaction(pluggyTx({ date: "2026-04-01T01:59:00.000Z" }), CARD).sourceDate).toBe("2026-03-31");
  });

  it("29/02 de ano bissexto é preservado", () => {
    const mapped = mapPluggyTransaction(
      pluggyTx({ date: "2028-02-29T00:00:00.000Z", creditCardMetadata: { purchaseDate: "2028-02-29" } }),
      CARD
    );
    expect(mapped.sourceDate).toBe("2028-02-29");
    expect(mapped.purchaseDate).toBe("2028-02-29");
  });

  it("data da compra inválida vira null sem derrubar o registro", () => {
    expect(mapPluggyTransaction(pluggyTx({ creditCardMetadata: { purchaseDate: "x" } }), CARD).purchaseDate).toBeNull();
  });
});
