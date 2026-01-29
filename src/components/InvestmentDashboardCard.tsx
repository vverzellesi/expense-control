"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InvestmentPieChart } from "@/components/Charts/InvestmentPieChart";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, Plus, ChevronRight } from "lucide-react";
import Link from "next/link";

interface CategoryAllocation {
  id: string;
  name: string;
  value: number;
  color: string;
  percent: number;
}

interface InvestmentSummary {
  totalValue: number;
  totalInvested: number;
  totalWithdrawn: number;
  totalReturn: number;
  totalReturnPercent: number;
  byCategory: CategoryAllocation[];
  investmentCount: number;
}

export function InvestmentDashboardCard() {
  const [data, setData] = useState<InvestmentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const res = await fetch("/api/investments/summary");
        if (!res.ok) {
          throw new Error("Failed to fetch investment summary");
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        console.error("Error fetching investment summary:", err);
        setError(true);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  // Loading state
  if (loading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Investimentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {/* Chart skeleton */}
            <div className="flex justify-center">
              <div className="h-[200px] w-[200px] rounded-full bg-gray-100 animate-pulse" />
            </div>
            {/* Stats skeleton */}
            <div className="space-y-3">
              <div className="h-8 w-3/4 bg-gray-100 rounded animate-pulse" />
              <div className="h-6 w-1/2 bg-gray-100 rounded animate-pulse" />
            </div>
            {/* Legend skeleton */}
            <div className="space-y-2">
              <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
              <div className="h-4 w-full bg-gray-100 rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state or empty state
  if (error || !data || data.byCategory.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <TrendingUp className="h-5 w-5 text-emerald-500" />
            Investimentos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="rounded-full bg-emerald-100 p-4 mb-4">
              <TrendingUp className="h-8 w-8 text-emerald-600" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Comece a investir
            </h3>
            <p className="text-sm text-gray-500 mb-4 max-w-[250px]">
              Adicione seus investimentos e acompanhe seu patrimonio em um so lugar.
            </p>
            <Link href="/investments?new=true">
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar Investimento
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  const isPositiveReturn = data.totalReturnPercent >= 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <TrendingUp className="h-5 w-5 text-emerald-500" />
          Investimentos
        </CardTitle>
        <Link
          href="/investments"
          className="flex items-center gap-1 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
        >
          Ver todos
          <ChevronRight className="h-4 w-4" />
        </Link>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {/* Left side: Donut chart */}
          <div className="flex items-center justify-center">
            <InvestmentPieChart
              data={data.byCategory.map((cat) => ({
                name: cat.name,
                value: cat.value,
                color: cat.color,
              }))}
            />
          </div>

          {/* Right side: Summary stats */}
          <div className="flex flex-col justify-center space-y-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">Patrimonio Total</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCurrency(data.totalValue)}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 mb-1">Rendimento Total</p>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xl font-semibold ${
                    isPositiveReturn ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {formatCurrency(data.totalReturn)}
                </span>
                <span
                  className={`flex items-center text-sm font-medium ${
                    isPositiveReturn ? "text-green-600" : "text-red-600"
                  }`}
                >
                  {isPositiveReturn ? (
                    <TrendingUp className="mr-1 h-4 w-4" />
                  ) : (
                    <TrendingDown className="mr-1 h-4 w-4" />
                  )}
                  {isPositiveReturn ? "+" : ""}
                  {data.totalReturnPercent.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Category legend with values and percentages */}
        <div className="mt-6 pt-4 border-t">
          <div className="grid gap-2 sm:grid-cols-2">
            {data.byCategory.map((category) => (
              <div
                key={category.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: category.color }}
                  />
                  <span className="text-sm font-medium text-gray-700 truncate max-w-[100px]">
                    {category.name}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-gray-900">
                    {formatCurrency(category.value)}
                  </span>
                  <span className="text-xs text-gray-500 ml-2">
                    ({category.percent.toFixed(1)}%)
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
