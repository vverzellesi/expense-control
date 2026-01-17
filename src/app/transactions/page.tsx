"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
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
  DialogTrigger,
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { TransactionForm } from "@/components/TransactionForm";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Pencil, Trash2, Filter } from "lucide-react";
import type { Transaction, Category, Origin } from "@/types";

function TransactionsContent() {
  const searchParams = useSearchParams();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(searchParams.get("new") === "true");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Filters
  const currentDate = new Date();
  const [filterMonth, setFilterMonth] = useState(String(currentDate.getMonth() + 1));
  const [filterYear, setFilterYear] = useState(String(currentDate.getFullYear()));
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterFixed, setFilterFixed] = useState(false);
  const [filterInstallment, setFilterInstallment] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    fetchData();
  }, [filterMonth, filterYear, filterCategory, filterType, filterFixed, filterInstallment]);

  useEffect(() => {
    fetchCategories();
    fetchOrigins();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterMonth) params.set("month", filterMonth);
      if (filterYear) params.set("year", filterYear);
      if (filterCategory && filterCategory !== "all") params.set("categoryId", filterCategory);
      if (filterType && filterType !== "all") params.set("type", filterType);
      if (filterFixed) params.set("isFixed", "true");
      if (filterInstallment) params.set("isInstallment", "true");

      const res = await fetch(`/api/transactions?${params.toString()}`);
      const data = await res.json();
      setTransactions(data);
    } catch (error) {
      console.error("Error fetching transactions:", error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchCategories() {
    const res = await fetch("/api/categories");
    const data = await res.json();
    setCategories(data);
  }

  async function fetchOrigins() {
    const res = await fetch("/api/origins");
    const data = await res.json();
    setOrigins(data);
  }

  async function handleDelete() {
    if (!deletingId) return;

    try {
      await fetch(`/api/transactions/${deletingId}`, {
        method: "DELETE",
      });
      setDeletingId(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting transaction:", error);
    }
  }

  function handleFormSuccess() {
    setIsFormOpen(false);
    setEditingTransaction(null);
    fetchData();
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
        <h1 className="text-2xl font-bold text-gray-900">Transacoes</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
            <Filter className="mr-2 h-4 w-4" />
            Filtros
          </Button>
          <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Nova Transação
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>
                  {editingTransaction ? "Editar Transação" : "Nova Transação"}
                </DialogTitle>
              </DialogHeader>
              <TransactionForm
                categories={categories}
                origins={origins}
                transaction={editingTransaction}
                onSuccess={handleFormSuccess}
                onCancel={() => {
                  setIsFormOpen(false);
                  setEditingTransaction(null);
                }}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 md:grid-cols-6">
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
                <Label>Categoria</Label>
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

              <div>
                <Label>Tipo</Label>
                <Select value={filterType} onValueChange={setFilterType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todos" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="INCOME">Receita</SelectItem>
                    <SelectItem value="EXPENSE">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="fixed"
                    checked={filterFixed}
                    onCheckedChange={setFilterFixed}
                  />
                  <Label htmlFor="fixed">Fixas</Label>
                </div>
              </div>

              <div className="flex items-end gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="installment"
                    checked={filterInstallment}
                    onCheckedChange={setFilterInstallment}
                  />
                  <Label htmlFor="installment">Parceladas</Label>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transactions List */}
      <Card>
        <CardHeader>
          <CardTitle>
            {transactions.length} transacao{transactions.length !== 1 ? "es" : ""}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center text-gray-500">Carregando...</div>
          ) : transactions.length === 0 ? (
            <div className="text-center text-gray-500">
              Nenhuma transação encontrada
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((transaction) => (
                <div
                  key={transaction.id}
                  className="flex items-center justify-between rounded-lg border p-4 hover:bg-gray-50"
                >
                  <div className="flex items-center gap-4">
                    {transaction.category && (
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: transaction.category.color }}
                      />
                    )}
                    <div>
                      <div className="font-medium">{transaction.description}</div>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
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
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex gap-1">
                      {transaction.isFixed && (
                        <Badge variant="secondary">Fixa</Badge>
                      )}
                      {transaction.isInstallment && (
                        <Badge variant="outline">
                          {transaction.currentInstallment}/
                          {transaction.installment?.totalInstallments}
                        </Badge>
                      )}
                    </div>

                    <div
                      className={`min-w-[100px] text-right font-semibold ${
                        transaction.type === "INCOME"
                          ? "text-green-600"
                          : "text-red-600"
                      }`}
                    >
                      {transaction.type === "INCOME" ? "+" : ""}
                      {formatCurrency(transaction.amount)}
                    </div>

                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingTransaction(transaction);
                          setIsFormOpen(true);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingId(transaction.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
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
              Tem certeza que deseja excluir esta transação? Esta ação não pode
              ser desfeita.
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

export default function TransactionsPage() {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="text-gray-500">Carregando...</div></div>}>
      <TransactionsContent />
    </Suspense>
  );
}
