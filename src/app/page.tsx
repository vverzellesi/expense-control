"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import { Plus, TrendingUp, TrendingDown, Wallet, AlertCircle } from "lucide-react";
import Link from "next/link";
import { CategoryPieChart } from "@/components/Charts/CategoryPieChart";
import { MonthlyBarChart } from "@/components/Charts/MonthlyBarChart";
import type { Transaction, Category } from "@/types";

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
  fixedExpenses: (Transaction & { category: Category | null })[];
  upcomingInstallments: (Transaction & { category: Category | null })[];
}

export default function Dashboard() {
  const [data, setData] = useState<SummaryData | null>(null);
  const [loading, setLoading] = useState(true);

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch(
          `/api/summary?month=${currentMonth}&year=${currentYear}`
        );
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching summary:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [currentMonth, currentYear]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  const monthName = currentDate.toLocaleDateString("pt-BR", { month: "long" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 capitalize">{monthName} {currentYear}</p>
        </div>
        <Link href="/transactions?new=true">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            Nova Transação
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Receitas</CardTitle>
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
            <CardTitle className="text-sm font-medium">Despesas</CardTitle>
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
            <CardTitle className="text-sm font-medium">Saldo</CardTitle>
            <Wallet className="h-4 w-4 text-blue-500" />
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
                Nenhuma despesa neste mes
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ultimos 6 Meses</CardTitle>
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

      {/* Fixed Expenses & Upcoming Installments */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Despesas Fixas</CardTitle>
          </CardHeader>
          <CardContent>
            {data?.fixedExpenses && data.fixedExpenses.length > 0 ? (
              <div className="space-y-3">
                {data.fixedExpenses.slice(0, 5).map((expense) => (
                  <div
                    key={expense.id}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      {expense.category && (
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: expense.category.color }}
                        />
                      )}
                      <span className="text-sm">{expense.description}</span>
                    </div>
                    <span className="text-sm font-medium text-red-600">
                      {formatCurrency(Math.abs(expense.amount))}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Nenhuma despesa fixa cadastrada
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="h-4 w-4 text-amber-500" />
              Parcelas Futuras
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data?.upcomingInstallments && data.upcomingInstallments.length > 0 ? (
              <div className="space-y-3">
                {data.upcomingInstallments.slice(0, 5).map((installment) => (
                  <div
                    key={installment.id}
                    className="flex items-center justify-between"
                  >
                    <div>
                      <span className="text-sm">{installment.description}</span>
                      <span className="ml-2 text-xs text-gray-500">
                        {new Date(installment.date).toLocaleDateString("pt-BR", {
                          month: "short",
                        })}
                      </span>
                    </div>
                    <span className="text-sm font-medium text-red-600">
                      {formatCurrency(Math.abs(installment.amount))}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-500">
                Nenhuma parcela futura
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
