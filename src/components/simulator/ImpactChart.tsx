"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  TooltipProps,
} from "recharts";
import { useMediaQuery } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";
import type { BaselineMonth } from "@/types";
import type { SimulatedMonth } from "@/lib/simulation-engine";

interface ImpactChartProps {
  baseline: BaselineMonth[];
  averageIncome: number;
  simulatedMonths?: SimulatedMonth[] | null;
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="rounded-lg border bg-white p-3 shadow-md">
      <p className="font-medium text-gray-900 mb-2">{label}</p>
      <div className="space-y-1 text-sm">
        {data.averageIncome != null && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Renda:</span>
            <span className="font-medium">{formatCurrency(data.averageIncome)}</span>
          </div>
        )}
        <div className="flex justify-between gap-4">
          <span className="text-gray-500">Despesas fixas:</span>
          <span>{formatCurrency(data.recurringExpenses ?? data.currentExpenses)}</span>
        </div>
        {data.installmentsTotal > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-gray-500">Parcelas existentes:</span>
            <span>{formatCurrency(data.installmentsTotal)}</span>
          </div>
        )}
        {data.simulationExpenses > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-emerald-600 font-medium">Esta simulação:</span>
            <span className="text-emerald-600 font-medium">
              {formatCurrency(data.simulationExpenses)}
            </span>
          </div>
        )}
        <div className="border-t pt-1 flex justify-between gap-4">
          <span className="text-gray-700 font-medium">Saldo livre:</span>
          <span className={data.freeBalance < 0 ? "text-red-600 font-bold" : "font-medium"}>
            {formatCurrency(data.freeBalance ?? (data.averageIncome - data.currentExpenses))}
          </span>
        </div>
      </div>
    </div>
  );
}

export function ImpactChart({ baseline, averageIncome, simulatedMonths }: ImpactChartProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const chartData = (simulatedMonths ?? baseline).map((m) => ({
    label: m.label,
    currentExpenses: m.currentExpenses,
    simulationExpenses: "simulationExpenses" in m ? (m as SimulatedMonth).simulationExpenses : 0,
    freeBalance: "freeBalance" in m ? (m as SimulatedMonth).freeBalance : averageIncome - m.currentExpenses,
    isOverBudget: "isOverBudget" in m ? (m as SimulatedMonth).isOverBudget : false,
    recurringExpenses: m.recurringExpenses,
    installmentsTotal: m.installmentsTotal,
    averageIncome,
  }));

  // Find over-budget month labels for red zones
  const overBudgetMonths = chartData
    .filter((d) => d.isOverBudget)
    .map((d) => d.label);

  const formatCompact = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(value);

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 280 : 380}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis dataKey="label" tick={{ fontSize: isMobile ? 10 : 12 }} />
        <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12 }} />
        <Tooltip content={<CustomTooltip />} />

        {/* Red zones for over-budget months */}
        {overBudgetMonths.map((monthLabel) => (
          <ReferenceArea
            key={monthLabel}
            x1={monthLabel}
            x2={monthLabel}
            fill="#ef4444"
            fillOpacity={0.08}
          />
        ))}

        <Bar
          dataKey="currentExpenses"
          name="Despesas atuais"
          stackId="expenses"
          fill="#d1d5db"
          radius={simulatedMonths ? [0, 0, 0, 0] : [4, 4, 0, 0]}
        />
        {simulatedMonths && (
          <Bar
            dataKey="simulationExpenses"
            name="Simulação"
            stackId="expenses"
            fill="#34d399"
            radius={[4, 4, 0, 0]}
          />
        )}

        {averageIncome > 0 && (
          <ReferenceLine
            y={averageIncome}
            stroke="#6b7280"
            strokeDasharray="5 5"
            label={{
              value: `Renda: ${formatCurrency(averageIncome)}`,
              position: "insideTopRight",
              fontSize: 11,
              fill: "#6b7280",
            }}
          />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
