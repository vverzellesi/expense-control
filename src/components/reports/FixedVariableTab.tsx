"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FixedVariableChart } from "@/components/Charts/FixedVariableChart";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Lock, Shuffle, Percent, DollarSign } from "lucide-react";

interface FixedVariableData {
  currentMonth: {
    fixed: number;
    variable: number;
    total: number;
    fixedPercentage: number;
  };
  monthlyBreakdown: {
    monthLabel: string;
    fixed: number;
    variable: number;
  }[];
  fixedExpenses: {
    description: string;
    amount: number;
    categoryName: string;
  }[];
  topVariableExpenses: {
    description: string;
    amount: number;
    categoryName: string;
    date: string;
  }[];
}

interface Props {
  filterMonth: string;
  filterYear: string;
}

export function FixedVariableTab({ filterMonth, filterYear }: Props) {
  const [data, setData] = useState<FixedVariableData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/reports/fixed-variable?month=${filterMonth}&year=${filterYear}`
        );
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching fixed/variable data:", error);
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

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Sem dados para exibir
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Despesas Fixas</CardTitle>
            <Lock className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(data.currentMonth.fixed)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Despesas Variaveis</CardTitle>
            <Shuffle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(data.currentMonth.variable)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">% Fixas</CardTitle>
            <Percent className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {data.currentMonth.fixedPercentage.toFixed(1)}%
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total</CardTitle>
            <DollarSign className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(data.currentMonth.total)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Evolucao Fixas vs Variaveis (12 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.monthlyBreakdown.length > 0 ? (
            <FixedVariableChart data={data.monthlyBreakdown} />
          ) : (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Sem dados para exibir
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expense Lists */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Fixed Expenses */}
        <Card>
          <CardHeader>
            <CardTitle>Despesas Fixas do Mes</CardTitle>
          </CardHeader>
          <CardContent>
            {data.fixedExpenses.length > 0 ? (
              <div className="space-y-3">
                {data.fixedExpenses.map((expense, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{expense.description}</div>
                      <div className="text-xs text-gray-500">{expense.categoryName}</div>
                    </div>
                    <span className="font-semibold text-sm">
                      {formatCurrency(expense.amount)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-gray-500 text-sm">
                Nenhuma despesa fixa neste mes
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top Variable Expenses */}
        <Card>
          <CardHeader>
            <CardTitle>Top 10 Despesas Variaveis</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topVariableExpenses.length > 0 ? (
              <div className="space-y-3">
                {data.topVariableExpenses.map((expense, idx) => (
                  <div key={idx} className="flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{expense.description}</div>
                      <div className="text-xs text-gray-500">
                        {expense.categoryName} - {formatDate(expense.date + "T12:00:00")}
                      </div>
                    </div>
                    <span className="font-semibold text-sm">
                      {formatCurrency(expense.amount)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex h-32 items-center justify-center text-gray-500 text-sm">
                Nenhuma despesa variavel neste mes
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
