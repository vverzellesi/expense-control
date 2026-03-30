export interface PendingItem {
  description: string;
  amount: number;
  type: "recurring" | "installment";
  categoryName?: string;
}

export interface ProjectionResult {
  currentExpenses: number;
  pendingTotal: number;
  projectedTotal: number;
  pendingItems: PendingItem[];
  income: number;
  projectedPercentage: number; // projectedTotal / income * 100
}

export function calculateProjection({
  currentExpenses,
  income,
  pendingRecurring,
  pendingInstallments,
}: {
  currentExpenses: number;
  income: number;
  pendingRecurring: Array<{ description: string; defaultAmount: number; categoryName?: string }>;
  pendingInstallments: Array<{ description: string; installmentAmount: number; categoryName?: string }>;
}): ProjectionResult {
  const pendingItems: PendingItem[] = [];

  for (const r of pendingRecurring) {
    pendingItems.push({
      description: r.description,
      amount: r.defaultAmount,
      type: "recurring",
      categoryName: r.categoryName,
    });
  }

  for (const i of pendingInstallments) {
    pendingItems.push({
      description: i.description,
      amount: i.installmentAmount,
      type: "installment",
      categoryName: i.categoryName,
    });
  }

  const pendingTotal = pendingItems.reduce((sum, item) => sum + item.amount, 0);
  const projectedTotal = currentExpenses + pendingTotal;
  const projectedPercentage = income > 0 ? (projectedTotal / income) * 100 : 0;

  return {
    currentExpenses,
    pendingTotal,
    projectedTotal,
    pendingItems,
    income,
    projectedPercentage,
  };
}
