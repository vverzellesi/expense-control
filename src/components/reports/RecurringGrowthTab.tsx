"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RecurringGrowthChart } from "@/components/Charts/RecurringGrowthChart";
import { formatCurrency } from "@/lib/utils";
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
} from "lucide-react";

interface RecurringGrowthItem {
  description: string;
  currentAmount: number;
  firstAmount: number;
  changeAmount: number;
  changePercent: number;
  categoryName: string | null;
  categoryColor: string | null;
  isActive: boolean;
  monthlyAmounts: number[];
}

interface RecurringGrowthData {
  summary: {
    totalMonthly: number;
    increasedCount: number;
    decreasedCount: number;
    averageGrowthPercent: number;
  };
  items: RecurringGrowthItem[];
}

interface Props {
  filterYear: string;
}

export function RecurringGrowthTab({ filterYear }: Props) {
  const [data, setData] = useState<RecurringGrowthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/reports/recurring-growth?year=${filterYear}`
        );
        if (!res.ok) throw new Error("Fetch failed");
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching recurring growth data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [filterYear]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  if (!data || data.items.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Sem dados para exibir
      </div>
    );
  }

  const { summary } = data;
  const avgIsPositive = summary.averageGrowthPercent >= 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Custo Mensal Total
            </CardTitle>
            <DollarSign className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(summary.totalMonthly)}
            </div>
            <p className="text-xs text-muted-foreground">
              soma dos recorrentes ativos
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Aumentaram</CardTitle>
            <TrendingUp className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {summary.increasedCount}
            </div>
            <p className="text-xs text-muted-foreground">
              itens com aumento de preco
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Diminuiram</CardTitle>
            <TrendingDown className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {summary.decreasedCount}
            </div>
            <p className="text-xs text-muted-foreground">
              itens com reducao de preco
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Crescimento Medio
            </CardTitle>
            <BarChart3 className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                avgIsPositive ? "text-red-600" : "text-green-600"
              }`}
            >
              {avgIsPositive ? "+" : ""}
              {summary.averageGrowthPercent.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">
              variacao media de preco
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Variacao de Preco por Item</CardTitle>
        </CardHeader>
        <CardContent>
          <RecurringGrowthChart data={data.items} />
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento de Gastos Recorrentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-medium text-muted-foreground">
                    Descricao
                  </th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">
                    Valor Atual
                  </th>
                  <th className="hidden pb-3 text-right font-medium text-muted-foreground sm:table-cell">
                    Valor Inicial
                  </th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">
                    Variacao
                  </th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">
                    %
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items
                  .filter((item) => item.firstAmount > 0)
                  .sort(
                    (a, b) =>
                      Math.abs(b.changePercent) - Math.abs(a.changePercent)
                  )
                  .map((item) => (
                    <tr
                      key={item.description}
                      className="border-b last:border-0"
                    >
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          {item.categoryColor && (
                            <div
                              className="h-3 w-3 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: item.categoryColor }}
                            />
                          )}
                          <span className="font-medium">
                            {item.description}
                          </span>
                          {!item.isActive && (
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                              inativo
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 text-right font-semibold">
                        {formatCurrency(item.currentAmount)}
                      </td>
                      <td className="hidden py-3 text-right text-muted-foreground sm:table-cell">
                        {formatCurrency(item.firstAmount)}
                      </td>
                      <td
                        className={`py-3 text-right font-semibold ${
                          item.changeAmount > 0
                            ? "text-red-600"
                            : item.changeAmount < 0
                              ? "text-green-600"
                              : "text-gray-500"
                        }`}
                      >
                        {item.changeAmount > 0 ? "+" : ""}
                        {formatCurrency(item.changeAmount)}
                      </td>
                      <td
                        className={`py-3 text-right font-semibold ${
                          item.changePercent > 0
                            ? "text-red-600"
                            : item.changePercent < 0
                              ? "text-green-600"
                              : "text-gray-500"
                        }`}
                      >
                        {item.changePercent > 0 ? "+" : ""}
                        {item.changePercent.toFixed(1)}%
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
