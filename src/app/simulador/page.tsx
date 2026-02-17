"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SimulationForm } from "@/components/simulator/SimulationForm";
import { ImpactChart } from "@/components/simulator/ImpactChart";
import { ImpactSummaryCards } from "@/components/simulator/ImpactSummaryCards";
import { calculateSimulation } from "@/lib/simulation-engine";
import type { Category, SimulationData } from "@/types";

export default function SimuladorPage() {
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [totalInstallments, setTotalInstallments] = useState<number>(1);
  const [categoryId, setCategoryId] = useState<string>("");

  // Debounce only amount input (text input with rapid typing)
  const [debouncedAmount, setDebouncedAmount] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(totalAmount);
    }, 300);
    return () => clearTimeout(timer);
  }, [totalAmount]);

  const simulationResult = useMemo(() => {
    if (!simulationData || debouncedAmount <= 0) return null;
    return calculateSimulation(
      simulationData.months,
      simulationData.averageIncome,
      [{ totalAmount: debouncedAmount, totalInstallments: totalInstallments, isActive: true }],
    );
  }, [simulationData, debouncedAmount, totalInstallments]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [dataRes, catRes] = await Promise.all([
          fetch("/api/simulation/data"),
          fetch("/api/categories"),
        ]);
        if (!dataRes.ok || !catRes.ok) throw new Error("Failed to fetch data");
        const data = await dataRes.json();
        const cats = await catRes.json();
        setSimulationData(data);
        setCategories(cats);
      } catch (error) {
        console.error("Error loading simulation data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Carregando dados...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Simulador de Compras</h1>
        <p className="text-gray-500">Veja como uma compra afeta seu fluxo financeiro</p>
      </div>

      <SimulationForm
        description={description}
        onDescriptionChange={setDescription}
        totalAmount={totalAmount}
        onTotalAmountChange={setTotalAmount}
        totalInstallments={totalInstallments}
        onTotalInstallmentsChange={setTotalInstallments}
        categoryId={categoryId}
        onCategoryIdChange={setCategoryId}
        categories={categories}
      />

      <ImpactSummaryCards
        result={simulationResult}
        averageIncome={simulationData?.averageIncome ?? 0}
      />

      <Card>
        <CardHeader>
          <CardTitle>Impacto no Fluxo Mensal</CardTitle>
        </CardHeader>
        <CardContent>
          {simulationData && (
            <ImpactChart
              baseline={simulationData.months}
              averageIncome={simulationData.averageIncome}
              simulatedMonths={simulationResult?.months ?? null}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
