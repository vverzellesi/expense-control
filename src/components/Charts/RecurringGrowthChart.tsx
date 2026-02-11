"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useMediaQuery } from "@/lib/hooks";

interface RecurringGrowthItem {
  description: string;
  changePercent: number;
}

interface Props {
  data: RecurringGrowthItem[];
}

export function RecurringGrowthChart({ data }: Props) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Sort by changePercent descending and filter items with actual changes
  const chartData = [...data]
    .filter((item) => item.changePercent !== 0)
    .sort((a, b) => b.changePercent - a.changePercent)
    .slice(0, isMobile ? 8 : 15)
    .map((item) => ({
      description:
        item.description.length > (isMobile ? 12 : 20)
          ? item.description.slice(0, isMobile ? 12 : 20) + "..."
          : item.description,
      changePercent: parseFloat(item.changePercent.toFixed(1)),
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Sem variacao de preco no periodo
      </div>
    );
  }

  const chartHeight = Math.max(isMobile ? 260 : 300, chartData.length * 40);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart
        data={chartData}
        layout="vertical"
        margin={isMobile ? { left: 10, right: 20 } : { left: 20, right: 30 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: isMobile ? 10 : 12 }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value) => `${value}%`}
        />
        <YAxis
          type="category"
          dataKey="description"
          tick={{ fontSize: isMobile ? 9 : 12 }}
          tickLine={false}
          axisLine={false}
          width={isMobile ? 80 : 140}
        />
        <Tooltip
          formatter={(value: number) => [`${value.toFixed(1)}%`, "Variacao"]}
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
        />
        <Bar dataKey="changePercent" name="changePercent" radius={[0, 4, 4, 0]}>
          {chartData.map((entry, index) => (
            <Cell
              key={`cell-${index}`}
              fill={entry.changePercent > 0 ? "#ef4444" : "#22c55e"}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
