"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InvestmentCard } from "@/components/InvestmentCard";
import { InvestmentForm } from "@/components/InvestmentForm";
import { formatCurrency } from "@/lib/utils";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Wallet,
  PiggyBank,
  Pencil,
  Trash2,
} from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import type { Investment, InvestmentCategory, InvestmentSummary } from "@/types";

type SortOption = "name" | "value" | "return" | "recent";

export default function InvestmentsPage() {
  const { toast } = useToast();
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [categories, setCategories] = useState<InvestmentCategory[]>([]);
  const [summary, setSummary] = useState<InvestmentSummary | null>(null);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<SortOption>("recent");

  // Modals
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingInvestment, setEditingInvestment] = useState<Investment | null>(null);
  const [deletingInvestment, setDeletingInvestment] = useState<Investment | null>(null);

  // Operation modals
  const [depositInvestment, setDepositInvestment] = useState<Investment | null>(null);
  const [withdrawInvestment, setWithdrawInvestment] = useState<Investment | null>(null);
  const [updateValueInvestment, setUpdateValueInvestment] = useState<Investment | null>(null);

  // Operation form state
  const [operationAmount, setOperationAmount] = useState("");
  const [operationLoading, setOperationLoading] = useState(false);

  useEffect(() => {
    fetchData();
    fetchCategories();
    fetchSummary();
  }, []);

  useEffect(() => {
    fetchData();
  }, [filterCategory]);

  async function fetchData() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterCategory && filterCategory !== "all") {
        params.set("categoryId", filterCategory);
      }

      const res = await fetch(`/api/investments?${params.toString()}`);
      if (!res.ok) {
        throw new Error("Failed to fetch investments");
      }
      const data = await res.json();
      setInvestments(data);
    } catch (error) {
      console.error("Error fetching investments:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar investimentos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategories() {
    try {
      const res = await fetch("/api/investment-categories");
      if (!res.ok) {
        throw new Error("Failed to fetch categories");
      }
      const data = await res.json();
      setCategories(data);
    } catch (error) {
      console.error("Error fetching categories:", error);
    }
  }

  async function fetchSummary() {
    try {
      const res = await fetch("/api/investments/summary");
      if (!res.ok) {
        throw new Error("Failed to fetch investment summary");
      }
      const data = await res.json();
      setSummary(data);
    } catch (error) {
      console.error("Error fetching investment summary:", error);
    }
  }

  function handleFormSuccess() {
    setIsFormOpen(false);
    setEditingInvestment(null);
    fetchData();
    fetchSummary();
  }

  function handleEdit(investment: Investment) {
    setEditingInvestment(investment);
    setIsFormOpen(true);
  }

  async function handleDelete() {
    if (!deletingInvestment) return;

    try {
      const res = await fetch(`/api/investments/${deletingInvestment.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Erro ao excluir investimento");
      }

      toast({
        title: "Sucesso",
        description: "Investimento excluido com sucesso",
      });

      setDeletingInvestment(null);
      fetchData();
      fetchSummary();
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao excluir investimento",
        variant: "destructive",
      });
    }
  }

  async function handleDeposit() {
    if (!depositInvestment || !operationAmount) return;

    const amount = parseFloat(operationAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Erro",
        description: "Informe um valor valido maior que zero",
        variant: "destructive",
      });
      return;
    }

    setOperationLoading(true);
    try {
      const res = await fetch(`/api/investments/${depositInvestment.id}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao realizar aporte");
      }

      toast({
        title: "Sucesso",
        description: `Aporte de ${formatCurrency(amount)} realizado com sucesso`,
      });

      setDepositInvestment(null);
      setOperationAmount("");
      fetchData();
      fetchSummary();
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao realizar aporte",
        variant: "destructive",
      });
    } finally {
      setOperationLoading(false);
    }
  }

  async function handleWithdraw() {
    if (!withdrawInvestment || !operationAmount) return;

    const amount = parseFloat(operationAmount);
    if (isNaN(amount) || amount <= 0) {
      toast({
        title: "Erro",
        description: "Informe um valor valido maior que zero",
        variant: "destructive",
      });
      return;
    }

    if (amount > withdrawInvestment.currentValue) {
      toast({
        title: "Erro",
        description: "O valor do resgate nao pode ser maior que o valor atual",
        variant: "destructive",
      });
      return;
    }

    setOperationLoading(true);
    try {
      const res = await fetch(`/api/investments/${withdrawInvestment.id}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao realizar resgate");
      }

      toast({
        title: "Sucesso",
        description: `Resgate de ${formatCurrency(amount)} realizado com sucesso`,
      });

      setWithdrawInvestment(null);
      setOperationAmount("");
      fetchData();
      fetchSummary();
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao realizar resgate",
        variant: "destructive",
      });
    } finally {
      setOperationLoading(false);
    }
  }

  async function handleUpdateValue() {
    if (!updateValueInvestment || !operationAmount) return;

    const newValue = parseFloat(operationAmount);
    if (isNaN(newValue) || newValue < 0) {
      toast({
        title: "Erro",
        description: "Informe um valor valido",
        variant: "destructive",
      });
      return;
    }

    setOperationLoading(true);
    try {
      const res = await fetch(`/api/investments/${updateValueInvestment.id}/value`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentValue: newValue }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || "Erro ao atualizar valor");
      }

      toast({
        title: "Sucesso",
        description: "Valor atualizado com sucesso",
      });

      setUpdateValueInvestment(null);
      setOperationAmount("");
      fetchData();
      fetchSummary();
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar valor",
        variant: "destructive",
      });
    } finally {
      setOperationLoading(false);
    }
  }

  // Sort investments
  function getSortedInvestments() {
    const sorted = [...investments];
    switch (sortBy) {
      case "name":
        return sorted.sort((a, b) => a.name.localeCompare(b.name));
      case "value":
        return sorted.sort((a, b) => b.currentValue - a.currentValue);
      case "return":
        return sorted.sort((a, b) => b.totalReturnPercent - a.totalReturnPercent);
      case "recent":
      default:
        return sorted; // Already sorted by createdAt desc from API
    }
  }

  const sortedInvestments = getSortedInvestments();
  const isPositiveReturn = summary ? summary.totalReturn >= 0 : true;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Investimentos</h1>
        <Button onClick={() => setIsFormOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          <span className="hidden sm:inline">Novo Investimento</span>
          <span className="sm:hidden">Novo</span>
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        {/* Patrimonio Total */}
        <Card className="border-emerald-200 bg-emerald-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-emerald-800">
              Patrimonio Total
            </CardTitle>
            <Wallet className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-900">
              {summary ? formatCurrency(summary.totalValue) : "R$ 0,00"}
            </div>
            <p className="text-xs text-emerald-600">
              {summary?.investmentCount || 0} investimento{(summary?.investmentCount || 0) !== 1 ? "s" : ""}
            </p>
          </CardContent>
        </Card>

        {/* Total Investido */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-blue-800">
              Total Investido
            </CardTitle>
            <PiggyBank className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-900">
              {summary ? formatCurrency(summary.totalInvested) : "R$ 0,00"}
            </div>
            {summary && summary.totalWithdrawn > 0 && (
              <p className="text-xs text-blue-600">
                Retirado: {formatCurrency(summary.totalWithdrawn)}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Rendimento Total */}
        <Card className={isPositiveReturn ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className={`text-sm font-medium ${isPositiveReturn ? "text-green-800" : "text-red-800"}`}>
              Rendimento Total
            </CardTitle>
            {isPositiveReturn ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${isPositiveReturn ? "text-green-900" : "text-red-900"}`}>
              {summary ? formatCurrency(summary.totalReturn) : "R$ 0,00"}
            </div>
            <p className={`text-xs ${isPositiveReturn ? "text-green-600" : "text-red-600"}`}>
              {isPositiveReturn ? "+" : ""}{summary?.totalReturnPercent?.toFixed(2) ?? "0.00"}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-full sm:w-auto">
              <Label>Categoria</Label>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="w-full sm:w-auto">
              <Label>Ordenar por</Label>
              <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Mais Recentes</SelectItem>
                  <SelectItem value="name">Nome</SelectItem>
                  <SelectItem value="value">Maior Valor</SelectItem>
                  <SelectItem value="return">Maior Rendimento</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Investment List */}
      {loading ? (
        <div className="text-center text-gray-500 py-8">Carregando...</div>
      ) : sortedInvestments.length === 0 ? (
        <Card>
          <CardContent className="py-12">
            <div className="text-center">
              <PiggyBank className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-4 text-lg font-medium text-gray-900">
                Nenhum investimento encontrado
              </h3>
              <p className="mt-2 text-sm text-gray-500">
                {filterCategory !== "all"
                  ? "Nenhum investimento nesta categoria. Tente outra categoria ou crie um novo investimento."
                  : "Comece a registrar seus investimentos para acompanhar seu patrimonio."}
              </p>
              <Button onClick={() => setIsFormOpen(true)} className="mt-6">
                <Plus className="mr-2 h-4 w-4" />
                Criar Primeiro Investimento
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sortedInvestments.map((investment) => (
            <div key={investment.id} className="relative group">
              <InvestmentCard
                investment={investment}
                onUpdateValue={(inv) => {
                  setUpdateValueInvestment(inv);
                  setOperationAmount(String(inv.currentValue));
                }}
                onDeposit={(inv) => {
                  setDepositInvestment(inv);
                  setOperationAmount("");
                }}
                onWithdraw={(inv) => {
                  setWithdrawInvestment(inv);
                  setOperationAmount("");
                }}
              />
              {/* Edit/Delete buttons overlay */}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-white/80 hover:bg-white"
                  onClick={() => handleEdit(investment)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 bg-white/80 hover:bg-white"
                  onClick={() => setDeletingInvestment(investment)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Investment Form Modal */}
      {isFormOpen && (
        <InvestmentForm
          investment={editingInvestment}
          categories={categories}
          onSuccess={handleFormSuccess}
          onCancel={() => {
            setIsFormOpen(false);
            setEditingInvestment(null);
          }}
        />
      )}

      {/* Delete Confirmation */}
      <AlertDialog
        open={!!deletingInvestment}
        onOpenChange={() => setDeletingInvestment(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusao</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir o investimento &quot;{deletingInvestment?.name}&quot;?
              Esta acao nao pode ser desfeita e todo o historico de transacoes sera perdido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Deposit Modal */}
      <Dialog
        open={!!depositInvestment}
        onOpenChange={() => {
          setDepositInvestment(null);
          setOperationAmount("");
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Realizar Aporte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-sm text-gray-600">Investimento</p>
              <p className="font-medium">{depositInvestment?.name}</p>
              <p className="text-sm text-gray-500">
                Valor atual: {depositInvestment ? formatCurrency(depositInvestment.currentValue) : ""}
              </p>
            </div>
            <div>
              <Label htmlFor="deposit-amount">Valor do Aporte *</Label>
              <Input
                id="deposit-amount"
                type="number"
                step="0.01"
                min="0"
                value={operationAmount}
                onChange={(e) => setOperationAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDepositInvestment(null);
                  setOperationAmount("");
                }}
                className="flex-1"
                disabled={operationLoading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleDeposit}
                className="flex-1"
                disabled={operationLoading || !operationAmount}
              >
                {operationLoading ? "Processando..." : "Confirmar Aporte"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Withdraw Modal */}
      <Dialog
        open={!!withdrawInvestment}
        onOpenChange={() => {
          setWithdrawInvestment(null);
          setOperationAmount("");
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Realizar Resgate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-sm text-gray-600">Investimento</p>
              <p className="font-medium">{withdrawInvestment?.name}</p>
              <p className="text-sm text-gray-500">
                Valor disponivel: {withdrawInvestment ? formatCurrency(withdrawInvestment.currentValue) : ""}
              </p>
            </div>
            <div>
              <Label htmlFor="withdraw-amount">Valor do Resgate *</Label>
              <Input
                id="withdraw-amount"
                type="number"
                step="0.01"
                min="0"
                max={withdrawInvestment?.currentValue}
                value={operationAmount}
                onChange={(e) => setOperationAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setWithdrawInvestment(null);
                  setOperationAmount("");
                }}
                className="flex-1"
                disabled={operationLoading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleWithdraw}
                className="flex-1"
                disabled={operationLoading || !operationAmount}
              >
                {operationLoading ? "Processando..." : "Confirmar Resgate"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Update Value Modal */}
      <Dialog
        open={!!updateValueInvestment}
        onOpenChange={() => {
          setUpdateValueInvestment(null);
          setOperationAmount("");
        }}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Atualizar Valor</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg bg-gray-50 p-3">
              <p className="text-sm text-gray-600">Investimento</p>
              <p className="font-medium">{updateValueInvestment?.name}</p>
              <p className="text-sm text-gray-500">
                Valor atual: {updateValueInvestment ? formatCurrency(updateValueInvestment.currentValue) : ""}
              </p>
            </div>
            <div>
              <Label htmlFor="new-value">Novo Valor *</Label>
              <Input
                id="new-value"
                type="number"
                step="0.01"
                min="0"
                value={operationAmount}
                onChange={(e) => setOperationAmount(e.target.value)}
                placeholder="0,00"
              />
              <p className="mt-1 text-xs text-gray-500">
                Use esta opcao para atualizar o valor de mercado do investimento
                (rendimentos, valorizacao/desvalorizacao).
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setUpdateValueInvestment(null);
                  setOperationAmount("");
                }}
                className="flex-1"
                disabled={operationLoading}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleUpdateValue}
                className="flex-1"
                disabled={operationLoading || !operationAmount}
              >
                {operationLoading ? "Processando..." : "Atualizar Valor"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
