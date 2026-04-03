import { describe, it, expect } from "vitest";
import { parseStatementText, detectBank } from "./statement-parser";

describe("Nubank statement parsing", () => {
  const NUBANK_STATEMENT_TEXT = `
Joao da Silva
CPF •••.123.456-•• Agência 0001 Conta
1234567-8
01 DE MARÇO DE 2026 a 31 DE MARÇO DE 2026 VALORES EM R$
Saldo final do período
R$ 500,00
Saldo inicial
Rendimento líquido
Total de entradas
Total de saídas
Saldo final do período
1.000,00
+0,00
+2.500,00
-2.000,00
500,00
Movimentações
01 MAR 2026 Total de entradas + 1.500,00
Transferência recebida pelo Pix PEDRO ALMEIDA - •••.987.654-•• - BCO SANTANDER (BRASIL) S.A. (0033) Agência: 1234 Conta: 5678-9
500,00
Transferência Recebida EMPRESA ABC LTDA - 12.345.678/0001-90 - ITAÚ UNIBANCO S.A. (0341) Agência: 66 Conta: 12345-6
1.000,00
Total de saídas - 350,00
Compra no débito SUPERMERCADO XYZ
200,00
Transferência enviada pelo Pix MARIA SANTOS - •••.111.222-•• - ITAÚ UNIBANCO S.A. (0341) Agência: 5678 Conta: 1234-5
150,00
05 MAR 2026 Total de entradas + 100,00
Resgate RDB
100,00
Total de saídas - 250,00
Aplicação RDB
200,00
Pagamento de fatura
50,00
10 MAR 2026 Total de saídas - 1.500,00
Débito em conta Pagamento de contas do Detran
1.356,60
Resgate de empréstimo
133,81
Tem alguma dúvida? Mande uma mensagem para nosso time de atendimento.
Extrato gerado dia 02 de abril de 2026 às 13:56 1 de 1
Nu Financeira S.A. - Sociedade de Credito, Financiamento e Investimento
CNPJ: 30.680.829/0001-43
`;

  it("detects Nubank bank", () => {
    expect(detectBank(NUBANK_STATEMENT_TEXT)).toBe("Extrato Nubank");
  });

  it("extracts all transactions from Nubank statement", () => {
    const result = parseStatementText(NUBANK_STATEMENT_TEXT, 95);
    expect(result.bank).toBe("Extrato Nubank");
    expect(result.transactions.length).toBe(9);
  });

  it("parses DD MMM YYYY date format correctly", () => {
    const result = parseStatementText(NUBANK_STATEMENT_TEXT, 95);
    const tx = result.transactions;

    // 01 MAR 2026 transactions
    expect(tx[0].date).toEqual(new Date(2026, 2, 1));
    expect(tx[1].date).toEqual(new Date(2026, 2, 1));
    expect(tx[2].date).toEqual(new Date(2026, 2, 1));
    expect(tx[3].date).toEqual(new Date(2026, 2, 1));

    // 05 MAR 2026 transactions
    expect(tx[4].date).toEqual(new Date(2026, 2, 5));
    expect(tx[5].date).toEqual(new Date(2026, 2, 5));
    expect(tx[6].date).toEqual(new Date(2026, 2, 5));

    // 10 MAR 2026 transactions
    expect(tx[7].date).toEqual(new Date(2026, 2, 10));
    expect(tx[8].date).toEqual(new Date(2026, 2, 10));
  });

  it("extracts correct amounts", () => {
    const result = parseStatementText(NUBANK_STATEMENT_TEXT, 95);
    const tx = result.transactions;

    expect(tx[0].amount).toBe(500);       // Pix recebido
    expect(tx[1].amount).toBe(1000);      // Transferência Recebida
    expect(tx[2].amount).toBe(-200);      // Compra no débito
    expect(tx[3].amount).toBe(-150);      // Pix enviado
    expect(tx[4].amount).toBe(100);       // Resgate RDB
    expect(tx[5].amount).toBe(-200);      // Aplicação RDB
    expect(tx[6].amount).toBe(-50);       // Pagamento de fatura
    expect(tx[7].amount).toBe(-1356.6);   // Débito em conta
    expect(tx[8].amount).toBe(133.81);    // Resgate de empréstimo
  });

  it("classifies income and expense correctly", () => {
    const result = parseStatementText(NUBANK_STATEMENT_TEXT, 95);
    const tx = result.transactions;

    expect(tx[0].type).toBe("INCOME");    // Pix recebido
    expect(tx[1].type).toBe("INCOME");    // Transferência Recebida
    expect(tx[2].type).toBe("EXPENSE");   // Compra no débito
    expect(tx[3].type).toBe("EXPENSE");   // Pix enviado
    expect(tx[4].type).toBe("INCOME");    // Resgate RDB
    expect(tx[5].type).toBe("EXPENSE");   // Aplicação RDB
    expect(tx[6].type).toBe("EXPENSE");   // Pagamento de fatura
    expect(tx[7].type).toBe("EXPENSE");   // Débito em conta
    expect(tx[8].type).toBe("INCOME");    // Resgate de empréstimo
  });

  it("cleans descriptions removing bank details and CPF/CNPJ", () => {
    const result = parseStatementText(NUBANK_STATEMENT_TEXT, 95);
    const tx = result.transactions;

    // Should contain transaction type and entity name, but not bank details
    expect(tx[0].description).toMatch(/Transfer[eê]ncia recebida pelo Pix/i);
    expect(tx[0].description).toMatch(/PEDRO ALMEIDA/i);
    expect(tx[0].description).not.toMatch(/BCO SANTANDER/i);
    expect(tx[0].description).not.toMatch(/Ag[eê]ncia/i);

    expect(tx[2].description).toMatch(/Compra no d[eé]bito/i);
    expect(tx[2].description).toMatch(/SUPERMERCADO XYZ/i);
  });

  it("skips Total de entradas/saídas lines", () => {
    const result = parseStatementText(NUBANK_STATEMENT_TEXT, 95);

    for (const tx of result.transactions) {
      expect(tx.description).not.toMatch(/Total de entradas/i);
      expect(tx.description).not.toMatch(/Total de sa[ií]das/i);
    }
  });

  it("skips header and footer noise lines", () => {
    const result = parseStatementText(NUBANK_STATEMENT_TEXT, 95);

    for (const tx of result.transactions) {
      expect(tx.description).not.toMatch(/Saldo/i);
      expect(tx.description).not.toMatch(/Movimenta/i);
      expect(tx.description).not.toMatch(/Tem alguma/i);
      expect(tx.description).not.toMatch(/Nu Financeira/i);
      expect(tx.description).not.toMatch(/CNPJ/i);
    }
  });

  it("handles page breaks in multi-page statements", () => {
    const multiPageText = `
NU PAGAMENTOS
03 MAR 2026 Total de saídas - 118,89
Tem alguma dúvida?
Extrato gerado dia 02 de abril de 2026 às 13:56 1 de 2

Joao da Silva
CPF •••.123.456-•• Agência 0001 Conta
1234567-8
01 DE MARÇO DE 2026 a 31 DE MARÇO DE 2026 VALORES EM R$
Transferência enviada pelo Pix EMPRESA TELECOM - 12.345.678/0001-90 - CLARO PAY S.A. IP
Agência: 1 Conta: 1234567-2
118,89
04 MAR 2026 Total de entradas + 500,00
Resgate RDB
500,00
`;

    const result = parseStatementText(multiPageText, 95);
    expect(result.transactions.length).toBe(2);

    // Transaction from page break should have date from page 1
    expect(result.transactions[0].date).toEqual(new Date(2026, 2, 3));
    expect(result.transactions[0].amount).toBe(-118.89);
    expect(result.transactions[0].type).toBe("EXPENSE");

    // Transaction on page 2 with its own date
    expect(result.transactions[1].date).toEqual(new Date(2026, 2, 4));
    expect(result.transactions[1].amount).toBe(500);
    expect(result.transactions[1].type).toBe("INCOME");
  });

  it("classifies Compra no crédito with correct kind", () => {
    const text = `
Nu Financeira
10 MAR 2026 Total de saídas - 150,00
Compra no crédito LOJA ONLINE
150,00
`;
    const result = parseStatementText(text, 95);
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].type).toBe("EXPENSE");
    expect(result.transactions[0].transactionKind).toBe("COMPRA CREDITO");
  });

  it("classifies Transferência enviada (without Pix) as EXPENSE", () => {
    const text = `
Nu Financeira
10 MAR 2026 Total de saídas - 500,00
Transferência enviada EMPRESA XYZ
500,00
`;
    const result = parseStatementText(text, 95);
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].type).toBe("EXPENSE");
    expect(result.transactions[0].transactionKind).toBe("TRANSFERENCIA");
  });

  it("classifies Pagamento efetuado with BOLETO kind", () => {
    const text = `
Nu Financeira
10 MAR 2026 Total de saídas - 200,00
Pagamento efetuado CONTA LUZ
200,00
`;
    const result = parseStatementText(text, 95);
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].type).toBe("EXPENSE");
    expect(result.transactions[0].transactionKind).toBe("BOLETO");
  });

  it("returns 0 transactions for empty Nubank statement", () => {
    const text = `
Nu Financeira
01 MAR 2026 Total de entradas + 0,00
Total de saídas - 0,00
`;
    const result = parseStatementText(text, 95);
    expect(result.transactions.length).toBe(0);
  });

  it("skips transaction starters without amounts", () => {
    const text = `
Nu Financeira
10 MAR 2026 Total de saídas - 100,00
Transferência enviada pelo Pix PESSOA TESTE
Resgate RDB
100,00
`;
    const result = parseStatementText(text, 95);
    // First transaction has no amount, gets skipped. Resgate RDB has 100,00.
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].description).toMatch(/Resgate RDB/);
  });
});
