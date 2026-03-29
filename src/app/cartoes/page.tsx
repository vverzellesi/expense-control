"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, Wallet, Info } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CardsSummaryResponse, CardSummary } from "@/lib/cards-summary";

const CARD_COLORS = [
  "#10B981", // emerald
  "#3B82F6", // blue
  "#F59E0B", // amber
  "#8B5CF6", // violet
  "#EF4444", // red
  "#06B6D4", // cyan
  "#EC4899", // pink
  "#F97316", // orange
];

function ProportionalBar({ cards, totalAllCards }: { cards: CardSummary[]; totalAllCards: number }) {
  if (totalAllCards === 0) return null;

  const barData = [
    cards.reduce(
      (acc, card) => {
        acc[card.name] = card.currentMonth.total;
        return acc;
      },
      {} as Record<string, number>
    ),
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Distribuição por Cartão</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={50}>
          <BarChart data={barData} layout="vertical" stackOffset="expand" barSize={32}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" hide />
            <Tooltip
              formatter={(value: number, name: string) => [
                `${formatCurrency(value)} (${Math.round((value / totalAllCards) * 100)}%)`,
                name,
              ]}
            />
            {cards.map((card, i) => (
              <Bar key={card.id} dataKey={card.name} stackId="a" fill={CARD_COLORS[i % CARD_COLORS.length]} radius={i === 0 ? [4, 0, 0, 4] : i === cards.length - 1 ? [0, 4, 4, 0] : 0} />
            ))}
          </BarChart>
        </ResponsiveContainer>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 mt-3">
          {cards.map((card, i) => (
            <div key={card.id} className="flex items-center gap-1.5 text-sm">
              <div
                className="w-3 h-3 rounded-sm"
                style={{ backgroundColor: CARD_COLORS[i % CARD_COLORS.length] }}
              />
              <span className="text-gray-600">
                {card.name} ({totalAllCards > 0 ? Math.round((card.currentMonth.total / totalAllCards) * 100) : 0}%)
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function CartoesPage() {
  const router = useRouter();
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

          {/* Proportional Bar */}
          <ProportionalBar cards={data.cards} totalAllCards={data.totals.totalAllCards} />

          {/* Cards Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.cards.map((card) => (
              <Card key={card.id} className="cursor-pointer transition-shadow hover:shadow-md" onClick={() => router.push(`/transactions?origin=${encodeURIComponent(card.name)}`)}>
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

          {/* Rates Banner or Table */}
          {(() => {
            const hasAnyRates = data.cards.some(
              (c) => c.rates.rotativoRateMonth !== null || c.rates.parcelamentoRate !== null || c.rates.cetAnual !== null
            );

            if (!hasAnyRates) {
              return (
                <Card className="border-dashed border-amber-300 bg-amber-50">
                  <CardContent className="flex items-center gap-3 p-6">
                    <Info className="h-5 w-5 text-amber-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-amber-800">
                        Configure as taxas dos seus cartões
                      </p>
                      <p className="text-xs text-amber-600 mt-0.5">
                        Vá em Configurações → Origens e edite cada cartão para informar taxas de juros. Isso permite comparar custos entre cartões.
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            }

            // Find best card for installments (lowest parcelamentoRate)
            const cardsWithParcelamento = data.cards.filter((c) => c.rates.parcelamentoRate !== null);
            const bestForParcelamento = cardsWithParcelamento.length > 0
              ? cardsWithParcelamento.reduce((best, c) =>
                  (c.rates.parcelamentoRate ?? Infinity) < (best.rates.parcelamentoRate ?? Infinity) ? c : best
                )
              : null;

            return (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Comparativo de Taxas</CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Mobile Card View */}
                  <div className="md:hidden space-y-3">
                    {data.cards.map((card) => (
                      <div key={card.id} className="rounded-lg border bg-white p-4 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="font-medium text-sm">{card.name}</div>
                          {bestForParcelamento?.id === card.id && (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                              Parcelar
                            </Badge>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Rotativo:</span>
                            <span className="ml-1 font-medium">
                              {card.rates.rotativoRateMonth !== null ? `${card.rates.rotativoRateMonth}%/m\u00EAs` : "\u2014"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Parcelamento:</span>
                            <span className="ml-1 font-medium">
                              {card.rates.parcelamentoRate !== null ? `${card.rates.parcelamentoRate}%` : "\u2014"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">CET Anual:</span>
                            <span className="ml-1 font-medium">
                              {card.rates.cetAnual !== null ? `${card.rates.cetAnual}%` : "\u2014"}
                            </span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-muted-foreground">Melhor para:</span>
                            <span className="ml-1">
                              {bestForParcelamento?.id === card.id ? "Parcelar" : "\u2014"}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Desktop Table View */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-4 font-medium text-gray-500">Cartão</th>
                          <th className="text-right py-2 px-4 font-medium text-gray-500">Rotativo (%/mês)</th>
                          <th className="text-right py-2 px-4 font-medium text-gray-500">Parcelamento (%)</th>
                          <th className="text-right py-2 px-4 font-medium text-gray-500">CET Anual (%)</th>
                          <th className="text-left py-2 pl-4 font-medium text-gray-500">Melhor para</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.cards.map((card) => (
                          <tr key={card.id} className="border-b last:border-0">
                            <td className="py-2 pr-4 font-medium">{card.name}</td>
                            <td className="text-right py-2 px-4 text-gray-600">
                              {card.rates.rotativoRateMonth !== null ? `${card.rates.rotativoRateMonth}%` : "\u2014"}
                            </td>
                            <td className="text-right py-2 px-4 text-gray-600">
                              {card.rates.parcelamentoRate !== null ? `${card.rates.parcelamentoRate}%` : "\u2014"}
                            </td>
                            <td className="text-right py-2 px-4 text-gray-600">
                              {card.rates.cetAnual !== null ? `${card.rates.cetAnual}%` : "\u2014"}
                            </td>
                            <td className="py-2 pl-4">
                              {bestForParcelamento?.id === card.id && (
                                <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
                                  Parcelar
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}
