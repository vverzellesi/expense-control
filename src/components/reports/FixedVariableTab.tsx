"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FixedVariableChart } from "@/components/Charts/FixedVariableChart";
import { formatCurrency, formatDate, parseDateLocal } from "@/lib/utils";
import { Lock, Shuffle, Percent, DollarSign, Shield, Scale, Zap, HelpCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

interface FlexibilityBreakdown {
  essential: number;
  negotiable: number;
  variable: number;
  unclassified: number;
}

interface FlexibilityMonthlyEntry {
  monthLabel: string;
  essential: number;
  negotiable: number;
  variable: number;
  unclassified: number;
}

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
  flexibilityBreakdown: FlexibilityBreakdown | null;
  flexibilityMonthly: FlexibilityMonthlyEntry[] | null;
}

interface Props {
  filterMonth: string;
  filterYear: string;
}

export function FixedVariableTab({ filterMonth, filterYear }: Props) {
  const [data, setData] = useState<FixedVariableData | null>(null);
  const [loading, setLoading] = useState(true);
  const [reductionPercent, setReductionPercent] = useState(20);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/reports/fixed-variable?month=${filterMonth}&year=${filterYear}`
        );
        if (!res.ok) throw new Error("Fetch failed");
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

  const hasFlexibility = data.flexibilityBreakdown !== null;

  return (
    <div className="space-y-6">
      {hasFlexibility && data.flexibilityBreakdown ? (
        <FlexibilityView
          data={data}
          flexBreakdown={data.flexibilityBreakdown}
          flexMonthly={data.flexibilityMonthly!}
          reductionPercent={reductionPercent}
          setReductionPercent={setReductionPercent}
        />
      ) : (
        <BinaryView data={data} />
      )}
    </div>
  );
}

/** 3-way FlexibilityType view */
function FlexibilityView({
  data,
  flexBreakdown,
  flexMonthly,
  reductionPercent,
  setReductionPercent,
}: {
  data: FixedVariableData;
  flexBreakdown: FlexibilityBreakdown;
  flexMonthly: FlexibilityMonthlyEntry[];
  reductionPercent: number;
  setReductionPercent: (v: number) => void;
}) {
  const total = flexBreakdown.essential + flexBreakdown.negotiable + flexBreakdown.variable + flexBreakdown.unclassified;
  const savings = (flexBreakdown.variable * reductionPercent) / 100;

  return (
    <>
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Essenciais</CardTitle>
            <Shield className="h-4 w-4 text-slate-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-600">
              {formatCurrency(flexBreakdown.essential)}
            </div>
            {total > 0 && (
              <p className="text-xs text-gray-500">
                {((flexBreakdown.essential / total) * 100).toFixed(1)}% do total
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Negociaveis</CardTitle>
            <Scale className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(flexBreakdown.negotiable)}
            </div>
            {total > 0 && (
              <p className="text-xs text-gray-500">
                {((flexBreakdown.negotiable / total) * 100).toFixed(1)}% do total
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Variaveis</CardTitle>
            <Zap className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600">
              {formatCurrency(flexBreakdown.variable)}
            </div>
            {total > 0 && (
              <p className="text-xs text-gray-500">
                {((flexBreakdown.variable / total) * 100).toFixed(1)}% do total
              </p>
            )}
          </CardContent>
        </Card>

        {flexBreakdown.unclassified > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sem Classificacao</CardTitle>
              <HelpCircle className="h-4 w-4 text-gray-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-500">
                {formatCurrency(flexBreakdown.unclassified)}
              </div>
              {total > 0 && (
                <p className="text-xs text-gray-500">
                  {((flexBreakdown.unclassified / total) * 100).toFixed(1)}% do total
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Simulator */}
      <Card>
        <CardHeader>
          <CardTitle>Simulador de Economia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <label htmlFor="reduction-slider" className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Reducao em variaveis:
            </label>
            <input
              id="reduction-slider"
              type="range"
              min={0}
              max={50}
              step={5}
              value={reductionPercent}
              onChange={(e) => setReductionPercent(Number(e.target.value))}
              className="flex-1 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-emerald-600"
            />
            <span className="text-sm font-bold text-emerald-600 min-w-[3rem] text-right">
              {reductionPercent}%
            </span>
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
            <p className="text-sm text-emerald-800">
              Se reduzir variaveis em <strong>{reductionPercent}%</strong>, economiza{" "}
              <strong>{formatCurrency(savings)}/mes</strong>
              {" "}({formatCurrency(savings * 12)}/ano)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Evolucao por Flexibilidade (12 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          {flexMonthly.length > 0 ? (
            <FixedVariableChart data={data.monthlyBreakdown} flexibilityData={flexMonthly} />
          ) : (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Sem dados para exibir
            </div>
          )}
        </CardContent>
      </Card>

      {/* Expense Lists (binary view still useful) */}
      <div className="grid gap-6 md:grid-cols-2">
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
                        {expense.categoryName} - {formatDate(parseDateLocal(expense.date))}
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
    </>
  );
}

/** Binary (fixed/variable) fallback view */
function BinaryView({ data }: { data: FixedVariableData }) {
  return (
    <>
      {/* CTA to classify categories */}
      <Card className="border-emerald-200 bg-emerald-50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-emerald-800">
                Classifique suas categorias para ver analise detalhada
              </p>
              <p className="text-sm text-emerald-600 mt-1">
                Com a classificacao de flexibilidade, voce vera 3 camadas (essencial, negociavel, variavel) e um simulador de economia.
              </p>
            </div>
            <Link
              href="/categories"
              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Categorias
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </CardContent>
      </Card>

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
                        {expense.categoryName} - {formatDate(parseDateLocal(expense.date))}
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
    </>
  );
}
