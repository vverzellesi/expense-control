"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";

const COLORS = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];

interface OriginData {
  origin: string;
  totalExpense: number;
  percentage: number;
}

interface Props {
  data: OriginData[];
}

export function OriginsPieChart({ data }: Props) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const chartData = data.map((item, index) => ({
    name: item.origin,
    value: item.totalExpense,
    color: COLORS[index % COLORS.length],
    percentage: item.percentage,
  }));

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 320 : 280}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy={isMobile ? "30%" : "50%"}
          innerRadius={isMobile ? 35 : 60}
          outerRadius={isMobile ? 60 : 100}
          paddingAngle={2}
          dataKey="value"
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number, _name: string, props: { payload?: { percentage?: number } }) => {
            const percentage = props.payload?.percentage;
            return `${formatCurrency(value)} (${percentage?.toFixed(1)}%)`;
          }}
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
        />
        <Legend
          layout={isMobile ? "horizontal" : "vertical"}
          align={isMobile ? "center" : "right"}
          verticalAlign={isMobile ? "bottom" : "middle"}
          wrapperStyle={isMobile ? { paddingTop: "10px" } : undefined}
          formatter={(value) => (
            <span className={isMobile ? "text-xs text-gray-600" : "text-sm text-gray-600"}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
