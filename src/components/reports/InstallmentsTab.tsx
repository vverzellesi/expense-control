"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InstallmentTimelineChart } from "@/components/Charts/InstallmentTimelineChart";
import { formatCurrency } from "@/lib/utils";
import { Layers, DollarSign, Clock } from "lucide-react";

interface InstallmentData {
  id: string;
  description: string;
  installmentAmount: number;
  totalInstallments: number;
  paidInstallments: number;
  remainingInstallments: number;
  remainingAmount: number;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

interface TimelineData {
  monthLabel: string;
  total: number;
}

interface InstallmentsReport {
  summary: {
    activeCount: number;
    monthlyTotal: number;
    totalRemaining: number;
  };
  timeline: TimelineData[];
  installments: InstallmentData[];
}

interface Props {
  filterYear: string;
}

export function InstallmentsTab({ filterYear }: Props) {
  const [data, setData] = useState<InstallmentsReport | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/reports/installments?year=${filterYear}`
        );
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching installments data:", error);
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

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Parcelas Ativas
            </CardTitle>
            <Layers className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {data.summary.activeCount}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Comprometimento Mensal
            </CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(data.summary.monthlyTotal)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Restante
            </CardTitle>
            <Clock className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">
              {formatCurrency(data.summary.totalRemaining)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Timeline Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Projecao de Parcelas (12 meses)</CardTitle>
        </CardHeader>
        <CardContent>
          {data.timeline.some((t) => t.total > 0) ? (
            <InstallmentTimelineChart data={data.timeline} />
          ) : (
            <div className="flex h-64 items-center justify-center text-gray-500">
              Sem parcelas ativas
            </div>
          )}
        </CardContent>
      </Card>

      {/* Installments Table */}
      <Card>
        <CardHeader>
          <CardTitle>Todas as Parcelas</CardTitle>
        </CardHeader>
        <CardContent>
          {data.installments.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-gray-500">
                      Descricao
                    </th>
                    <th className="pb-2 text-right font-medium text-gray-500">
                      Valor
                    </th>
                    <th className="pb-2 text-right font-medium text-gray-500">
                      Progresso
                    </th>
                    <th className="pb-2 text-right font-medium text-gray-500">
                      Restante
                    </th>
                    <th className="pb-2 text-center font-medium text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.installments.map((inst) => {
                    const progressPct =
                      inst.totalInstallments > 0
                        ? (inst.paidInstallments / inst.totalInstallments) * 100
                        : 0;

                    return (
                      <tr
                        key={inst.id}
                        className="border-b last:border-0"
                      >
                        <td className="py-2 font-medium">
                          {inst.description}
                        </td>
                        <td className="py-2 text-right">
                          {formatCurrency(inst.installmentAmount)}
                        </td>
                        <td className="py-2 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <div className="h-2 w-20 overflow-hidden rounded-full bg-gray-200">
                              <div
                                className="h-full rounded-full bg-emerald-500"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            <span className="min-w-[50px] text-xs text-gray-500">
                              {inst.paidInstallments}/{inst.totalInstallments}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 text-right">
                          {formatCurrency(inst.remainingAmount)}
                        </td>
                        <td className="py-2 text-center">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                              inst.isActive
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {inst.isActive ? "Ativa" : "Concluida"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex h-32 items-center justify-center text-gray-500">
              Nenhuma parcela encontrada
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
