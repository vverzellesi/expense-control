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
  LabelList,
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

  const formatCompact = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      notation: "compact",
      compactDisplay: "short",
      maximumFractionDigits: 1,
    }).format(value);

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
        >
          <LabelList
            dataKey="income"
            position="top"
            formatter={formatCompact}
            fontSize={10}
            fill="#16a34a"
          />
        </Bar>
        <Bar
          dataKey="expense"
          name="expense"
          fill="#ef4444"
          radius={[4, 4, 0, 0]}
        >
          <LabelList
            dataKey="expense"
            position="top"
            formatter={formatCompact}
            fontSize={10}
            fill="#dc2626"
          />
        </Bar>
        <Bar
          dataKey="balance"
          name="balance"
          fill="#3b82f6"
          radius={[4, 4, 0, 0]}
        >
          <LabelList
            dataKey="balance"
            position="top"
            formatter={formatCompact}
            fontSize={10}
            fill="#2563eb"
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
