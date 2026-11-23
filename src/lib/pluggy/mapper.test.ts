import { describe, expect, it } from "vitest";
import { mapPluggyTransaction, PluggyMappingError, type MapperAccount } from "./mapper";
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
    date: "2026-03-10T03:00:00.000Z",
    type: "DEBIT",
    status: "POSTED",
    providerId: null,
    ...overrides,
  };
}

const BANK = { type: "BANK" as const, currencyCode: "BRL" };
const CARD = { type: "CREDIT" as const, currencyCode: "BRL" };

describe("mapPluggyTransaction - forma e valores", () => {
  it("débito em conta: forma completa do contrato", () => {
    expect(mapPluggyTransaction(pluggyTx(), BANK)).toEqual({
      externalId: "tx_test_1",
      providerId: null,
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

  it("conta corrente: débito negativo e crédito positivo", () => {
    const debit = mapPluggyTransaction(pluggyTx({ type: "DEBIT", amount: -50 }), BANK);
    const credit = mapPluggyTransaction(pluggyTx({ type: "CREDIT", amount: 50, description: "PIX RECEBIDO EXEMPLO" }), BANK);
    expect([debit.direction, debit.type, debit.amountCents]).toEqual(["DEBIT", "EXPENSE", 5000]);
    expect([credit.direction, credit.type, credit.amountCents]).toEqual(["CREDIT", "INCOME", 5000]);
  });

  it("cartão: débito positivo e crédito negativo", () => {
    const debit = mapPluggyTransaction(pluggyTx({ type: "DEBIT", amount: 50 }), CARD);
    const credit = mapPluggyTransaction(
      pluggyTx({ type: "CREDIT", amount: -50, operationType: "ESTORNO", description: "ESTORNO LOJA EXEMPLO" }),
      CARD
    );
    expect([debit.direction, debit.type, debit.amountCents]).toEqual(["DEBIT", "EXPENSE", 5000]);
    expect([credit.direction, credit.type, credit.amountCents, credit.creditKind]).toEqual(["CREDIT", "INCOME", 5000, "refund"]);
  });

  it("centavos inteiros sem erro de ponto flutuante", () => {
    expect(mapPluggyTransaction(pluggyTx({ amount: 0.29 }), BANK).amountCents).toBe(29);
    expect(mapPluggyTransaction(pluggyTx({ amount: -1234.56 }), BANK).amountCents).toBe(123456);
    expect(mapPluggyTransaction(pluggyTx({ amount: 19.99 }), CARD).amountCents).toBe(1999);
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
    expect(mapPluggyTransaction(pluggyTx({ providerId: "prov_test_1" }), BANK).providerId).toBe("prov_test_1");
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

describe("mapPluggyTransaction - PENDING", () => {
  it("por padrão entra como provisório: sem destino prévio e com sourceStatus PENDING", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ status: "PENDING" }), CARD);
    expect(mapped.sourceStatus).toBe("PENDING");
    expect(mapped.preDisposition).toBeNull();
  });

  it("com importPending false vira pending", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ status: "PENDING" }), CARD, { importPending: false });
    expect(mapped.preDisposition).toEqual({ disposition: "pending", reasonCode: "pending" });
  });

  it("pendente continua sujeito às demais regras (ex.: pagamento de fatura)", () => {
    const mapped = mapPluggyTransaction(
      pluggyTx({ status: "PENDING", type: "CREDIT", amount: -10, operationType: "PAGAMENTO_FATURA" }),
      CARD
    );
    expect(mapped.preDisposition).toEqual({ disposition: "excluded", reasonCode: "bill_payment_credit" });
  });
});

describe("mapPluggyTransaction - moeda", () => {
  it("compra em moeda estrangeira com valor na moeda da conta (BRL) entra em BRL", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ currencyCode: "USD", amount: 10, amountInAccountCurrency: 55.3 }), CARD);
    expect(mapped.amountCents).toBe(5530);
    expect(mapped.currencyCode).toBe("BRL");
    expect(mapped.preDisposition).toBeNull();
  });

  it("moeda estrangeira sem equivalência em BRL vai para revisão", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ currencyCode: "USD", amount: 10, amountInAccountCurrency: null }), CARD);
    expect(mapped.currencyCode).toBe("USD");
    expect(mapped.amountCents).toBe(1000);
    expect(mapped.preDisposition).toEqual({ disposition: "needs_review", reasonCode: "foreign_currency" });
  });

  it("conta em outra moeda vai para revisão mesmo com amountInAccountCurrency", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ currencyCode: "USD", amount: -10, amountInAccountCurrency: -10 }), {
      type: "BANK",
      currencyCode: "USD",
    });
    expect(mapped.preDisposition).toEqual({ disposition: "needs_review", reasonCode: "foreign_currency" });
  });

  it("pendente sem importPending prevalece sobre moeda estrangeira", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ status: "PENDING", currencyCode: "EUR", amount: 5 }), CARD, {
      importPending: false,
    });
    expect(mapped.preDisposition).toEqual({ disposition: "pending", reasonCode: "pending" });
  });
});

