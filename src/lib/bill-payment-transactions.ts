import prisma from "@/lib/db";
import { BillPaymentType } from "@/types";

/**
 * Month names in Portuguese for transaction descriptions
 */
const MONTH_NAMES = [
  "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
];

/**
 * Format month/year label (e.g., "Jan/2026")
 */
function formatBillLabel(month: number, year: number): string {
  return `${MONTH_NAMES[month - 1]}/${year}`;
}

/**
 * Get the next month and year from a given month/year
 */
function getNextMonth(month: number, year: number): { month: number; year: number } {
  if (month === 12) {
    return { month: 1, year: year + 1 };
  }
  return { month: month + 1, year };
}

/**
 * Create a date for a specific month/year (day 15 to avoid timezone issues)
 */
function createDateForMonth(month: number, year: number, day: number = 15): Date {
  return new Date(year, month - 1, day, 12, 0, 0);
}

/**
 * Calculate installment amount with interest
 */
function calculateInstallmentWithInterest(
  principal: number,
  installments: number,
  interestRate: number | undefined | null
): { installmentAmount: number; totalWithInterest: number; interestAmount: number } {
  if (!interestRate || interestRate === 0) {
    return {
      installmentAmount: principal / installments,
      totalWithInterest: principal,
      interestAmount: 0,
    };
  }

  // Simple interest calculation: total = principal * (1 + rate/100)
  const totalWithInterest = principal * (1 + interestRate / 100);
  const installmentAmount = totalWithInterest / installments;
  const interestAmount = totalWithInterest - principal;

  return {
    installmentAmount,
    totalWithInterest,
    interestAmount,
  };
}

export interface PartialPaymentInput {
  billMonth: number;
  billYear: number;
  origin: string;
  totalBillAmount: number;
  amountPaid: number;
  interestRate?: number | null;
  userId: string;
  categoryId?: string | null;
}

export interface PartialPaymentResult {
  entryTransactionId: string;
  carryoverTransactionId: string;
  amountCarried: number;
  interestAmount: number;
}

/**
 * Generate transactions for PARTIAL (Rolar Saldo) bill payment
 *
 * Creates:
 * 1. BILL_PAYMENT transaction for amountPaid in the bill month
 * 2. BILL_CARRYOVER transaction for amountCarried in the NEXT month
 */
export async function generatePartialPaymentTransactions(
  input: PartialPaymentInput
): Promise<PartialPaymentResult> {
  const {
    billMonth,
    billYear,
    origin,
    totalBillAmount,
    amountPaid,
    interestRate,
    userId,
    categoryId,
  } = input;

  const amountCarried = totalBillAmount - amountPaid;
  const billLabel = formatBillLabel(billMonth, billYear);
  const nextMonthInfo = getNextMonth(billMonth, billYear);

  // Calculate interest on carried amount (if any)
  let interestAmount = 0;
  let carryoverAmount = amountCarried;
  if (interestRate && interestRate > 0) {
    interestAmount = amountCarried * (interestRate / 100);
    carryoverAmount = amountCarried + interestAmount;
  }

  // Create payment transaction in bill month
  const paymentTransaction = await prisma.transaction.create({
    data: {
      description: `Pagamento Fatura ${billLabel} - ${origin}`,
      amount: -Math.abs(amountPaid),
      date: createDateForMonth(billMonth, billYear),
      type: "EXPENSE",
      origin,
      categoryId: categoryId || null,
      isFixed: false,
      isInstallment: false,
      userId,
    },
  });

  // Create carryover transaction in next month
  const carryoverTransaction = await prisma.transaction.create({
    data: {
      description: `Saldo Anterior Fatura ${billLabel} - ${origin}`,
      amount: -Math.abs(carryoverAmount),
      date: createDateForMonth(nextMonthInfo.month, nextMonthInfo.year),
      type: "EXPENSE",
      origin,
      categoryId: categoryId || null,
      isFixed: false,
      isInstallment: false,
      userId,
    },
  });

  return {
    entryTransactionId: paymentTransaction.id,
    carryoverTransactionId: carryoverTransaction.id,
    amountCarried,
    interestAmount,
  };
}

export interface FinancedPaymentInput {
  billMonth: number;
  billYear: number;
  origin: string;
  totalBillAmount: number;
  amountPaid: number; // Entry amount
  installments: number;
  interestRate?: number | null;
  userId: string;
  categoryId?: string | null;
}

export interface FinancedPaymentResult {
  entryTransactionId: string;
  installmentId: string;
  installmentTransactionIds: string[];
  amountCarried: number;
  installmentAmount: number;
  interestAmount: number;
}

/**
 * Generate transactions for FINANCED (Parcelar) bill payment
 *
 * Creates:
 * 1. BILL_PAYMENT transaction for the entry (amountPaid) in the bill month
 * 2. Installment record for the financing
 * 3. FINANCING transactions for each installment in subsequent months
 */
