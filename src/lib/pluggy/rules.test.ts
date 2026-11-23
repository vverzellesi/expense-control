import { describe, expect, it } from "vitest";
import {
  applyBatchRules,
  classifyPluggyTransaction,
  compileExcludePatterns,
  matchUserPattern,
  type BatchEntry,
} from "./rules";
import type { MappedPluggyTransaction } from "./types";

// Padrões, descrições e ids 100% sintéticos.

describe("compileExcludePatterns", () => {
  it("aceita literal e regex com ação e ignora entradas inválidas", () => {
    const compiled = compileExcludePatterns([
      { pattern: "texto exemplo", action: "exclude" },
      { pattern: "/^LOJA\\s+TESTE/i", accountType: "CREDIT", action: "transfer" },
      { pattern: "sem ação" },
      { pattern: "ação errada", action: "delete" },
      { pattern: "/[unclosed/", action: "exclude" },
      { pattern: "/(a+)+$/", action: "exclude" }, // grupo quantificado
      { pattern: "/(x|y){2,}/", action: "exclude" },
      { pattern: "/(a)\\1/", action: "exclude" }, // referência para trás
      { pattern: "/.*.*Z/", action: "exclude" }, // dois quantificadores ilimitados
      { pattern: "/A+B{3,}/", action: "exclude" },
      { pattern: "/[a-z ]{0,500}[a-z ]{0,500}Z/", action: "exclude" }, // quantificadores limitados em sequência
      { pattern: "/a?b?c/", action: "exclude" },
      { pattern: "/\\(?\\(?\\(\\(Z/", action: "exclude" }, // "?" depois de caractere escapado conta
      { pattern: "/\\*?a+/", action: "exclude" },
      { pattern: "x".repeat(201), action: "exclude" },
      { pattern: "   ", action: "exclude" },
      { pattern: "ok", accountType: "INVESTMENT", action: "exclude" },
      { pattern: 42, action: "exclude" },
      null,
      "string solta",
    ]);
    expect(compiled.matchers.map((m) => m.action)).toEqual(["exclude", "transfer"]);
    expect(compiled.rejected).toBe(18);
  });

  it("aceita um único quantificador, grupo não capturante e modo preguiçoso", () => {
    const compiled = compileExcludePatterns([
      { pattern: "/(?:LOJA) TESTE+/", action: "exclude" },
      { pattern: "/LOJA.+?TESTE/", action: "exclude" },
      { pattern: "/^[0-9]{4} LOJA/", action: "exclude" },
    ]);
    expect(compiled.rejected).toBe(0);
    expect(matchUserPattern("LOJA X TESTE", "BANK", compiled)).toBe("exclude");
  });

  it("entrada que não é lista vira lista vazia", () => {
    expect(compileExcludePatterns(undefined)).toEqual({ matchers: [], rejected: 0 });
    expect(compileExcludePatterns({ pattern: "x", action: "exclude" })).toEqual({ matchers: [], rejected: 0 });
  });

  it("literal ignora maiúsculas, acentos e espaços repetidos; não é regex", () => {
    const compiled = compileExcludePatterns([
      { pattern: "transferência   exemplo", action: "exclude" },
      { pattern: "a.b", action: "transfer" },
    ]);
    expect(matchUserPattern("TRANSFERENCIA EXEMPLO 123", "BANK", compiled)).toBe("exclude");
    expect(matchUserPattern("axb", "BANK", compiled)).toBeNull();
    expect(matchUserPattern("loja a.b", "BANK", compiled)).toBe("transfer");
  });

  it("respeita o tipo de conta do padrão", () => {
    const compiled = compileExcludePatterns([{ pattern: "/^LOJA TESTE/", accountType: "CREDIT", action: "exclude" }]);
    expect(matchUserPattern("LOJA TESTE 1", "CREDIT", compiled)).toBe("exclude");
    expect(matchUserPattern("LOJA TESTE 1", "BANK", compiled)).toBeNull();
  });

  it("regex permitida roda rápido em descrição longa", () => {
    const compiled = compileExcludePatterns([{ pattern: "/^A+B[0-9]{2}$/", action: "exclude" }]);
    expect(compiled.matchers).toHaveLength(1);
    const started = Date.now();
    expect(matchUserPattern("A".repeat(5000) + "X", "BANK", compiled)).toBeNull();
    expect(Date.now() - started).toBeLessThan(200);
  });
});

