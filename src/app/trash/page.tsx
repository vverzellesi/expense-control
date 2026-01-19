"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Trash2, RotateCcw, AlertTriangle } from "lucide-react";
import type { Transaction } from "@/types";

export default function TrashPage() {
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [cleaningOld, setCleaningOld] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const res = await fetch("/api/transactions/trash");
      const data = await res.json();
      setTransactions(data);
    } catch (error) {
      console.error("Error fetching deleted transactions:", error);
      toast({
        title: "Erro",
        description: "Erro ao carregar transacoes excluidas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleRestore(id: string) {
    setRestoringId(id);
    try {
      const res = await fetch("/api/transactions/trash", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });

      if (!res.ok) throw new Error();

      toast({
        title: "Sucesso",
        description: "Transacao restaurada com sucesso",
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao restaurar transacao",
        variant: "destructive",
      });
    } finally {
      setRestoringId(null);
    }
  }

  async function handlePermanentDelete() {
    if (!deletingId) return;

    try {
      const res = await fetch(`/api/transactions/trash?id=${deletingId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error();

      toast({
        title: "Sucesso",
        description: "Transacao excluida permanentemente",
      });
      setDeletingId(null);
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao excluir transacao permanentemente",
        variant: "destructive",
      });
    }
  }

  async function handleCleanOld() {
    setCleaningOld(true);
    try {
      const res = await fetch("/api/transactions/trash?cleanOld=true", {
        method: "DELETE",
      });

      if (!res.ok) throw new Error();

      const data = await res.json();
      toast({
        title: "Sucesso",
        description: data.message,
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao limpar transacoes antigas",
        variant: "destructive",
      });
    } finally {
      setCleaningOld(false);
    }
  }

  function getDaysAgo(deletedAt: Date | string | null): number {
    if (!deletedAt) return 0;
    const deleted = new Date(deletedAt);
    const now = new Date();
    const diff = now.getTime() - deleted.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  }

  const oldTransactions = transactions.filter(t => getDaysAgo(t.deletedAt) >= 30);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Lixeira</h1>
          <p className="text-gray-500">
            Transacoes excluidas podem ser restauradas ou removidas permanentemente
          </p>
        </div>
        {oldTransactions.length > 0 && (
          <Button
            variant="outline"
            onClick={handleCleanOld}
            disabled={cleaningOld}
            className="text-red-600 border-red-200 hover:bg-red-50"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Limpar itens antigos ({oldTransactions.length})
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-gray-500" />
            {transactions.length} transacao{transactions.length !== 1 ? "es" : ""} na lixeira
          </CardTitle>
          <CardDescription>
            Itens sao mantidos por 30 dias antes de serem excluidos automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-gray-500 py-8">Carregando...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              A lixeira esta vazia
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((transaction) => {
                const daysAgo = getDaysAgo(transaction.deletedAt);
                const isOld = daysAgo >= 30;

                return (
                  <div
                    key={transaction.id}
                    className={`flex items-center justify-between rounded-lg border p-4 ${
                      isOld ? "bg-red-50 border-red-200" : "hover:bg-gray-50"
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      {transaction.category && (
                        <div
                          className="h-4 w-4 rounded-full opacity-50"
                          style={{ backgroundColor: transaction.category.color }}
                        />
                      )}
                      <div>
                        <div className="font-medium text-gray-600">
                          {transaction.description}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-400">
                          <span>{formatDate(transaction.date)}</span>
                          <span>-</span>
                          <span>{transaction.origin}</span>
                          {transaction.category && (
                            <>
                              <span>-</span>
                              <span>{transaction.category.name}</span>
                            </>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          Excluido ha {daysAgo} dia{daysAgo !== 1 ? "s" : ""}
                          {isOld && (
                            <span className="ml-2 text-red-500 font-medium">
                              <AlertTriangle className="inline h-3 w-3 mr-1" />
                              Sera removido em breve
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-4">
                      <div
                        className={`min-w-[100px] text-right font-semibold opacity-50 ${
                          transaction.type === "INCOME"
                            ? "text-green-600"
                            : transaction.type === "TRANSFER"
                            ? "text-gray-400"
                            : "text-red-600"
                        }`}
                      >
                        {transaction.type === "INCOME" ? "+" : ""}
                        {formatCurrency(transaction.amount)}
                      </div>

                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRestore(transaction.id)}
                          disabled={restoringId === transaction.id}
                        >
                          <RotateCcw className="mr-1 h-4 w-4" />
                          Restaurar
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeletingId(transaction.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Permanent Delete Confirmation */}
      <AlertDialog open={!!deletingId} onOpenChange={() => setDeletingId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir permanentemente</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao nao pode ser desfeita. A transacao sera removida permanentemente
              e nao podera ser recuperada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePermanentDelete} className="bg-red-600">
              Excluir Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
