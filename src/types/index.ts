export type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";

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
  recurringExpenseId: string | null;
  recurringExpense?: RecurringExpense | null;
  tags: string | null;
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
