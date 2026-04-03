import type { StatementTransaction, StatementParseResult, TransactionType } from "@/types";

// Transaction kind patterns
const TRANSACTION_PATTERNS = {
  PIX_RECEBIDO: /PIX\s*(?:RECEBIDO|REC(?:EB)?|TRANSF(?:ERENCIA)?\s*REC)/i,
  PIX_ENVIADO: /PIX\s*(?:ENVIADO|ENV|TRANSF(?:ERENCIA)?\s*ENV)/i,
  TED_RECEBIDO: /TED\s*(?:RECEBIDO|REC)/i,
  TED_ENVIADO: /TED\s*(?:ENVIADO|ENV)/i,
  DOC: /DOC\s/i,
  BOLETO: /(?:PAGTO?\s*)?BOLETO|PAG(?:AMENTO)?\s*TIT(?:ULO)?|TITULO|CONVÊNIO/i,
  DEBITO_AUTO: /DEB(?:ITO)?\s*AUT(?:OMATICO)?|DEBITO\s*AUTOMATICO/i,
  TARIFA: /TARIFA|IOF|ANUIDADE|TAXA/i,
  SAQUE: /SAQUE|SAQ\s/i,
  DEPOSITO: /DEPOSITO|DEP\s/i,
  TRANSFERENCIA: /TRANSF(?:ERENCIA)?(?!\s*(?:REC|ENV))/i,
  COMPRA_DEBITO: /COMPRA\s*(?:NO\s*)?DEB(?:ITO)?/i,
  ESTORNO: /ESTORNO/i,
  RENDIMENTO: /RENDIMENTO|JUROS\s*(?:POUPANCA|CRED)/i,
};

// Credit card invoice detection patterns
const CREDIT_CARD_PATTERNS = [
  /fatura\s*(?:do\s*)?cart[aã]o/i,
  /valor\s*m[ií]nimo/i,
  /total\s*(?:da\s*)?fatura/i,
  /pagamento\s*m[ií]nimo/i,
  /limite\s*(?:de\s*)?cr[eé]dito/i,
  /vencimento/i,
];

// Invoice due date patterns
const INVOICE_DATE_PATTERNS = [
  /vencimento[:\s]*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/i,
  /vencimento[:\s]*(\d{1,2})\s*(?:de\s*)?(janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i,
  /data\s*(?:de\s*)?vencimento[:\s]*(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})/i,
];

// Full month names in Portuguese
const MONTH_FULL: Record<string, number> = {
  janeiro: 0,
  fevereiro: 1,
  marco: 2,
  abril: 3,
  maio: 4,
  junho: 5,
  julho: 6,
  agosto: 7,
  setembro: 8,
  outubro: 9,
  novembro: 10,
  dezembro: 11,
};

// Bank detection patterns
// Order matters: specific brands first (Nubank, C6, BTG) before generic ones
// that commonly appear in transfer details (Itaú, Santander, Bradesco)
const BANK_PATTERNS: Record<string, RegExp[]> = {
  "Extrato Nubank": [/NUBANK/i, /NU\s*PAGAMENTOS/i, /Nu\s+Financeira/i],
  "Extrato C6": [/C6\s*BANK/i, /BANCO\s*C6/i, /C6\s*S\.?A/i],
  "Extrato BTG": [/BTG\s*PACTUAL/i, /BANCO\s*BTG/i, /BTG\s*BANK/i],
  "Extrato Itaú": [
    /ITAU/i,
    /ITAÚ/i,
    /BANCO\s*ITAU/i,
    /ITAUUNIBANCO/i,
  ],
  "Extrato Bradesco": [/BRADESCO/i, /BCO\s*BRADESCO/i],
  "Extrato Santander": [/SANTANDER/i, /BCO\s*SANTANDER/i],
  "Extrato BB": [/BANCO\s*DO\s*BRASIL/i, /BB\s*S\.?A/i],
  "Extrato Caixa": [/CAIXA\s*ECON/i, /CEF/i, /CAIXA\s*FED/i],
};

