"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { formatCurrency, formatDate } from "@/lib/utils";
import { Trash2, Calendar, CreditCard, Receipt, Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { Transaction, Category, Installment, Origin } from "@/types";

interface InstallmentWithTransactions extends Installment {
  transactions: (Transaction & { category: Category | null })[];
}

interface StandaloneInstallment extends Transaction {
  category: Category | null;
}

export default function InstallmentsPage() {
  const [installments, setInstallments] = useState<InstallmentWithTransactions[]>([]);
  const [standaloneInstallments, setStandaloneInstallments] = useState<StandaloneInstallment[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [filterOrigin, setFilterOrigin] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingStandalone, setEditingStandalone] = useState<StandaloneInstallment | null>(null);
  const [editCurrentInstallment, setEditCurrentInstallment] = useState("");
  const [editTotalInstallments, setEditTotalInstallments] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchOrigins();
  }, []);

  useEffect(() => {
    fetchData();
  }, [filterOrigin]);

  async function fetchOrigins() {
    const res = await fetch("/api/origins");
    const data = await res.json();
    setOrigins(data);
  }

  async function fetchData() {
    try {
      const originParam = filterOrigin && filterOrigin !== "all" ? `&origin=${filterOrigin}` : "";
      const [installmentsRes, standaloneRes] = await Promise.all([
        fetch(`/api/installments?active=true${originParam}`),
        fetch(`/api/transactions?isInstallment=true&standalone=true${originParam}`),
      ]);
      const [installmentsData, standaloneData] = await Promise.all([
        installmentsRes.json(),
        standaloneRes.json(),
      ]);
      setInstallments(installmentsData);
      setStandaloneInstallments(standaloneData);
    } catch (error) {
      console.error("Error fetching installments:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!deletingId) return;

    try {
      await fetch(`/api/installments?id=${deletingId}`, {
        method: "DELETE",
      });
      setDeletingId(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting installment:", error);
    }
  }

  function openEditStandalone(t: StandaloneInstallment) {
    setEditingStandalone(t);
    setEditCurrentInstallment(String(t.currentInstallment || 1));
    setEditTotalInstallments(String(t.totalInstallments || 2));
  }

  async function handleSaveStandalone() {
    if (!editingStandalone) return;

    setSaving(true);
    try {
      await fetch(`/api/transactions/${editingStandalone.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: editingStandalone.description,
          amount: Math.abs(editingStandalone.amount),
          date: new Date(editingStandalone.date).toISOString().split("T")[0],
          type: editingStandalone.type,
          origin: editingStandalone.origin,
          categoryId: editingStandalone.categoryId,
          isInstallment: true,
          currentInstallment: parseInt(editCurrentInstallment),
          totalInstallments: parseInt(editTotalInstallments),
        }),
      });
      setEditingStandalone(null);
      fetchData();
    } catch (error) {
      console.error("Error updating installment:", error);
    } finally {
      setSaving(false);
    }
  }

  // Calculate future months summary
  const futureSummary: Record<string, number> = {};
  const now = new Date();

  // Include grouped installments
  installments.forEach((inst) => {
    inst.transactions.forEach((t) => {
      const transactionDate = new Date(t.date);
      if (transactionDate >= now) {
        const key = `${transactionDate.getFullYear()}-${String(
          transactionDate.getMonth() + 1
        ).padStart(2, "0")}`;
        futureSummary[key] = (futureSummary[key] || 0) + Math.abs(t.amount);
      }
    });
  });

  // Include standalone installments - project FUTURE installments
  // If transaction is installment 3/10, project installments 4-10 in future months
  standaloneInstallments.forEach((t) => {
    if (!t.currentInstallment || !t.totalInstallments) return;

    const transactionDate = new Date(t.date);
    const remainingInstallments = t.totalInstallments - t.currentInstallment;

    // Project future installments starting from next month after transaction date
    for (let i = 1; i <= remainingInstallments; i++) {
      const futureDate = new Date(transactionDate);
      futureDate.setMonth(futureDate.getMonth() + i);

      const key = `${futureDate.getFullYear()}-${String(
        futureDate.getMonth() + 1
      ).padStart(2, "0")}`;
      futureSummary[key] = (futureSummary[key] || 0) + Math.abs(t.amount);
    }
  });

  const sortedMonths = Object.keys(futureSummary).sort();

  // Filter standalone installments that still have future installments (are "active")
  const activeStandaloneInstallments = standaloneInstallments.filter((t) => {
    if (!t.currentInstallment || !t.totalInstallments) return false;
    return t.currentInstallment < t.totalInstallments;
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parcelas</h1>
          <p className="text-gray-500">Gerencie suas compras parceladas</p>
        </div>
        <div className="flex items-center gap-2">
          <Label>Origem</Label>
          <Select value={filterOrigin} onValueChange={setFilterOrigin}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Todas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {origins.map((o) => (
                <SelectItem key={o.id} value={o.name}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Future Summary */}
      {sortedMonths.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Compromissos Futuros
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-6">
              {sortedMonths.slice(0, 6).map((month) => {
                const [year, m] = month.split("-");
                const date = new Date(parseInt(year), parseInt(m) - 1);
                const monthName = date.toLocaleDateString("pt-BR", {
                  month: "short",
                  year: "2-digit",
                });

                return (
                  <div
                    key={month}
                    className="rounded-lg border bg-red-50 p-4 text-center"
                  >
                    <div className="text-sm text-gray-600 capitalize">{monthName}</div>
                    <div className="text-lg font-bold text-red-600">
                      {formatCurrency(futureSummary[month])}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Installments List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5" />
            Compras Parceladas Ativas ({installments.length + activeStandaloneInstallments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {installments.length === 0 && activeStandaloneInstallments.length === 0 ? (
            <div className="text-center text-gray-500">
              Nenhuma compra parcelada ativa
            </div>
          ) : (
            <div className="space-y-4">
              {/* Grouped installments */}
              {installments.map((inst) => {
                const paidCount = inst.transactions.filter(
                  (t) => new Date(t.date) < now
                ).length;
                const progress = (paidCount / inst.totalInstallments) * 100;

                return (
                  <div key={inst.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-semibold">{inst.description}</h3>
                        <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                          <span>{inst.origin}</span>
                          <span>-</span>
                          <span>
                            Início: {formatDate(inst.startDate)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-semibold">
                            {formatCurrency(inst.installmentAmount)} / parcela
                          </div>
                          <div className="text-sm text-gray-500">
                            Total: {formatCurrency(inst.totalAmount)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDeletingId(inst.id)}
                        >
                          <Trash2 className="h-4 w-4 text-red-500" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span>
                          {paidCount} de {inst.totalInstallments} parcelas pagas
                        </span>
                        <Badge variant={paidCount === inst.totalInstallments ? "default" : "outline"}>
                          {Math.round(progress)}%
                        </Badge>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-6 gap-2 md:grid-cols-12">
                      {inst.transactions.map((t) => {
                        const isPast = new Date(t.date) < now;
                        return (
                          <div
                            key={t.id}
                            className={`rounded p-2 text-center text-xs ${
                              isPast
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                            title={formatDate(t.date)}
                          >
                            {t.currentInstallment}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}

              {/* Standalone installments (shown as active) */}
              {activeStandaloneInstallments.map((t) => {
                const paidCount = t.currentInstallment || 0;
                const total = t.totalInstallments || 1;
                const progress = (paidCount / total) * 100;
                const totalAmount = Math.abs(t.amount) * total;

                return (
                  <div key={t.id} className="rounded-lg border p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        {t.category && (
                          <div
                            className="h-4 w-4 rounded-full"
                            style={{ backgroundColor: t.category.color }}
                          />
                        )}
                        <div>
                          <h3 className="font-semibold">{t.description}</h3>
                          <div className="mt-1 flex items-center gap-2 text-sm text-gray-500">
                            <span>{t.origin}</span>
                            <span>-</span>
                            <span>Parcela atual: {formatDate(t.date)}</span>
                            {t.category && (
                              <>
                                <span>-</span>
                                <span>{t.category.name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-semibold">
                            {formatCurrency(Math.abs(t.amount))} / parcela
                          </div>
                          <div className="text-sm text-gray-500">
                            Total: {formatCurrency(totalAmount)}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditStandalone(t)}
                        >
                          <Pencil className="h-4 w-4 text-gray-500" />
                        </Button>
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="mb-2 flex items-center justify-between text-sm">
                        <span>
                          {paidCount} de {total} parcelas pagas
                        </span>
                        <Badge variant={paidCount === total ? "default" : "outline"}>
                          {Math.round(progress)}%
                        </Badge>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>

                    <div className="mt-4 grid grid-cols-6 gap-2 md:grid-cols-12">
                      {Array.from({ length: total }, (_, i) => {
                        const installmentNum = i + 1;
                        const isPaid = installmentNum <= paidCount;
                        // Calculate projected date for each installment
                        const baseDate = new Date(t.date);
                        const installmentDate = new Date(baseDate);
                        installmentDate.setMonth(baseDate.getMonth() + (installmentNum - paidCount));

                        return (
                          <div
                            key={installmentNum}
                            className={`rounded p-2 text-center text-xs ${
                              isPaid
                                ? "bg-green-100 text-green-700"
                                : "bg-gray-100 text-gray-600"
                            }`}
                            title={isPaid ? "Paga" : formatDate(installmentDate)}
                          >
                            {installmentNum}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusao</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este parcelamento? Todas as parcelas
              serão excluídas. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Edit Standalone Modal */}
      <Dialog open={!!editingStandalone} onOpenChange={() => setEditingStandalone(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Parcela</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <div className="text-sm text-gray-600">
              {editingStandalone?.description}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="editCurrent">Parcela atual</Label>
                <Input
                  id="editCurrent"
                  type="number"
                  min="1"
                  max={editTotalInstallments}
                  value={editCurrentInstallment}
                  onChange={(e) => setEditCurrentInstallment(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="editTotal">Total de parcelas</Label>
                <Input
                  id="editTotal"
                  type="number"
                  min="2"
                  max="48"
                  value={editTotalInstallments}
                  onChange={(e) => setEditTotalInstallments(e.target.value)}
                />
              </div>
            </div>
            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setEditingStandalone(null)}
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveStandalone}
                disabled={saving}
                className="flex-1"
              >
                {saving ? "Salvando..." : "Salvar"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
