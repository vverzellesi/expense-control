"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Trash2, Calendar, CreditCard } from "lucide-react";
import type { Transaction, Category, Installment } from "@/types";

interface InstallmentWithTransactions extends Installment {
  transactions: (Transaction & { category: Category | null })[];
}

export default function InstallmentsPage() {
  const [installments, setInstallments] = useState<InstallmentWithTransactions[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchInstallments();
  }, []);

  async function fetchInstallments() {
    try {
      const res = await fetch("/api/installments?active=true");
      const data = await res.json();
      setInstallments(data);
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
      fetchInstallments();
    } catch (error) {
      console.error("Error deleting installment:", error);
    }
  }

  // Calculate future months summary
  const futureSummary: Record<string, number> = {};
  const now = new Date();

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

  const sortedMonths = Object.keys(futureSummary).sort();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Parcelas</h1>
        <p className="text-gray-500">Gerencie suas compras parceladas</p>
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
            Compras Parceladas Ativas ({installments.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {installments.length === 0 ? (
            <div className="text-center text-gray-500">
              Nenhuma compra parcelada ativa
            </div>
          ) : (
            <div className="space-y-4">
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
    </div>
  );
}
