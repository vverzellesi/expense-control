"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ReferenceLine,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { MonthProjection } from "@/types";

interface Props {
  data: MonthProjection[];
}

export function ProjectionChart({ data }: Props) {
  const chartData = data.map((m) => ({
    monthLabel: m.monthLabel,
    income: m.totalIncome,
    expense: m.totalExpenses,
    balance: m.projectedBalance,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="monthLabel"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) =>
            new Intl.NumberFormat("pt-BR", {
              notation: "compact",
              compactDisplay: "short",
            }).format(value)
          }
        />
        <Tooltip
          formatter={(value: number, name: string) => [
            formatCurrency(value),
            name === "income" ? "Receitas" : name === "expense" ? "Despesas" : "Saldo",
          ]}
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
          labelFormatter={(label) => `Mês: ${label}`}
        />
        <Legend
          formatter={(value) =>
            value === "income" ? "Receitas" : value === "expense" ? "Despesas" : "Saldo"
          }
        />
        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
        <Bar
          dataKey="income"
          name="income"
          fill="#22c55e"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="expense"
          name="expense"
          fill="#ef4444"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
