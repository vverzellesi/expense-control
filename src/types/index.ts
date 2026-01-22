export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";

// Special transaction types for credit card statements
export type SpecialTransactionType =
  | "BILL_PAYMENT"      // Pagamento de fatura (credito)
  | "FINANCING"         // Parcelamento de fatura
  | "REFUND"            // Estorno
  | "FEE"               // Tarifa, anuidade
  | "IOF"               // IOF de transacao internacional
  | "CURRENCY_SPREAD"   // Spread de cotacao
  | null;

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  date: Date | string;
  type: TransactionType;
  origin: string;
  categoryId: string | null;
  category?: Category | null;
  isFixed: boolean;
  isInstallment: boolean;
  installmentId: string | null;
  installment?: Installment | null;
  currentInstallment: number | null;
  totalInstallments: number | null;
  recurringExpenseId: string | null;
  recurringExpense?: RecurringExpense | null;
  tags: string | null;
  deletedAt: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface RecurringExpense {
  id: string;
  description: string;
  defaultAmount: number;
  dayOfMonth: number;
  type: TransactionType;
  origin: string;
  categoryId: string | null;
  category?: Category | null;
  isActive: boolean;
  autoGenerate: boolean; // false = aguarda importacao e vincula
  transactions?: Transaction[];
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string | null;
}

export interface Installment {
  id: string;
  description: string;
  totalAmount: number;
  totalInstallments: number;
  installmentAmount: number;
  startDate: Date | string;
  origin: string;
  transactions?: Transaction[];
}

export interface Origin {
  id: string;
  name: string;
}

export interface Budget {
  id: string;
  categoryId: string;
  category?: Category;
  amount: number;
  isActive: boolean;
}

export interface CategoryRule {
  id: string;
  keyword: string;
  categoryId: string;
  category?: Category;
}

export interface MonthSummary {
  income: number;
  expense: number;
  balance: number;
}

export interface CategorySummary {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  total: number;
  percentage: number;
  previousTotal: number | null;
  changePercentage: number | null;
}

export interface ImportedTransaction {
  description: string;
  amount: number;
  date: Date;
  suggestedCategoryId?: string;
  isInstallment: boolean;
  currentInstallment?: number;
  totalInstallments?: number;
  type?: TransactionType;
  confidence?: number;
  isRecurring?: boolean;
  recurringName?: string;
  specialType?: SpecialTransactionType;
  specialTypeWarning?: string; // Aviso para o usuario sobre transacoes especiais
}

// OCR Types
export interface OCRResult {
  text: string;
  confidence: number;
}

export interface StatementTransaction {
  date: Date;
  description: string;
  amount: number;
  type: TransactionType;
  transactionKind?: string; // PIX, TED, BOLETO, etc.
  confidence: number;
}

export interface StatementParseResult {
  bank: string;
  transactions: StatementTransaction[];
  averageConfidence: number;
}

// Projection Types
export interface ProjectionInstallmentItem {
  description: string;
  amount: number;
  currentInstallment: number;
  totalInstallments: number;
}

export interface ProjectionRecurringItem {
  description: string;
  amount: number;
  type: TransactionType;
}

export interface MonthProjection {
  month: number;
  year: number;
  monthLabel: string; // "fev/26"

  // Parcelas (do DB)
  installmentsTotal: number;
  installmentsCount: number;
  installments: ProjectionInstallmentItem[];

  // Recorrentes projetados
  recurringExpenses: number;
  recurringIncome: number;
  recurringItems: ProjectionRecurringItem[];

  // Totais
  totalExpenses: number;
  totalIncome: number;
  projectedBalance: number;
  isNegative: boolean;
}

export interface ProjectionTotals {
  totalInstallments: number;
  totalRecurringExpenses: number;
  totalRecurringIncome: number;
  netProjectedBalance: number;
}

export interface ProjectionResponse {
  months: MonthProjection[];
  totals: ProjectionTotals;
}

// Savings History Types
export interface SavingsHistory {
  id: string;
  month: number;
  year: number;
  goal: number;
  actual: number;
  isAchieved: boolean;
  percentage: number;
  createdAt: Date | string;
}

// Weekly Summary Types
export interface WeeklySummary {
  currentWeek: {
    total: number;
    count: number;
    startDate: string;
    endDate: string;
  };
  previousWeek: {
    total: number;
    count: number;
  };
  changePercentage: number | null;
}

// Unusual Transaction Types
export interface UnusualTransaction {
  id: string;
  description: string;
  amount: number;
  date: Date | string;
  categoryId: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryAverage: number;
  exceedsBy: number; // Percentage above average
}

// Weekly Breakdown Types (gastos por semana do mês)
export interface WeekData {
  weekNumber: number; // 1, 2, 3, 4, 5
  startDate: string;
  endDate: string;
  total: number;
  count: number;
  dailyAverage: number;
  categories: {
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    total: number;
  }[];
}

export interface WeeklyBreakdown {
  weeks: WeekData[];
  highestWeek: number; // semana com mais gastos
  lowestWeek: number; // semana com menos gastos
  averagePerWeek: number;
}
