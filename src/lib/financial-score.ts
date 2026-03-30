export type FinancialLevel = "healthy" | "warning" | "critical";

export interface FinancialScoreResult {
  score: number; // 0-100
  level: FinancialLevel;
  factors: {
    fixedCommitment: { value: number; score: number; description: string };
    expenseTrend: { value: string; score: number; description: string };
    installmentLoad: { value: number; score: number; description: string };
    debtStatus: { value: number; score: number; description: string };
  };
}

const WEIGHTS = {
  fixedCommitment: 35,
  expenseTrend: 20,
  installmentLoad: 25,
  debtStatus: 20,
};

function scoreFixedCommitment(
  fixedTotal: number,
  income: number
): { value: number; score: number } {
  if (income <= 0) return { value: 0, score: 50 };
  const pct = (fixedTotal / income) * 100;
  if (pct < 50) return { value: pct, score: 100 };
  if (pct < 60) return { value: pct, score: 80 };
  if (pct < 70) return { value: pct, score: 60 };
  if (pct < 80) return { value: pct, score: 40 };
  return { value: pct, score: 10 };
}

function scoreExpenseTrend(
  monthlyExpenses: number[] // last 3 months, oldest first
): { value: string; score: number } {
  if (monthlyExpenses.length < 2) return { value: "insuficiente", score: 70 };

  const recent = monthlyExpenses[monthlyExpenses.length - 1];
  const previous = monthlyExpenses[monthlyExpenses.length - 2];
  if (previous <= 0) return { value: "estável", score: 70 };

  const change = ((recent - previous) / previous) * 100;
  if (change > 15) return { value: "subindo", score: 30 };
  if (change > 5) return { value: "subindo leve", score: 55 };
  if (change < -15) return { value: "descendo", score: 100 };
  if (change < -5) return { value: "descendo leve", score: 85 };
  return { value: "estável", score: 70 };
}

function scoreInstallmentLoad(
  activeInstallments: number,
  totalRemainingMonths: number
): { value: number; score: number } {
  // Combined metric: count x average remaining duration
  const load =
    activeInstallments *
    (totalRemainingMonths / Math.max(activeInstallments, 1));
  if (activeInstallments === 0) return { value: 0, score: 100 };
  if (activeInstallments <= 2 && load <= 12)
    return { value: activeInstallments, score: 80 };
  if (activeInstallments <= 5 && load <= 30)
    return { value: activeInstallments, score: 60 };
  if (activeInstallments <= 8)
    return { value: activeInstallments, score: 40 };
  return { value: activeInstallments, score: 15 };
}

function scoreDebtStatus(
  debtAlertCount: number,
  hasCriticalDebt: boolean
): { value: number; score: number } {
  if (debtAlertCount === 0) return { value: 0, score: 100 };
  if (hasCriticalDebt) return { value: debtAlertCount, score: 10 };
  return { value: debtAlertCount, score: 40 };
}

export function calculateFinancialScore({
  income,
  fixedExpensesTotal,
  monthlyExpenses,
  activeInstallments,
  totalRemainingMonths,
  debtAlertCount,
  hasCriticalDebt,
}: {
  income: number;
  fixedExpensesTotal: number;
  monthlyExpenses: number[];
  activeInstallments: number;
  totalRemainingMonths: number;
  debtAlertCount: number;
  hasCriticalDebt: boolean;
}): FinancialScoreResult {
  const fc = scoreFixedCommitment(fixedExpensesTotal, income);
  const et = scoreExpenseTrend(monthlyExpenses);
  const il = scoreInstallmentLoad(activeInstallments, totalRemainingMonths);
  const ds = scoreDebtStatus(debtAlertCount, hasCriticalDebt);

  const score = Math.round(
    (fc.score * WEIGHTS.fixedCommitment +
      et.score * WEIGHTS.expenseTrend +
      il.score * WEIGHTS.installmentLoad +
      ds.score * WEIGHTS.debtStatus) /
      100
  );

  const level: FinancialLevel =
    score >= 70 ? "healthy" : score >= 40 ? "warning" : "critical";

  return {
    score,
    level,
    factors: {
      fixedCommitment: {
        ...fc,
        description: `${fc.value.toFixed(0)}% da renda em fixos`,
      },
      expenseTrend: { ...et, description: `Tendência: ${et.value}`},
      installmentLoad: {
        ...il,
        description: `${il.value} parcelas ativas`,
      },
      debtStatus: {
        ...ds,
        description:
          ds.value > 0 ? `${ds.value} alerta(s) de dívida` : "Sem dívidas",
      },
    },
  };
}
