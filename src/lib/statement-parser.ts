import type { StatementTransaction, StatementParseResult, TransactionType } from "@/types";
import { deduplicateTransactions } from "@/lib/dedup";

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

  // Check for negative indicator — U+002D HYPHEN-MINUS or U+2212 MINUS SIGN
  // (Nubank PDFs use U+2212 for negative amounts; most other sources use U+002D)
  const isNegative = /[−-]/.test(cleaned) || cleaned.endsWith("D");

  // Remove signs and D/C indicators
  cleaned = cleaned.replace(/[−\-+CD]/g, "").trim();

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
  const uniqueTransactions = deduplicateTransactions(transactions);

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

// ===== Credit Card Invoice Screenshots (multi-bank OCR) =====

// Noise patterns to skip in credit card invoice screenshots
const CARD_SCREENSHOT_NOISE_PATTERNS = [
  /^\d{2}:\d{2}/,                           // Status bar time (08:51)
  /Fatura\s*(?:do\s*)?cart/i,               // Header title (any bank)
  /^[<>←→]/,                                // Navigation arrows
  /^(Janeiro|Fevereiro|Mar[cç]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)/i,
  /^(larço|Mai:|lar[cç]o)/i,                // OCR-garbled month tab names
  /^Valor\s*(?:total)?$/i,                   // Total section label
  /^Valor\s*(?:da\s*)?fatura/i,             // Invoice total label
  /^Vence\s*em/i,                            // Due date
  /^Vencimento/i,                            // Due date variant
  /^Antecipar$/i,                            // Button text
  /Em\s*processamento/i,                     // Processing status
  /^DADO$/i,                                 // OCR-garbled date
  /^Cart[aã]o\s*final/i,                    // Card info line (C6)
  /^Pagamento\s*m[ií]nimo/i,                // Minimum payment
  /^Limite\s*dispon[ií]vel/i,               // Available limit
  /^Melhor\s*dia/i,                          // Best payment day
  /^Fechar\s*fatura/i,                       // Close invoice
  /^Pagar$/i,                                // Pay button
  /^Copiar$/i,                               // Copy button
  /^Compartilhar$/i,                         // Share button
  /^[A-Z]{2,4}\s*$/,                         // Short garbled text (SED, TER, etc.)
  /^[□●○•\-\*\s]+$/,                        // Bullet/marker only lines
];

// Date-only line: DD/MM
const DATE_SLASH_ONLY = /^(\d{1,2})\/(\d{1,2})$/;
// Date-only line: DD MMM (e.g., "14 MAR", "03 ABR")
const DATE_ABBREV_ONLY = /^(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)$/i;

/**
 * Detect if OCR text is from a credit card invoice screenshot (any bank).
 * Uses multiple signals:
 *   - "Fatura do cartão" / "Fatura" header
 *   - "Cartão final XXXX" lines (C6)
 *   - Credit card layout: date-only lines + R$ amounts
 */
export function isCreditCardScreenshot(text: string): boolean {
  const hasFaturaHeader = /Fatura\s*(?:do\s*)?cart[aã]o/i.test(text);
  const cartaoFinalCount = (text.match(/Cart[aã]o\s*final\s*\d{4}/gi) || []).length;

  // C6 specific: header + card line, or 2+ card lines
  if ((hasFaturaHeader && cartaoFinalCount >= 1) || cartaoFinalCount >= 2) {
    return true;
  }

  // Generic: "Fatura" header + date-only lines + R$ amounts
  if (hasFaturaHeader || /^Fatura$/im.test(text)) {
    const lines = text.split("\n").map((l) => l.trim());
    const hasDateOnlyLines = lines.some(
      (l) => DATE_SLASH_ONLY.test(l) || DATE_ABBREV_ONLY.test(l)
    );
    const hasAmounts = /R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/.test(text);
    if (hasDateOnlyLines && hasAmounts) return true;
  }

  return false;
}

// Keep old name as alias for backwards compatibility in tests
export const isC6CreditCardInvoice = isCreditCardScreenshot;

/**
 * Detect which bank a credit card screenshot belongs to.
 */
function detectCardScreenshotBank(text: string): string {
  if (/Cart[aã]o\s*final/i.test(text) || /C6/i.test(text)) return "Fatura C6";
  if (/NUBANK/i.test(text) || /NU\b/i.test(text)) return "Fatura Nubank";
  if (/BTG/i.test(text)) return "Fatura BTG";
  if (/ITA[UÚ]/i.test(text)) return "Fatura Itaú";
  if (/BRADESCO/i.test(text)) return "Fatura Bradesco";
  if (/SANTANDER/i.test(text)) return "Fatura Santander";
  if (/INTER/i.test(text)) return "Fatura Inter";
  return "Fatura Cartão";
}

