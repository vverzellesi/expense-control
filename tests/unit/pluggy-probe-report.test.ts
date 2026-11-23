import { describe, expect, it } from "vitest";
import {
  billChecks,
  buildProbeReport,
  dateBucket,
  descriptionShape,
  summarizeProbe,
  type ProbeData,
} from "../../scripts/pluggy/probe-report";

// Dados 100% sintéticos, com marcadores para provar o mascaramento.
type AccountEntry = ProbeData["accounts"][number];

function data(): ProbeData {
  const card: AccountEntry = {
    account: { id: "acc_SECRET_ID", type: "CREDIT", subtype: "CREDIT_CARD", currencyCode: "BRL", name: "CONTA MARCADOR" } as AccountEntry["account"],
    transactions: [
      {
        id: "tx_SECRET_ID_1",
        description: "LOJA MARCADOR",
        currencyCode: "BRL",
        amount: 4321.98,
        date: "2026-02-10T03:00:00.000Z",
        type: "DEBIT",
        status: "POSTED",
        operationType: "OUTROS",
        creditCardMetadata: { installmentNumber: 2, totalInstallments: 3, purchaseDate: "2026-01-10", billId: "bill_SECRET_2" },
      },
      {
        id: "tx_SECRET_ID_2",
        description: "PAGAMENTO RECEBIDO",
        currencyCode: "BRL",
        amount: -1000,
        date: "2026-02-15T14:27:00.000Z",
        type: "CREDIT",
        status: "POSTED",
        operationType: "PAGAMENTO_FATURA",
        creditCardMetadata: { billId: "bill_SECRET_2" },
      },
      {
        id: "tx_SECRET_ID_3",
        description: "LOJA MARCADOR DOIS",
        currencyCode: "BRL",
        amount: 77.7,
        date: "2026-03-02T03:00:00.000Z",
        type: "DEBIT",
        status: "PENDING",
      },
    ],
    transactionsError: null,
    coverage: { total: 3, minDate: "2026-02-10", maxDate: "2026-03-02" },
    bills: [
      { id: "bill_SECRET_2", dueDate: "2026-03-05T00:00:00", totalAmount: 6000, totalAmountCurrencyCode: "BRL" },
      { id: "bill_SECRET_1", dueDate: "2026-02-05T00:00:00", totalAmount: 1678.02, totalAmountCurrencyCode: "BRL" },
    ],
    billsError: null,
  };
  const bank: AccountEntry = {
    account: { id: "acc_SECRET_ID_2", type: "BANK", currencyCode: "BRL" } as AccountEntry["account"],
    transactions: [
      {
        id: "tx_SECRET_ID_4",
        description: "PIX ENVIADO MARCADOR",
        currencyCode: "BRL",
        amount: -1000,
        date: "2026-02-14T03:00:00.000Z",
        type: "DEBIT",
        status: "POSTED",
      },
    ],
    transactionsError: null,
    coverage: { total: 1, minDate: "2026-02-14", maxDate: "2026-02-14" },
    bills: null,
    billsError: null,
  };
  const failed: AccountEntry = {
    account: { id: "acc_SECRET_ID_3", type: "BANK", currencyCode: "BRL" } as AccountEntry["account"],
    transactions: null,
    transactionsError: "Pluggy GET /v2/transactions: http status 500",
    coverage: null,
    bills: null,
    billsError: null,
  };
  return {
    generatedAt: new Date("2026-03-01T12:00:00.000Z"),
    item: {
      id: "item_SECRET_ID",
      status: "UPDATED",
      lastUpdatedAt: "2026-03-01T10:00:00.000Z",
      consentExpiresAt: "2026-03-31T12:00:00.000Z",
      connector: { name: "BANCO MARCADOR" },
    } as ProbeData["item"],
    accounts: [card, bank, failed],
  };
}

describe("buildProbeReport", () => {
  it("modo padrão não contém ids, descrições, valores nem nomes", () => {
    const report = buildProbeReport(data(), { detailed: false });
    for (const forbidden of ["SECRET", "MARCADOR", "LOJA", "4321", "1678", "6000", "1000", "77.7", "PAGAMENTO RECEBIDO", "PIX"]) {
      expect(report).not.toContain(forbidden);
    }
    expect(report).toContain("status: UPDATED");
    expect(report).toContain("em 30 dias");
    expect(report).toContain("| DEBIT / positivo | 2 |");
    expect(report).toContain("| CREDIT / negativo | 1 |");
    expect(report).toContain("| DEBIT / negativo | 1 |");
    expect(report).toContain("| CREDIT / PAGAMENTO_FATURA | 1 |");
    expect(report).toContain("| meia-noite de São Paulo | 2 |");
    expect(report).toContain("| com horário | 1 |");
    expect(report).toContain("forma da descrição: a a");
    // resíduo = 6000 − 1678,02 − 4321,98 + 1000 = 1000 → positivo
    expect(report).toContain("| positivo | 1 |");
    // pagamento no cartão e débito na conta pareados pela regra de lote
    expect(report).toContain("| excluded / bill_payment_credit | 1 |");
    expect(report).toContain("| excluded / bill_payment_debit | 1 |");
    expect(report).toContain("leitura falhou (Pluggy GET /v2/transactions: http status 500)");
  });

  it("modo detalhado inclui amostras e valores reais", () => {
    const report = buildProbeReport(data(), { detailed: true });
    expect(report).toContain("LOJA MARCADOR");
    expect(report).toContain("4321.98");
    expect(report).toContain("1000.00");
    expect(report).toContain("BANCO MARCADOR");
    expect(report).not.toContain("SECRET");
  });

  it("conferência de fatura ordena por vencimento e calcula o resíduo", () => {
    const checks = billChecks(data().accounts[0]);
    expect(checks.map((c) => c.dueDate)).toEqual(["2026-02-05T00:00:00", "2026-03-05T00:00:00"]);
    expect(checks[0].residual).toBeNull();
    expect(checks[1].residual).toBeCloseTo(1000, 2);
  });

  it("faixas de formato de data", () => {
    expect(dateBucket("2026-01-01T03:00:00.000Z")).toBe("meia-noite de São Paulo");
    expect(dateBucket("2026-01-01T00:00:00-03:00")).toBe("meia-noite de São Paulo");
    expect(dateBucket("2026-01-01T00:00:00.000Z")).toBe("meia-noite UTC ou sem fuso");
    expect(dateBucket("2026-01-01T17:42:10.000Z")).toBe("com horário");
    expect(dateBucket("2026-01-01")).toBe("só data");
    expect(dateBucket("ontem")).toBe("outros");
  });

  it("forma da descrição esconde letras, dígitos e o tamanho das palavras", () => {
    expect(descriptionShape("Café  Exemplo 12/3")).toBe("a a 9/9");
  });

  it("resumo do terminal só tem contagens", () => {
    expect(summarizeProbe(data())).toEqual({ accounts: 3, transactions: 4, bills: 2, failures: 1 });
  });
});
