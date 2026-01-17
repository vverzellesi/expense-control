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
import { DateRangePicker } from "@/components/DateRangePicker";
import { formatCurrency, formatDate } from "@/lib/utils";
import { Plus, Pencil, Trash2, Filter, Search, X, Tag } from "lucide-react";
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
  const currentMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const currentMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
  const [filterStartDate, setFilterStartDate] = useState(currentMonthStart.toISOString().split("T")[0]);
  const [filterEndDate, setFilterEndDate] = useState(currentMonthEnd.toISOString().split("T")[0]);
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterFixed, setFilterFixed] = useState(false);
  const [filterInstallment, setFilterInstallment] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, [filterStartDate, filterEndDate, filterCategory, filterType, filterFixed, filterInstallment, searchQuery, filterTag]);

  useEffect(() => {
    fetchCategories();
    fetchOrigins();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filterStartDate) params.set("startDate", filterStartDate);
      if (filterEndDate) params.set("endDate", filterEndDate);
      if (filterCategory && filterCategory !== "all") params.set("categoryId", filterCategory);
      if (filterType && filterType !== "all") params.set("type", filterType);
      if (filterFixed) params.set("isFixed", "true");
      if (filterInstallment) params.set("isInstallment", "true");
      if (searchQuery) params.set("search", searchQuery);
      if (filterTag) params.set("tag", filterTag);

      const res = await fetch(`/api/transactions?${params.toString()}`);
      const data = await res.json();
      setTransactions(data);

      // Extract unique tags from all transactions
      const tagsSet = new Set<string>();
      data.forEach((t: Transaction) => {
        if (t.tags) {
          try {
            const parsedTags = JSON.parse(t.tags);
            parsedTags.forEach((tag: string) => tagsSet.add(tag));
          } catch {
            // Ignore parsing errors
          }
        }
      });
      setAllTags(Array.from(tagsSet).sort());
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

  function handleDateRangeChange(startDate: string, endDate: string) {
    setFilterStartDate(startDate);
    setFilterEndDate(endDate);
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput);
  }

  function clearSearch() {
    setSearchInput("");
    setSearchQuery("");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Transacoes</h1>
        <div className="flex gap-2">
          <form onSubmit={handleSearch} className="relative flex">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por descricao..."
                className="w-64 pl-9 pr-8"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </form>
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
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <Label>Periodo</Label>
                <DateRangePicker
                  startDate={filterStartDate}
                  endDate={filterEndDate}
                  onRangeChange={handleDateRangeChange}
                />
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
                    <SelectItem value="TRANSFER">Transferencia</SelectItem>
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

              {allTags.length > 0 && (
                <div>
                  <Label>Tag</Label>
                  <Select value={filterTag} onValueChange={setFilterTag}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="Todas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todas</SelectItem>
                      {allTags.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          <div className="flex items-center gap-1">
                            <Tag className="h-3 w-3" />
                            {tag}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transactions List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {transactions.length} transacao{transactions.length !== 1 ? "es" : ""}
            {searchQuery && (
              <Badge variant="secondary" className="font-normal">
                Busca: &quot;{searchQuery}&quot;
              </Badge>
            )}
            {filterTag && (
              <Badge variant="outline" className="font-normal">
                <Tag className="mr-1 h-3 w-3" />
                {filterTag}
              </Badge>
            )}
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
                    <div className="flex flex-wrap gap-1">
                      {transaction.isFixed && (
                        <Badge variant="secondary">Fixa</Badge>
                      )}
                      {transaction.isInstallment && (
                        <Badge variant="outline">
                          {transaction.currentInstallment}/
                          {transaction.installment?.totalInstallments}
                        </Badge>
                      )}
                      {transaction.tags && (() => {
                        try {
                          const tags = JSON.parse(transaction.tags);
                          return tags.map((tag: string) => (
                            <Badge
                              key={tag}
                              variant="outline"
                              className="cursor-pointer bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100"
                              onClick={() => setFilterTag(tag)}
                            >
                              <Tag className="mr-1 h-3 w-3" />
                              {tag}
                            </Badge>
                          ));
                        } catch {
                          return null;
                        }
                      })()}
                    </div>

                    <div
                      className={`min-w-[100px] text-right font-semibold ${
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
