"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";

interface ChartData {
  name: string;
  value: number;
  color: string;
}

interface Props {
  data: ChartData[];
}

export function InvestmentPieChart({ data }: Props) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const total = data.reduce((acc, item) => acc + item.value, 0);

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 200 : 220}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={isMobile ? 45 : 55}
          outerRadius={isMobile ? 70 : 85}
          paddingAngle={2}
          dataKey="value"
        >
          {data.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => {
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
            return `${formatCurrency(value)} (${percentage}%)`;
          }}
          contentStyle={{
            backgroundColor: "white",
            border: "1px solid #e5e7eb",
            borderRadius: "8px",
          }}
        />
        {/* Center text showing total */}
        <text
          x="50%"
          y="50%"
          textAnchor="middle"
          dominantBaseline="middle"
          className="fill-gray-900"
        >
          <tspan
            x="50%"
            dy="-0.5em"
            className="text-xs fill-gray-500"
            style={{ fontSize: "12px" }}
          >
            Total
          </tspan>
          <tspan
            x="50%"
            dy="1.4em"
            className="font-semibold"
            style={{ fontSize: isMobile ? "12px" : "14px" }}
          >
            {formatCurrency(total)}
          </tspan>
        </text>
      </PieChart>
    </ResponsiveContainer>
  );
}
