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
import { formatCurrency, formatDate, toLocalDateString } from "@/lib/utils";
import { Trash2, Calendar, CreditCard, Receipt, Pencil, Ban } from "lucide-react";
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
  const [cancellingInstallment, setCancellingInstallment] = useState<InstallmentWithTransactions | null>(null);
  const [cancellingStandalone, setCancellingStandalone] = useState<StandaloneInstallment | null>(null);
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

  async function handleCancel() {
    if (!cancellingInstallment) return;

    try {
      await fetch(`/api/installments/${cancellingInstallment.id}/cancel`, {
        method: "POST",
      });
      setCancellingInstallment(null);
      fetchData();
    } catch (error) {
      console.error("Error cancelling installment:", error);
    }
  }

  async function handleCancelStandalone() {
    if (!cancellingStandalone) return;

    const transDate = new Date(cancellingStandalone.date);
    const current = new Date();
    const monthsElapsed =
      (current.getFullYear() - transDate.getFullYear()) * 12 +
      (current.getMonth() - transDate.getMonth());
    const effectiveCurrent = Math.min(
      (cancellingStandalone.currentInstallment || 0) + monthsElapsed,
      cancellingStandalone.totalInstallments || 1
    );

    try {
      await fetch(`/api/transactions/${cancellingStandalone.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: cancellingStandalone.description,
          amount: Math.abs(cancellingStandalone.amount),
          date: toLocalDateString(new Date(cancellingStandalone.date)),
          type: cancellingStandalone.type,
          origin: cancellingStandalone.origin,
          categoryId: cancellingStandalone.categoryId,
          isInstallment: true,
          currentInstallment: cancellingStandalone.currentInstallment,
          totalInstallments: effectiveCurrent,
        }),
      });
      setCancellingStandalone(null);
      fetchData();
    } catch (error) {
      console.error("Error cancelling standalone installment:", error);
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
          date: toLocalDateString(new Date(editingStandalone.date)),
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
  const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  // Include grouped installments
  installments.forEach((inst) => {
    inst.transactions.forEach((t) => {
      const transactionDate = new Date(t.date);
      if (transactionDate >= startOfCurrentMonth) {
        const key = `${transactionDate.getFullYear()}-${String(
          transactionDate.getMonth() + 1
        ).padStart(2, "0")}`;
        futureSummary[key] = (futureSummary[key] || 0) + Math.abs(t.amount);
      }
    });
  });

  // Include standalone installments - project remaining installments from current month
  standaloneInstallments.forEach((t) => {
    if (!t.currentInstallment || !t.totalInstallments) return;

    const transactionDate = new Date(t.date);
    const monthsElapsed =
      (now.getFullYear() - transactionDate.getFullYear()) * 12 +
      (now.getMonth() - transactionDate.getMonth());
    const effectiveCurrent = t.currentInstallment + monthsElapsed;

    if (effectiveCurrent > t.totalInstallments) return;

    const remaining = t.totalInstallments - effectiveCurrent;

    for (let i = 0; i <= remaining; i++) {
      const futureDate = new Date(now.getFullYear(), now.getMonth() + i, 1);

      const key = `${futureDate.getFullYear()}-${String(
        futureDate.getMonth() + 1
      ).padStart(2, "0")}`;
      futureSummary[key] = (futureSummary[key] || 0) + Math.abs(t.amount);
    }
  });

  const sortedMonths = Object.keys(futureSummary).sort();

  // Filter standalone installments that still have remaining installments (are "active")
  const activeStandaloneInstallments = standaloneInstallments.filter((t) => {
    if (!t.currentInstallment || !t.totalInstallments) return false;
    const transactionDate = new Date(t.date);
    const monthsElapsed =
      (now.getFullYear() - transactionDate.getFullYear()) * 12 +
      (now.getMonth() - transactionDate.getMonth());
    return t.currentInstallment + monthsElapsed <= t.totalInstallments;
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 md:px-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Parcelas</h1>
          <p className="text-gray-500">Gerencie suas compras parceladas</p>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Label className="whitespace-nowrap">Origem</Label>
          <Select value={filterOrigin} onValueChange={setFilterOrigin}>
            <SelectTrigger className="w-full sm:w-40 min-h-[44px]">
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
            <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 md:grid-cols-6">
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
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate">{inst.description}</h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                          <span>{inst.origin}</span>
                          <span>-</span>
                          <span>
                            Início: {formatDate(inst.startDate)}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
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
                          className="min-h-[44px] min-w-[44px]"
                          title="Cancelar parcelas futuras"
                          onClick={() => setCancellingInstallment(inst)}
                        >
                          <Ban className="h-4 w-4 text-orange-500" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="min-h-[44px] min-w-[44px]"
                          title="Excluir tudo"
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

                    <div className="mt-4 grid grid-cols-4 sm:grid-cols-6 gap-2 md:grid-cols-12">
                      {inst.transactions.map((t) => {
                        const isPast = new Date(t.date) < now;
                        return (
                          <div
                            key={t.id}
                            className={`rounded p-2 text-center text-xs min-h-[36px] flex items-center justify-center ${
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
                const transactionDate = new Date(t.date);
                const monthsElapsed =
                  (now.getFullYear() - transactionDate.getFullYear()) * 12 +
                  (now.getMonth() - transactionDate.getMonth());
                const paidCount = Math.min(
                  (t.currentInstallment || 0) + monthsElapsed,
                  t.totalInstallments || 1
                );
                const total = t.totalInstallments || 1;
                const progress = (paidCount / total) * 100;
                const totalAmount = Math.abs(t.amount) * total;
                const effectiveDate = new Date(transactionDate);
                effectiveDate.setMonth(transactionDate.getMonth() + monthsElapsed);

                return (
                  <div key={t.id} className="rounded-lg border p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        {t.category && (
                          <div
                            className="h-4 w-4 rounded-full flex-shrink-0"
                            style={{ backgroundColor: t.category.color }}
                          />
                        )}
                        <div className="min-w-0">
                          <h3 className="font-semibold truncate">{t.description}</h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-gray-500">
                            <span>{t.origin}</span>
                            <span>-</span>
                            <span>Parcela atual: {formatDate(effectiveDate)}</span>
                            {t.category && (
                              <>
                                <span>-</span>
                                <span>{t.category.name}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <div className="font-semibold">
                            {formatCurrency(Math.abs(t.amount))} / parcela
                          </div>
                          <div className="text-sm text-gray-500">
                            Total: {formatCurrency(totalAmount)}
                          </div>
                        </div>
                        {paidCount < total && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="min-h-[44px] min-w-[44px]"
                            title="Cancelar parcelas futuras"
                            onClick={() => setCancellingStandalone(t)}
                          >
                            <Ban className="h-4 w-4 text-orange-500" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="min-h-[44px] min-w-[44px]"
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

                    <div className="mt-4 grid grid-cols-4 sm:grid-cols-6 gap-2 md:grid-cols-12">
                      {Array.from({ length: total }, (_, i) => {
                        const installmentNum = i + 1;
                        const isPaid = installmentNum <= paidCount;
                        // Calculate projected date for each installment relative to original
                        const baseDate = new Date(t.date);
                        const installmentDate = new Date(baseDate);
                        installmentDate.setMonth(baseDate.getMonth() + (installmentNum - (t.currentInstallment || 0)));

                        return (
                          <div
                            key={installmentNum}
                            className={`rounded p-2 text-center text-xs min-h-[36px] flex items-center justify-center ${
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
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
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

      {/* Cancel Confirmation */}
      <AlertDialog open={!!cancellingInstallment} onOpenChange={() => setCancellingInstallment(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar parcelas futuras</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {cancellingInstallment && (() => {
                  const futureCount = cancellingInstallment.transactions.filter(
                    (t) => new Date(t.date) >= now
                  ).length;
                  const paidCount = cancellingInstallment.transactions.length - futureCount;
                  return (
                    <>
                      <strong>{cancellingInstallment.description}</strong>
                      <br /><br />
                      {futureCount} parcela{futureCount !== 1 ? "s" : ""} futura{futureCount !== 1 ? "s" : ""} ser{futureCount !== 1 ? "ão" : "á"} cancelada{futureCount !== 1 ? "s" : ""}.
                      {paidCount > 0 && (
                        <> As {paidCount} parcela{paidCount !== 1 ? "s" : ""} já paga{paidCount !== 1 ? "s" : ""} ser{paidCount !== 1 ? "ão" : "á"} mantida{paidCount !== 1 ? "s" : ""} no histórico.</>
                      )}
                    </>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-orange-600 hover:bg-orange-700">
              Cancelar Parcelas
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Standalone Confirmation */}
      <AlertDialog open={!!cancellingStandalone} onOpenChange={() => setCancellingStandalone(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar parcelas futuras</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {cancellingStandalone && (() => {
                  const transDate = new Date(cancellingStandalone.date);
                  const monthsElapsed =
                    (now.getFullYear() - transDate.getFullYear()) * 12 +
                    (now.getMonth() - transDate.getMonth());
                  const effectiveCurrent = Math.min(
                    (cancellingStandalone.currentInstallment || 0) + monthsElapsed,
                    cancellingStandalone.totalInstallments || 1
                  );
                  const futureCount = (cancellingStandalone.totalInstallments || 1) - effectiveCurrent;
                  return (
                    <>
                      <strong>{cancellingStandalone.description}</strong>
                      <br /><br />
                      {futureCount} parcela{futureCount !== 1 ? "s" : ""} futura{futureCount !== 1 ? "s" : ""} ser{futureCount !== 1 ? "ão" : "á"} cancelada{futureCount !== 1 ? "s" : ""}.
                      {effectiveCurrent > 0 && (
                        <> As {effectiveCurrent} parcela{effectiveCurrent !== 1 ? "s" : ""} já paga{effectiveCurrent !== 1 ? "s" : ""} ser{effectiveCurrent !== 1 ? "ão" : "á"} mantida{effectiveCurrent !== 1 ? "s" : ""} no histórico.</>
                      )}
                    </>
                  );
                })()}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancelStandalone} className="bg-orange-600 hover:bg-orange-700">
              Cancelar Parcelas
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
