import type { StatementTransaction, StatementParseResult, TransactionType } from "@/types";

/**
 * Patterns for detecting purchase notifications from bank apps
 * These are push notification screenshots, not bank statements
 */

// Pattern: "no valor de R$ XX,XX, dia DD/MM/YYYY às HH:MM, em ESTABELECIMENTO, foi aprovada"
const PURCHASE_NOTIFICATION_PATTERN =
  /(?:compra|pagamento).*?(?:no\s+valor\s+de|de)\s+R\$\s*([\d.,]+).*?dia\s+(\d{1,2}\/\d{1,2}\/\d{2,4}).*?(?:[àa]s\s+\d{1,2}:\d{2})?.*?(?:,\s*)?em\s+([^,]+?)(?:,\s*(?:foi\s+)?aprovad|$)/i;

// Pattern: "Compra aprovada de R$ XX,XX em ESTABELECIMENTO dia DD/MM/YYYY"
// Also matches: "Compra aprovada no valor de R$ XX,XX em ESTABELECIMENTO dia DD/MM/YYYY"
const SIMPLE_PURCHASE_PATTERN =
  /(?:compra|pagamento)\s+aprovad[ao]?\s+(?:(?:no\s+valor\s+)?de\s+)?R\$\s*([\d.,]+)\s+em\s+(.+?)\s+dia\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i;

// Pattern: "no valor de R$ XX,XX, dia DD/MM/YYYY ... em ESTABELECIMENTO" (without "aprovada" at end)
const VALUE_DATE_ESTABLISHMENT_PATTERN =
  /(?:compra|pagamento).*?(?:no\s+valor\s+de|de)\s+R\$\s*([\d.,]+).*?dia\s+(\d{1,2}\/\d{1,2}\/\d{2,4}).*?em\s+([A-Z][A-Z0-9\s]+?)(?:\.|,|$)/i;

// PIX sent: "PIX enviado de R$ XX,XX para NOME em DD/MM/YYYY"
const PIX_SENT_PATTERN =
  /PIX\s+enviado\s+de\s+R\$\s*([\d.,]+)\s+para\s+(.+?)\s+em\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i;

// PIX received: "PIX recebido de R$ XX,XX de NOME em DD/MM/YYYY"
const PIX_RECEIVED_PATTERN =
  /PIX\s+recebido\s+de\s+R\$\s*([\d.,]+)\s+de\s+(.+?)\s+em\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i;

// Bank detection from notification text
const NOTIFICATION_BANK_PATTERNS: Record<string, RegExp> = {
  "C6 Bank": /C6\s*(?:Bank)?/i,
  "Nubank": /Nu(?:bank)?/i,
  "Itaú": /Ita[uú]/i,
  "Bradesco": /Bradesco/i,
  "Santander": /Santander/i,
  "Banco do Brasil": /Banco\s+do\s+Brasil|BB/i,
  "Caixa": /Caixa/i,
  "BTG": /BTG/i,
};

// Credit vs debit detection
const CREDIT_PURCHASE = /cr[eé]dito/i;
const DEBIT_PURCHASE = /d[eé]bito/i;

/**
 * Parse Brazilian currency amount string
 */
function parseAmount(amountStr: string): number {
  const cleaned = amountStr.replace(/\./g, "").replace(",", ".");
  const value = parseFloat(cleaned);
  return isNaN(value) ? 0 : value;
}

/**
 * Parse date from DD/MM/YYYY format
 */
