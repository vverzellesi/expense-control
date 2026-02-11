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
import { MONTH_LABELS } from "@/lib/constants";

interface SnapshotEntry {
  month: number;
  year: number;
  totalValue: number;
  totalInvested: number;
  totalWithdrawn: number;
}

interface Props {
  data: SnapshotEntry[];
}

export function InvestmentEvolutionChart({ data }: Props) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  const chartData = data.map((entry) => ({
    label: `${MONTH_LABELS[entry.month - 1]}/${String(entry.year).slice(2)}`,
    totalValue: entry.totalValue,
    totalInvested: entry.totalInvested,
  }));

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 260 : 300}>
      <AreaChart
        data={chartData}
        margin={isMobile ? { left: -10, right: 5 } : undefined}
      >
        <defs>
          <linearGradient id="investEvoColorValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="investEvoColorInvested" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
        </defs>
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
            name === "totalValue" ? "Valor Atual" : "Total Investido",
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
          formatter={(value) =>
            value === "totalValue" ? "Valor Atual" : "Total Investido"
          }
        />
        <Area
          type="monotone"
          dataKey="totalInvested"
          name="totalInvested"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#investEvoColorInvested)"
        />
        <Area
          type="monotone"
          dataKey="totalValue"
          name="totalValue"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#investEvoColorValue)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
