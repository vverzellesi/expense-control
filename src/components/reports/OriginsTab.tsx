"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OriginsPieChart } from "@/components/Charts/OriginsPieChart";
import { formatCurrency } from "@/lib/utils";

interface OriginData {
  origin: string;
  totalExpense: number;
  transactionCount: number;
  averageExpense: number;
  percentage: number;
}

interface OriginsData {
  origins: OriginData[];
  totalExpense: number;
}

interface Props {
  filterMonth: string;
  filterYear: string;
}

export function OriginsTab({ filterMonth, filterYear }: Props) {
  const [data, setData] = useState<OriginsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/reports/origins?month=${filterMonth}&year=${filterYear}`
        );
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching origins data:", error);
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

  if (!data || data.origins.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Sem dados para exibir
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Despesas por Origem</CardTitle>
        </CardHeader>
        <CardContent>
          <OriginsPieChart data={data.origins} />
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Detalhamento por Origem</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="pb-3 font-medium">Origem</th>
                  <th className="pb-3 font-medium text-right">Total</th>
                  <th className="pb-3 font-medium text-right">Qtd</th>
                  <th className="pb-3 font-medium text-right">Media</th>
                  <th className="pb-3 font-medium text-right">%</th>
                </tr>
              </thead>
              <tbody>
                {data.origins.map((origin) => (
                  <tr key={origin.origin} className="border-b last:border-0">
                    <td className="py-3 font-medium">{origin.origin}</td>
                    <td className="py-3 text-right">{formatCurrency(origin.totalExpense)}</td>
                    <td className="py-3 text-right">{origin.transactionCount}</td>
                    <td className="py-3 text-right">{formatCurrency(origin.averageExpense)}</td>
                    <td className="py-3 text-right">{origin.percentage.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t font-semibold">
                  <td className="pt-3">Total</td>
                  <td className="pt-3 text-right">{formatCurrency(data.totalExpense)}</td>
                  <td className="pt-3 text-right">
                    {data.origins.reduce((sum, o) => sum + o.transactionCount, 0)}
                  </td>
                  <td className="pt-3 text-right">-</td>
                  <td className="pt-3 text-right">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
