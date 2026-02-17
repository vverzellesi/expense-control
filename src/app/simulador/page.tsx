"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SimulationForm } from "@/components/simulator/SimulationForm";
import { SimulationChips } from "@/components/simulator/SimulationChips";
import { ImpactChart } from "@/components/simulator/ImpactChart";
import { ImpactSummaryCards } from "@/components/simulator/ImpactSummaryCards";
import { calculateSimulation, generateScenarios } from "@/lib/simulation-engine";
import { ScenarioComparison } from "@/components/simulator/ScenarioComparison";
import { RegisterPurchaseDialog } from "@/components/simulator/RegisterPurchaseDialog";
import { SimulatorActions } from "@/components/simulator/SimulatorActions";
import { useToast } from "@/components/ui/use-toast";
import type { Category, Simulation, SimulationData } from "@/types";

export default function SimuladorPage() {
  const [simulationData, setSimulationData] = useState<SimulationData | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState<number>(0);
  const [totalInstallments, setTotalInstallments] = useState<number>(1);
  const [categoryId, setCategoryId] = useState<string>("");

  // Saved simulations state
  const [savedSimulations, setSavedSimulations] = useState<Simulation[]>([]);
  const [selectedSimulationId, setSelectedSimulationId] = useState<string | null>(null);
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const { toast } = useToast();

  // Debounce only amount input (text input with rapid typing)
  const [debouncedAmount, setDebouncedAmount] = useState(0);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAmount(totalAmount);
    }, 300);
    return () => clearTimeout(timer);
  }, [totalAmount]);

  // Build combined simulation inputs for calculation
  const simulationInputs = useMemo(() => {
    const inputs = savedSimulations.map((s) => ({
      totalAmount: s.totalAmount,
      totalInstallments: s.totalInstallments,
      isActive: s.isActive,
    }));

    // Add current form as unsaved simulation (if not editing a saved one)
    if (debouncedAmount > 0 && !selectedSimulationId) {
      inputs.push({
        totalAmount: debouncedAmount,
        totalInstallments: totalInstallments,
        isActive: true,
      });
    }

    return inputs;
  }, [savedSimulations, debouncedAmount, totalInstallments, selectedSimulationId]);

  // Update calculation to use all inputs
  const simulationResult = useMemo(() => {
    if (!simulationData || simulationInputs.length === 0) return null;
    const hasActive = simulationInputs.some((s) => s.isActive && s.totalAmount > 0);
    if (!hasActive) return null;
    return calculateSimulation(simulationData.months, simulationData.averageIncome, simulationInputs);
  }, [simulationData, simulationInputs]);

  const scenarios = useMemo(() => {
    if (!simulationData || debouncedAmount <= 0) return [];
    return generateScenarios(
      debouncedAmount,
      totalInstallments,
      simulationData.months,
      simulationData.averageIncome,
    );
  }, [simulationData, debouncedAmount, totalInstallments]);

  useEffect(() => {
    async function fetchData() {
      try {
        const [dataRes, catRes, simRes] = await Promise.all([
          fetch("/api/simulation/data"),
          fetch("/api/categories"),
          fetch("/api/simulations"),
        ]);
        if (!dataRes.ok || !catRes.ok) throw new Error("Failed to fetch data");
        const data = await dataRes.json();
        const cats = await catRes.json();
        setSimulationData(data);
        setCategories(cats);

        if (simRes.ok) {
          const sims = await simRes.json();
          setSavedSimulations(sims);
        }
      } catch (error) {
        console.error("Error loading simulation data:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  // Handlers
  function handleNew() {
    setSelectedSimulationId(null);
    setDescription("");
    setTotalAmount(0);
    setTotalInstallments(1);
    setCategoryId("");
  }

  function handleSelect(sim: Simulation) {
    setSelectedSimulationId(sim.id);
    setDescription(sim.description);
    setTotalAmount(sim.totalAmount);
    setTotalInstallments(sim.totalInstallments);
    setCategoryId(sim.categoryId || "");
  }

  async function handleSave() {
    if (!description || totalAmount <= 0) return;
    try {
      const isEditing = !!selectedSimulationId;
      const url = isEditing
        ? `/api/simulations/${selectedSimulationId}`
        : "/api/simulations";
      const method = isEditing ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description, totalAmount, totalInstallments, categoryId: categoryId || null }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const saved = await res.json();

      if (isEditing) {
        setSavedSimulations((prev) =>
          prev.map((s) => (s.id === saved.id ? saved : s)),
        );
      } else {
        setSavedSimulations((prev) => [saved, ...prev]);
      }
      handleNew();
      toast({ title: isEditing ? "Simulação atualizada" : "Simulação salva" });
    } catch {
      toast({ title: "Erro ao salvar simulação", variant: "destructive" });
    }
  }

  async function handleToggle(id: string, isActive: boolean) {
    try {
      await fetch(`/api/simulations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive }),
      });
      setSavedSimulations((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isActive } : s)),
      );
    } catch {
      toast({ title: "Erro ao atualizar", variant: "destructive" });
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/simulations/${id}`, { method: "DELETE" });
      setSavedSimulations((prev) => prev.filter((s) => s.id !== id));
      if (selectedSimulationId === id) handleNew();
    } catch {
      toast({ title: "Erro ao deletar", variant: "destructive" });
    }
  }

  function handleSelectScenario(newInstallments: number) {
    setTotalInstallments(newInstallments);
  }

  async function handleRegisterSuccess() {
    // Remove from saved simulations if it was saved
    if (selectedSimulationId) {
      await fetch(`/api/simulations/${selectedSimulationId}`, { method: "DELETE" });
      setSavedSimulations((prev) => prev.filter((s) => s.id !== selectedSimulationId));
    }
    setShowRegisterDialog(false);
  }

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

      {selectedSimulationId && (
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={!description || totalAmount <= 0}
          >
            Atualizar simulação
          </Button>
          <Button variant="ghost" onClick={handleNew}>
            Cancelar edição
          </Button>
        </div>
      )}

      <SimulationChips
        simulations={savedSimulations}
        selectedId={selectedSimulationId}
        onSelect={handleSelect}
        onToggle={handleToggle}
        onDelete={handleDelete}
        onNew={handleNew}
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

      {/* Scenarios comparison */}
      {scenarios.length > 0 && (
        <ScenarioComparison
          scenarios={scenarios}
          onSelectScenario={handleSelectScenario}
        />
      )}

      {/* Register Purchase Dialog */}
      <RegisterPurchaseDialog
        open={showRegisterDialog}
        onOpenChange={setShowRegisterDialog}
        description={description}
        totalAmount={totalAmount}
        totalInstallments={totalInstallments}
        categoryId={categoryId}
        categories={categories}
        onSuccess={handleRegisterSuccess}
      />

      {/* Action bar */}
      <SimulatorActions
        hasSimulation={totalAmount > 0 && description.length > 0}
        isSaved={!!selectedSimulationId}
        onSave={handleSave}
        onRegister={() => setShowRegisterDialog(true)}
        onDiscard={handleNew}
      />
    </div>
  );
}
