"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InvestmentEvolutionChart } from "@/components/Charts/InvestmentEvolutionChart";
import { InvestmentPieChart } from "@/components/Charts/InvestmentPieChart";
import { formatCurrency } from "@/lib/utils";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Target,
} from "lucide-react";

interface Snapshot {
  month: number;
  year: number;
  totalValue: number;
  totalInvested: number;
  totalWithdrawn: number;
}

interface SnapshotsResponse {
  snapshots: Snapshot[];
  current: Snapshot;
}

interface CategoryBreakdown {
  id: string;
  name: string;
  color: string;
  value: number;
  percent: number;
}

interface GoalProgress {
  investmentId: string;
  name: string;
  current: number;
  goal: number;
  percent: number;
}

interface SummaryResponse {
  totalValue: number;
  totalInvested: number;
  totalWithdrawn: number;
  totalReturn: number;
  totalReturnPercent: number;
  byCategory: CategoryBreakdown[];
  goalsProgress: GoalProgress[];
  investmentCount: number;
}

export function InvestmentsTab() {
  const [snapshotsData, setSnapshotsData] =
    useState<SnapshotsResponse | null>(null);
  const [summaryData, setSummaryData] = useState<SummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const [snapshotsRes, summaryRes] = await Promise.all([
          fetch("/api/investments/snapshots?months=12"),
          fetch("/api/investments/summary"),
        ]);
        const [snapshots, summary] = await Promise.all([
          snapshotsRes.json(),
          summaryRes.json(),
        ]);
        setSnapshotsData(snapshots);
        setSummaryData(summary);
      } catch (error) {
        console.error("Error fetching investment data:", error);
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

  if (!summaryData) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Sem dados para exibir
      </div>
    );
  }

  // Build chart data: snapshots + current appended
  const chartData: Snapshot[] = [
    ...(snapshotsData?.snapshots || []),
    ...(snapshotsData?.current ? [snapshotsData.current] : []),
  ];

  const pieData = summaryData.byCategory.map((cat) => ({
    name: cat.name,
    value: cat.value,
    color: cat.color,
  }));

  const isPositiveReturn = summaryData.totalReturn >= 0;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Valor Total</CardTitle>
            <Wallet className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(summaryData.totalValue)}
            </div>
            <p className="text-xs text-muted-foreground">
              {summaryData.investmentCount}{" "}
              {summaryData.investmentCount === 1
                ? "investimento"
                : "investimentos"}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Investido
            </CardTitle>
            <PiggyBank className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(summaryData.totalInvested)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Retorno Total</CardTitle>
            {isPositiveReturn ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                isPositiveReturn ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(summaryData.totalReturn)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Retorno %</CardTitle>
            {isPositiveReturn ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                isPositiveReturn ? "text-green-600" : "text-red-600"
              }`}
            >
              {summaryData.totalReturnPercent >= 0 ? "+" : ""}
              {summaryData.totalReturnPercent.toFixed(2)}%
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Evolucao do Patrimonio</CardTitle>
          </CardHeader>
          <CardContent>
            {chartData.length > 0 ? (
              <InvestmentEvolutionChart data={chartData} />
            ) : (
              <div className="flex h-64 items-center justify-center text-gray-500">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Distribuicao por Categoria</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <>
                <InvestmentPieChart data={pieData} />
                <div className="mt-4 space-y-2">
                  {summaryData.byCategory.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: cat.color }}
                        />
                        <span>{cat.name}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-muted-foreground">
                          {cat.percent.toFixed(1)}%
                        </span>
                        <span className="font-semibold">
                          {formatCurrency(cat.value)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex h-64 items-center justify-center text-gray-500">
                Sem dados para exibir
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Goals Progress */}
      {summaryData.goalsProgress.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-emerald-500" />
              Progresso das Metas
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {summaryData.goalsProgress.map((goal) => (
                <div key={goal.investmentId} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{goal.name}</span>
                    <span className="text-muted-foreground">
                      {formatCurrency(goal.current)} /{" "}
                      {formatCurrency(goal.goal)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                      <div
                        className={`h-full rounded-full transition-all ${
                          goal.percent >= 100
                            ? "bg-emerald-500"
                            : goal.percent >= 50
                              ? "bg-blue-500"
                              : "bg-orange-500"
                        }`}
                        style={{
                          width: `${Math.min(goal.percent, 100)}%`,
                        }}
                      />
                    </div>
                    <span className="min-w-[50px] text-right text-sm font-semibold">
                      {goal.percent.toFixed(1)}%
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
