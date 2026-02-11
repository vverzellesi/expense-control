"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryTrendLineChart } from "@/components/Charts/CategoryTrendLineChart";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface CategoryData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  monthlyTotals: number[];
  total: number;
  trend: number;
}

interface TrendsData {
  months: string[];
  categories: CategoryData[];
  highlights: {
    mostGrown: { categoryName: string; trend: number } | null;
    mostShrunk: { categoryName: string; trend: number } | null;
  };
}

interface Props {
  filterYear: string;
}

export function CategoryTrendsTab({ filterYear }: Props) {
  const [data, setData] = useState<TrendsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch(
          `/api/reports/category-trends?year=${filterYear}`
        );
        const json = await res.json();
        setData(json);
      } catch (error) {
        console.error("Error fetching category trends:", error);
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

  if (!data || data.categories.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-gray-500">
        Sem dados para exibir
      </div>
    );
  }

  // Top 8 categories for chart
  const top8 = data.categories.slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Highlight Cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Maior Crescimento
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {data.highlights.mostGrown ? (
              <>
                <div className="text-xl font-bold text-gray-900">
                  {data.highlights.mostGrown.categoryName}
                </div>
                <p className="text-sm text-red-600">
                  +{data.highlights.mostGrown.trend.toFixed(1)}%
                </p>
              </>
            ) : (
              <div className="text-sm text-gray-500">Sem dados</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Maior Reducao
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            {data.highlights.mostShrunk ? (
              <>
                <div className="text-xl font-bold text-gray-900">
                  {data.highlights.mostShrunk.categoryName}
                </div>
                <p className="text-sm text-green-600">
                  {data.highlights.mostShrunk.trend.toFixed(1)}%
                </p>
              </>
            ) : (
              <div className="text-sm text-gray-500">Sem dados</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Tendencia por Categoria (Top 8)</CardTitle>
        </CardHeader>
        <CardContent>
          <CategoryTrendLineChart categories={top8} months={data.months} />
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Todas as Categorias</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-gray-500">Categoria</th>
                  <th className="pb-2 text-right font-medium text-gray-500">
                    Total
                  </th>
                  <th className="pb-2 text-right font-medium text-gray-500">
                    Tendencia
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((cat) => (
                  <tr key={cat.categoryId} className="border-b last:border-0">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: cat.categoryColor }}
                        />
                        <span className="font-medium">{cat.categoryName}</span>
                      </div>
                    </td>
                    <td className="py-2 text-right font-semibold">
                      {formatCurrency(cat.total)}
                    </td>
                    <td className="py-2 text-right">
                      <span
                        className={`font-medium ${
                          cat.trend > 0
                            ? "text-red-600"
                            : cat.trend < 0
                              ? "text-green-600"
                              : "text-gray-500"
                        }`}
                      >
                        {cat.trend > 0 ? "+" : ""}
                        {cat.trend.toFixed(1)}%
                      </span>
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