describe("mapPluggyTransaction - cartão", () => {
  it("créditos por operationType", () => {
    const credit = (o: Partial<PluggyTransaction>) => mapPluggyTransaction(pluggyTx({ type: "CREDIT", amount: -20, ...o }), CARD);
    expect(credit({ operationType: "PAGAMENTO_FATURA", description: "CREDITO EXEMPLO" }).preDisposition).toEqual({
      disposition: "excluded",
      reasonCode: "bill_payment_credit",
    });
    expect(credit({ operationType: "PAGAMENTO_FATURA", description: "PARCELAMENTO DE COMPRA EXEMPLO" }).preDisposition).toEqual({
      disposition: "needs_review",
      reasonCode: "purchase_installment_plan",
    });
    const refund = credit({ operationType: "ESTORNO", description: "SAMPLE STORE REFUND" });
    expect([refund.type, refund.creditKind, refund.preDisposition]).toEqual(["INCOME", "refund", null]);
    expect(credit({ operationType: "OUTROS", description: "AJUSTE EXEMPLO" }).preDisposition).toEqual({
      disposition: "needs_review",
      reasonCode: "credit_unknown",
    });
  });

  it("IOF e juros de rotativo são despesa; saldo transportado vai para revisão", () => {
    const iof = mapPluggyTransaction(pluggyTx({ description: "IOF ROTATIVO EXEMPLO", amount: 3.21 }), CARD);
    expect([iof.type, iof.preDisposition]).toEqual(["EXPENSE", null]);
    expect(mapPluggyTransaction(pluggyTx({ description: "SALDO ROTATIVO" }), CARD).preDisposition).toEqual({
      disposition: "needs_review",
      reasonCode: "carryover",
    });
  });

  it("padrão do usuário recebido como argumento (lista crua ou compilada)", () => {
    const raw = [{ pattern: "loja exemplo", accountType: "CREDIT" as const, action: "exclude" as const }];
    const excluded = { disposition: "excluded", reasonCode: "user_pattern" };
    expect(mapPluggyTransaction(pluggyTx(), CARD, { excludePatterns: raw }).preDisposition).toEqual(excluded);
    expect(mapPluggyTransaction(pluggyTx(), CARD, { excludePatterns: compileExcludePatterns(raw) }).preDisposition).toEqual(excluded);
    expect(mapPluggyTransaction(pluggyTx(), BANK, { excludePatterns: raw }).preDisposition).toBeNull();
    const transfer = mapPluggyTransaction(pluggyTx(), BANK, { excludePatterns: [{ pattern: "loja exemplo", action: "transfer" }] });
    expect([transfer.type, transfer.preDisposition]).toEqual(["TRANSFER", null]);
  });
});

