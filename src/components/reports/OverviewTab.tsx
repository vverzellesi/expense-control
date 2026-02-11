"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryPieChart } from "@/components/Charts/CategoryPieChart";
import { MonthlyBarChart } from "@/components/Charts/MonthlyBarChart";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface SummaryData {
  summary: {
    income: number;
    expense: number;
    balance: number;
  };
  categoryBreakdown: {
    categoryId: string;
    categoryName: string;
    categoryColor: string;
    total: number;
    percentage: number;
  }[];
  monthlyData: {
    month: string;
    year: number;
    income: number;
    expense: number;
  }[];
}

interface Props {
  filterMonth: string;
  filterYear: string;
}

export function OverviewTab({ filterMonth, filterYear }: Props) {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/summary?month=${filterMonth}&year=${filterYear}`
        );
        if (!res.ok) throw new Error("Fetch failed");
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching data:", error);
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Receitas
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(data?.summary.income || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Despesas
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(data?.summary.expense || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo do Mes</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                (data?.summary.balance || 0) >= 0
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {formatCurrency(data?.summary.balance || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Despesas por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.categoryBreakdown && data.categoryBreakdown.length > 0 ? (
              <CategoryPieChart data={data.categoryBreakdown} />
            ) : (
              <div className="flex h-64 items-center justify-center text-gray-500">
                Nenhuma despesa neste periodo
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Evolucao Mensal</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.monthlyData && data.monthlyData.length > 0 ? (
              <MonthlyBarChart data={data.monthlyData} />
            ) : (
              <div className="flex h-64 items-center justify-center text-gray-500">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Category Breakdown Table */}
      {data?.categoryBreakdown && data.categoryBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Detalhamento por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.categoryBreakdown.map((item) => (
                <div
                  key={item.categoryId}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="h-4 w-4 rounded-full"
                      style={{ backgroundColor: item.categoryColor }}
                    />
                    <span className="font-medium">{item.categoryName}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-32">
                      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${item.percentage}%`,
                            backgroundColor: item.categoryColor,
                          }}
                        />
                      </div>
                    </div>
                    <span className="min-w-[60px] text-right text-sm text-gray-500">
                      {item.percentage.toFixed(1)}%
                    </span>
                    <span className="min-w-[100px] text-right font-semibold">
                      {formatCurrency(item.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
