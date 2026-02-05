import prisma from "./db";
import type { BillPayment } from "@/types";

/**
 * Patterns to detect carryover transactions during import.
 * These patterns match descriptions in credit card statements that indicate
 * carried-over balance, financed amounts, or minimum payments from previous bills.
 */
export const CARRYOVER_PATTERNS: RegExp[] = [
  /SALDO\s*ANTERIOR/i,
  /SALDO\s*FATURA\s*ANT/i,
  /SALDO\s*ROTATIVO/i,
  /ROTATIVO/i,
  /FINANC(?:IAMENTO)?\s*FATURA/i,
  /PARCELAMENTO\s*(?:DE\s*)?FATURA/i,
  /PGTO\s*MINIMO/i,
  /PAGAMENTO\s*MINIMO/i,
];

/**
 * Check if a transaction description matches any carryover pattern.
 * Used during import to identify transactions that represent carried-over
 * balances from previous credit card bills.
 *
 * @param description - The transaction description to check
 * @returns true if the description matches a carryover pattern
 *
 * @example
 * isCarryoverTransaction("SALDO ROTATIVO") // true
 * isCarryoverTransaction("NETFLIX SUBSCRIPTION") // false
 */
export function isCarryoverTransaction(description: string): boolean {
  const upperDesc = description.toUpperCase();

  for (const pattern of CARRYOVER_PATTERNS) {
    if (pattern.test(upperDesc)) {
      return true;
    }
  }

  return false;
}

/**
 * Parameters for finding a matching bill payment.
 */
export interface FindMatchingBillPaymentParams {
  /** The origin (card name) of the transaction */
  origin: string;
  /** The month of the imported transaction (1-12) */
  month: number;
  /** The year of the imported transaction */
  year: number;
  /** The amount of the carryover transaction (absolute value) */
  amount: number;
  /** The user ID to scope the search */
  userId: string;
}

/**
 * Get the previous month and year, handling the January edge case.
 *
 * @param month - Current month (1-12)
 * @param year - Current year
 * @returns Object with previous month and year
 */
export function getPreviousMonth(
  month: number,
  year: number
): { month: number; year: number } {
  if (month === 1) {
    return { month: 12, year: year - 1 };
  }
  return { month: month - 1, year };
}

/**
 * Find a pending BillPayment that matches the imported carryover transaction.
 *
 * Matching criteria:
 * - Same origin (card)
 * - Previous month (billMonth/Year = month-1)
 * - Amount within tolerance (+/-50% to account for interest)
 * - Not yet linked (linkedTransactionId = null)
 *
 * @param params - The search parameters
 * @returns The matching BillPayment or null if not found
 *
 * @example
 * // Transaction imported in Feb/2026 for R$ 2,150
 * const match = await findMatchingBillPayment({
 *   origin: "Nubank",
 *   month: 2,
 *   year: 2026,
 *   amount: 2150,
 *   userId: "user123"
 * });
 * // Returns BillPayment from Jan/2026 with amountCarried ~R$ 2,000
 */
export async function findMatchingBillPayment(
  params: FindMatchingBillPaymentParams
): Promise<BillPayment | null> {
  const { origin, month, year, amount, userId } = params;

  // Get previous month/year (the bill being carried over)
  const prevPeriod = getPreviousMonth(month, year);

  // Amount tolerance: +/-50% to account for interest charges
  const tolerance = 0.5;
  const minAmount = amount * (1 - tolerance);
  const maxAmount = amount * (1 + tolerance);

  // Find pending bill payments that match the criteria
  const billPayments = await prisma.billPayment.findMany({
    where: {
      userId,
      origin,
      billMonth: prevPeriod.month,
      billYear: prevPeriod.year,
      linkedTransactionId: null, // Not yet linked
      amountCarried: {
        gte: minAmount,
        lte: maxAmount,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (billPayments.length === 0) {
    return null;
  }

  // Return the most recent matching bill payment
  // Cast to BillPayment type to match the interface
  const payment = billPayments[0];
  return {
    id: payment.id,
    billMonth: payment.billMonth,
    billYear: payment.billYear,
    origin: payment.origin,
    totalBillAmount: payment.totalBillAmount,
    amountPaid: payment.amountPaid,
    amountCarried: payment.amountCarried,
    paymentType: payment.paymentType as "PARTIAL" | "FINANCED",
    installmentId: payment.installmentId ?? undefined,
    interestRate: payment.interestRate ?? undefined,
    interestAmount: payment.interestAmount ?? undefined,
    entryTransactionId: payment.entryTransactionId ?? undefined,
    carryoverTransactionId: payment.carryoverTransactionId ?? undefined,
    linkedTransactionId: payment.linkedTransactionId ?? undefined,
    userId: payment.userId,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt,
  };
}

/**
 * Result of interest calculation.
 */
export interface InterestCalculation {
  /** The interest rate as a percentage (e.g., 7.5 for 7.5%) */
  rate: number;
  /** The absolute interest amount in currency */
  amount: number;
}

/**
 * Calculate interest rate and amount from the difference between
 * expected (carried) and actual (imported) amounts.
 *
 * @param expectedAmount - The amount that was carried over (from BillPayment.amountCarried)
 * @param actualAmount - The actual amount found in the imported transaction
 * @returns Object with interest rate (percentage) and interest amount
 *
 * @example
 * // Expected R$ 2,000, imported R$ 2,150
 * const interest = calculateInterest(2000, 2150);
 * // { rate: 7.5, amount: 150 }
 */
export function calculateInterest(
  expectedAmount: number,
  actualAmount: number
): InterestCalculation {
  // Use absolute values to handle both positive and negative amounts
  const expected = Math.abs(expectedAmount);
  const actual = Math.abs(actualAmount);

  // Calculate the difference (interest amount)
  const interestAmount = actual - expected;

  // Calculate the rate as a percentage
  // Avoid division by zero
  const rate = expected > 0 ? (interestAmount / expected) * 100 : 0;

  return {
    rate: Math.round(rate * 100) / 100, // Round to 2 decimal places
    amount: Math.round(interestAmount * 100) / 100, // Round to 2 decimal places
  };
}