describe("classifyPluggyTransaction", () => {
  const none = compileExcludePatterns([]);
  const card = (description: string, operationType?: string | null) =>
    classifyPluggyTransaction({ accountType: "CREDIT", direction: "CREDIT", description, operationType }, none);

  it("conta: débito é despesa, crédito é receita, transferência própria é TRANSFER", () => {
    expect(classifyPluggyTransaction({ accountType: "BANK", direction: "DEBIT", description: "LOJA EXEMPLO" }, none)).toEqual({
      type: "EXPENSE",
      creditKind: null,
      preDisposition: null,
    });
    expect(classifyPluggyTransaction({ accountType: "BANK", direction: "CREDIT", description: "PIX RECEBIDO EXEMPLO" }, none).type).toBe("INCOME");
    expect(
      classifyPluggyTransaction({ accountType: "BANK", direction: "DEBIT", description: "TRANSFERENCIA ENTRE CONTAS" }, none).type
    ).toBe("TRANSFER");
  });

  it("cartão, operationType PAGAMENTO_FATURA: excluído, salvo parcelamento de compra", () => {
    expect(card("CREDITO EXEMPLO", "PAGAMENTO_FATURA")).toEqual({
      type: "TRANSFER",
      creditKind: "bill_payment",
      preDisposition: { disposition: "excluded", reasonCode: "bill_payment_credit" },
    });
    expect(card("PARCELAMENTO DE COMPRA EXEMPLO", "PAGAMENTO_FATURA")).toEqual({
      type: "INCOME",
      creditKind: "other",
      preDisposition: { disposition: "needs_review", reasonCode: "purchase_installment_plan" },
    });
  });

  it("cartão, operationType ESTORNO: estorno mesmo com descrição em inglês ou neutra", () => {
    for (const description of ["SAMPLE STORE REFUND", "AJUSTE EXEMPLO"]) {
      expect(card(description, "ESTORNO")).toEqual({ type: "INCOME", creditKind: "refund", preDisposition: null });
    }
  });

  it("cartão sem operationType conclusivo cai na descrição", () => {
    expect(card("ESTORNO LOJA EXEMPLO", "OUTROS").creditKind).toBe("refund");
    expect(card("SAMPLE STORE REFUND", null).creditKind).toBe("refund");
    for (const description of ["PAGAMENTO DE FATURA", "PAGAMENTO RECEBIDO", "PAGTO FATURA CARTAO"]) {
      expect(card(description, "OUTROS").preDisposition).toEqual({ disposition: "excluded", reasonCode: "bill_payment_credit" });
    }
    expect(card("AJUSTE EXEMPLO", "OUTROS")).toEqual({
      type: "INCOME",
      creditKind: "unknown",
      preDisposition: { disposition: "needs_review", reasonCode: "credit_unknown" },
    });
    // estorno e pagamento juntos são ambíguos
    expect(card("ESTORNO PAGAMENTO FATURA").preDisposition).toEqual({ disposition: "needs_review", reasonCode: "credit_unknown" });
  });

  it("débito no cartão com texto de estorno continua despesa", () => {
    expect(classifyPluggyTransaction({ accountType: "CREDIT", direction: "DEBIT", description: "ESTORNO EXEMPLO" }, none)).toEqual({
      type: "EXPENSE",
      creditKind: null,
      preDisposition: null,
    });
  });

  it("encargos são despesa mesmo com texto de rotativo; só saldo transportado vai para revisão", () => {
    for (const description of ["IOF ROTATIVO EXEMPLO", "JUROS ROTATIVO", "ENCARGOS ROTATIVO", "MULTA ATRASO", "TARIFA EXEMPLO", "ANUIDADE EXEMPLO"]) {
      expect(classifyPluggyTransaction({ accountType: "CREDIT", direction: "DEBIT", description }, none)).toEqual({
        type: "EXPENSE",
        creditKind: null,
        preDisposition: null,
      });
    }
    for (const description of ["SALDO ROTATIVO", "SALDO ANTERIOR"]) {
      expect(classifyPluggyTransaction({ accountType: "CREDIT", direction: "DEBIT", description }, none).preDisposition).toEqual({
        disposition: "needs_review",
        reasonCode: "carryover",
      });
    }
  });

  it("operationType PAGAMENTO_FATURA vence o texto de rotativo; conta corrente não tem rotativo", () => {
    for (const description of ["PAGAMENTO MINIMO", "PARCELAMENTO DE FATURA"]) {
      expect(card(description, "PAGAMENTO_FATURA").preDisposition).toEqual({
        disposition: "excluded",
        reasonCode: "bill_payment_credit",
      });
    }
    expect(
      classifyPluggyTransaction({ accountType: "BANK", direction: "DEBIT", description: "PAGAMENTO MINIMO FATURA" }, none).preDisposition
    ).toBeNull();
  });

  it("padrão do usuário: exclude exclui, transfer vira TRANSFER sem destino prévio", () => {
    const patterns = compileExcludePatterns([
      { pattern: "saldo rotativo", action: "exclude" },
      { pattern: "ajuste exemplo", action: "transfer" },
    ]);
    expect(
      classifyPluggyTransaction({ accountType: "CREDIT", direction: "DEBIT", description: "SALDO ROTATIVO" }, patterns).preDisposition
    ).toEqual({ disposition: "excluded", reasonCode: "user_pattern" });
    expect(classifyPluggyTransaction({ accountType: "CREDIT", direction: "CREDIT", description: "AJUSTE EXEMPLO" }, patterns)).toEqual({
      type: "TRANSFER",
      creditKind: "other",
      preDisposition: null,
    });
    expect(classifyPluggyTransaction({ accountType: "BANK", direction: "DEBIT", description: "AJUSTE EXEMPLO" }, patterns)).toEqual({
      type: "TRANSFER",
      creditKind: null,
      preDisposition: null,
    });
  });
});

