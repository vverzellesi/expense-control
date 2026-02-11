"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarHeatmap } from "@/components/Charts/CalendarHeatmap";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Calendar, TrendingUp, TrendingDown, Hash } from "lucide-react";

interface DayData {
  date: string;
  dayOfMonth: number;
  dayOfWeek: number;
  totalExpense: number;
  transactionCount: number;
  transactions: { description: string; amount: number }[];
}

interface CalendarData {
  days: DayData[];
  summary: {
    highestDay: { date: string; total: number };
    lowestDay: { date: string; total: number };
    averageDaily: number;
    zeroDays: number;
  };
  maxExpense: number;
}

interface Props {
  filterMonth: string;
  filterYear: string;
}

export function CalendarHeatmapTab({ filterMonth, filterYear }: Props) {
  const [data, setData] = useState<CalendarData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/reports/calendar?month=${filterMonth}&year=${filterYear}`
        );
        if (!res.ok) throw new Error("Fetch failed");
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching calendar data:", error);
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
            <CardTitle className="text-sm font-medium">Maior Gasto</CardTitle>
            <TrendingUp className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(data.summary.highestDay.total)}
            </div>
            {data.summary.highestDay.date && (
              <p className="text-xs text-muted-foreground">
                {formatDate(data.summary.highestDay.date + "T12:00:00")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Menor Gasto</CardTitle>
            <TrendingDown className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(data.summary.lowestDay.total)}
            </div>
            {data.summary.lowestDay.date && (
              <p className="text-xs text-muted-foreground">
                {formatDate(data.summary.lowestDay.date + "T12:00:00")}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Media Diaria</CardTitle>
            <Calendar className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(data.summary.averageDaily)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Dias sem Gasto</CardTitle>
            <Hash className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {data.summary.zeroDays}
            </div>
            <p className="text-xs text-muted-foreground">
              de {data.days.length} dias
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Calendar Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle>Mapa de Gastos Diarios</CardTitle>
        </CardHeader>
        <CardContent>
          <CalendarHeatmap days={data.days} maxExpense={data.maxExpense} />
        </CardContent>
      </Card>
    </div>
  );
}
