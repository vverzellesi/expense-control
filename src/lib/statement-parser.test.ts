import { describe, it, expect } from "vitest";
import { parseStatementText, detectBank, isC6CreditCardInvoice, isCreditCardScreenshot, extractC6CreditCardTransactions, extractCreditCardScreenshotTransactions } from "./statement-parser";

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

describe("Nubank credit card invoice parsing (PDF)", () => {
  // Real text extracted by unpdf from a Nubank credit card invoice PDF
  const NUBANK_INVOICE_PDF_TEXT = `RAISSA SINDEAUX DE LIMA
FATURA 13 ABR 2026 EMISSÃO E ENVIO 04 ABR 2026
RESUMO DA FATURA ATUAL
Fatura anterior R$ 891,67
Pagamento recebido −R$ 891,67
Total de compras de todos os cartões, 04 MAR a 04 ABR R$ 567,61
Outros lançamentos R$ 21,44
Total a pagar R$ 589,05
Pagamento mínimo para não ficar em atraso R$ 106,58
PRÓXIMAS FATURAS
Fechamento da próxima fatura 04 MAI 2026
TRANSAÇÕES DE 04 MAR A 04 ABR
Raissa S Lima R$ 567,61
04 MAR •••• 3746 Odp-Outlet D*Odptech - Parcela 2/2 R$ 31,78
04 MAR •••• 3746 Shein *Shein.Com - Parcela 5/6 R$ 63,50
05 MAR •••• 3746 Mercadolivre*2produto R$ 163,73
11 MAR •••• 3746 Applecombill R$ 5,90
17 MAR •••• 3746 Cobasi R$ 63,80
21 MAR •••• 1747 Lojas Americanas R$ 14,76
23 MAR •••• 3746 Amazon R$ 56,81
23 MAR •••• 3746 Amazon R$ 6,47
23 MAR •••• 3746 Amazon R$ 33,32
01 ABR •••• 1747 Uber Uber *Trip Help.U R$ 116,04
02 ABR •••• 3746 Jjlanches R$ 11,50
Pagamentos e Financiamentos -R$ 870,22
13 MAR Pagamento em 13 MAR −R$ 891,67
13 MAR Juros de dívida encerrada R$ 0,67
login com sua conta Nubank.`;

  it("extracts all 11 purchases from the invoice", () => {
    const result = parseStatementText(NUBANK_INVOICE_PDF_TEXT, 95);
    expect(result.transactions.length).toBe(11);
  });

  it("sets bank as Fatura Nubank", () => {
    const result = parseStatementText(NUBANK_INVOICE_PDF_TEXT, 95);
    expect(result.bank).toBe("Fatura Nubank");
  });

  it("parses descriptions without card number noise", () => {
    const result = parseStatementText(NUBANK_INVOICE_PDF_TEXT, 95);
    const descriptions = result.transactions.map((t) => t.description);
    expect(descriptions).toContain("Odp-Outlet D*Odptech - Parcela 2/2");
    expect(descriptions).toContain("Shein *Shein.Com - Parcela 5/6");
    expect(descriptions).toContain("Mercadolivre*2produto");
    expect(descriptions).toContain("Uber Uber *Trip Help.U");
  });

  it("parses amounts as negative (EXPENSE) for purchases", () => {
    const result = parseStatementText(NUBANK_INVOICE_PDF_TEXT, 95);
    const netflix = result.transactions.find((t) =>
      t.description.startsWith("Applecombill")
    );
    expect(netflix?.amount).toBe(-5.9);
    expect(netflix?.type).toBe("EXPENSE");

    const uber = result.transactions.find((t) =>
      t.description.startsWith("Uber")
    );
    expect(uber?.amount).toBe(-116.04);
    expect(uber?.type).toBe("EXPENSE");
  });

  it("uses invoice FATURA date to infer transaction year", () => {
    const result = parseStatementText(NUBANK_INVOICE_PDF_TEXT, 95);
    // Invoice is FATURA 13 ABR 2026, so all transactions are 2026
    const mar4 = result.transactions.find(
      (t) => t.date.getDate() === 4 && t.date.getMonth() === 2
    );
    expect(mar4?.date.getFullYear()).toBe(2026);

    const abr2 = result.transactions.find(
      (t) => t.date.getDate() === 2 && t.date.getMonth() === 3
    );
    expect(abr2?.date.getFullYear()).toBe(2026);
  });

  it("keeps duplicate merchants on same day with different amounts", () => {
    const result = parseStatementText(NUBANK_INVOICE_PDF_TEXT, 95);
    // Three Amazon purchases on 23 MAR with different amounts
    const amazons = result.transactions.filter(
      (t) => t.description === "Amazon" && t.date.getDate() === 23
    );
    expect(amazons.length).toBe(3);
    const amounts = amazons.map((t) => Math.abs(t.amount)).sort((a, b) => a - b);
    expect(amounts).toEqual([6.47, 33.32, 56.81]);
  });
});