// ------------------------------------------------------------- regras de lote

let seq = 0;
function entry(
  accountId: string,
  overrides: Partial<MappedPluggyTransaction>,
  extra: Partial<BatchEntry> = {}
): BatchEntry {
  seq++;
  const mapped: MappedPluggyTransaction = {
    externalId: "tx_test_" + String(seq).padStart(3, "0"),
    providerId: null,
    accountType: accountId.startsWith("card") ? "CREDIT" : "BANK",
    sourceStatus: "POSTED",
    sourceDate: "2026-03-10",
    purchaseDate: null,
    ledgerDate: overrides.sourceDate ?? "2026-03-10",
    description: "LOJA EXEMPLO",
    amountCents: 1000,
    currencyCode: "BRL",
    direction: "DEBIT",
    type: "EXPENSE",
    creditKind: null,
    billId: null,
    installmentNumber: null,
    totalInstallments: null,
    preDisposition: null,
    ...overrides,
  };
  return { accountId, itemId: "item_test_1", mapped, ...extra };
}

const fee = (accountId: string, o: Partial<MappedPluggyTransaction> = {}) =>
  entry(accountId, { description: "TARIFA MENSAL EXEMPLO", amountCents: 2990, ...o });
const feeRefund = (accountId: string, o: Partial<MappedPluggyTransaction> = {}) =>
  entry(accountId, {
    description: "ESTORNO TARIFA EXEMPLO",
    amountCents: 2990,
    direction: "CREDIT",
    type: "INCOME",
    creditKind: accountId.startsWith("card") ? "refund" : null,
    ...o,
  });
