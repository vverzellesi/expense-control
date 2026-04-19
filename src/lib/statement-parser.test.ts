import { describe, it, expect } from "vitest";
import { parseStatementText, detectBank, isC6CreditCardInvoice, isCreditCardScreenshot, extractC6CreditCardTransactions, extractCreditCardScreenshotTransactions, extractItauInvoiceTransactions } from "./statement-parser";

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
  // Fictional fixture modeled after the Nubank invoice PDF layout produced by unpdf.
  // Structure is preserved (headers, section markers, "DD MMM •••• NNNN" lines)
  // so the parser logic is exercised, but all names/merchants/amounts are made up.
  const NUBANK_INVOICE_PDF_TEXT = `TITULAR FICTICIO
FATURA 13 ABR 2026 EMISSÃO E ENVIO 04 ABR 2026
RESUMO DA FATURA ATUAL
Fatura anterior R$ 100,00
Pagamento recebido −R$ 100,00
Total de compras de todos os cartões, 04 MAR a 04 ABR R$ 500,00
Outros lançamentos R$ 10,00
Total a pagar R$ 510,00
Pagamento mínimo para não ficar em atraso R$ 100,00
PRÓXIMAS FATURAS
Fechamento da próxima fatura 04 MAI 2026
TRANSAÇÕES DE 04 MAR A 04 ABR
Titular Fict R$ 500,00
04 MAR •••• 1111 Loja A - Parcela 2/2 R$ 10,00
04 MAR •••• 1111 Loja B - Parcela 5/6 R$ 20,00
05 MAR •••• 1111 Loja C R$ 30,00
11 MAR •••• 1111 Servico X R$ 40,00
17 MAR •••• 1111 Servico Y R$ 50,00
21 MAR •••• 2222 Loja D R$ 60,00
23 MAR •••• 1111 Loja E R$ 70,00
23 MAR •••• 1111 Loja E R$ 80,00
23 MAR •••• 1111 Loja E R$ 90,00
01 ABR •••• 2222 Transporte F R$ 40,00
02 ABR •••• 1111 Restaurante G R$ 10,00
Pagamentos e Financiamentos -R$ 100,00
13 MAR Pagamento em 13 MAR −R$ 100,00
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
    expect(descriptions).toContain("Loja A - Parcela 2/2");
    expect(descriptions).toContain("Loja B - Parcela 5/6");
    expect(descriptions).toContain("Loja C");
    expect(descriptions).toContain("Transporte F");
  });

  it("parses amounts as negative (EXPENSE) for purchases", () => {
    const result = parseStatementText(NUBANK_INVOICE_PDF_TEXT, 95);
    const servicoX = result.transactions.find((t) => t.description === "Servico X");
    expect(servicoX?.amount).toBe(-40);
    expect(servicoX?.type).toBe("EXPENSE");

    const transporte = result.transactions.find((t) => t.description === "Transporte F");
    expect(transporte?.amount).toBe(-40);
    expect(transporte?.type).toBe("EXPENSE");
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
    const lojaE = result.transactions.filter(
      (t) => t.description === "Loja E" && t.date.getDate() === 23
    );
    expect(lojaE.length).toBe(3);
    const amounts = lojaE.map((t) => Math.abs(t.amount)).sort((a, b) => a - b);
    expect(amounts).toEqual([70, 80, 90]);
  });

  it("treats refund (minus sign before R$) as INCOME", () => {
    const text = `Titular Ficticio
FATURA 13 ABR 2026
Total a pagar R$ 100,00
TRANSAÇÕES DE 04 MAR A 04 ABR
Nubank
15 MAR •••• 1111 Loja Z - Estorno −R$ 50,00
20 MAR •••• 1111 Loja Z R$ 30,00`;
    const result = parseStatementText(text, 95);
    const estorno = result.transactions.find((t) => t.amount > 0);
    expect(estorno).toBeDefined();
    expect(estorno?.type).toBe("INCOME");
    expect(estorno?.amount).toBe(50);
  });

  it("infers previous year for transactions after reference month (Dec -> Jan)", () => {
    const text = `Titular Ficticio
FATURA 10 JAN 2026
Total a pagar R$ 100,00
TRANSAÇÕES DE 10 DEZ A 10 JAN
Nubank
15 DEZ •••• 1111 Loja Natal R$ 150,00
05 JAN •••• 1111 Loja Ano Novo R$ 200,00`;
    const result = parseStatementText(text, 95);
    expect(result.transactions.length).toBe(2);
    const dez = result.transactions.find((t) => t.description === "Loja Natal");
    expect(dez?.date.getFullYear()).toBe(2025);
    expect(dez?.date.getMonth()).toBe(11); // December

    const jan = result.transactions.find((t) => t.description === "Loja Ano Novo");
    expect(jan?.date.getFullYear()).toBe(2026);
    expect(jan?.date.getMonth()).toBe(0); // January
  });

  it("does not misclassify Nubank bank statement as invoice", () => {
    const text = `
Nu Financeira
01 MAR 2026 Total de entradas + 500,00
Transferência recebida pelo Pix JOAO TESTE
500,00
`;
    const result = parseStatementText(text, 95);
    expect(result.bank).toBe("Extrato Nubank");
  });

  it("matches purchase line with only 2 bullet chars (lenient OCR)", () => {
    const text = `Titular Ficticio
