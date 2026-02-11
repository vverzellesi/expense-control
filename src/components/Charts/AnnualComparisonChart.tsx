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
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";

interface MonthData {
  monthLabel: string;
  income: number;
  expense: number;
  prevIncome: number;
  prevExpense: number;
}

interface Props {
  data: MonthData[];
}

export function AnnualComparisonChart({ data }: Props) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 280 : 320}>
      <BarChart
        data={data}
        margin={isMobile ? { left: -10, right: 5 } : undefined}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="monthLabel"
          tick={{ fontSize: isMobile ? 9 : 12 }}
          tickLine={false}
          axisLine={false}
          interval={0}
        />
        <YAxis
          tick={{ fontSize: isMobile ? 10 : 12 }}
          tickLine={false}
          axisLine={false}
          width={isMobile ? 40 : 60}
          tickFormatter={(value) =>
            new Intl.NumberFormat("pt-BR", {
              notation: "compact",
              compactDisplay: "short",
            }).format(value)
          }
        />
        <Tooltip
          formatter={(value: number) => formatCurrency(value)}
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
        />
        <Legend
          layout="horizontal"
          verticalAlign={isMobile ? "bottom" : "top"}
          align="center"
          wrapperStyle={isMobile ? { fontSize: "11px" } : undefined}
        />
        <Bar
          dataKey="income"
          name="Receitas (atual)"
          fill="#22c55e"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="prevIncome"
          name="Receitas (anterior)"
          fill="#86efac"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="expense"
          name="Despesas (atual)"
          fill="#ef4444"
          radius={[4, 4, 0, 0]}
        />
        <Bar
          dataKey="prevExpense"
          name="Despesas (anterior)"
          fill="#fca5a5"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
