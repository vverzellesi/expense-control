"use client";

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";
import { MONTH_LABELS } from "@/lib/constants";

interface SavingsHistoryEntry {
  id: string;
  month: number;
  year: number;
  goal: number;
  actual: number;
  isAchieved: boolean;
  percentage: number;
}

interface Props {
  data: SavingsHistoryEntry[];
}

export function SavingsHistoryChart({ data }: Props) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Data comes reversed from API (newest first), reverse for chronological display
  const chartData = [...data].reverse().map((entry) => ({
    label: `${MONTH_LABELS[entry.month - 1]}/${String(entry.year).slice(2)}`,
    actual: entry.actual,
    goal: entry.goal,
    isAchieved: entry.isAchieved,
  }));

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 260 : 300}>
      <ComposedChart
        data={chartData}
        margin={isMobile ? { left: -10, right: 5 } : undefined}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: isMobile ? 9 : 12 }}
          tickLine={false}
          axisLine={false}
          interval={isMobile ? 1 : 0}
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
          formatter={(value: number, name: string) => [
            formatCurrency(value),
            name === "actual" ? "Economizado" : "Meta",
          ]}
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
        />
        <Legend
          verticalAlign={isMobile ? "bottom" : "top"}
          align="center"
          wrapperStyle={isMobile ? { fontSize: "12px" } : undefined}
          formatter={(value) => (value === "actual" ? "Economizado" : "Meta")}
        />
        <Bar dataKey="actual" name="actual" radius={[4, 4, 0, 0]}>
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.isAchieved ? "#22c55e" : "#ef4444"}
            />
          ))}
        </Bar>
        <Line
          type="monotone"
          dataKey="goal"
          name="goal"
          stroke="#9ca3af"
          strokeDasharray="5 5"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
