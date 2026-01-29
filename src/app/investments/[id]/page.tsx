"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
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
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  TrendingUp,
  TrendingDown,
  Wallet,
  Target,
  Plus,
  Minus,
  RefreshCw,
  Building2,
} from "lucide-react";
import type { InvestmentWithTransactions, InvestmentTransaction } from "@/types";

interface InvestmentDetail extends InvestmentWithTransactions {
  totalReturn: number;
  totalReturnPercent: number;
  goalProgress: number | null;
}

export default function InvestmentDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const investmentId = params.id as string;

  const [investment, setInvestment] = useState<InvestmentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Dialogs for actions
  const [updateValueDialogOpen, setUpdateValueDialogOpen] = useState(false);
  const [depositDialogOpen, setDepositDialogOpen] = useState(false);
  const [withdrawDialogOpen, setWithdrawDialogOpen] = useState(false);

  // Form states
  const [newValue, setNewValue] = useState("");
  const [depositAmount, setDepositAmount] = useState("");
  const [depositDate, setDepositDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [depositNotes, setDepositNotes] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawDate, setWithdrawDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [withdrawNotes, setWithdrawNotes] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  useEffect(() => {
    fetchInvestment();
  }, [investmentId]);

  async function fetchInvestment() {
    try {
      setLoading(true);
      const res = await fetch(`/api/investments/${investmentId}`);
      if (!res.ok) {
        if (res.status === 404) {
          router.push("/investments");
          return;
        }
        throw new Error("Erro ao buscar investimento");
      }
      const data = await res.json();

      // Calculate totals
      const totalReturn =
        data.currentValue - data.totalInvested + data.totalWithdrawn;
      const totalReturnPercent =
        data.totalInvested > 0
          ? (totalReturn / data.totalInvested) * 100
          : 0;
      const goalProgress =
        data.goalAmount && data.goalAmount > 0
          ? (data.currentValue / data.goalAmount) * 100
          : null;

      setInvestment({
        ...data,
        totalReturn,
        totalReturnPercent,
        goalProgress,
      });
    } catch (error) {
      console.error("Error fetching investment:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar investimento",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/investments/${investmentId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Erro ao excluir investimento");

      toast({
        title: "Sucesso",
        description: "Investimento excluido com sucesso",
      });
      router.push("/investments");
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao excluir investimento",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
      setDeleteDialogOpen(false);
    }
  }

  async function handleUpdateValue(e: React.FormEvent) {
    e.preventDefault();
    if (!newValue) return;

    setFormLoading(true);
    try {
      const res = await fetch(`/api/investments/${investmentId}/value`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: parseFloat(newValue) }),
      });

      if (!res.ok) throw new Error("Erro ao atualizar valor");

      toast({
        title: "Sucesso",
        description: "Valor atualizado com sucesso",
      });

      setUpdateValueDialogOpen(false);
      setNewValue("");
      fetchInvestment();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao atualizar valor",
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDeposit(e: React.FormEvent) {
    e.preventDefault();
    if (!depositAmount) return;

    setFormLoading(true);
    try {
      const res = await fetch(`/api/investments/${investmentId}/deposit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(depositAmount),
          date: depositDate,
          notes: depositNotes || null,
        }),
      });

      if (!res.ok) throw new Error("Erro ao registrar aporte");

      toast({
        title: "Sucesso",
        description: "Aporte registrado com sucesso",
      });

      setDepositDialogOpen(false);
      setDepositAmount("");
      setDepositDate(new Date().toISOString().split("T")[0]);
      setDepositNotes("");
      fetchInvestment();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao registrar aporte",
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!withdrawAmount) return;

    setFormLoading(true);
    try {
      const res = await fetch(`/api/investments/${investmentId}/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseFloat(withdrawAmount),
          date: withdrawDate,
          notes: withdrawNotes || null,
        }),
      });

      if (!res.ok) throw new Error("Erro ao registrar resgate");

      toast({
        title: "Sucesso",
        description: "Resgate registrado com sucesso",
      });

      setWithdrawDialogOpen(false);
      setWithdrawAmount("");
      setWithdrawDate(new Date().toISOString().split("T")[0]);
      setWithdrawNotes("");
      fetchInvestment();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao registrar resgate",
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  if (!investment) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Investimento nao encontrado</div>
      </div>
    );
  }

  const amountToGoal =
    investment.goalAmount && investment.goalAmount > investment.currentValue
      ? investment.goalAmount - investment.currentValue
      : 0;

  return (
    <div className="space-y-6 px-4 md:px-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/investments">
            <Button variant="ghost" size="icon" className="min-h-[44px] min-w-[44px]">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {investment.name}
            </h1>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge
                style={{ backgroundColor: investment.category.color }}
                className="text-white"
              >
                {investment.category.name}
              </Badge>
              {investment.broker && (
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <Building2 className="h-4 w-4" />
                  {investment.broker}
                </span>
              )}
            </div>
          </div>
        </div>
        <Link href={`/investments/${investmentId}/edit`}>
          <Button variant="outline" className="w-full sm:w-auto min-h-[44px]">
            <Pencil className="mr-2 h-4 w-4" />
            Editar
          </Button>
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Valor Atual</p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(investment.currentValue)}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-emerald-100 flex items-center justify-center">
                <Wallet className="h-6 w-6 text-emerald-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">
                  Total Investido
                </p>
                <p className="text-2xl font-bold text-gray-900">
                  {formatCurrency(investment.totalInvested)}
                </p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-100 flex items-center justify-center">
                <Plus className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Rendimento</p>
                <p
                  className={`text-2xl font-bold ${
                    investment.totalReturn >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {formatCurrency(investment.totalReturn)}
                </p>
                <p
                  className={`text-sm ${
                    investment.totalReturnPercent >= 0
                      ? "text-green-600"
                      : "text-red-600"
                  }`}
                >
                  {investment.totalReturnPercent >= 0 ? "+" : ""}
                  {investment.totalReturnPercent.toFixed(2)}%
                </p>
              </div>
              <div
                className={`h-12 w-12 rounded-full flex items-center justify-center ${
                  investment.totalReturn >= 0 ? "bg-green-100" : "bg-red-100"
                }`}
              >
                {investment.totalReturn >= 0 ? (
                  <TrendingUp className="h-6 w-6 text-green-600" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-red-600" />
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Goal Progress */}
      {investment.goalAmount && investment.goalProgress !== null && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Meta
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Progresso</span>
                <span className="font-medium">
                  {investment.goalProgress.toFixed(1)}%
                </span>
              </div>
              <Progress
                value={Math.min(investment.goalProgress, 100)}
                className="h-3"
              />
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">
                  {formatCurrency(investment.currentValue)} /{" "}
                  {formatCurrency(investment.goalAmount)}
                </span>
                {amountToGoal > 0 && (
                  <span className="text-gray-500">
                    Faltam {formatCurrency(amountToGoal)} para atingir a meta
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Button
          variant="outline"
          className="min-h-[44px]"
          onClick={() => {
            setNewValue(String(investment.currentValue));
            setUpdateValueDialogOpen(true);
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Atualizar Valor
        </Button>
        <Button
          className="min-h-[44px] bg-emerald-600 hover:bg-emerald-700"
          onClick={() => setDepositDialogOpen(true)}
        >
          <Plus className="mr-2 h-4 w-4" />
          Novo Aporte
        </Button>
        <Button
          variant="outline"
          className="min-h-[44px] text-red-600 border-red-200 hover:bg-red-50"
          onClick={() => setWithdrawDialogOpen(true)}
        >
          <Minus className="mr-2 h-4 w-4" />
          Fazer Resgate
        </Button>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>Historico de Transacoes</CardTitle>
        </CardHeader>
        <CardContent>
          {investment.transactions.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              Nenhuma transacao registrada
            </p>
          ) : (
            <div className="space-y-3">
              {investment.transactions.map((transaction: InvestmentTransaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between rounded-lg border p-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center ${
                        transaction.type === "DEPOSIT"
                          ? "bg-green-100"
                          : "bg-red-100"
                      }`}
                    >
                      {transaction.type === "DEPOSIT" ? (
                        <Plus className="h-5 w-5 text-green-600" />
                      ) : (
                        <Minus className="h-5 w-5 text-red-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">
                        {transaction.type === "DEPOSIT" ? "Aporte" : "Resgate"}
                      </p>
                      <p className="text-sm text-gray-500">
                        {formatDate(transaction.date)}
                      </p>
                      {transaction.notes && (
                        <p className="text-sm text-gray-400">
                          {transaction.notes}
                        </p>
                      )}
                    </div>
                  </div>
                  <span
                    className={`font-semibold ${
                      transaction.type === "DEPOSIT"
                        ? "text-green-600"
                        : "text-red-600"
                    }`}
                  >
                    {transaction.type === "DEPOSIT" ? "+" : "-"}
                    {formatCurrency(transaction.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Description */}
      {investment.description && (
        <Card>
          <CardHeader>
            <CardTitle>Descricao</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 whitespace-pre-wrap">
              {investment.description}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Delete Button */}
      <div className="pt-4 border-t">
        <Button
          variant="ghost"
          className="w-full text-red-600 hover:text-red-700 hover:bg-red-50 min-h-[44px]"
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Excluir Investimento
        </Button>
      </div>

      {/* Update Value Dialog */}
      <Dialog open={updateValueDialogOpen} onOpenChange={setUpdateValueDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Atualizar Valor</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleUpdateValue} className="space-y-4">
            <div>
              <Label htmlFor="newValue">Novo Valor Atual</Label>
              <Input
                id="newValue"
                type="number"
                step="0.01"
                min="0"
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                placeholder="0,00"
              />
              <p className="text-sm text-gray-500 mt-1">
                Atualiza o valor atual do investimento sem criar uma transacao de aporte ou resgate.
              </p>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setUpdateValueDialogOpen(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={formLoading} className="flex-1">
                {formLoading ? "Salvando..." : "Atualizar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deposit Dialog */}
      <Dialog open={depositDialogOpen} onOpenChange={setDepositDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Aporte</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleDeposit} className="space-y-4">
            <div>
              <Label htmlFor="depositAmount">Valor</Label>
              <Input
                id="depositAmount"
                type="number"
                step="0.01"
                min="0"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <Label htmlFor="depositDate">Data</Label>
              <Input
                id="depositDate"
                type="date"
                value={depositDate}
                onChange={(e) => setDepositDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="depositNotes">Observacoes (opcional)</Label>
              <Input
                id="depositNotes"
                value={depositNotes}
                onChange={(e) => setDepositNotes(e.target.value)}
                placeholder="Ex: Aporte mensal"
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setDepositDialogOpen(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={formLoading}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                {formLoading ? "Salvando..." : "Registrar Aporte"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Withdraw Dialog */}
      <Dialog open={withdrawDialogOpen} onOpenChange={setWithdrawDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fazer Resgate</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleWithdraw} className="space-y-4">
            <div>
              <Label htmlFor="withdrawAmount">Valor</Label>
              <Input
                id="withdrawAmount"
                type="number"
                step="0.01"
                min="0"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="0,00"
              />
            </div>
            <div>
              <Label htmlFor="withdrawDate">Data</Label>
              <Input
                id="withdrawDate"
                type="date"
                value={withdrawDate}
                onChange={(e) => setWithdrawDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="withdrawNotes">Observacoes (opcional)</Label>
              <Input
                id="withdrawNotes"
                value={withdrawNotes}
                onChange={(e) => setWithdrawNotes(e.target.value)}
                placeholder="Ex: Resgate para emergencia"
              />
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setWithdrawDialogOpen(false)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={formLoading}
                className="flex-1 bg-red-600 hover:bg-red-700"
              >
                {formLoading ? "Salvando..." : "Registrar Resgate"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusao</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este investimento? Esta acao nao pode ser desfeita. As transacoes vinculadas serao mantidas no historico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600"
              disabled={deleting}
            >
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
