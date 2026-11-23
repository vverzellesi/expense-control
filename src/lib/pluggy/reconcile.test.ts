import { describe, expect, it } from "vitest";
import {
  BILL_RESIDUE_TOLERANCE_CENTS,
  checkCoverage,
  classifyResidue,
  computeBillResidue,
  reconcileBills,
  type BillTransactionInput,
} from "./reconcile";

const debit = (billId: string, amountCents: number): BillTransactionInput => ({ billId, direction: "DEBIT", amountCents, currencyCode: "BRL" });
const credit = (billId: string, amountCents: number): BillTransactionInput => ({ billId, direction: "CREDIT", amountCents, currencyCode: "BRL" });

describe("computeBillResidue", () => {
  it("aplica total(n) = total(n−1) + débitos(n) − créditos(n) + resíduo(n)", () => {
    // 1000 = 800 + 500 − 400 + resíduo → resíduo 100
    expect(computeBillResidue({ totalCents: 1000, previousTotalCents: 800, debitsCents: 500, creditsCents: 400 })).toBe(100);
  });
});

describe("classifyResidue", () => {
  it("tolera até 5 centavos nos dois sentidos", () => {
    expect(classifyResidue(BILL_RESIDUE_TOLERANCE_CENTS)).toBe("balanced");
    expect(classifyResidue(-BILL_RESIDUE_TOLERANCE_CENTS)).toBe("balanced");
    expect(classifyResidue(6)).toBe("residue_positive");
    expect(classifyResidue(-6)).toBe("residue_negative");
  });
});

describe("reconcileBills", () => {
  const bills = [
    { id: "bill_test_2", dueDate: "2026-02-10", totalCents: 12_000, currencyCode: "BRL" },
    { id: "bill_test_1", dueDate: "2026-01-10", totalCents: 10_000, currencyCode: "BRL" },
    { id: "bill_test_3", dueDate: "2026-03-10", totalCents: 5_000, currencyCode: "BRL" },
  ];

  it("ordena por vencimento, marca a primeira como não avaliável e calcula os três resultados", () => {
    const result = reconcileBills(bills, [
      debit("bill_test_1", 10_000),
      // fatura 2: 12000 = 10000 + 3000 − 1000 + 0 → equilibrada
      debit("bill_test_2", 3_000),
      credit("bill_test_2", 1_000),
      // fatura 3: 5000 = 12000 + 2000 − 12000 + 3000 → resíduo positivo (parcelas não expostas)
      debit("bill_test_3", 2_000),
      credit("bill_test_3", 12_000),
    ]);
    expect(result.bills.map((b) => [b.dueDate, b.result, b.residueCents])).toEqual([
      ["2026-01-10", "not_evaluable", null],
      ["2026-02-10", "balanced", 0],
      ["2026-03-10", "residue_positive", 3_000],
    ]);
    expect(result.bills[0].reason).toBe("first_in_series");
    expect(result).toMatchObject({ balanced: 1, residuePositive: 1, residueNegative: 0, notEvaluable: 1 });
  });

  it("resíduo negativo além da tolerância é contado à parte", () => {
    const result = reconcileBills(bills.slice(0, 2), [debit("bill_test_2", 2_100)]);
    // 12000 − 10000 − 2100 = −100
    expect(result.bills[1]).toMatchObject({ result: "residue_negative", residueCents: -100 });
    expect(result.residueNegative).toBe(1);
  });

  it("fatura faltando na série ou moeda estrangeira não são avaliáveis", () => {
    const gap = reconcileBills(
      [
        { id: "bill_test_1", dueDate: "2026-01-10", totalCents: 100, currencyCode: "BRL" },
        { id: "bill_test_3", dueDate: "2026-03-10", totalCents: 100, currencyCode: "BRL" },
      ],
      []
    );
    expect(gap.bills[1]).toMatchObject({ result: "not_evaluable", reason: "gap_in_series" });

    const foreign = reconcileBills(bills.slice(0, 2), [{ billId: "bill_test_2", direction: "DEBIT", amountCents: 100, currencyCode: "USD" }]);
    expect(foreign.bills[1]).toMatchObject({ result: "not_evaluable", reason: "foreign_currency" });
  });

  it("conta transações cujo billId não está entre as faturas lidas", () => {
    expect(reconcileBills(bills, [debit("bill_test_x", 100), { ...debit("", 1), billId: null }]).orphanTransactions).toBe(1);
  });
});

describe("checkCoverage", () => {
  it("histórico que começa depois do corte é truncado", () => {
    expect(checkCoverage({ syncFromDay: "2026-01-01", minDate: "2026-02-15", total: 3 })).toEqual({
      status: "truncated",
      coveredFrom: "2026-02-15",
    });
  });
  it("histórico que alcança o corte é completo", () => {
    expect(checkCoverage({ syncFromDay: "2026-01-01", minDate: "2025-12-01", total: 3 }).status).toBe("complete");
    expect(checkCoverage({ syncFromDay: "2026-01-01", minDate: "2026-01-01", total: 3 }).status).toBe("complete");
  });
  it("leitura vazia não prova cobertura", () => {
    expect(checkCoverage({ syncFromDay: "2026-01-01", minDate: null, total: 0 }).status).toBe("empty");
  });
});