/**
 * Parse a date-only line in either DD/MM or DD MMM format.
 * Returns null if the line is not a date-only line.
 */
function parseDateOnlyLine(line: string): Date | null {
  const currentYear = new Date().getFullYear();

  // DD/MM
  const slashMatch = line.match(DATE_SLASH_ONLY);
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      return new Date(currentYear, month, day);
    }
  }

  // DD MMM
  const abbrevMatch = line.match(DATE_ABBREV_ONLY);
  if (abbrevMatch) {
    const day = parseInt(abbrevMatch[1], 10);
    const monthStr = abbrevMatch[2].toLowerCase();
    const month = MONTH_ABBREV[monthStr];
    if (month !== undefined && day >= 1 && day <= 31) {
      return new Date(currentYear, month, day);
    }
  }

  return null;
}

/**
 * Extract transactions from credit card invoice screenshots (OCR text).
 * Works for any bank. Handles two common layouts:
 *
 * Layout A (C6): amount on the SAME line as description
 *   DD/MM
 *   DESCRIPTION R$ XX,XX
 *   Cartão final 6604
 *
 * Layout B (Nubank, Inter, etc.): amount on a SEPARATE line
 *   DD MMM
 *   DESCRIPTION
 *   R$ XX,XX
 */
export function extractCreditCardScreenshotTransactions(
  text: string,
  confidence: number
): StatementTransaction[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const transactions: StatementTransaction[] = [];
  let currentDate: Date | null = null;
  let pendingDescription: string | null = null;

  // Strict amount pattern: requires "R$" prefix
  const amountPattern = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;

  function flushPending() {
    pendingDescription = null;
  }

  for (const line of lines) {
    // Skip noise lines
    if (CARD_SCREENSHOT_NOISE_PATTERNS.some((p) => p.test(line))) {
      // Noise after date+desc but before amount → discard pending
      if (pendingDescription && /^Cart[aã]o\s*final/i.test(line)) {
        // Card info line — don't discard pending, amount may follow
        continue;
      }
      flushPending();
      continue;
    }

    // Date-only line
    const dateFromLine = parseDateOnlyLine(line);
    if (dateFromLine) {
      flushPending();
      currentDate = dateFromLine;
      continue;
    }

    if (!currentDate) continue;

    // Check if line has an amount
    const amountMatch = line.match(amountPattern);

    if (amountMatch) {
      const amountStr = amountMatch[1];
      const amount = parseFloat(
        amountStr.replace(/\./g, "").replace(",", ".")
      );
      if (amount <= 0) continue;

      // Layout A: DESCRIPTION R$ XX,XX (amount on same line as description)
      const amountIndex = line.indexOf(amountMatch[0]);
      const inlineDesc = line
        .substring(0, amountIndex)
        .replace(/\s+/g, " ")
        .replace(/^[□●○•\-\*\s]+/, "")
        .trim();

      let description: string;
      if (inlineDesc.length >= 2) {
        // Amount was on same line as description (Layout A)
        description = inlineDesc;
      } else if (pendingDescription) {
        // Amount was on separate line (Layout B) — use pending description
        description = pendingDescription;
      } else {
        // Standalone amount with no date+description context — skip (likely a total)
        continue;
      }

      transactions.push({
        date: new Date(currentDate),
        description,
        amount: -Math.abs(amount), // Credit card purchases are expenses
        type: "EXPENSE",
        confidence,
      });

      currentDate = null;
      flushPending();
    } else {
      // No amount — this might be a description line (Layout B)
      const cleanLine = line
        .replace(/\s+/g, " ")
        .replace(/^[□●○•\-\*\s]+/, "")
        .trim();

      if (cleanLine.length >= 2) {
        pendingDescription = cleanLine;
      }
    }
  }

  return transactions;
}

// Keep old name as alias for backwards compatibility in tests
export const extractC6CreditCardTransactions = extractCreditCardScreenshotTransactions;

// ===== Nubank credit card invoice format (PDF) =====

// Invoice header: "FATURA 13 ABR 2026" — used as year reference
const NUBANK_INVOICE_HEADER_PATTERN =
  /FATURA\s+(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})/i;

