import type { BaselineMonth } from "@/types";

export interface SimulatedMonth extends BaselineMonth {
  simulationExpenses: number;
  totalWithSimulation: number;
  freeBalance: number;
  isOverBudget: boolean;
  commitmentPercent: number;
}

export interface SimulationResult {
  months: SimulatedMonth[];
  monthlyInstallment: number;
  tightestMonth: { label: string; freeBalance: number } | null;
  commitmentBefore: number;
  commitmentAfter: number;
}

export interface SimulationInput {
  totalAmount: number;
  totalInstallments: number;
  isActive: boolean;
}

export function calculateSimulation(
  baseline: BaselineMonth[],
  averageIncome: number,
  simulations: SimulationInput[],
): SimulationResult {
  const activeSimulations = simulations.filter((s) => s.isActive);

  const months: SimulatedMonth[] = baseline.map((month, index) => {
    let simulationExpenses = 0;
    for (const sim of activeSimulations) {
      if (sim.totalInstallments <= 0) continue;
      if (index < sim.totalInstallments) {
        simulationExpenses += sim.totalAmount / sim.totalInstallments;
      }
    }

    const totalWithSimulation = month.currentExpenses + simulationExpenses;
    const freeBalance = averageIncome - totalWithSimulation;
    const commitmentPercent =
      averageIncome > 0 ? (totalWithSimulation / averageIncome) * 100 : 0;

    return {
      ...month,
      simulationExpenses,
      totalWithSimulation,
      freeBalance,
      isOverBudget: freeBalance < 0,
      commitmentPercent,
    };
  });

  const monthlyInstallment = activeSimulations.reduce(
    (sum, s) => sum + (s.totalInstallments > 0 ? s.totalAmount / s.totalInstallments : 0),
    0,
  );

  // Find tightest month (only among months with simulation impact)
  let tightestMonth: { label: string; freeBalance: number } | null = null;
  for (const m of months) {
    if (m.simulationExpenses > 0) {
      if (!tightestMonth || m.freeBalance < tightestMonth.freeBalance) {
        tightestMonth = { label: m.label, freeBalance: m.freeBalance };
      }
    }
  }

  // Commitment before (baseline only)
  const avgCurrentExpenses =
    baseline.length > 0
      ? baseline.reduce((sum, m) => sum + m.currentExpenses, 0) / baseline.length
      : 0;
  const commitmentBefore =
    averageIncome > 0 ? (avgCurrentExpenses / averageIncome) * 100 : 0;

  // Commitment after (with simulation, averaged over impacted months)
  const impactedMonths = months.filter((m) => m.simulationExpenses > 0);
  const avgTotalExpenses =
    impactedMonths.length > 0
      ? impactedMonths.reduce((sum, m) => sum + m.totalWithSimulation, 0) /
        impactedMonths.length
      : avgCurrentExpenses;
  const commitmentAfter =
    averageIncome > 0 ? (avgTotalExpenses / averageIncome) * 100 : 0;

  return {
    months,
    monthlyInstallment,
    tightestMonth,
    commitmentBefore,
    commitmentAfter,
  };
}