FATURA 13 ABR 2026
Total a pagar R$ 100,00
TRANSAÇÕES DE 04 MAR A 04 ABR
Nubank
15 MAR •• 1111 Loja OCR Garbled R$ 40,00`;
    const result = parseStatementText(text, 95);
    expect(result.transactions.length).toBe(1);
    expect(result.transactions[0].description).toBe("Loja OCR Garbled");
  });
});

describe("Itaú credit card invoice parsing (screenshot OCR)", () => {
  // Fictional fixture modeled after Tesseract output for an Itaú open-invoice
  // screenshot. Layout is preserved (status bar, "DD de MONTH" headers,
  // "cartão físico/virtual" sub-labels, garbled icon tokens before amount),
  // but all merchants/amounts are made up.
  const ITAU_INVOICE_OCR_TEXT = `18:45 all FS
< O)
ontem, 18 de abril
BP loja alpha R$ 85,75 y
cartão físico em 2x
16 de abril
99*
CC) ao R$13,50 >
cartão físico
15 de abril
torii
ER e R$10,00 >
cartão físico
loja beta
CC) 2gemsP R$18,90 >
cartão físico
6 servico gama R$ 40,79 y
cartão virtual em 2x
10 de abril
E servico delta R$ 170,70 y
cartão virtual em 3x
conta teste
C) ie o R$99,99 >
cartão virtual`;

  it("extracts all 7 transactions", () => {
    const result = parseStatementText(ITAU_INVOICE_OCR_TEXT, 80);
    expect(result.transactions.length).toBe(7);
  });

  it("sets bank as Fatura Itaú", () => {
    const result = parseStatementText(ITAU_INVOICE_OCR_TEXT, 80);
    expect(result.bank).toBe("Fatura Itaú");
  });

  it("uses pending description line when amount line is OCR-garbled", () => {
    const result = parseStatementText(ITAU_INVOICE_OCR_TEXT, 80);
    const descriptions = result.transactions.map((t) => t.description);
    expect(descriptions).toContain("99*");
    expect(descriptions).toContain("torii");
    expect(descriptions).toContain("loja beta");
    expect(descriptions).toContain("conta teste");
  });

  it("strips leading icon noise from inline descriptions", () => {
    const result = parseStatementText(ITAU_INVOICE_OCR_TEXT, 80);
    const descriptions = result.transactions.map((t) => t.description);
    expect(descriptions).toContain("loja alpha");
    expect(descriptions).toContain("servico gama");
    expect(descriptions).toContain("servico delta");
  });

  it("parses amounts as EXPENSE with correct values", () => {
    const result = parseStatementText(ITAU_INVOICE_OCR_TEXT, 80);
    const alpha = result.transactions.find((t) => t.description === "loja alpha");
    expect(alpha?.amount).toBe(-85.75);
    expect(alpha?.type).toBe("EXPENSE");

    const teste = result.transactions.find((t) => t.description === "conta teste");
    expect(teste?.amount).toBe(-99.99);

    const delta = result.transactions.find((t) => t.description === "servico delta");
    expect(delta?.amount).toBe(-170.70);
  });

  it("parses DD de MONTH date headers with correct day and month", () => {
    const result = parseStatementText(ITAU_INVOICE_OCR_TEXT, 80);
    const apr18 = result.transactions.find((t) => t.description === "loja alpha");
    expect(apr18?.date.getDate()).toBe(18);
    expect(apr18?.date.getMonth()).toBe(3); // April

    const apr10 = result.transactions.find((t) => t.description === "servico delta");
    expect(apr10?.date.getDate()).toBe(10);
    expect(apr10?.date.getMonth()).toBe(3);
  });

  it("uses explicit referenceDate to infer year deterministically", () => {
    const reference = new Date(2026, 3, 19); // 19 April 2026
    const txs = extractItauInvoiceTransactions(ITAU_INVOICE_OCR_TEXT, 80, reference);
    const apr18 = txs.find((t) => t.description === "loja alpha");
    expect(apr18?.date.getFullYear()).toBe(2026);
    expect(apr18?.date.getMonth()).toBe(3);
  });

  it("infers previous year when transaction month is future of reference month", () => {
    // Reference: 10 Feb 2026. A December entry must be from 2025.
    const reference = new Date(2026, 1, 10);
    const text = `15:00 all
< O)
15 de dezembro
BP loja natal R$ 50,00
cartão físico`;
    const txs = extractItauInvoiceTransactions(text, 80, reference);
    expect(txs).toHaveLength(1);
    expect(txs[0].date.getFullYear()).toBe(2025);
    expect(txs[0].date.getMonth()).toBe(11); // December
  });

  it("handles março with cedilla in date header", () => {
    const reference = new Date(2026, 3, 19);
    const text = `15:00 all
< O)
15 de março
BP loja teste R$ 25,00
cartão físico`;
    const txs = extractItauInvoiceTransactions(text, 80, reference);
    expect(txs).toHaveLength(1);
    expect(txs[0].date.getMonth()).toBe(2); // March
    expect(txs[0].date.getDate()).toBe(15);
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
