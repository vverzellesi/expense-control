"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { NetWorthChart } from "@/components/Charts/NetWorthChart";
import { formatCurrency } from "@/lib/utils";
import {
  Wallet,
  Landmark,
  PiggyBank,
  TrendingUp,
  TrendingDown,
} from "lucide-react";

interface MonthData {
  monthLabel: string;
  income: number;
  expense: number;
  cashDelta: number;
  cumulativeCash: number;
  investmentValue: number;
  netWorth: number;
}

interface NetWorthData {
  months: MonthData[];
  current: {
    netWorth: number;
    cashBalance: number;
    investmentValue: number;
    monthlyChange: number;
  };
}

interface Props {
  filterYear: string;
}

export function NetWorthTab({ filterYear }: Props) {
  const [data, setData] = useState<NetWorthData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(`/api/reports/net-worth?year=${filterYear}`);
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching net worth data:", error);
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

  if (!data || data.months.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Sem dados para exibir
      </div>
    );
  }

  const { current } = data;
  const changeIsPositive = current.monthlyChange >= 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Patrimonio Liquido
            </CardTitle>
            <Wallet className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {formatCurrency(current.netWorth)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Saldo Acumulado
            </CardTitle>
            <Landmark className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                current.cashBalance >= 0 ? "text-blue-600" : "text-red-600"
              }`}
            >
              {formatCurrency(current.cashBalance)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Investimentos
            </CardTitle>
            <PiggyBank className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(current.investmentValue)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Variacao Mensal
            </CardTitle>
            {changeIsPositive ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                changeIsPositive ? "text-green-600" : "text-red-600"
              }`}
            >
              {changeIsPositive ? "+" : ""}
              {formatCurrency(current.monthlyChange)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Evolucao do Patrimonio</CardTitle>
        </CardHeader>
        <CardContent>
          <NetWorthChart data={data.months} />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            Saldo acumulado relativo ao inicio do ano
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
