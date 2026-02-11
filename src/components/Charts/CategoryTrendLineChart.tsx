"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";

interface CategoryInfo {
  categoryName: string;
  categoryColor: string;
  monthlyTotals: number[];
}

interface Props {
  categories: CategoryInfo[];
  months: string[];
}

export function CategoryTrendLineChart({ categories, months }: Props) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  // Build data: array of objects like { month: "Jan", "Alimentacao": 500, ... }
  const data = months.map((month, idx) => {
    const point: Record<string, string | number> = { month };
    for (const cat of categories) {
      point[cat.categoryName] = cat.monthlyTotals[idx] || 0;
    }
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 280 : 320}>
      <LineChart
        data={data}
        margin={isMobile ? { left: -10, right: 5 } : undefined}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="month"
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
        {categories.map((cat) => (
          <Line
            key={cat.categoryName}
            type="monotone"
            dataKey={cat.categoryName}
            stroke={cat.categoryColor}
            strokeWidth={2}
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
