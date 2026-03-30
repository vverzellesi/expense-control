"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import { useMediaQuery } from "@/lib/hooks";

interface MonthlyData {
  monthLabel: string;
  fixed: number;
  variable: number;
}

interface FlexibilityMonthlyData {
  monthLabel: string;
  essential: number;
  negotiable: number;
  variable: number;
  unclassified: number;
}

interface Props {
  data: MonthlyData[];
  flexibilityData?: FlexibilityMonthlyData[];
}

export function FixedVariableChart({ data, flexibilityData }: Props) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const chartData = flexibilityData || data;

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 240 : 280}>
      <AreaChart data={chartData} margin={isMobile ? { left: -10, right: 5 } : undefined}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis
          dataKey="monthLabel"
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
          wrapperStyle={isMobile ? { fontSize: "12px" } : undefined}
        />
        {flexibilityData ? (
          <>
            <Area
              type="monotone"
              dataKey="essential"
              name="Essenciais"
              stackId="1"
              stroke="#475569"
              fill="#475569"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="negotiable"
              name="Negociaveis"
              stackId="1"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="variable"
              name="Variaveis"
              stackId="1"
              stroke="#f59e0b"
              fill="#f59e0b"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="unclassified"
              name="Sem Classificacao"
              stackId="1"
              stroke="#9ca3af"
              fill="#9ca3af"
              fillOpacity={0.4}
            />
          </>
        ) : (
          <>
            <Area
              type="monotone"
              dataKey="fixed"
              name="Fixas"
              stackId="1"
              stroke="#3b82f6"
              fill="#3b82f6"
              fillOpacity={0.6}
            />
            <Area
              type="monotone"
              dataKey="variable"
              name="Variaveis"
              stackId="1"
              stroke="#f59e0b"
              fill="#f59e0b"
              fillOpacity={0.6}
            />
          </>
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}
