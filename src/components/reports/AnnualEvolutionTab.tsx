"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AnnualComparisonChart } from "@/components/Charts/AnnualComparisonChart";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, Scale } from "lucide-react";

interface MonthData {
  month: number;
  monthLabel: string;
  income: number;
  expense: number;
  prevIncome: number;
  prevExpense: number;
  incomeChange: number;
  expenseChange: number;
}

interface AnnualData {
  months: MonthData[];
  totals: {
    income: number;
    expense: number;
    prevIncome: number;
    prevExpense: number;
  };
}

interface Props {
  filterYear: string;
}

export function AnnualEvolutionTab({ filterYear }: Props) {
  const [data, setData] = useState<AnnualData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/reports/annual?year=${filterYear}`);
        if (!res.ok) throw new Error("Fetch failed");
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching annual data:", error);
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

  if (!data) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Sem dados para exibir
      </div>
    );
  }

  const balance = data.totals.income - data.totals.expense;
  const prevBalance = data.totals.prevIncome - data.totals.prevExpense;
  const balanceChange =
    prevBalance !== 0
      ? ((balance - prevBalance) / Math.abs(prevBalance)) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total de Receitas
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(data.totals.income)}
            </div>
            <p className="text-xs text-gray-500">
              Anterior: {formatCurrency(data.totals.prevIncome)}
            </p>
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
              {formatCurrency(data.totals.expense)}
            </div>
            <p className="text-xs text-gray-500">
              Anterior: {formatCurrency(data.totals.prevExpense)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Anual</CardTitle>
            <Scale className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                balance >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(balance)}
            </div>
            <p className="text-xs text-gray-500">
              Anterior: {formatCurrency(prevBalance)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Variacao do Saldo
            </CardTitle>
            {balanceChange >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                balanceChange >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {balanceChange >= 0 ? "+" : ""}
              {balanceChange.toFixed(1)}%
            </div>
            <p className="text-xs text-gray-500">vs ano anterior</p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Comparativo Anual</CardTitle>
        </CardHeader>
        <CardContent>
          {data.months.some((m) => m.income > 0 || m.expense > 0) ? (
            <AnnualComparisonChart data={data.months} />
          ) : (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Sem dados para exibir
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-gray-500">Mes</th>
                  <th className="pb-2 text-right font-medium text-gray-500">
                    Receita
                  </th>
                  <th className="pb-2 text-right font-medium text-gray-500">
                    Rec. Anterior
                  </th>
                  <th className="pb-2 text-right font-medium text-gray-500">
                    Despesa
                  </th>
                  <th className="pb-2 text-right font-medium text-gray-500">
                    Desp. Anterior
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.month} className="border-b last:border-0">
                    <td className="py-2 font-medium">{m.monthLabel}</td>
                    <td className="py-2 text-right text-green-600">
                      {formatCurrency(m.income)}
                    </td>
                    <td className="py-2 text-right text-green-400">
                      {formatCurrency(m.prevIncome)}
                    </td>
                    <td className="py-2 text-right text-red-600">
                      {formatCurrency(m.expense)}
                    </td>
                    <td className="py-2 text-right text-red-400">
                      {formatCurrency(m.prevExpense)}
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
