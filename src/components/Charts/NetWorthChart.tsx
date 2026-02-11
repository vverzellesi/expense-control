"use client";

import {
  ComposedChart,
  Area,
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

interface NetWorthEntry {
  monthLabel: string;
  cumulativeCash: number;
  investmentValue: number;
  netWorth: number;
}

interface Props {
  data: NetWorthEntry[];
}

export function NetWorthChart({ data }: Props) {
  const isMobile = useMediaQuery("(max-width: 768px)");

  return (
    <ResponsiveContainer width="100%" height={isMobile ? 260 : 300}>
      <ComposedChart
        data={data}
        margin={isMobile ? { left: -10, right: 5 } : undefined}
      >
        <defs>
          <linearGradient id="colorCash" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorInvestment" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
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
          formatter={(value: number, name: string) => {
            const labels: Record<string, string> = {
              cumulativeCash: "Saldo Acumulado",
              investmentValue: "Investimentos",
              netWorth: "Patrimonio Liquido",
            };
            return [formatCurrency(value), labels[name] || name];
          }}
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
          formatter={(value) => {
            const labels: Record<string, string> = {
              cumulativeCash: "Saldo Acumulado",
              investmentValue: "Investimentos",
              netWorth: "Patrimonio Liquido",
            };
            return labels[value] || value;
          }}
        />
        <Area
          type="monotone"
          dataKey="cumulativeCash"
          name="cumulativeCash"
          stackId="1"
          stroke="#3b82f6"
          strokeWidth={2}
          fill="url(#colorCash)"
        />
        <Area
          type="monotone"
          dataKey="investmentValue"
          name="investmentValue"
          stackId="1"
          stroke="#10b981"
          strokeWidth={2}
          fill="url(#colorInvestment)"
        />
        <Line
          type="monotone"
          dataKey="netWorth"
          name="netWorth"
          stroke="#8b5cf6"
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
