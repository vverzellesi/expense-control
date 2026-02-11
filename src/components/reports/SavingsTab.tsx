"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SavingsHistoryChart } from "@/components/Charts/SavingsHistoryChart";
import { formatCurrency } from "@/lib/utils";
import { MONTH_LABELS } from "@/lib/constants";
import {
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Target,
  Flame,
} from "lucide-react";

interface SavingsEntry {
  id: string;
  month: number;
  year: number;
  goal: number;
  actual: number;
  isAchieved: boolean;
  percentage: number;
}

function calculateStreak(entries: SavingsEntry[]): number {
  // Entries come newest first from API
  let streak = 0;
  for (const entry of entries) {
    if (entry.isAchieved) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function SavingsTab() {
  const [data, setData] = useState<SavingsEntry[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch("/api/savings-history?limit=24");
        if (!res.ok) throw new Error("Fetch failed");
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching savings history:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Sem dados para exibir
      </div>
    );
  }

  const streak = calculateStreak(data);
  const bestMonth = data.reduce((best, entry) =>
    entry.actual > best.actual ? entry : best
  );
  const worstMonth = data.reduce((worst, entry) =>
    entry.actual < worst.actual ? entry : worst
  );
  const averageActual =
    data.reduce((sum, entry) => sum + entry.actual, 0) / data.length;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sequencia</CardTitle>
            <Flame className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {streak} {streak === 1 ? "mes" : "meses"}
            </div>
            <p className="text-xs text-muted-foreground">
              meses consecutivos atingindo a meta
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Melhor Mes</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(bestMonth.actual)}
            </div>
            <p className="text-xs text-muted-foreground">
              {MONTH_LABELS[bestMonth.month - 1]}/{bestMonth.year}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pior Mes</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(worstMonth.actual)}
            </div>
            <p className="text-xs text-muted-foreground">
              {MONTH_LABELS[worstMonth.month - 1]}/{worstMonth.year}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Media Mensal
            </CardTitle>
            <Target className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(averageActual)}
            </div>
            <p className="text-xs text-muted-foreground">
              economia media por mes
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Historico de Economia</CardTitle>
        </CardHeader>
        <CardContent>
          <SavingsHistoryChart data={data} />
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-3 font-medium text-muted-foreground">
                    Mes
                  </th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">
                    Meta
                  </th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">
                    Economizado
                  </th>
                  <th className="pb-3 text-right font-medium text-muted-foreground">
                    %
                  </th>
                  <th className="pb-3 text-center font-medium text-muted-foreground">
                    Atingido
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.map((entry) => (
                  <tr key={entry.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">
                      {MONTH_LABELS[entry.month - 1]}/{entry.year}
                    </td>
                    <td className="py-3 text-right text-muted-foreground">
                      {formatCurrency(entry.goal)}
                    </td>
                    <td
                      className={`py-3 text-right font-semibold ${
                        entry.isAchieved ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {formatCurrency(entry.actual)}
                    </td>
                    <td className="py-3 text-right text-muted-foreground">
                      {entry.percentage.toFixed(1)}%
                    </td>
                    <td className="py-3 text-center">
                      {entry.isAchieved ? (
                        <CheckCircle className="mx-auto h-5 w-5 text-green-500" />
                      ) : (
                        <XCircle className="mx-auto h-5 w-5 text-red-400" />
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
