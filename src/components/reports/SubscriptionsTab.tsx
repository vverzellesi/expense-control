"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { DollarSign, CalendarDays, Hash } from "lucide-react";

interface SubscriptionItem {
  id: string;
  description: string;
  monthlyAmount: number;
  annualAmount: number;
  categoryName: string | null;
  categoryColor: string | null;
  origin: string;
  dayOfMonth: number;
}

interface SubscriptionsData {
  subscriptions: SubscriptionItem[];
  totalMonthly: number;
  totalAnnual: number;
  count: number;
}

export function SubscriptionsTab() {
  const [data, setData] = useState<SubscriptionsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch("/api/reports/subscriptions");
        if (!res.ok) throw new Error("Fetch failed");
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching subscriptions data:", error);
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

  if (!data || data.subscriptions.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Nenhuma assinatura ativa encontrada
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Mensal</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">
              {formatCurrency(data.totalMonthly)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Anual</CardTitle>
            <CalendarDays className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {formatCurrency(data.totalAnnual)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Assinaturas Ativas</CardTitle>
            <Hash className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {data.count}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Subscriptions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Assinaturas e Recorrentes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-gray-500">Descrição</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Mensal</th>
                  <th className="pb-2 font-medium text-gray-500 text-right hidden sm:table-cell">Anual</th>
                  <th className="pb-2 font-medium text-gray-500 hidden md:table-cell">Categoria</th>
                  <th className="pb-2 font-medium text-gray-500 hidden md:table-cell">Origem</th>
                  <th className="pb-2 font-medium text-gray-500 text-right hidden sm:table-cell">Dia</th>
                </tr>
              </thead>
              <tbody>
                {data.subscriptions.map((sub) => (
                  <tr key={sub.id} className="border-b last:border-0">
                    <td className="py-2 font-medium">{sub.description}</td>
                    <td className="py-2 text-right">{formatCurrency(sub.monthlyAmount)}</td>
                    <td className="py-2 text-right hidden sm:table-cell">
                      {formatCurrency(sub.annualAmount)}
                    </td>
                    <td className="py-2 hidden md:table-cell">
                      {sub.categoryName ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ backgroundColor: sub.categoryColor || "#9ca3af" }}
                          />
                          {sub.categoryName}
                        </span>
                      ) : (
                        <span className="text-gray-400">Sem categoria</span>
                      )}
                    </td>
                    <td className="py-2 hidden md:table-cell text-gray-600">
                      {sub.origin}
                    </td>
                    <td className="py-2 text-right hidden sm:table-cell text-gray-600">
                      {sub.dayOfMonth}
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