// Date patterns (DD/MM/YYYY, DD/MM/YY, DD/MM)
const DATE_PATTERNS = [
  /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})/g, // DD/MM/YYYY
  /(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})/g, // DD/MM/YY
  /(\d{1,2})[\/\-\.](\d{1,2})(?!\d)/g, // DD/MM
];

// Month abbreviations in Portuguese
const MONTH_ABBREV: Record<string, number> = {
  jan: 0,
  fev: 1,
  mar: 2,
  abr: 3,
  mai: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  set: 8,
  out: 9,
  nov: 10,
  dez: 11,
};

// Pattern for "DD mes" format (e.g., "13 ago", "04 jul")
const DATE_ABBREV_PATTERN = /^(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/i;

// Amount patterns (Brazilian format: 1.234,56 or 1234,56 or R$ 1.234,56)
const AMOUNT_PATTERN =
  /R?\$?\s*-?(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})\s*(?:[CD]|[+-])?|-?(\d{1,3}(?:\.\d{3})*|\d+),(\d{2})/g;

/**
 * Detect bank from OCR text
 */
export function detectBank(text: string): string {
  for (const [bank, patterns] of Object.entries(BANK_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return bank;
      }
    }
  }
  return "Extrato Bancário";
}

/**
 * Detect if text is a credit card invoice
 * Returns true if at least 2 credit card patterns are found
 */
export function isCreditCardInvoice(text: string): boolean {
  let matchCount = 0;
  for (const pattern of CREDIT_CARD_PATTERNS) {
    if (pattern.test(text)) {
      matchCount++;
    }
  }
  return matchCount >= 2;
}

/**
 * Extract invoice due date from credit card statement
 * This date is used as reference for determining transaction years
 */
export function extractInvoiceDueDate(text: string): Date | null {
  // Try patterns with numeric month first
  for (const pattern of INVOICE_DATE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      // Check if it's a numeric date (DD/MM/YYYY)
      if (match[2] && /^\d+$/.test(match[2])) {
        const day = parseInt(match[1], 10);
        const month = parseInt(match[2], 10) - 1;
        let year = parseInt(match[3], 10);
        if (year < 100) year = 2000 + year;

        if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
          const date = new Date(year, month, day);
          if (!isNaN(date.getTime())) return date;
        }
      }
      // Check if it's a text month (DD de Janeiro)
      else if (match[2]) {
        const day = parseInt(match[1], 10);
        const monthName = match[2].toLowerCase();
        const month = MONTH_FULL[monthName];

        if (month !== undefined && day >= 1 && day <= 31) {
          // Infer year from current date
          const currentYear = new Date().getFullYear();
          const date = new Date(currentYear, month, day);
          if (!isNaN(date.getTime())) return date;
        }
      }
    }
  }

  return null;
}

/**
 * Detect transaction kind (PIX, TED, Boleto, etc.)
 */
export function detectTransactionKind(description: string): string | undefined {
  for (const [kind, pattern] of Object.entries(TRANSACTION_PATTERNS)) {
    if (pattern.test(description)) {
      return kind.replace(/_/g, " ");
    }
  }
  return undefined;
}

/**
 * Determine if transaction is income or expense based on description and patterns
 */
