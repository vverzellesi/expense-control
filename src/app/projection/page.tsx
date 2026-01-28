"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProjectionChart } from "@/components/Charts/ProjectionChart";
import { formatCurrency } from "@/lib/utils";
import {
  CreditCard,
  RefreshCw,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";
import type { ProjectionResponse, MonthProjection } from "@/types";
import { cn } from "@/lib/utils";

export default function ProjectionPage() {
  const [data, setData] = useState<ProjectionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState<6 | 12>(6);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchData();
  }, [months]);

  async function fetchData() {
    try {
      setLoading(true);
      const res = await fetch(`/api/projection?months=${months}`);
      const json = await res.json();
      setData(json);
    } catch (error) {
      console.error("Error fetching projection:", error);
    } finally {
      setLoading(false);
    }
  }

  function toggleMonth(monthKey: string) {
    setExpandedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  }

  function getMonthName(month: number): string {
    const names = [
      "Janeiro",
      "Fevereiro",
      "Marco",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    return names[month - 1] || "";
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  const totalInstallmentsCount = data?.months.reduce(
    (sum, m) => sum + m.installmentsCount,
    0
  ) || 0;

  const recurringCount =
    data?.months[0]?.recurringItems.filter((r) => r.type === "EXPENSE").length || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Projecao Financeira</h1>
          <p className="text-gray-500">Visualize seus compromissos futuros</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={months === 6 ? "default" : "outline"}
            size="sm"
            onClick={() => setMonths(6)}
          >
            6 meses
          </Button>
          <Button
            variant={months === 12 ? "default" : "outline"}
            size="sm"
            onClick={() => setMonths(12)}
          >
            12 meses
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Parcelas
            </CardTitle>
            <CreditCard className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency((data?.totals.totalInstallments || 0) / months)}
              <span className="text-sm font-normal text-gray-500">/mês (média)</span>
            </div>
            <p className="text-xs text-gray-500">
              Total: {formatCurrency(data?.totals.totalInstallments || 0)} ({totalInstallmentsCount} parcela{totalInstallmentsCount !== 1 ? "s" : ""})
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Despesas Recorrentes
            </CardTitle>
            <RefreshCw className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {formatCurrency((data?.totals.totalRecurringExpenses || 0) / months)}
              <span className="text-sm font-normal text-gray-500">/mês (média)</span>
            </div>
            <p className="text-xs text-gray-500">
              Total: {formatCurrency(data?.totals.totalRecurringExpenses || 0)} ({recurringCount} item{recurringCount !== 1 ? "s" : ""})
            </p>
          </CardContent>
        </Card>

        <Card
          className={cn(
            data?.totals.netProjectedBalance !== undefined &&
              data.totals.netProjectedBalance < 0 &&
              "border-red-200 bg-red-50"
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Saldo Projetado
            </CardTitle>
            {data?.totals.netProjectedBalance !== undefined &&
            data.totals.netProjectedBalance < 0 ? (
              <AlertTriangle className="h-4 w-4 text-red-500" />
            ) : (
              <TrendingUp className="h-4 w-4 text-green-500" />
            )}
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-2xl font-bold",
                data?.totals.netProjectedBalance !== undefined &&
                  data.totals.netProjectedBalance >= 0
                  ? "text-green-600"
                  : "text-red-600"
              )}
            >
              {formatCurrency((data?.totals.netProjectedBalance || 0) / months)}
              <span className="text-sm font-normal text-gray-500">/mês (média)</span>
            </div>
            <p className="text-xs text-gray-500">
              Total em {months} meses: {formatCurrency(data?.totals.netProjectedBalance || 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Receitas vs Despesas por Mes</CardTitle>
        </CardHeader>
        <CardContent>
          {data?.months && data.months.length > 0 ? (
            <ProjectionChart data={data.months} />
          ) : (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Sem dados para exibir
            </div>
          )}
        </CardContent>
      </Card>

      {/* Monthly Details */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhes por Mes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data?.months.map((m) => {
            const monthKey = `${m.year}-${m.month}`;
            const isExpanded = expandedMonths.has(monthKey);
            const monthName = `${getMonthName(m.month)} ${m.year}`;

            return (
              <div
                key={monthKey}
                className={cn(
                  "rounded-lg border",
                  m.isNegative ? "border-red-200 bg-red-50" : "bg-white"
                )}
              >
                <button
                  onClick={() => toggleMonth(monthKey)}
                  className="flex w-full items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-gray-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-500" />
                    )}
                    <span className="font-medium">{monthName}</span>
                    {m.isCurrentMonth && (
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Atual
                      </span>
                    )}
                    {m.isNegative && (
                      <AlertTriangle className="h-4 w-4 text-red-500" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "font-semibold",
                      m.projectedBalance >= 0 ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {m.projectedBalance >= 0 ? "+" : ""}
                    {formatCurrency(m.projectedBalance)}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t px-4 pb-4 pt-2">
                    {/* Current Month: Actual Expenses */}
                    {m.isCurrentMonth && (m.actualExpenses > 0 || m.actualIncome > 0) && (
                      <div className="mb-4">
                        <h4 className="mb-2 text-sm font-semibold text-gray-700">
                          Gastos Reais (ate agora)
                        </h4>
                        <div className="space-y-1">
                          {m.actualIncome > 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">Receitas recebidas</span>
                              <span className="font-medium text-green-600">
                                +{formatCurrency(m.actualIncome)}
                              </span>
                            </div>
                          )}
                          {m.actualExpenses > 0 && (
                            <div className="flex items-center justify-between text-sm">
                              <span className="text-gray-600">Despesas realizadas</span>
                              <span className="font-medium text-gray-900">
                                -{formatCurrency(m.actualExpenses)}
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex justify-between border-t pt-2 text-sm">
                          <span className="font-medium">Saldo Real</span>
                          <span className={cn(
                            "font-semibold",
                            m.actualIncome - m.actualExpenses >= 0 ? "text-green-600" : "text-red-600"
                          )}>
                            {m.actualIncome - m.actualExpenses >= 0 ? "+" : ""}
                            {formatCurrency(m.actualIncome - m.actualExpenses)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Pending Recurring (for current month) or Installments (future months) */}
                    {!m.isCurrentMonth && m.installments.length > 0 && (
                      <div className="mb-4">
                        <h4 className="mb-2 text-sm font-semibold text-gray-700">
                          Parcelas ({m.installmentsCount})
                        </h4>
                        <div className="space-y-1">
                          {m.installments.map((inst, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-gray-600">
                                {inst.description} ({inst.currentInstallment}/
                                {inst.totalInstallments})
                              </span>
                              <span className="font-medium text-gray-900">
                                -{formatCurrency(inst.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 flex justify-between border-t pt-2 text-sm">
                          <span className="font-medium">Subtotal Parcelas</span>
                          <span className="font-semibold">
                            -{formatCurrency(m.installmentsTotal)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Recurring - show as "Pending" for current month */}
                    {m.recurringItems.length > 0 && (
                      <div>
                        <h4 className="mb-2 text-sm font-semibold text-gray-700">
                          {m.isCurrentMonth ? "Recorrentes Pendentes" : "Recorrentes"}
                        </h4>
                        <div className="space-y-1">
                          {m.recurringItems.map((rec, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between text-sm"
                            >
                              <span className="text-gray-600">
                                {rec.description}
                              </span>
                              <span
                                className={cn(
                                  "font-medium",
                                  rec.type === "INCOME"
                                    ? "text-green-600"
                                    : "text-gray-900"
                                )}
                              >
                                {rec.type === "INCOME" ? "+" : "-"}
                                {formatCurrency(rec.amount)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="mt-2 space-y-1 border-t pt-2 text-sm">
                          <div className="flex justify-between">
                            <span className="font-medium">
                              {m.isCurrentMonth ? "Receitas Pendentes" : "Receitas Recorrentes"}
                            </span>
                            <span className="font-semibold text-green-600">
                              +{formatCurrency(m.recurringIncome)}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium">
                              {m.isCurrentMonth ? "Despesas Pendentes" : "Despesas Recorrentes"}
                            </span>
                            <span className="font-semibold">
                              -{formatCurrency(m.recurringExpenses)}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* No items */}
                    {!m.isCurrentMonth && m.installments.length === 0 && m.recurringItems.length === 0 && (
                      <p className="text-sm text-gray-500">
                        Nenhum compromisso projetado para este mes
                      </p>
                    )}

                    {m.isCurrentMonth && m.actualExpenses === 0 && m.actualIncome === 0 && m.recurringItems.length === 0 && (
                      <p className="text-sm text-gray-500">
                        Nenhuma transacao registrada este mes
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