describe("mapPluggyTransaction - parcelas e data do lançamento", () => {
  const installment = (n: number, t: number, purchaseDate: string | null, date = "2026-05-10T03:00:00.000Z") =>
    mapPluggyTransaction(
      pluggyTx({
        description: "LOJA EXEMPLO",
        date,
        creditCardMetadata: { installmentNumber: n, totalInstallments: t, purchaseDate, billId: "bill_test_1" },
      }),
      CARD
    );

  it("parcela por metadado: ledgerDate = data da compra + (N−1) meses", () => {
    const mapped = installment(3, 10, "2026-01-15T03:00:00.000Z");
    expect([mapped.installmentNumber, mapped.totalInstallments]).toEqual([3, 10]);
    expect(mapped.purchaseDate).toBe("2026-01-15");
    expect(mapped.sourceDate).toBe("2026-05-10");
    expect(mapped.ledgerDate).toBe("2026-03-15");
    expect(mapped.billId).toBe("bill_test_1");
  });

  it("parcela 1 fica na data da compra", () => {
    expect(installment(1, 4, "2026-01-15").ledgerDate).toBe("2026-01-15");
  });

  it("sem transbordo de fim de mês e com ano bissexto", () => {
    expect(installment(2, 3, "2026-01-31").ledgerDate).toBe("2026-02-28");
    expect(installment(2, 3, "2028-01-31").ledgerDate).toBe("2028-02-29");
    expect(installment(13, 24, "2026-01-31").ledgerDate).toBe("2027-01-31");
  });

  it("parcela sem data da compra usa a data do registro", () => {
    expect(installment(2, 3, null).ledgerDate).toBe("2026-05-10");
  });

  it("compra à vista com data da compra usa a data do registro", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ creditCardMetadata: { purchaseDate: "2026-03-01" } }), CARD);
    expect(mapped.ledgerDate).toBe(mapped.sourceDate);
  });

  it("metadado prevalece sobre a descrição", () => {
    const mapped = mapPluggyTransaction(
      pluggyTx({ description: "LOJA EXEMPLO PARCELA 1/2", creditCardMetadata: { installmentNumber: 4, totalInstallments: 6 } }),
      CARD
    );
    expect([mapped.installmentNumber, mapped.totalInstallments]).toEqual([4, 6]);
  });

  it("metadado 1/1 ou sem números é compra à vista, sem olhar a descrição", () => {
    for (const creditCardMetadata of [{ installmentNumber: 1, totalInstallments: 1 }, { billId: "bill_test_1" }]) {
      const mapped = mapPluggyTransaction(pluggyTx({ description: "LOJA EXEMPLO PARCELA 2/3", creditCardMetadata }), CARD);
      expect([mapped.installmentNumber, mapped.totalInstallments, mapped.preDisposition]).toEqual([null, null, null]);
    }
  });

  it("metadado inconsistente vai para revisão", () => {
    for (const creditCardMetadata of [{ installmentNumber: 7, totalInstallments: 4 }, { totalInstallments: 4 }]) {
      const mapped = mapPluggyTransaction(pluggyTx({ description: "LOJA EXEMPLO PARC 3/4", creditCardMetadata }), CARD);
      expect([mapped.installmentNumber, mapped.totalInstallments]).toEqual([null, null]);
      expect(mapped.preDisposition).toEqual({ disposition: "needs_review", reasonCode: "invalid_installment" });
    }
  });

  it("sem metadado, só marcador explícito de parcela na descrição conta", () => {
    const fromDescription = (description: string, account: MapperAccount = CARD) => {
      const mapped = mapPluggyTransaction(pluggyTx({ description, creditCardMetadata: null }), account);
      return [mapped.installmentNumber, mapped.totalInstallments];
    };
    expect(fromDescription("LOJA EXEMPLO - Parcela 2/5")).toEqual([2, 5]);
    expect(fromDescription("LOJA EXEMPLO PARC 3 DE 4")).toEqual([3, 4]);
    expect(fromDescription("LOJA EXEMPLO PARC.03/10")).toEqual([3, 10]);
    expect(fromDescription("LOJA EXEMPLO 10/12")).toEqual([null, null]);
    expect(fromDescription("LOJA EXEMPLO 3 DE 5")).toEqual([null, null]);
    expect(fromDescription("LOJA EXEMPLO PARCELA 5/3")).toEqual([null, null]);
    expect(fromDescription("PIX EXEMPLO PARCELA 2/3", BANK)).toEqual([null, null]);
  });
});

describe("mapPluggyTransaction - datas", () => {
  it("meia-noite de São Paulo e meia-noite UTC caem no dia certo", () => {
    expect(mapPluggyTransaction(pluggyTx({ date: "2026-04-01T03:00:00.000Z" }), CARD).sourceDate).toBe("2026-04-01");
    expect(mapPluggyTransaction(pluggyTx({ date: "2026-04-01T00:00:00.000Z" }), CARD).sourceDate).toBe("2026-04-01");
  });

  it("instante de madrugada UTC cai no dia anterior em São Paulo", () => {
    expect(mapPluggyTransaction(pluggyTx({ date: "2026-04-01T01:59:00.000Z" }), CARD).sourceDate).toBe("2026-03-31");
  });

  it("29/02 de ano bissexto é preservado", () => {
    const mapped = mapPluggyTransaction(pluggyTx({ date: "2028-02-29T03:00:00.000Z", creditCardMetadata: { purchaseDate: "2028-02-29" } }), CARD);
    expect(mapped.sourceDate).toBe("2028-02-29");
    expect(mapped.purchaseDate).toBe("2028-02-29");
  });

  it("data da compra inválida vira null sem derrubar o registro", () => {
    expect(mapPluggyTransaction(pluggyTx({ creditCardMetadata: { purchaseDate: "x" } }), CARD).purchaseDate).toBeNull();
  });
});
