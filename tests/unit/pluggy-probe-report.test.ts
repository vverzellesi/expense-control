import { describe, expect, it } from "vitest";
import { buildProbeReport, descriptionShape, summarizeProbe, type ProbeData } from "../../scripts/pluggy/probe-report";

// Dados sintéticos com marcadores para provar o mascaramento.
function data(): ProbeData {
  return {
    generatedAt: new Date("2026-03-01T12:00:00.000Z"),
    item: {
      id: "item_SECRET_ID",
      status: "UPDATED",
      lastUpdatedAt: "2026-03-01T10:00:00.000Z",
      consentExpiresAt: "2026-03-31T12:00:00.000Z",
      connector: { name: "BANCO MARCADOR" },
    } as ProbeData["item"],
    accounts: [
      {
        account: { id: "acc_SECRET_ID", type: "CREDIT", subtype: "CREDIT_CARD", currencyCode: "BRL", name: "CONTA MARCADOR" } as ProbeData["accounts"][number]["account"],
        transactions: [
          {
            id: "tx_SECRET_ID",
            description: "LOJA MARCADOR - Parcela 2/3",
            currencyCode: "BRL",
            amount: 4321.98,
            date: "2026-02-10T00:00:00.000Z",
            type: "DEBIT",
            status: "POSTED",
            providerId: "prov_SECRET_ID",
            creditCardMetadata: { installmentNumber: 2, totalInstallments: 3, billId: "bill_SECRET_ID" },
          },
          {
            id: "tx_SECRET_ID_2",
            description: "PAGAMENTO RECEBIDO",
            currencyCode: "BRL",
            amount: -4321.98,
            date: "2026-02-15T03:00:00.000Z",
            type: "CREDIT",
            status: "PENDING",
          },
        ],
        transactionsError: null,
        coverage: { total: 2, minDate: "2026-02-10", maxDate: "2026-02-15" },
        bills: [{ id: "bill_SECRET_ID", dueDate: "2026-03-05T00:00:00", totalAmount: 4321.98, totalAmountCurrencyCode: "BRL" }],
        billsError: null,
      },
      {
        account: { id: "acc_SECRET_ID_2", type: "BANK", currencyCode: "BRL" } as ProbeData["accounts"][number]["account"],
        transactions: null,
        transactionsError: "Pluggy GET /v2/transactions: http status 500",
        coverage: null,
        bills: null,
        billsError: null,
      },
    ],
  };
}

describe("buildProbeReport", () => {
  it("modo padrão não contém ids, descrições, valores nem nomes", () => {
    const report = buildProbeReport(data(), { detailed: false });
    for (const forbidden of ["SECRET_ID", "MARCADOR", "LOJA", "4321", "PAGAMENTO RECEBIDO"]) {
      expect(report).not.toContain(forbidden);
    }
    expect(report).toContain("status: UPDATED");
    expect(report).toContain("em 30 dias");
    expect(report).toContain("com providerId: 1");
    expect(report).toContain("| DEBIT / positivo | 1 |");
    expect(report).toContain("| CREDIT / negativo | 1 |");
    expect(report).toContain("| 2026-02 | 2 |");
    expect(report).toContain("metadado e descrição concordam: 1");
    expect(report).toContain("razão totalAmount / soma das transações (mediana): 1.000");
    expect(report).toContain("leitura falhou (Pluggy GET /v2/transactions: http status 500)");
  });

  it("modo detalhado inclui amostras reais", () => {
    const report = buildProbeReport(data(), { detailed: true });
    expect(report).toContain("LOJA MARCADOR");
    expect(report).toContain("4321.98");
    expect(report).toContain("BANCO MARCADOR");
    expect(report).not.toContain("SECRET_ID");
  });

  it("forma da descrição esconde letras e dígitos", () => {
    expect(descriptionShape("Café 12/3")).toBe("aaaa 99/9");
  });

  it("resumo do terminal só tem contagens", () => {
    expect(summarizeProbe(data())).toEqual({ accounts: 2, transactions: 2, bills: 1, failures: 1 });
  });
});