// Purchase line: "04 MAR •••• 3746 Odp-Outlet D*Odptech - Parcela 2/2 R$ 31,78"
// Captures: day, month, card4, description, amount (with optional minus sign)
const NUBANK_INVOICE_PURCHASE_PATTERN =
  /^(\d{1,2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+[•·\*]{2,}\s*(\d{4})\s+(.+?)\s+([−\-]?\s*R\$\s*[\d.,]+)\s*$/i;

/**
 * Detect if this is a Nubank credit card invoice PDF.
 * Signals (need at least 2): Nubank brand + FATURA header / TRANSAÇÕES section /
 * "Total a pagar" / purchase lines with "DD MMM •••• NNNN".
 */
function isNubankCreditCardInvoice(text: string): boolean {
  const hasNubankRef =
    /NUBANK/i.test(text) ||
    /Nu\s*Pagamentos/i.test(text) ||
    /Nu\s*Financeira/i.test(text);
  if (!hasNubankRef) return false;

  const hasInvoiceHeader = NUBANK_INVOICE_HEADER_PATTERN.test(text);
  const hasTransactionSection =
    /TRANSA[CÇ][OÕ]ES\s+DE\s+\d{1,2}\s+\w+\s+A\s+\d{1,2}\s+\w+/i.test(text);
  const hasTotalAPagar = /Total\s+a\s+pagar/i.test(text);
  const hasPurchaseLines =
    /\d{1,2}\s+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+[•·\*]{2,}\s*\d{4}/i.test(
      text
    );

  const signalCount = [
    hasInvoiceHeader,
    hasTransactionSection,
    hasTotalAPagar,
    hasPurchaseLines,
  ].filter(Boolean).length;
  return signalCount >= 2;
}

/**
 * Extract invoice FATURA date (used to infer transaction year).
 */
function extractNubankInvoiceDate(text: string): Date | null {
  const match = text.match(NUBANK_INVOICE_HEADER_PATTERN);
  if (!match) return null;
  const day = parseInt(match[1], 10);
  const month = MONTH_ABBREV[match[2].toLowerCase()];
  const year = parseInt(match[3], 10);
  if (month === undefined) return null;
  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Parse a single Nubank invoice purchase line.
 */
function parseNubankInvoicePurchase(
  line: string,
  referenceDate: Date,
  confidence: number
): StatementTransaction | null {
  const match = line.match(NUBANK_INVOICE_PURCHASE_PATTERN);
  if (!match) return null;

  const day = parseInt(match[1], 10);
  const month = MONTH_ABBREV[match[2].toLowerCase()];
  if (month === undefined || day < 1 || day > 31) return null;

  // Infer year: if transaction month > reference month, it's from previous year
  // (e.g., invoice FATURA is JAN 2026, transaction is DEZ → DEZ 2025)
  const refMonth = referenceDate.getMonth();
  const refYear = referenceDate.getFullYear();
  const year = month > refMonth ? refYear - 1 : refYear;

  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) return null;

  const description = match[4].trim();
  if (description.length < 2) return null;

  const rawAmount = parseAmount(match[5]);
  if (rawAmount === 0) return null;

  // parseAmount already applies the minus sign (U+2212 or U+002D) to the value.
  // Negative purchase → refund/estorno (INCOME). Positive → regular purchase (EXPENSE).
  const type: TransactionType = rawAmount < 0 ? "INCOME" : "EXPENSE";

  return {
    date,
    description,
    amount: type === "EXPENSE" ? -Math.abs(rawAmount) : Math.abs(rawAmount),
    type,
    confidence,
  };
}

/**
 * Extract purchase transactions from a Nubank credit card invoice PDF.
 * Only parses lines with the "DD MMM •••• NNNN" card marker — fees,
 * payments and interest lines are intentionally skipped.
 */
export function extractNubankCreditCardInvoiceTransactions(
  text: string,
  confidence: number
): StatementTransaction[] {
  const referenceDate = extractNubankInvoiceDate(text) || new Date();
  const transactions: StatementTransaction[] = [];

  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines) {
    const tx = parseNubankInvoicePurchase(line, referenceDate, confidence);
    if (tx) transactions.push(tx);
  }

  return transactions;
}

// ===== Itaú credit card invoice screenshot format =====

// Date header: "ontem, 18 de abril" or "15 de abril" (lowercase month, optional "ontem,")
const ITAU_INVOICE_DATE_PATTERN =
  /^(?:ontem,?\s*)?(\d{1,2})\s+de\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s*$/i;

// Card type line (noise): "cartão físico", "cartão virtual em 2x"
const ITAU_CARD_TYPE_PATTERN =
  /^cart[aã]o\s+(?:f[ií]sico|virtual)(?:\s+em\s+\d+x)?\s*$/i;

/**
 * Detect Itaú credit card invoice screenshot: multiple "DD de MONTH" headers +
 * "cartão físico/virtual" sub-labels + R$ amounts.
 */
function isItauInvoiceScreenshot(text: string): boolean {
  const lines = text.split("\n").map((l) => l.trim());
  const dateHeaders = lines.filter((l) => ITAU_INVOICE_DATE_PATTERN.test(l)).length;
  const cardTypes = lines.filter((l) => ITAU_CARD_TYPE_PATTERN.test(l)).length;
  const hasAmounts = /R\$\s*\d{1,3}(?:\.\d{3})*,\d{2}/.test(text);
  return dateHeaders >= 1 && cardTypes >= 1 && hasAmounts;
}

/**
 * Strip OCR noise from start of inline description.
 * Tesseract often prepends icon glyphs as 1-3 char tokens (e.g., "BP", "CC)", "6 ").
 * Only strip the leading token when the rest still has a real merchant word (≥4 alpha chars).
 */
function cleanItauInlineDescription(text: string): string {
  const trimmed = text.replace(/^[^a-zA-Z0-9*]+/, "").trim();
  const match = trimmed.match(/^(\S{1,3})\s+(.+)$/);
  if (match && /[a-zA-Z]{4,}/.test(match[2])) {
    return match[2].replace(/\s+/g, " ").trim();
  }
  return trimmed.replace(/\s+/g, " ").trim();
}

/**
 * Detect lines that are pure noise (status bar, navigation icons).
 */
function isItauNoiseLine(line: string): boolean {
  if (/^\d{1,2}:\d{2}/.test(line)) return true; // status bar time
  if (line.length <= 6 && /^[<>←→]/.test(line)) return true; // back/nav arrows
  if (/^[^a-zA-Z0-9]+$/.test(line)) return true; // symbols only
  return false;
}

/**
 * Extract transactions from an Itaú credit card invoice screenshot.
 * Uses state tracking: date headers + pending description + amount lines.
 *
 * `referenceDate` is used to infer the year for "DD de MONTH" headers (which
 * don't carry the year). Defaults to `new Date()` — pass an explicit value
 * in tests to avoid time-dependent behavior.
 */
export function extractItauInvoiceTransactions(
  text: string,
  confidence: number,
  referenceDate: Date = new Date()
): StatementTransaction[] {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const transactions: StatementTransaction[] = [];
  let currentDate: Date | null = null;
  let pendingDescription: string | null = null;

  const refYear = referenceDate.getFullYear();
  const refMonth = referenceDate.getMonth();

  const amountPattern = /R\$\s*(\d{1,3}(?:\.\d{3})*,\d{2})/;

  for (const line of lines) {
    const dateMatch = line.match(ITAU_INVOICE_DATE_PATTERN);
    if (dateMatch) {
      const day = parseInt(dateMatch[1], 10);
      const monthName = dateMatch[2].toLowerCase().replace("ç", "c");
      const month = MONTH_FULL[monthName];
      if (month !== undefined && day >= 1 && day <= 31) {
        // If month is in the future relative to today, it's from the previous year
        const year = month > refMonth ? refYear - 1 : refYear;
        currentDate = new Date(year, month, day);
        pendingDescription = null;
      }
      // Invalid date lookup → keep previous state, don't silently re-attribute
      continue;
    }

    if (ITAU_CARD_TYPE_PATTERN.test(line)) continue;

    const amountMatch = line.match(amountPattern);
    if (amountMatch) {
      if (!currentDate) continue;

      const amount = parseAmount(amountMatch[0]);
      if (amount <= 0) continue;

      const amountStart = line.indexOf(amountMatch[0]);
      const inlineDesc = cleanItauInlineDescription(line.substring(0, amountStart));

      let description: string;
      if (pendingDescription && pendingDescription.length >= 2) {
        description = pendingDescription;
      } else if (inlineDesc.length >= 3 && /[a-zA-Z]/.test(inlineDesc)) {
        description = inlineDesc;
      } else {
        pendingDescription = null;
        continue;
      }

      transactions.push({
        date: new Date(currentDate),
        description,
        amount: -Math.abs(amount),
        type: "EXPENSE",
        confidence,
      });

      pendingDescription = null;
      continue;
    }

    if (isItauNoiseLine(line)) continue;

    if (line.length >= 2) {
      pendingDescription = line;
    }
  }

  return transactions;
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

  // Detect credit card invoice screenshots (any bank) before checking bank statements
  if (isCreditCardScreenshot(text)) {
    const cardTransactions = extractCreditCardScreenshotTransactions(text, ocrConfidence);
    if (cardTransactions.length > 0) {
      return buildParseResult(detectCardScreenshotBank(text), cardTransactions);
    }
  }

  // Detect Nubank credit card invoice PDF (must come before Nubank bank statement
  // check, since invoices also contain "Nubank" + "DD MMM YYYY" headers)
  if (isNubankCreditCardInvoice(text)) {
    const invoiceTxs = extractNubankCreditCardInvoiceTransactions(
      text,
      ocrConfidence
    );
    return buildParseResult("Fatura Nubank", invoiceTxs);
  }

  // Detect Itaú credit card invoice screenshot (uses "DD de MONTH" +
  // "cartão físico/virtual" layout — different from "Fatura" header screenshots)
  if (isItauInvoiceScreenshot(text)) {
    const itauTxs = extractItauInvoiceTransactions(text, ocrConfidence);
    if (itauTxs.length > 0) {
      return buildParseResult("Fatura Itaú", itauTxs);
    }
  }

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
