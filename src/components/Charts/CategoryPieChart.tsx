"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";

interface CategoryData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  total: number;
  percentage: number;
}

interface Props {
  data: CategoryData[];
}

export function CategoryPieChart({ data }: Props) {
  const isMobile = useMediaQuery('(max-width: 768px)');

  const chartData = data.map((item) => ({
    name: item.categoryName,
    value: item.total,
    color: item.categoryColor,
    percentage: item.percentage,
  }));

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 200 : 280}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy={isMobile ? "40%" : "50%"}
          innerRadius={isMobile ? 40 : 60}
          outerRadius={isMobile ? 70 : 100}
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
          formatter={(value) => (
            <span className={isMobile ? "text-xs text-gray-600" : "text-sm text-gray-600"}>{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
