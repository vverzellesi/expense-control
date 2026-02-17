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
} from "recharts";
import { useMediaQuery } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";
import type { BaselineMonth } from "@/types";

interface ImpactChartProps {
  baseline: BaselineMonth[];
  averageIncome: number;
}

export function ImpactChart({ baseline, averageIncome }: ImpactChartProps) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const chartData = baseline.map((m) => ({
    label: m.label,
    currentExpenses: m.currentExpenses,
  }));

  const formatCompact = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(value);

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 260 : 350}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: isMobile ? 10 : 12 }}
        />
        <YAxis tickFormatter={formatCompact} tick={{ fontSize: 12 }} />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
        />
        <Bar
          dataKey="currentExpenses"
          name="Despesas atuais"
          fill="#d1d5db"
          radius={[4, 4, 0, 0]}
        />
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
