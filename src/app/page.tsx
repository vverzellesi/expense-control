"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/utils";
import { Plus, TrendingUp, TrendingDown, Wallet, AlertCircle, AlertTriangle, PiggyBank, Target } from "lucide-react";
import Link from "next/link";
import { CategoryPieChart } from "@/components/Charts/CategoryPieChart";
import { MonthlyBarChart } from "@/components/Charts/MonthlyBarChart";
import type { Transaction, Category } from "@/types";

interface BudgetAlert {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  budgetAmount: number;
  spent: number;
  percentage: number;
  isOver: boolean;
}

interface SavingsGoal {
  goal: number;
  current: number;
  percentage: number | null;
  isAchieved: boolean;
}

interface SummaryData {
  summary: {
    income: number;
    expense: number;
    balance: number;
  };
  comparison: {
    incomeChange: number;
    expenseChange: number;
    balanceChange: number;
    previousMonth: {
      income: number;
      expense: number;
      balance: number;
    };
  };
  savingsGoal: SavingsGoal | null;
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
  budgetAlerts: BudgetAlert[];
  allBudgets: BudgetAlert[];
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
            {data?.comparison && data.comparison.previousMonth.income > 0 && (
              <div className={`mt-1 flex items-center text-xs ${
                data.comparison.incomeChange >= 0 ? "text-green-600" : "text-red-600"
              }`}>
                {data.comparison.incomeChange >= 0 ? (
                  <TrendingUp className="mr-1 h-3 w-3" />
                ) : (
                  <TrendingDown className="mr-1 h-3 w-3" />
                )}
                {data.comparison.incomeChange >= 0 ? "+" : ""}{data.comparison.incomeChange.toFixed(1)}% vs mes anterior
              </div>
            )}
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
            {data?.comparison && data.comparison.previousMonth.expense > 0 && (
              <div className={`mt-1 flex items-center text-xs ${
                data.comparison.expenseChange <= 0 ? "text-green-600" : "text-red-600"
              }`}>
                {data.comparison.expenseChange <= 0 ? (
                  <TrendingDown className="mr-1 h-3 w-3" />
                ) : (
                  <TrendingUp className="mr-1 h-3 w-3" />
                )}
                {data.comparison.expenseChange >= 0 ? "+" : ""}{data.comparison.expenseChange.toFixed(1)}% vs mes anterior
              </div>
            )}
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
            {data?.comparison && data.comparison.previousMonth.balance !== 0 && (
              <div className={`mt-1 flex items-center text-xs ${
                data.comparison.balanceChange >= 0 ? "text-green-600" : "text-red-600"
              }`}>
                {data.comparison.balanceChange >= 0 ? (
                  <TrendingUp className="mr-1 h-3 w-3" />
                ) : (
                  <TrendingDown className="mr-1 h-3 w-3" />
                )}
                {data.comparison.balanceChange >= 0 ? "+" : ""}{data.comparison.balanceChange.toFixed(1)}% vs mes anterior
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Budget Alerts */}
      {data?.budgetAlerts && data.budgetAlerts.length > 0 && (
        <Card className="border-orange-200 bg-orange-50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg text-orange-800">
              <AlertTriangle className="h-5 w-5" />
              Alertas de Orcamento
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.budgetAlerts.map((alert) => (
                <div
                  key={alert.categoryId}
                  className="rounded-lg bg-white p-3 shadow-sm"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: alert.categoryColor }}
                      />
                      <span className="font-medium">{alert.categoryName}</span>
                    </div>
                    <span className={`text-sm font-semibold ${
                      alert.isOver ? "text-red-600" : "text-orange-600"
                    }`}>
                      {alert.percentage.toFixed(0)}%
                    </span>
                  </div>
                  <div className="mt-2">
                    <Progress
                      value={Math.min(alert.percentage, 100)}
                      className={`h-2 ${
                        alert.isOver ? "[&>div]:bg-red-500" : "[&>div]:bg-orange-500"
                      }`}
                    />
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-gray-500">
                    <span>{formatCurrency(alert.spent)} gastos</span>
                    <span>Limite: {formatCurrency(alert.budgetAmount)}</span>
                  </div>
                  {alert.isOver && (
                    <div className="mt-1 text-xs text-red-600">
                      Excedido em {formatCurrency(alert.spent - alert.budgetAmount)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Budget Progress Cards */}
      {data?.allBudgets && data.allBudgets.length > 0 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Metas por Categoria</h2>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {data.allBudgets.map((budget) => (
              <Card
                key={budget.categoryId}
                className={`${
                  budget.isOver
                    ? "border-red-200 bg-red-50"
                    : budget.percentage >= 80
                    ? "border-orange-200 bg-orange-50"
                    : "border-gray-200"
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <div
                      className="h-3 w-3 rounded-full"
                      style={{ backgroundColor: budget.categoryColor }}
                    />
                    <span className="text-sm font-medium truncate">{budget.categoryName}</span>
                  </div>
                  <Progress
                    value={Math.min(budget.percentage, 100)}
                    className={`h-2 ${
                      budget.isOver
                        ? "[&>div]:bg-red-500"
                        : budget.percentage >= 80
                        ? "[&>div]:bg-orange-500"
                        : "[&>div]:bg-blue-500"
                    }`}
                  />
                  <div className="mt-2 flex justify-between text-xs">
                    <span className={budget.isOver ? "text-red-600 font-medium" : "text-gray-600"}>
                      {formatCurrency(budget.spent)}
                    </span>
                    <span className="text-gray-500">
                      {formatCurrency(budget.budgetAmount)}
                    </span>
                  </div>
                  <div className={`text-xs mt-1 ${
                    budget.isOver
                      ? "text-red-600"
                      : budget.percentage >= 80
                      ? "text-orange-600"
                      : "text-gray-500"
                  }`}>
                    {budget.percentage.toFixed(0)}% utilizado
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

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

      {/* Savings Goal Card */}
      {data?.savingsGoal && (
        <Card className={`border-2 ${
          data.savingsGoal.isAchieved
            ? "border-green-200 bg-green-50"
            : "border-blue-200 bg-blue-50"
        }`}>
          <CardHeader className="pb-3">
            <CardTitle className={`flex items-center gap-2 text-lg ${
              data.savingsGoal.isAchieved ? "text-green-800" : "text-blue-800"
            }`}>
              <PiggyBank className="h-5 w-5" />
              Meta de Economia
              {data.savingsGoal.isAchieved && (
                <span className="ml-2 rounded-full bg-green-500 px-2 py-0.5 text-xs font-bold text-white">
                  Atingida!
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <div className="flex-1">
                <div className={`text-3xl font-bold ${
                  data.savingsGoal.current >= 0 ? "text-green-600" : "text-red-600"
                }`}>
                  {formatCurrency(data.savingsGoal.current)}
                </div>
                <div className="mt-1 text-sm text-gray-600">
                  de {formatCurrency(data.savingsGoal.goal)} meta
                </div>
                <div className="mt-3">
                  <Progress
                    value={Math.max(0, Math.min(data.savingsGoal.percentage || 0, 100))}
                    className={`h-3 ${
                      data.savingsGoal.isAchieved
                        ? "[&>div]:bg-green-500"
                        : "[&>div]:bg-blue-500"
                    }`}
                  />
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {data.savingsGoal.percentage !== null
                    ? `${Math.max(0, data.savingsGoal.percentage).toFixed(0)}% da meta`
                    : "0% da meta"}
                </div>
              </div>
              <Link href="/settings">
                <Button variant="outline" size="sm">
                  <Target className="mr-2 h-4 w-4" />
                  Editar Meta
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
