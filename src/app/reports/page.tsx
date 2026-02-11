"use client";

import { useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Download,
  BarChart3,
  TrendingUp,
  CreditCard,
  Layers,
  LineChart,
  PiggyBank,
  SlidersHorizontal,
  Calendar,
  Briefcase,
  Landmark,
  RotateCcw,
} from "lucide-react";
import type { Category } from "@/types";
import { OverviewTab } from "@/components/reports/OverviewTab";
import { AnnualEvolutionTab } from "@/components/reports/AnnualEvolutionTab";
import { OriginsTab } from "@/components/reports/OriginsTab";
import { InstallmentsTab } from "@/components/reports/InstallmentsTab";
import { CategoryTrendsTab } from "@/components/reports/CategoryTrendsTab";
import { SavingsTab } from "@/components/reports/SavingsTab";
import { FixedVariableTab } from "@/components/reports/FixedVariableTab";
import { CalendarHeatmapTab } from "@/components/reports/CalendarHeatmapTab";
import { InvestmentsTab } from "@/components/reports/InvestmentsTab";
import { NetWorthTab } from "@/components/reports/NetWorthTab";
import { RecurringGrowthTab } from "@/components/reports/RecurringGrowthTab";

export default function ReportsPage() {
  const [categories, setCategories] = useState<Category[]>([]);

  const currentDate = new Date();
  const [filterMonth, setFilterMonth] = useState(String(currentDate.getMonth() + 1));
  const [filterYear, setFilterYear] = useState(String(currentDate.getFullYear()));
  const [filterCategory, setFilterCategory] = useState("all");

  useEffect(() => {
    fetchCategories();
  }, []);

  async function fetchCategories() {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data);
  }

  async function handleExport() {
    const params = new URLSearchParams();
    if (filterMonth) params.set("month", filterMonth);
    if (filterYear) params.set("year", filterYear);
    if (filterCategory && filterCategory !== "all") params.set("categoryId", filterCategory);

    window.location.href = `/api/export?${params.toString()}`;
  }

  const months = [
    { value: "1", label: "Janeiro" },
    { value: "2", label: "Fevereiro" },
    { value: "3", label: "Marco" },
    { value: "4", label: "Abril" },
    { value: "5", label: "Maio" },
    { value: "6", label: "Junho" },
    { value: "7", label: "Julho" },
    { value: "8", label: "Agosto" },
    { value: "9", label: "Setembro" },
    { value: "10", label: "Outubro" },
    { value: "11", label: "Novembro" },
    { value: "12", label: "Dezembro" },
  ];

  const years = Array.from({ length: 5 }, (_, i) => {
    const year = currentDate.getFullYear() - 2 + i;
    return { value: String(year), label: String(year) };
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Relatorios</h1>
          <p className="text-gray-500">Visualize e exporte seus dados</p>
        </div>
        <Button onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Exportar CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>Mes</Label>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Ano</Label>
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((y) => (
                    <SelectItem key={y.value} value={y.value}>
                      {y.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Categoria (para exportacao)</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList className="w-full flex-wrap h-auto gap-1 overflow-x-auto">
          <TabsTrigger value="overview" className="min-h-[44px] flex-1 sm:flex-initial">
            <BarChart3 className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Visao Geral</span>
            <span className="sm:hidden">Geral</span>
          </TabsTrigger>
          <TabsTrigger value="annual" className="min-h-[44px] flex-1 sm:flex-initial">
            <TrendingUp className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Evolucao Anual</span>
            <span className="sm:hidden">Anual</span>
          </TabsTrigger>
          <TabsTrigger value="origins" className="min-h-[44px] flex-1 sm:flex-initial">
            <CreditCard className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Origens</span>
            <span className="sm:hidden">Origens</span>
          </TabsTrigger>
          <TabsTrigger value="installments" className="min-h-[44px] flex-1 sm:flex-initial">
            <Layers className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Parcelas</span>
            <span className="sm:hidden">Parcelas</span>
          </TabsTrigger>
          <TabsTrigger value="categories" className="min-h-[44px] flex-1 sm:flex-initial">
            <LineChart className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Categorias</span>
            <span className="sm:hidden">Categ.</span>
          </TabsTrigger>
          <TabsTrigger value="savings" className="min-h-[44px] flex-1 sm:flex-initial">
            <PiggyBank className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Economia</span>
            <span className="sm:hidden">Econ.</span>
          </TabsTrigger>
          <TabsTrigger value="fixed-variable" className="min-h-[44px] flex-1 sm:flex-initial">
            <SlidersHorizontal className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Fixos vs Var.</span>
            <span className="sm:hidden">Fix/Var</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="min-h-[44px] flex-1 sm:flex-initial">
            <Calendar className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Calendario</span>
            <span className="sm:hidden">Calend.</span>
          </TabsTrigger>
          <TabsTrigger value="investments" className="min-h-[44px] flex-1 sm:flex-initial">
            <Briefcase className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Investimentos</span>
            <span className="sm:hidden">Invest.</span>
          </TabsTrigger>
          <TabsTrigger value="net-worth" className="min-h-[44px] flex-1 sm:flex-initial">
            <Landmark className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Patrimonio</span>
            <span className="sm:hidden">Patrim.</span>
          </TabsTrigger>
          <TabsTrigger value="recurring" className="min-h-[44px] flex-1 sm:flex-initial">
            <RotateCcw className="mr-1.5 h-4 w-4" />
            <span className="hidden sm:inline">Recorrentes</span>
            <span className="sm:hidden">Recorr.</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab filterMonth={filterMonth} filterYear={filterYear} />
        </TabsContent>

        <TabsContent value="annual">
          <AnnualEvolutionTab filterYear={filterYear} />
        </TabsContent>

        <TabsContent value="origins">
          <OriginsTab filterMonth={filterMonth} filterYear={filterYear} />
        </TabsContent>

        <TabsContent value="installments">
          <InstallmentsTab filterYear={filterYear} />
        </TabsContent>

        <TabsContent value="categories">
          <CategoryTrendsTab filterYear={filterYear} />
        </TabsContent>

        <TabsContent value="savings">
          <SavingsTab />
        </TabsContent>

        <TabsContent value="fixed-variable">
          <FixedVariableTab filterMonth={filterMonth} filterYear={filterYear} />
        </TabsContent>

        <TabsContent value="calendar">
          <CalendarHeatmapTab filterMonth={filterMonth} filterYear={filterYear} />
        </TabsContent>

        <TabsContent value="investments">
          <InvestmentsTab />
        </TabsContent>

        <TabsContent value="net-worth">
          <NetWorthTab filterYear={filterYear} />
        </TabsContent>

        <TabsContent value="recurring">
          <RecurringGrowthTab filterYear={filterYear} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