export async function generateFinancedPaymentTransactions(
  input: FinancedPaymentInput
): Promise<FinancedPaymentResult> {
  const {
    billMonth,
    billYear,
    origin,
    totalBillAmount,
    amountPaid,
    installments,
    interestRate,
    userId,
    categoryId,
  } = input;

  const amountCarried = totalBillAmount - amountPaid;
  const billLabel = formatBillLabel(billMonth, billYear);

  // Calculate installment amount with interest
  const { installmentAmount, interestAmount } = calculateInstallmentWithInterest(
    amountCarried,
    installments,
    interestRate
  );

  // Create entry/payment transaction in bill month
  const entryTransaction = await prisma.transaction.create({
    data: {
      description: `Entrada Financiamento Fatura ${billLabel} - ${origin}`,
      amount: -Math.abs(amountPaid),
      date: createDateForMonth(billMonth, billYear),
      type: "EXPENSE",
      origin,
      categoryId: categoryId || null,
      isFixed: false,
      isInstallment: false,
      userId,
    },
  });

  // Get first installment date (next month from bill month)
  const firstInstallmentMonth = getNextMonth(billMonth, billYear);
  const startDate = createDateForMonth(firstInstallmentMonth.month, firstInstallmentMonth.year);

  // Create installment record
  const installmentDescription = `Financiamento Fatura ${billLabel} - ${origin}`;
  const installmentRecord = await prisma.installment.create({
    data: {
      description: installmentDescription,
      totalAmount: amountCarried + interestAmount,
      totalInstallments: installments,
      installmentAmount,
      startDate,
      origin,
      userId,
    },
  });

  // Create financing transactions for each installment
  const installmentTransactionIds: string[] = [];
  let currentMonth = firstInstallmentMonth.month;
  let currentYear = firstInstallmentMonth.year;

  for (let i = 0; i < installments; i++) {
    const transactionDate = createDateForMonth(currentMonth, currentYear);

    const transaction = await prisma.transaction.create({
      data: {
        description: `${installmentDescription} (${i + 1}/${installments})`,
        amount: -Math.abs(installmentAmount),
        date: transactionDate,
        type: "EXPENSE",
        origin,
        categoryId: categoryId || null,
        isFixed: false,
        isInstallment: true,
        installmentId: installmentRecord.id,
        currentInstallment: i + 1,
        userId,
      },
    });

    installmentTransactionIds.push(transaction.id);

    // Move to next month
    const nextMonth = getNextMonth(currentMonth, currentYear);
    currentMonth = nextMonth.month;
    currentYear = nextMonth.year;
  }

  return {
    entryTransactionId: entryTransaction.id,
    installmentId: installmentRecord.id,
    installmentTransactionIds,
    amountCarried,
    installmentAmount,
    interestAmount,
  };
}

export interface GenerateTransactionsInput {
  billMonth: number;
  billYear: number;
  origin: string;
  totalBillAmount: number;
  amountPaid: number;
  paymentType: BillPaymentType;
  installments?: number;
  interestRate?: number | null;
  userId: string;
  categoryId?: string | null;
}

export interface GenerateTransactionsResult {
  entryTransactionId: string;
  carryoverTransactionId?: string;
  installmentId?: string;
  amountCarried: number;
  interestAmount: number;
}

/**
 * Main function to generate bill payment transactions
 * Dispatches to the appropriate handler based on payment type
 */
export async function generateBillPaymentTransactions(
  input: GenerateTransactionsInput
): Promise<GenerateTransactionsResult> {
  const { paymentType, installments } = input;

  if (paymentType === "PARTIAL") {
    const result = await generatePartialPaymentTransactions(input);
    return {
      entryTransactionId: result.entryTransactionId,
      carryoverTransactionId: result.carryoverTransactionId,
      amountCarried: result.amountCarried,
      interestAmount: result.interestAmount,
    };
  }

  if (paymentType === "FINANCED") {
    if (!installments || installments < 1) {
      throw new Error("Numero de parcelas e obrigatorio para financiamento");
    }

    const result = await generateFinancedPaymentTransactions({
      ...input,
      installments,
    });
    return {
      entryTransactionId: result.entryTransactionId,
      installmentId: result.installmentId,
      amountCarried: result.amountCarried,
      interestAmount: result.interestAmount,
    };
  }

  throw new Error(`Tipo de pagamento invalido: ${paymentType}`);
}

/**
 * Delete transactions generated for a bill payment
 * Used when canceling a bill payment
 */
export async function deleteBillPaymentTransactions(
  billPaymentId: string,
  userId: string
): Promise<void> {
  // Fetch the bill payment to get transaction IDs
  const billPayment = await prisma.billPayment.findFirst({
    where: { id: billPaymentId, userId },
  });

  if (!billPayment) {
    throw new Error("Pagamento de fatura nao encontrado");
  }

  // Delete entry transaction if exists
  if (billPayment.entryTransactionId) {
    await prisma.transaction.delete({
      where: { id: billPayment.entryTransactionId },
    }).catch(() => {
      // Transaction might already be deleted, ignore error
    });
  }

  // Delete carryover transaction if exists
  if (billPayment.carryoverTransactionId) {
    await prisma.transaction.delete({
      where: { id: billPayment.carryoverTransactionId },
    }).catch(() => {
      // Transaction might already be deleted, ignore error
    });
  }

  // Delete installment and its transactions if exists
  if (billPayment.installmentId) {
    // Delete all transactions linked to this installment
    await prisma.transaction.deleteMany({
      where: { installmentId: billPayment.installmentId, userId },
    });

    // Delete the installment record
    await prisma.installment.delete({
      where: { id: billPayment.installmentId },
    }).catch(() => {
      // Installment might already be deleted, ignore error
    });
  }
}

/**
 * Soft delete (mark as deleted) the carryover transaction when a linked import is found
 */
export async function softDeleteCarryoverTransaction(
  carryoverTransactionId: string,
  userId: string
): Promise<void> {
  await prisma.transaction.update({
    where: { id: carryoverTransactionId, userId },
    data: { deletedAt: new Date() },
  });
}
