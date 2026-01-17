"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CategoryPieChart } from "@/components/Charts/CategoryPieChart";
import { MonthlyBarChart } from "@/components/Charts/MonthlyBarChart";
import { formatCurrency } from "@/lib/utils";
import { Download, TrendingUp, TrendingDown } from "lucide-react";
import type { Category } from "@/types";

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

export default function ReportsPage() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const currentDate = new Date();
  const [filterMonth, setFilterMonth] = useState(String(currentDate.getMonth() + 1));
  const [filterYear, setFilterYear] = useState(String(currentDate.getFullYear()));
  const [filterCategory, setFilterCategory] = useState("all");

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchData();
  }, [filterMonth, filterYear]);

  async function fetchCategories() {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data);
  }

  async function fetchData() {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/summary?month=${filterMonth}&year=${filterYear}`
      );
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleExport() {
    const params = new URLSearchParams();
    if (filterMonth) params.set("month", filterMonth);
    if (filterYear) params.set("year", filterYear);
    if (filterCategory && filterCategory !== "all") params.set("categoryId", filterCategory);

    window.location.href = `/api/export?${params.toString()}`;
  }

  const months = [
    { value: "1", label: "Janeiro" },
    { value: "2", label: "Fevereiro" },
    { value: "3", label: "Marco" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Maio" },
    { value: "6", label: "Junho" },
    { value: "7", label: "Julho" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];

  const years = Array.from({ length: 5 }, (_, i) => {
    const year = currentDate.getFullYear() - 2 + i;
    return { value: String(year), label: String(year) };
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatórios</h1>
          <p className="text-gray-500">Visualize e exporte seus dados</p>
        </div>
        <Button onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>Mes</Label>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Ano</Label>
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.value} value={y.value}>
                      {y.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Categoria (para exportacao)</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

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