function parseDateStr(dateStr: string): Date | null {
  const parts = dateStr.split("/");
  if (parts.length < 2) return null;

  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parts[2]
    ? parseInt(parts[2], 10) < 100
      ? 2000 + parseInt(parts[2], 10)
      : parseInt(parts[2], 10)
    : new Date().getFullYear();

  if (day < 1 || day > 31 || month < 0 || month > 11) return null;

  const date = new Date(year, month, day);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Detect bank from notification text
 */
function detectNotificationBank(text: string): string {
  for (const [bank, pattern] of Object.entries(NOTIFICATION_BANK_PATTERNS)) {
    if (pattern.test(text)) {
      return bank;
    }
  }
  return "Notificação";
}

/**
 * Check if text looks like a purchase/transaction notification
 */
function isNotificationText(text: string): boolean {
  const notificationIndicators = [
    /compra.*aprovad/i,
    /compra.*cart[aã]o/i,
    /compra.*valor/i,
    /PIX\s+(?:enviado|recebido)/i,
    /cart[aã]o\s+final/i,
    /foi\s+aprovad/i,
  ];

  return notificationIndicators.some((p) => p.test(text));
}

/**
 * Parse purchase notification text and extract transaction data.
 * Handles screenshots of bank app push notifications (Telegram, SMS, etc.)
 *
 * Returns null if text doesn't match any notification pattern.
 */
export function parseNotificationText(
  text: string,
  ocrConfidence: number
): StatementParseResult | null {
  if (!text || !isNotificationText(text)) {
    return null;
  }

  // Normalize text: join lines, collapse whitespace
  const normalized = text.replace(/\n/g, " ").replace(/\s+/g, " ").trim();
  const bank = detectNotificationBank(normalized);

  // Try PIX patterns first (more specific)
  const pixSent = normalized.match(PIX_SENT_PATTERN);
  if (pixSent) {
    const amount = parseAmount(pixSent[1]);
    const date = parseDateStr(pixSent[3]);
    if (date && amount > 0) {
      return {
        bank,
        transactions: [
          {
            date,
            description: `PIX para ${pixSent[2].trim()}`,
            amount: -amount,
            type: "EXPENSE",
            transactionKind: "PIX ENVIADO",
            confidence: ocrConfidence,
          },
        ],
        averageConfidence: ocrConfidence,
      };
    }
  }

  const pixReceived = normalized.match(PIX_RECEIVED_PATTERN);
  if (pixReceived) {
    const amount = parseAmount(pixReceived[1]);
    const date = parseDateStr(pixReceived[3]);
    if (date && amount > 0) {
      return {
        bank,
        transactions: [
          {
            date,
            description: `PIX de ${pixReceived[2].trim()}`,
            amount,
            type: "INCOME",
            transactionKind: "PIX RECEBIDO",
            confidence: ocrConfidence,
          },
        ],
        averageConfidence: ocrConfidence,
      };
    }
  }

  // Try purchase notification patterns
  let match = normalized.match(PURCHASE_NOTIFICATION_PATTERN);
  if (!match) {
    match = normalized.match(SIMPLE_PURCHASE_PATTERN);
    if (match) {
      // Reorder captures to match: [_, amount, date, establishment]
      // SIMPLE pattern: [_, amount, establishment, date]
      match = [match[0], match[1], match[3], match[2]] as unknown as RegExpMatchArray;
    }
  }
  if (!match) {
    match = normalized.match(VALUE_DATE_ESTABLISHMENT_PATTERN);
  }

  if (!match) return null;

  const amount = parseAmount(match[1]);
  const date = parseDateStr(match[2]);
  const establishment = match[3].trim();

  if (!date || amount === 0 || !establishment) return null;

  // Determine transaction kind
  let transactionKind = "COMPRA CREDITO";
  if (DEBIT_PURCHASE.test(normalized)) {
    transactionKind = "COMPRA DEBITO";
  } else if (CREDIT_PURCHASE.test(normalized)) {
    transactionKind = "COMPRA CREDITO";
  }

  const transaction: StatementTransaction = {
    date,
    description: establishment,
    amount: -amount, // Purchases are always expenses
    type: "EXPENSE" as TransactionType,
    transactionKind,
    confidence: ocrConfidence,
  };

  return {
    bank,
    transactions: [transaction],
    averageConfidence: ocrConfidence,
  };
}
