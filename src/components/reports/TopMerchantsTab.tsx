"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Store, TrendingUp, TrendingDown, Hash, DollarSign } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useMediaQuery } from "@/lib/hooks";

interface MerchantData {
  merchant: string;
  total: number;
  count: number;
  average: number;
  previousTotal: number;
  changePercent: number | null;
}

interface TopMerchantsData {
  topMerchants: MerchantData[];
  totalMerchants: number;
  totalExpenses: number;
}

interface Props {
  filterMonth: string;
  filterYear: string;
}

export function TopMerchantsTab({ filterMonth, filterYear }: Props) {
  const [data, setData] = useState<TopMerchantsData | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = useMediaQuery("(max-width: 768px)");

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/reports/top-merchants?month=${filterMonth}&year=${filterYear}`
        );
        if (!res.ok) throw new Error("Fetch failed");
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching top merchants data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [filterMonth, filterYear]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  if (!data || data.topMerchants.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Nenhum gasto encontrado para este período
      </div>
    );
  }

  const topMerchant = data.topMerchants[0];

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estabelecimentos</CardTitle>
            <Hash className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {data.totalMerchants}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Gasto</CardTitle>
            <DollarSign className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.totalExpenses)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Maior Gasto</CardTitle>
            <Store className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {topMerchant.merchant}
            </div>
            <p className="text-xs text-gray-500">
              {formatCurrency(topMerchant.total)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Horizontal Bar Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Top 10 Estabelecimentos</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={isMobile ? 320 : 400}>
            <BarChart
              data={data.topMerchants}
              layout="vertical"
              margin={isMobile ? { left: 0, right: 10 } : { left: 20, right: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                type="number"
                tick={{ fontSize: isMobile ? 10 : 12 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) =>
                  new Intl.NumberFormat("pt-BR", {
                    notation: "compact",
                    compactDisplay: "short",
                  }).format(value)
                }
              />
              <YAxis
                type="category"
                dataKey="merchant"
                tick={{ fontSize: isMobile ? 9 : 12 }}
                tickLine={false}
                axisLine={false}
                width={isMobile ? 80 : 140}
              />
              <Tooltip
                formatter={(value: number) => [formatCurrency(value), "Total"]}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="total" fill="#10b981" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento por Estabelecimento</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-gray-500">Estabelecimento</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Total</th>
                  <th className="pb-2 font-medium text-gray-500 text-right hidden sm:table-cell">Visitas</th>
                  <th className="pb-2 font-medium text-gray-500 text-right hidden sm:table-cell">Ticket Médio</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">vs Anterior</th>
                </tr>
              </thead>
              <tbody>
                {data.topMerchants.map((merchant, idx) => (
                  <tr key={idx} className="border-b last:border-0">
                    <td className="py-2 font-medium">{merchant.merchant}</td>
                    <td className="py-2 text-right">{formatCurrency(merchant.total)}</td>
                    <td className="py-2 text-right hidden sm:table-cell">{merchant.count}</td>
                    <td className="py-2 text-right hidden sm:table-cell">
                      {formatCurrency(merchant.average)}
                    </td>
                    <td className="py-2 text-right">
                      {merchant.changePercent !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 ${
                            merchant.changePercent > 0 ? "text-red-600" : "text-emerald-600"
                          }`}
                        >
                          {merchant.changePercent > 0 ? (
                            <TrendingUp className="h-3 w-3" />
                          ) : (
                            <TrendingDown className="h-3 w-3" />
                          )}
                          {Math.abs(merchant.changePercent)}%
                        </span>
                      ) : (
                        <span className="text-gray-400">Novo</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