const billCredit = (o: Partial<MappedPluggyTransaction> = {}) =>
  entry("card_test_1", {
    description: "PAGAMENTO RECEBIDO",
    amountCents: 150000,
    direction: "CREDIT",
    type: "TRANSFER",
    creditKind: "bill_payment",
    preDisposition: { disposition: "excluded", reasonCode: "bill_payment_credit" },
    ...o,
  });
const bankDebit = (o: Partial<MappedPluggyTransaction> = {}, extra: Partial<BatchEntry> = {}) =>
  entry("bank_test_1", { description: "PAGAMENTO FATURA CARTAO", amountCents: 150000, type: "TRANSFER", ...o }, extra);

const reasons = (list: MappedPluggyTransaction[]) => list.map((m) => m.preDisposition?.reasonCode ?? null);

describe("applyBatchRules - estorno integral de tarifa", () => {
  it("tarifa e estorno de mesmo valor na mesma fatura se anulam", () => {
    const list = [
      fee("card_test_1", { billId: "bill_test_1" }),
      feeRefund("card_test_1", { billId: "bill_test_1", sourceDate: "2026-03-25" }),
    ];
    expect(reasons(applyBatchRules(list))).toEqual(["offsetting_refund", "offsetting_refund"]);
  });

  it("tarifa sem par continua despesa", () => {
    const list = [fee("card_test_1"), entry("card_test_1", {})];
    expect(reasons(applyBatchRules(list))).toEqual([null, null]);
  });

  it("valor, conta ou fatura diferentes não pareiam", () => {
    const list = [
      fee("card_test_1", { billId: "bill_test_1" }),
      feeRefund("card_test_1", { billId: "bill_test_2" }),
      feeRefund("card_test_2"),
      feeRefund("card_test_1", { amountCents: 2991 }),
    ];
    expect(reasons(applyBatchRules(list))).toEqual([null, null, null, null]);
  });

  it("sem billId vale a janela de 35 dias", () => {
    const inside = applyBatchRules([fee("bank_test_1", { sourceDate: "2026-03-01" }), feeRefund("bank_test_1", { sourceDate: "2026-04-05" })]);
    expect(reasons(inside)).toEqual(["offsetting_refund", "offsetting_refund"]);
    const outside = applyBatchRules([fee("bank_test_1", { sourceDate: "2026-03-01" }), feeRefund("bank_test_1", { sourceDate: "2026-04-06" })]);
    expect(reasons(outside)).toEqual([null, null]);
  });

  it("um para um com valores repetidos: dois débitos e um estorno anulam só um par", () => {
    const list = [
      fee("card_test_1", { sourceDate: "2026-04-10" }),
      fee("card_test_1", { sourceDate: "2026-03-10" }),
      feeRefund("card_test_1", { sourceDate: "2026-03-12" }),
    ];
    expect(reasons(applyBatchRules(list))).toEqual([null, "offsetting_refund", "offsetting_refund"]);
  });

  it("estorno fica com a tarifa mais próxima, mesmo que outra tarifa venha antes", () => {
    const list = [
      fee("bank_test_1", { sourceDate: "2026-01-05" }),
      fee("bank_test_1", { sourceDate: "2026-02-05" }),
      feeRefund("bank_test_1", { sourceDate: "2026-02-06" }),
    ];
    const result = applyBatchRules(list);
    expect(reasons(result)).toEqual([null, "offsetting_refund", "offsetting_refund"]);
    expect(result[1].preDisposition).not.toBe(result[2].preDisposition);
  });

  it("só estorno explícito anula tarifa (cashback e devolução não)", () => {
    const list = [
      fee("card_test_1"),
      feeRefund("card_test_1", { description: "CASHBACK EXEMPLO" }),
      feeRefund("card_test_1", { description: "ESTORNO TARIFA EXEMPLO" }, ),
    ];
    expect(reasons(applyBatchRules(list))).toEqual(["offsetting_refund", null, "offsetting_refund"]);
    const withOperationType = [
      fee("card_test_1"),
      entry("card_test_1", { description: "AJUSTE EXEMPLO", amountCents: 2990, direction: "CREDIT", type: "INCOME", creditKind: "refund" }, { operationType: "ESTORNO" }),
    ];
    expect(reasons(applyBatchRules(withOperationType))).toEqual(["offsetting_refund", "offsetting_refund"]);
    const bankOther = [fee("bank_test_1"), { ...feeRefund("bank_test_1"), operationType: "OUTROS" }];
    expect(reasons(applyBatchRules(bankOther))).toEqual(["offsetting_refund", "offsetting_refund"]);
    const cardOther = [fee("card_test_1"), { ...feeRefund("card_test_1"), operationType: "OUTROS" }];
    expect(reasons(applyBatchRules(cardOther))).toEqual([null, null]);
  });
});