export function detectTransactionType(
  description: string,
  amount: number,
  rawLine?: string,
  isCreditCard?: boolean
): TransactionType {
  const upperDesc = description.toUpperCase();
  const line = (rawLine || "").toUpperCase();

  // Check for explicit credit indicators (these are INCOME even on credit cards)
  const creditIndicators = [
    /\s[C]\s*$/i, // Ends with C
    /ESTORNO/i,
    /DEVOLU[CÇ][AÃ]O/i,
    /REEMBOLSO/i,
    /CASHBACK/i,
  ];

  // Check for explicit debit indicators
  const debitIndicators = [
    /\s[D]\s*$/i, // Ends with D
    /DEBITO/i,
    /PIX\s*(?:ENVIADO|ENV)/i,
    /TED\s*(?:ENVIADO|ENV)/i,
    /SAQUE/i,
    /TARIFA/i,
    /IOF/i,
    /PAGTO?/i,
    /BOLETO/i,
    /COMPRA/i,
    /TRANSF(?:ERENCIA)?\s*ENV/i,
  ];

  // Additional income indicators (only for bank statements, not credit cards)
  const bankIncomeIndicators = [
    /CREDITO/i,
    /PIX\s*(?:RECEBIDO|REC)/i,
    /TED\s*(?:RECEBIDO|REC)/i,
    /DEPOSITO/i,
    /RENDIMENTO/i,
    /JUROS\s*CRED/i,
    /TRANSF(?:ERENCIA)?\s*REC/i,
    /CR[EÉ]DITO\s*(?:REF|REFINANCIAMENTO)?/i,
    /PAGAMENTO\s*ANTECIPADO/i,
  ];

  for (const pattern of creditIndicators) {
    if (pattern.test(upperDesc) || pattern.test(line)) {
      return "INCOME";
    }
  }

  for (const pattern of debitIndicators) {
    if (pattern.test(upperDesc) || pattern.test(line)) {
      return "EXPENSE";
    }
  }

  // Only check bank income indicators for non-credit-card statements
  if (!isCreditCard) {
    for (const pattern of bankIncomeIndicators) {
      if (pattern.test(upperDesc) || pattern.test(line)) {
        return "INCOME";
      }
    }
  }

  // For credit cards, default to EXPENSE (purchases are expenses)
  if (isCreditCard) {
    return "EXPENSE";
  }

  // Default based on amount sign for bank statements
  return amount >= 0 ? "INCOME" : "EXPENSE";
}

/**
 * Parse date from string
 */
function parseDate(
  day: string,
  month: string,
  year?: string
): Date | null {
  const d = parseInt(day, 10);
  const m = parseInt(month, 10) - 1;
  let y = year ? parseInt(year, 10) : new Date().getFullYear();

  if (year && year.length === 2) {
    y = 2000 + y;
  }

  if (d < 1 || d > 31 || m < 0 || m > 11) {
    return null;
  }

  const date = new Date(y, m, d);
  if (isNaN(date.getTime())) {
    return null;
  }

  return date;
}

/**
 * Extract date from description in "DD mes" format (e.g., "13 ago", "04 jul")
 * Returns the date and the remaining description without the date prefix
 *
 * For credit card invoices, the transaction date in description should be
 * before or equal to the invoice date (referenceDate).
 */
function extractDateFromDescription(
  description: string,
  referenceDate?: Date
): { date: Date | null; cleanDescription: string } {
  const match = description.match(DATE_ABBREV_PATTERN);

  if (!match) {
    return { date: null, cleanDescription: description };
  }

  const day = parseInt(match[1], 10);
  const monthAbbrev = match[2].toLowerCase();
  const month = MONTH_ABBREV[monthAbbrev];

  if (month === undefined || day < 1 || day > 31) {
    return { date: null, cleanDescription: description };
  }

  // Use reference date's year or current year
  const refYear = referenceDate?.getFullYear() || new Date().getFullYear();
  const refMonth = referenceDate?.getMonth() ?? new Date().getMonth();

  // Determine the correct year for the transaction
  // If the transaction month is after the reference month, it's from the previous year
  // (e.g., invoice is June 2026, transaction is August -> August 2025)
  let year = refYear;
  if (month > refMonth) {
    year = refYear - 1;
  }

  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) {
    return { date: null, cleanDescription: description };
  }

  // Remove the date prefix from description
  const cleanDescription = description.replace(DATE_ABBREV_PATTERN, "").trim();

  return { date, cleanDescription };
}

/**
 * Parse amount from Brazilian format string
 */