describe("C6 credit card invoice parsing (screenshot OCR)", () => {
  // Real OCR output from C6 credit card screenshot
  const C6_CARD_OCR_TEXT = `08:51 SED

< Fatura do cartão TER O)

larço Abril Mai:
14/03
ED GAR R STO AMARO 272 R$ 8,00
Cartão final 6604
14/03
TRENDMARKET R$ 4,37
Cartão final 6604
14/03
MARCELOCRISTIANO R$ 16,00
Cartão final 6604
14/03
SEM PARAR R$ 100,00
Cartão final 6604
13/03
IDEALMARKET R$ 21,96
Cartão final 6604
Valor
Vence em 20/04`;

  it("detects C6 credit card invoice format", () => {
    expect(isC6CreditCardInvoice(C6_CARD_OCR_TEXT)).toBe(true);
  });

  it("does not detect C6 credit card for regular C6 bank statement", () => {
    const bankStatement = `C6 BANK
Agência: 1 • Conta: 12345
02/01 02/01 Saída PIX Pix enviado para VICTOR -R$ 156,00`;
    expect(isC6CreditCardInvoice(bankStatement)).toBe(false);
  });

  it("detects C6 credit card even without header (e.g., last page)", () => {
    const lastPage = `01/04
JUNDIAILLATORRE R$ 54,00
Cartão final 6604
01/04
OUTRA COMPRA R$ 30,00
Cartão final 6604`;
    expect(isC6CreditCardInvoice(lastPage)).toBe(true);
  });

  it("extracts all transactions from OCR text", () => {
    const result = parseStatementText(C6_CARD_OCR_TEXT, 88);
    expect(result.bank).toBe("Fatura C6");
    expect(result.transactions.length).toBe(5);
  });

  it("parses dates correctly", () => {
    const result = parseStatementText(C6_CARD_OCR_TEXT, 88);
    const tx = result.transactions;

    // Sorted by date, then by order
    expect(tx[0].date.getDate()).toBe(13);
    expect(tx[0].date.getMonth()).toBe(2); // March

    expect(tx[1].date.getDate()).toBe(14);
    expect(tx[1].date.getMonth()).toBe(2);
  });

  it("extracts correct amounts as expenses", () => {
    const result = parseStatementText(C6_CARD_OCR_TEXT, 88);
    const tx = result.transactions;

    // All credit card transactions should be negative (expenses)
    for (const t of tx) {
      expect(t.amount).toBeLessThan(0);
      expect(t.type).toBe("EXPENSE");
    }

    const idealmarket = tx.find(t => t.description.includes("IDEALMARKET"));
    expect(idealmarket?.amount).toBe(-21.96);

    const semParar = tx.find(t => t.description.includes("SEM PARAR"));
    expect(semParar?.amount).toBe(-100);
  });

  it("extracts descriptions correctly", () => {
    const result = parseStatementText(C6_CARD_OCR_TEXT, 88);
    const descriptions = result.transactions.map(t => t.description);

    expect(descriptions).toContain("ED GAR R STO AMARO 272");
    expect(descriptions).toContain("TRENDMARKET");
    expect(descriptions).toContain("SEM PARAR");
    expect(descriptions).toContain("IDEALMARKET");
  });

  it("filters out noise lines (totals, headers, card info)", () => {
    const result = parseStatementText(C6_CARD_OCR_TEXT, 88);

    for (const tx of result.transactions) {
      expect(tx.description).not.toMatch(/Valor/i);
      expect(tx.description).not.toMatch(/Vence em/i);
      expect(tx.description).not.toMatch(/Fatura/i);
      expect(tx.description).not.toMatch(/Cartão final/i);
      expect(tx.description).not.toMatch(/Abril/i);
    }
  });

  it("skips transactions with garbled amounts (installments)", () => {
    const textWithGarbled = `Fatura do cartão
24/03
KALIMERA HORTIFRUIT R$ 117,54
Cartão final 6604
24/03
ARZ CLINICA 5 R$ EA
Cartão final 6604 arceia e
23/03
PG *PP ALMADERMA - ERRA
Cartão final 6604 arceia e`;

    const result = parseStatementText(textWithGarbled, 85);
    // Only KALIMERA has valid amount; ARZ and PG have garbled amounts
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].description).toBe("KALIMERA HORTIFRUIT");
  });

  it("handles Em processamento items", () => {
    const textWithProcessing = `01/04
JUNDIAILLATORRE R$ 54,00
Cartão final 6604
DADO Em processamento
KombozaVeg SAO JOS R$ 33,00
Cartão final 6604`;

    const result = parseStatementText(textWithProcessing, 80);
    // Only JUNDIAILLATORRE: KombozaVeg has garbled date (DADO)
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].description).toBe("JUNDIAILLATORRE");
    expect(result.transactions[0].amount).toBe(-54);
  });

  it("deduplicates transactions with same date, description, and amount", () => {
    const textWithDupes = `Fatura do cartão
14/03
SEM PARAR R$ 100,00
Cartão final 6604
14/03
SEM PARAR R$ 100,00
Cartão final 6604`;

    const result = parseStatementText(textWithDupes, 88);
    expect(result.transactions.length).toBe(1);
  });
});

