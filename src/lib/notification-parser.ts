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
  "C6 Bank": /\bC6\s*Bank\b/i,
  "Nubank": /\bNubank\b/i,
  "Itaú": /\bIta[uú]\b/i,
  "Bradesco": /\bBradesco\b/i,
  "Santander": /\bSantander\b/i,
  "Banco do Brasil": /Banco\s+do\s+Brasil|\bBB\b/i,
  "Caixa": /\bCaixa\s*(?:Econ[oô]mica|Federal)\b/i,
  "BTG": /\bBTG\b/i,
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
  // Try purchase notification patterns and extract amount, date, establishment
  let amountStr: string | undefined;
  let dateStr: string | undefined;
  let establishmentStr: string | undefined;

  const mainMatch = normalized.match(PURCHASE_NOTIFICATION_PATTERN);
  if (mainMatch) {
    amountStr = mainMatch[1];
    dateStr = mainMatch[2];
    establishmentStr = mainMatch[3];
  }

  if (!amountStr) {
    const simpleMatch = normalized.match(SIMPLE_PURCHASE_PATTERN);
    if (simpleMatch) {
      amountStr = simpleMatch[1];
      establishmentStr = simpleMatch[2];
      dateStr = simpleMatch[3];
    }
  }

  if (!amountStr) {
    const valueMatch = normalized.match(VALUE_DATE_ESTABLISHMENT_PATTERN);
    if (valueMatch) {
      amountStr = valueMatch[1];
      dateStr = valueMatch[2];
      establishmentStr = valueMatch[3];
    }
  }

  if (!amountStr || !dateStr || !establishmentStr) return null;

  const amount = parseAmount(amountStr);
  const date = parseDateStr(dateStr);
  const establishment = establishmentStr.trim();

  if (!date || amount === 0 || !establishment) return null;

  // Determine transaction kind
  const transactionKind = DEBIT_PURCHASE.test(normalized)
    ? "COMPRA DEBITO"
    : "COMPRA CREDITO";

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
