"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import type { CardsSummaryResponse } from "@/lib/cards-summary";

export default function CartoesPage() {
  const [data, setData] = useState<CardsSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const [year, setYear] = useState(() => new Date().getFullYear());

  useEffect(() => {
    fetchData();
  }, [month, year]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch(`/api/cards/summary?month=${month}&year=${year}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (error) {
      console.error("Error fetching cards summary:", error);
    } finally {
      setLoading(false);
    }
  }

  function handlePrevMonth() {
    if (month === 1) {
      setMonth(12);
      setYear(year - 1);
    } else {
      setMonth(month - 1);
    }
  }

  function handleNextMonth() {
    if (month === 12) {
      setMonth(1);
      setYear(year + 1);
    } else {
      setMonth(month + 1);
    }
  }

  const monthNames = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
  ];

  const statusColors = {
    healthy: "bg-emerald-100 text-emerald-800",
    warning: "bg-amber-100 text-amber-800",
    critical: "bg-red-100 text-red-800",
  };

  const statusLabels = {
    healthy: "Saudável",
    warning: "Atenção",
    critical: "Crítico",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Cartões</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={handlePrevMonth}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[160px] text-center font-medium">
            {monthNames[month - 1]} {year}
          </span>
          <Button variant="outline" size="icon" onClick={handleNextMonth}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6 h-48" />
            </Card>
          ))}
        </div>
      ) : !data || data.cards.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Wallet className="h-12 w-12 text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg font-medium">
              Nenhum cartão de crédito cadastrado
            </p>
            <p className="text-gray-400 text-sm mt-1">
              Vá em Configurações &rarr; Origens e defina o tipo como &quot;Cartão de Crédito&quot;
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Total */}
          <Card>
            <CardContent className="flex items-center justify-between p-6">
              <div>
                <p className="text-sm text-gray-500">Total de todos os cartões</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(data.totals.totalAllCards)}
                </p>
              </div>
              {data.totals.projectedNextMonth > 0 && (
                <div className="text-right">
                  <p className="text-sm text-gray-500">Projeção próximo mês</p>
                  <p className="text-lg font-semibold text-gray-700">
                    {formatCurrency(data.totals.projectedNextMonth)}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cards Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.cards.map((card) => (
              <Card key={card.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{card.name}</CardTitle>
                    <Badge variant="outline" className={statusColors[card.currentMonth.status]}>
                      {statusLabels[card.currentMonth.status]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-2xl font-bold">
                    {formatCurrency(card.currentMonth.total)}
                  </p>

                  {/* Breakdown */}
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Parcelas</span>
                      <span>{formatCurrency(card.currentMonth.installmentTotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Gastos novos</span>
                      <span>{formatCurrency(card.currentMonth.newExpenseTotal)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Fixos</span>
                      <span>{formatCurrency(card.currentMonth.fixedTotal)}</span>
                    </div>
                  </div>

                  {/* Limit Progress */}
                  {card.creditLimit && card.currentMonth.limitUsedPercent !== null && (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-gray-500">
                        <span>Limite usado</span>
                        <span>{card.currentMonth.limitUsedPercent}%</span>
                      </div>
                      <Progress
                        value={Math.min(card.currentMonth.limitUsedPercent, 100)}
                        className="h-2"
                      />
                      <p className="text-xs text-gray-400">
                        Limite: {formatCurrency(card.creditLimit)}
                      </p>
                    </div>
                  )}

                  {/* Projection */}
                  {card.projection.estimatedTotal > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs text-gray-500">Próximo mês (estimado)</p>
                      <p className="text-sm font-medium">
                        {formatCurrency(card.projection.estimatedTotal)}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