describe("Generic credit card screenshot parsing (Layout B — amount on separate line)", () => {
  const NUBANK_CARD_TEXT = `Fatura
14 MAR
NETFLIX
R$ 55,90
14 MAR
SPOTIFY BRASIL
R$ 34,90
15 MAR
UBER *TRIP
R$ 23,45
15 MAR
MERCADO LIVRE
R$ 189,99
Valor total da fatura
Vencimento 10/04`;

  it("detects Nubank-style credit card screenshot", () => {
    expect(isCreditCardScreenshot(NUBANK_CARD_TEXT)).toBe(true);
  });

  it("extracts all transactions from Layout B (amount on separate line)", () => {
    const result = parseStatementText(NUBANK_CARD_TEXT, 85);
    expect(result.transactions.length).toBe(4);
  });

  it("parses DD MMM date format", () => {
    const result = parseStatementText(NUBANK_CARD_TEXT, 85);
    const tx = result.transactions;

    expect(tx[0].date.getDate()).toBe(14);
    expect(tx[0].date.getMonth()).toBe(2); // March

    expect(tx[2].date.getDate()).toBe(15);
    expect(tx[2].date.getMonth()).toBe(2);
  });

  it("extracts correct descriptions and amounts", () => {
    const result = parseStatementText(NUBANK_CARD_TEXT, 85);
    const netflix = result.transactions.find(t => t.description === "NETFLIX");
    expect(netflix?.amount).toBe(-55.90);

    const mercado = result.transactions.find(t => t.description === "MERCADO LIVRE");
    expect(mercado?.amount).toBe(-189.99);
  });

  it("handles DD/MM dates with Layout B", () => {
    const text = `Fatura do cartão
14/03
PADARIA BELA VISTA
R$ 12,50
14/03
DROGASIL FARMACIA
R$ 45,90`;

    const result = parseStatementText(text, 85);
    expect(result.transactions.length).toBe(2);
    expect(result.transactions[0].description).toBe("PADARIA BELA VISTA");
    expect(result.transactions[0].amount).toBe(-12.50);
  });

  it("handles mixed layouts (A + B) in same text", () => {
    const text = `Fatura do cartão
14/03
COMPRA INLINE R$ 50,00
15/03
COMPRA SEPARADA
R$ 75,00
Cartão final 1234`;

    const result = parseStatementText(text, 85);
    expect(result.transactions.length).toBe(2);

    const inline = result.transactions.find(t => t.description === "COMPRA INLINE");
    expect(inline?.amount).toBe(-50);

    const separate = result.transactions.find(t => t.description === "COMPRA SEPARADA");
    expect(separate?.amount).toBe(-75);
  });

  it("does not parse standalone total amounts as transactions", () => {
    const text = `Fatura
14 MAR
COMPRA
R$ 50,00
R$ 10.901,75
Vencimento`;

    const result = parseStatementText(text, 85);
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].amount).toBe(-50);
  });

  it("does not detect non-credit-card text as screenshot", () => {
    const bankText = `Extrato Bancário
Saldo: R$ 1.000,00
14/03/2026 PIX ENVIADO R$ 50,00`;
    expect(isCreditCardScreenshot(bankText)).toBe(false);
  });
});