describe("applyBatchRules - débito do pagamento de fatura", () => {
  it("débito na conta com o mesmo valor do crédito de pagamento, até 4 dias, é excluído", () => {
    const list = [billCredit({ sourceDate: "2026-03-10" }), bankDebit({ sourceDate: "2026-03-07" })];
    const result = applyBatchRules(list);
    expect(reasons(result)).toEqual(["bill_payment_credit", "bill_payment_debit"]);
    expect(result[1].preDisposition).toEqual({ disposition: "excluded", reasonCode: "bill_payment_debit" });
  });

  it("5 dias de diferença, outro item ou outro valor não pareiam", () => {
    const list = [
      billCredit({ sourceDate: "2026-03-10" }),
      bankDebit({ sourceDate: "2026-03-15" }),
      bankDebit({ sourceDate: "2026-03-10" }, { itemId: "item_test_2" }),
      bankDebit({ sourceDate: "2026-03-10", amountCents: 150001 }),
    ];
    expect(reasons(applyBatchRules(list))).toEqual(["bill_payment_credit", null, null, null]);
  });

  it("item ausente não pareia", () => {
    const list = [billCredit({ sourceDate: "2026-03-10" }), bankDebit({ sourceDate: "2026-03-10" }, { itemId: "" })];
    expect(reasons(applyBatchRules(list))).toEqual(["bill_payment_credit", null]);
  });

  it("crédito de pagamento pendente (importPending desligado) ainda exclui o débito da conta", () => {
    const list = [
      billCredit({ sourceStatus: "PENDING", preDisposition: { disposition: "pending", reasonCode: "pending" } }),
      bankDebit(),
    ];
    expect(reasons(applyBatchRules(list))).toEqual(["pending", "bill_payment_debit"]);
  });

  it("um para um com valores repetidos: dois créditos e três débitos excluem só dois", () => {
    const list = [
      billCredit({ sourceDate: "2026-03-10" }),
      billCredit({ sourceDate: "2026-04-10" }),
      bankDebit({ sourceDate: "2026-03-09" }),
      bankDebit({ sourceDate: "2026-03-10" }),
      bankDebit({ sourceDate: "2026-04-11" }),
    ];
    expect(reasons(applyBatchRules(list))).toEqual([
      "bill_payment_credit",
      "bill_payment_credit",
      null,
      "bill_payment_debit",
      "bill_payment_debit",
    ]);
  });

  it("prefere o débito com cara de pagamento de fatura", () => {
    const list = [
      billCredit({ sourceDate: "2026-03-10" }),
      bankDebit({ sourceDate: "2026-03-10", description: "PIX ENVIADO EXEMPLO", type: "EXPENSE" }),
      bankDebit({ sourceDate: "2026-03-08" }),
    ];
    expect(reasons(applyBatchRules(list))).toEqual(["bill_payment_credit", null, "bill_payment_debit"]);
  });

  it("débito já com destino prévio não é tocado e a entrada não é alterada", () => {
    const debit = bankDebit({ preDisposition: { disposition: "excluded", reasonCode: "user_pattern" } });
    const list = [billCredit(), debit];
    const snapshot = JSON.stringify(list);
    expect(reasons(applyBatchRules(list))).toEqual(["bill_payment_credit", "user_pattern"]);
    expect(JSON.stringify(list)).toBe(snapshot);
  });
});