function parseAmount(amountStr: string): number {
  // Remove R$ and spaces
  let cleaned = amountStr.replace(/R\$?\s*/g, "").trim();

  // Check for negative indicator
  const isNegative = cleaned.includes("-") || cleaned.endsWith("D");

  // Remove signs and D/C indicators
  cleaned = cleaned.replace(/[-+CD]/g, "").trim();

  // Remove thousand separators and convert decimal separator
  cleaned = cleaned.replace(/\./g, "").replace(",", ".");

  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : isNegative ? -Math.abs(value) : Math.abs(value);
}

// Pattern for "DD mes" format at the start of line (credit card invoices)
// e.g., "□ 19 set Parcelamento de Fatura" or "13 ago NETFLIX"
const CREDIT_CARD_LINE_DATE_PATTERN =
  /^\s*[□●○•\-\*]?\s*(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\b/i;

// C6 Bank statement format patterns
// C6 extracts have format: DD/MM DD/MM Tipo Descrição Valor
// e.g., "02/01 02/01 Saída PIX Pix enviado para VICTOR -R$ 156,00"
// e.g., "17/01 19/01 Outros gastos SEGURO CONTA C6 -R$ 20,00"
const C6_STATEMENT_TYPES = [
  "Saída PIX",
  "Entrada PIX",
  "Outros gastos",
  "Pagamento",
  "Transferência",
  "Saldo do dia",
];

// Pattern to match C6 format: DD/MM DD/MM Type Description Amount
// Captures: date1, date2, type, rest of line
const C6_LINE_PATTERN =
  /^(\d{1,2}\/\d{1,2})\s+(\d{1,2}\/\d{1,2})\s+(Saída PIX|Entrada PIX|Outros gastos|Pagamento|Transferência)\s+(.+)$/i;

/**
 * Extract transaction from C6 bank statement format
 * Format: DD/MM DD/MM Tipo Descrição Valor
 * e.g., "02/01 02/01 Saída PIX Pix enviado para VICTOR -R$ 156,00"
 */
function extractFromC6Line(
  line: string,
  confidence: number
): StatementTransaction | null {
  const match = line.match(C6_LINE_PATTERN);
  if (!match) return null;

  const [, date1Str, date2Str, transactionType, rest] = match;

  // Parse the accounting date (data contábil - second date)
  const [day, month] = date2Str.split("/").map(Number);
  const year = new Date().getFullYear();
  const date = new Date(year, month - 1, day);

  if (isNaN(date.getTime())) return null;

  // Extract amount from the rest of the line
  const amountRegex = new RegExp(AMOUNT_PATTERN.source, "g");
  const amounts: number[] = [];
  let amountMatch;
  let lastAmountEnd = 0;

  while ((amountMatch = amountRegex.exec(rest)) !== null) {
    const amount = parseAmount(amountMatch[0]);
    if (amount !== 0) {
      amounts.push(amount);
      lastAmountEnd = amountMatch.index;
    }
  }

  if (amounts.length === 0) return null;

  const amount = amounts[amounts.length - 1];

  // Extract description (everything before the amount)
  let description = rest.substring(0, lastAmountEnd).trim();

  // Clean up description
  description = description
    .replace(/\s+/g, " ")
    .replace(/^[:\-\s]+|[:\-\s]+$/g, "")
    .trim();

  if (!description || description.length < 2) {
    description = transactionType;
  }

  // Determine transaction type based on C6 type column
  let type: TransactionType;
  const upperType = transactionType.toUpperCase();

  if (upperType.includes("ENTRADA") || upperType.includes("RECEBIDO")) {
    type = "INCOME";
  } else if (upperType.includes("SAÍDA") || upperType.includes("SAIDA") || upperType.includes("PAGAMENTO") || upperType.includes("OUTROS GASTOS")) {
    type = "EXPENSE";
  } else {
    type = amount >= 0 ? "INCOME" : "EXPENSE";
  }

  // Map C6 type to transaction kind
  let transactionKind: string | undefined;
  if (upperType.includes("PIX")) {
    transactionKind = upperType.includes("ENTRADA") ? "PIX RECEBIDO" : "PIX ENVIADO";
  } else if (upperType.includes("PAGAMENTO")) {
    transactionKind = "BOLETO";
  }

  return {
    date,
    description,
    amount: type === "EXPENSE" ? -Math.abs(amount) : Math.abs(amount),
    type,
    transactionKind,
    confidence,
  };
}

/**
 * Detect if this is a C6 Bank statement
 */
function isC6Statement(text: string): boolean {
  // Check for C6 Bank header patterns
  const c6Patterns = [
    /C6\s*BANK/i,
    /BANCO\s*C6/i,
    /Agência:\s*1\s*•?\s*Conta:/i,
    /Extrato\s+Período/i,
  ];

  // Check for characteristic C6 format: "Data lançamento" "Data contábil"
  const hasC6Format = /Data\s+(?:de\s+)?lan[çc]amento\s*Data\s+cont[áa]bil/i.test(text) ||
    /lan[çc]amento\s*cont[áa]bil\s*Tipo/i.test(text);

  // Check if any C6 patterns match
  const hasC6Header = c6Patterns.some(p => p.test(text));

  // Also check for characteristic line format
  const hasC6Lines = C6_LINE_PATTERN.test(text);

  return hasC6Header || hasC6Format || hasC6Lines;
}

// ===== Nubank bank statement format =====

// Nubank statements use "DD MMM YYYY" date format (e.g., "01 MAR 2026")
const NUBANK_DATE_PATTERN = /(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i;

// Known Nubank transaction type prefixes
const NUBANK_TRANSACTION_STARTERS = [
  /^Transfer[eê]ncia\s+(?:recebida|enviada)/i,
  /^Compra\s+no\s+(?:d[eé]bito|cr[eé]dito)/i,
  /^Resgate\s+(?:RDB|de\s+empr[eé]stimo)/i,
  /^Aplica[cç][aã]o\s+RDB/i,
  /^Pagamento\s+(?:de\s+(?:fatura|boleto)|efetuado)/i,
  /^D[eé]bito\s+em\s+conta/i,
];

// Lines to skip in Nubank statements
const NUBANK_SKIP_PATTERNS = [
  /Total\s+de\s+(?:entradas|sa[ií]das)/i,
  /^Saldo\s+(?:inicial|final)/i,
  /^Rendimento\s+l[ií]quido/i,
  /^Movimenta[cç][oõ]es\s*$/i,
  /^VALORES\s+EM\s+R\$/i,
  /^\d{1,2}\s+DE\s+\w+\s+DE\s+\d{4}\s+a\s+/i,
  /^Tem\s+alguma\s+d[uú]vida/i,
  /^Caso\s+a\s+solu[cç][aã]o/i,
  /^Extrato\s+gerado\s+dia/i,
  /^N[aã]o\s+nos\s+responsabilizamos/i,
  /^Asseguramos/i,
  /^Nu\s+(?:Financeira|Pagamentos)/i,
  /^CNPJ:/i,
  /^CPF\s+[•\*]{3}/i,
  /^\d+\s+de\s+\d+\s*$/i,
];

/**
 * Detect if this is a Nubank bank statement with DD MMM YYYY format
 */
function isNubankStatement(text: string): boolean {
  const hasNubankHeader =
    /NUBANK/i.test(text) ||
    /NU\s*PAGAMENTOS/i.test(text) ||
    /Nu\s+Financeira/i.test(text);
  const hasNubankDates = NUBANK_DATE_PATTERN.test(text);
  return hasNubankHeader && hasNubankDates;
}

// Nubank transaction type classification rules (order matters: specific before generic)
const NUBANK_TYPE_RULES: Array<{ pattern: RegExp; type: TransactionType; kind?: string }> = [
  { pattern: /transfer[eê]ncia\s+recebida\s+(?:pelo\s+)?pix/i, type: "INCOME", kind: "PIX RECEBIDO" },
  { pattern: /transfer[eê]ncia\s+recebida/i, type: "INCOME", kind: "TRANSFERENCIA" },
  { pattern: /transfer[eê]ncia\s+enviada\s+(?:pelo\s+)?pix/i, type: "EXPENSE", kind: "PIX ENVIADO" },
  { pattern: /transfer[eê]ncia\s+enviada/i, type: "EXPENSE", kind: "TRANSFERENCIA" },
  { pattern: /compra\s+no\s+d[eé]bito/i, type: "EXPENSE", kind: "COMPRA DEBITO" },
  { pattern: /compra\s+no\s+cr[eé]dito/i, type: "EXPENSE", kind: "COMPRA CREDITO" },
  { pattern: /resgate\s+RDB/i, type: "INCOME" },
  { pattern: /aplica[cç][aã]o\s+RDB/i, type: "EXPENSE" },
  { pattern: /pagamento\s+(?:de\s+(?:fatura|boleto)|efetuado)/i, type: "EXPENSE", kind: "BOLETO" },
  { pattern: /resgate\s+de\s+empr[eé]stimo/i, type: "INCOME" },
  { pattern: /d[eé]bito\s+em\s+conta/i, type: "EXPENSE", kind: "DEBITO AUTO" },
];

/**
 * Determine transaction type and kind for Nubank transactions
 */
function getNubankTransactionType(description: string): { type: TransactionType; kind?: string } {
  for (const rule of NUBANK_TYPE_RULES) {
    if (rule.pattern.test(description)) {
      return { type: rule.type, kind: rule.kind };
    }
  }
  return { type: "EXPENSE" };
}

/**
 * Clean Nubank transaction description: remove bank details, CPF/CNPJ, amounts
 */
function cleanNubankDescription(firstLine: string): string {
  let desc = firstLine;

  // Remove amounts
  desc = desc.replace(new RegExp(AMOUNT_PATTERN.source, "g"), "").trim();

  // Truncate at masked CPF (- •••.XXX... or - ***.XXX...)
  desc = desc.replace(/\s*-?\s*[•\*]{2,}[\.\d].*$/, "").trim();

  // Truncate at CNPJ (- XX.XXX.XXX/XXXX-XX)
  desc = desc.replace(/\s*-?\s*\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}.*$/, "").trim();

  // Remove trailing dash/spaces
  desc = desc.replace(/\s*-\s*$/, "").trim();

  // Clean up whitespace
  desc = desc.replace(/\s+/g, " ").trim();

  return desc || "Transação";
}

/**
 * Extract transactions from a Nubank bank statement
 * Uses state tracking for dates since transactions don't have inline dates
 */
function extractNubankTransactions(
  text: string,
  confidence: number
): StatementTransaction[] {
  const transactions: StatementTransaction[] = [];
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  let currentDate: Date | null = null;
  let pendingTransaction: { firstLine: string; allLines: string[] } | null = null;

  function flushTransaction() {
    if (!pendingTransaction || !currentDate) return;

    const allText = pendingTransaction.allLines.join(" ");

    // Extract amounts from all collected text
    const amountRegex = new RegExp(AMOUNT_PATTERN.source, "g");
    const amounts: number[] = [];
    let match;
    while ((match = amountRegex.exec(allText)) !== null) {
      const amt = parseAmount(match[0]);
      if (amt !== 0) {
        amounts.push(amt);
      }
    }

    if (amounts.length === 0) return;

    // Use the last amount as the transaction value
    const rawAmount = amounts[amounts.length - 1];

    // Build description from first line, cleaned
    const description = cleanNubankDescription(pendingTransaction.firstLine);
    if (description.length < 3) return;

    const { type, kind } = getNubankTransactionType(description);

    transactions.push({
      date: new Date(currentDate),
      description,
      amount: type === "EXPENSE" ? -Math.abs(rawAmount) : Math.abs(rawAmount),
      type,
      transactionKind: kind,
      confidence,
    });
  }

  for (const line of lines) {
    // Check for date line (DD MMM YYYY) at start
    const dateMatch = line.match(NUBANK_DATE_PATTERN);
    if (dateMatch) {
      flushTransaction();
      pendingTransaction = null;
      const day = parseInt(dateMatch[1], 10);
      const monthAbbrev = dateMatch[2].toLowerCase();
      const month = MONTH_ABBREV[monthAbbrev];
      const year = parseInt(dateMatch[3], 10);
      if (month !== undefined) {
        currentDate = new Date(year, month, day);
      }
      // Date lines contain "Total de entradas/saídas" - skip content
      continue;
    }

    // Skip known noise lines
    if (NUBANK_SKIP_PATTERNS.some((p) => p.test(line))) {
      continue;
    }

    // Check if this line starts a new transaction
    if (NUBANK_TRANSACTION_STARTERS.some((p) => p.test(line))) {
      flushTransaction();
      pendingTransaction = { firstLine: line, allLines: [line] };
      continue;
    }

    // Continuation line for current transaction
    if (pendingTransaction) {
      pendingTransaction.allLines.push(line);
    }
  }

  // Flush last pending transaction
  flushTransaction();

  return transactions;
}

/**
 * Extract transactions from a single line
 */
function extractFromLine(
  line: string,
  confidence: number,
  invoiceReferenceDate?: Date,
  isCreditCard?: boolean
): StatementTransaction | null {
  // Try to find date in standard format (DD/MM/YYYY)
  let date: Date | null = null;
  let dateMatch: RegExpMatchArray | null = null;
  let referenceDate: Date | undefined = invoiceReferenceDate;

  for (const pattern of DATE_PATTERNS) {
    const matches = line.match(pattern);
    if (matches) {
      dateMatch = matches;
      const parts = matches[0].split(/[\/\-\.]/);
      if (parts.length >= 2) {
        date = parseDate(parts[0], parts[1], parts[2]);
        if (date) {
          if (!referenceDate) referenceDate = date;
          break;
        }
      }
    }
  }

  // For credit card invoices, try "DD mes" format if no standard date found
  if (!date && isCreditCard) {
    const abbrevMatch = line.match(CREDIT_CARD_LINE_DATE_PATTERN);
    if (abbrevMatch) {
      const day = parseInt(abbrevMatch[1], 10);
      const monthAbbrev = abbrevMatch[2].toLowerCase();
      const month = MONTH_ABBREV[monthAbbrev];

      if (month !== undefined && day >= 1 && day <= 31) {
        // Use reference date for year inference
        const refYear = referenceDate?.getFullYear() || new Date().getFullYear();
        const refMonth = referenceDate?.getMonth() ?? new Date().getMonth();

        // If transaction month > reference month, it's from the previous year
        let year = refYear;
        if (month > refMonth) {
          year = refYear - 1;
        }

        date = new Date(year, month, day);
        if (isNaN(date.getTime())) {
          date = null;
        } else {
          // Mark as found from abbreviation for description extraction
          dateMatch = abbrevMatch as RegExpMatchArray;
        }
      }
    }
  }

  if (!date) return null;

  // Try to find amount
  const amounts: number[] = [];
  const amountRegex = new RegExp(AMOUNT_PATTERN.source, "g");
  let match;

  while ((match = amountRegex.exec(line)) !== null) {
    const amount = parseAmount(match[0]);
    if (amount !== 0) {
      amounts.push(amount);
    }
  }

  if (amounts.length === 0) return null;

  // Use the last amount found (usually the transaction value)
  const amount = amounts[amounts.length - 1];

  // Extract description (text between date and amount)
  let description = line;

  // Remove the date part
  if (dateMatch) {
    description = description.replace(dateMatch[0], "").trim();
  }

  // Remove amount parts
  description = description.replace(amountRegex, "").trim();

  // Clean up description - remove leading special characters and whitespace
  description = description
    .replace(/^[□●○•\-\*\s]+/, "") // Remove leading bullets/markers
    .replace(/\s+/g, " ")
    .replace(/^[:\-\s]+|[:\-\s]+$/g, "")
    .trim();

  // Check if description still starts with a date in "DD mes" format (nested)
  // This can happen when the main line has a standard date format
  const descDateResult = extractDateFromDescription(description, referenceDate);
  if (descDateResult.date) {
    date = descDateResult.date;
    description = descDateResult.cleanDescription;
  }

  if (!description || description.length < 3) {
    description = "Transação";
  }

  const type = detectTransactionType(description, amount, line, isCreditCard);
  const transactionKind = detectTransactionKind(description);

  return {
    date,
    description,
    amount: type === "EXPENSE" ? -Math.abs(amount) : Math.abs(amount),
    type,
    transactionKind,
    confidence,
  };
}

/**
 * Deduplicate, sort, and build final parse result
 */
function buildParseResult(
  bank: string,
  transactions: StatementTransaction[]
): StatementParseResult {
  const uniqueTransactions = transactions.filter(
    (t, index, self) =>
      index ===
      self.findIndex(
        (other) =>
          other.date.getTime() === t.date.getTime() &&
          other.description === t.description &&
          other.amount === t.amount
      )
  );

  uniqueTransactions.sort((a, b) => a.date.getTime() - b.date.getTime());

  const averageConfidence =
    uniqueTransactions.length > 0
      ? uniqueTransactions.reduce((sum, t) => sum + t.confidence, 0) /
        uniqueTransactions.length
      : 0;

  return {
    bank,
    transactions: uniqueTransactions,
    averageConfidence,
  };
}

/**
 * Main function to parse statement text from OCR
 */
export function parseStatementText(
  text: string,
  ocrConfidence: number
): StatementParseResult {
  const bank = detectBank(text);
  const transactions: StatementTransaction[] = [];

  // Detect if this is a credit card invoice
  const isCreditCard = isCreditCardInvoice(text);

  // Detect if this is a C6 Bank statement
  const isC6 = isC6Statement(text);

  // Detect if this is a Nubank bank statement (DD MMM YYYY format)
  const isNubank = isNubankStatement(text);

  // For Nubank statements, use dedicated parser with state tracking
  if (isNubank) {
    const nubankTransactions = extractNubankTransactions(text, ocrConfidence);
    return buildParseResult("Extrato Nubank", nubankTransactions);
  }

  // For credit card invoices, try to extract the due date as reference
  const invoiceDueDate = isCreditCard ? extractInvoiceDueDate(text) : null;

  // Split text into lines and process each
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 5);

  for (const line of lines) {
    // Skip "Saldo do dia" lines (C6 balance summaries)
    if (/^Saldo\s+do\s+dia/i.test(line)) {
      continue;
    }

    let transaction: StatementTransaction | null = null;

    // Try C6-specific parser first if detected as C6 statement
    if (isC6) {
      transaction = extractFromC6Line(line, ocrConfidence);
    }

    // Fall back to generic parser if C6 parser didn't match
    if (!transaction) {
      transaction = extractFromLine(
        line,
        ocrConfidence,
        invoiceDueDate || undefined,
        isCreditCard
      );
    }

    if (transaction) {
      transactions.push(transaction);
    }
  }

  return buildParseResult(bank, transactions);
}

/**
 * Suggested category based on transaction kind
 */
export function suggestCategoryForStatement(
  transactionKind?: string
): string | null {
  if (!transactionKind) return null;

  const categoryMap: Record<string, string> = {
    "PIX RECEBIDO": "Outros",
    "PIX ENVIADO": "Outros",
    "TED RECEBIDO": "Outros",
    "TED ENVIADO": "Outros",
    BOLETO: "Serviços",
    "DEBITO AUTO": "Serviços",
    TARIFA: "Serviços",
    SAQUE: "Outros",
    DEPOSITO: "Outros",
    RENDIMENTO: "Investimentos",
    "COMPRA DEBITO": "Compras",
    "COMPRA CREDITO": "Compras",
  };

  return categoryMap[transactionKind.toUpperCase()] || null;
}
