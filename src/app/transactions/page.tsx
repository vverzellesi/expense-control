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
import { Plus, Pencil, Trash2, Filter, Search, X, Tag, Repeat } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { FilterDrawer } from "@/components/FilterDrawer";
import type { Transaction, Category, Origin } from "@/types";

function TransactionsContent() {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(searchParams.get("new") === "true");
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [makingRecurring, setMakingRecurring] = useState<Transaction | null>(null);
  const [recurringLoading, setRecurringLoading] = useState(false);

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
  const [filterOrigin, setFilterOrigin] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [allTags, setAllTags] = useState<string[]>([]);

  useEffect(() => {
    fetchData();
  }, [filterStartDate, filterEndDate, filterCategory, filterType, filterFixed, filterInstallment, filterOrigin, searchQuery, filterTag]);

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
      if (filterOrigin && filterOrigin !== "all") params.set("origin", filterOrigin);
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

  async function handleMakeRecurring() {
    if (!makingRecurring) return;

    try {
      setRecurringLoading(true);
      const transactionDate = new Date(makingRecurring.date);
      const dayOfMonth = transactionDate.getDate();

      const res = await fetch(`/api/transactions/${makingRecurring.id}/make-recurring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayOfMonth, autoGenerate: true }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Erro ao criar despesa recorrente");
      }

      toast({
        title: "Sucesso",
        description: "Despesa recorrente criada com sucesso",
      });

      setMakingRecurring(null);
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao criar despesa recorrente",
        variant: "destructive",
      });
    } finally {
      setRecurringLoading(false);
    }
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

  // Count active filters for badge
  function getActiveFilterCount() {
    let count = 0;
    if (filterCategory && filterCategory !== "all") count++;
    if (filterType && filterType !== "all") count++;
    if (filterOrigin && filterOrigin !== "all") count++;
    if (filterFixed) count++;
    if (filterInstallment) count++;
    if (filterTag) count++;
    return count;
  }

  // Handle mobile filter drawer apply
  function handleFilterDrawerApply(filters: {
    startDate: string;
    endDate: string;
    category: string;
    type: string;
    origin: string;
    isFixed: boolean;
    isInstallment: boolean;
    tag: string;
  }) {
    setFilterStartDate(filters.startDate);
    setFilterEndDate(filters.endDate);
    setFilterCategory(filters.category);
    setFilterType(filters.type);
    setFilterOrigin(filters.origin);
    setFilterFixed(filters.isFixed);
    setFilterInstallment(filters.isInstallment);
    setFilterTag(filters.tag);
  }

  const activeFilterCount = getActiveFilterCount();

  // Group transactions by date range
  function groupTransactionsByDateRange(txs: Transaction[]) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const weekStart = new Date(today);
    weekStart.setDate(weekStart.getDate() - today.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const groups: { label: string; transactions: Transaction[] }[] = [
      { label: "Hoje", transactions: [] },
      { label: "Ontem", transactions: [] },
      { label: "Esta semana", transactions: [] },
      { label: "Este mês", transactions: [] },
      { label: "Mês passado", transactions: [] },
      { label: "Anteriores", transactions: [] },
    ];

    txs.forEach((t) => {
      const date = new Date(t.date);
      const txDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

      if (txDate.getTime() === today.getTime()) {
        groups[0].transactions.push(t);
      } else if (txDate.getTime() === yesterday.getTime()) {
        groups[1].transactions.push(t);
      } else if (txDate >= weekStart && txDate < yesterday) {
        groups[2].transactions.push(t);
      } else if (txDate >= monthStart && txDate < weekStart) {
        groups[3].transactions.push(t);
      } else if (txDate >= lastMonthStart && txDate <= lastMonthEnd) {
        groups[4].transactions.push(t);
      } else {
        groups[5].transactions.push(t);
      }
    });

    return groups.filter((g) => g.transactions.length > 0);
  }

  const groupedTransactions = groupTransactionsByDateRange(transactions);

  return (
    <div className="space-y-6 overflow-x-hidden">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Transacoes</h1>
        <div className="flex flex-col sm:flex-row gap-2">
          <form onSubmit={handleSearch} className="relative flex">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por descricao..."
                className="w-full md:w-64 pl-9 pr-8"
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
          <div className="flex gap-2">
            {/* Mobile filter button with badge */}
            <Button
              variant="outline"
              onClick={() => setShowFilterDrawer(true)}
              className="md:hidden relative"
            >
              <Filter className="mr-2 h-4 w-4" />
              Filtros
              {activeFilterCount > 0 && (
                <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">
                  {activeFilterCount}
                </span>
              )}
            </Button>
            {/* Desktop filter button */}
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className="hidden md:flex"
            >
              <Filter className="mr-2 h-4 w-4" />
              Filtros
            </Button>
            <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  <span className="hidden sm:inline">Nova Transação</span>
                  <span className="sm:hidden">Nova</span>
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
      </div>

      {/* Desktop Filters */}
      {showFilters && (
        <Card className="hidden md:block">
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

              <div>
                <Label>Origem</Label>
                <Select value={filterOrigin} onValueChange={setFilterOrigin}>
                  <SelectTrigger>
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
            {filterOrigin && filterOrigin !== "all" && (
              <Badge variant="secondary" className="font-normal">
                Origem: {filterOrigin}
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
            <div className="space-y-6">
              {groupedTransactions.map((group) => (
                <div key={group.label}>
                  <div className="mb-3 flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                      {group.label}
                    </h3>
                    <span className="text-xs text-gray-400">
                      ({group.transactions.length})
                    </span>
                  </div>
                  <div className="space-y-2">
                    {group.transactions.map((transaction) => (
                      <div
                        key={transaction.id}
                        className="rounded-lg border p-4 hover:bg-gray-50"
                      >
                        <div className="flex items-start gap-3">
                          {/* Category dot */}
                          {transaction.category && (
                            <div
                              className="mt-1 h-4 w-4 flex-shrink-0 rounded-full"
                              style={{ backgroundColor: transaction.category.color }}
                            />
                          )}

                          {/* Main content - grows to fill space */}
                          <div className="min-w-0 flex-1">
                            {/* Top row: description + amount */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium truncate">{transaction.description}</div>
                              </div>
                              <div
                                className={`flex-shrink-0 font-semibold ${
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
                            </div>

                            {/* Middle row: metadata */}
                            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
                              <span>{formatDate(transaction.date)}</span>
                              <span className="hidden sm:inline">-</span>
                              <span className="hidden sm:inline">{transaction.origin}</span>
                              {transaction.category && (
                                <>
                                  <span className="hidden sm:inline">-</span>
                                  <span className="hidden sm:inline">{transaction.category.name}</span>
                                </>
                              )}
                              {/* Mobile: show origin and category as badges */}
                              <span className="sm:hidden text-xs bg-gray-100 px-1.5 py-0.5 rounded">{transaction.origin}</span>
                              {transaction.category && (
                                <span className="sm:hidden text-xs bg-gray-100 px-1.5 py-0.5 rounded">{transaction.category.name}</span>
                              )}
                            </div>

                            {/* Bottom row: badges + actions */}
                            <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                              <div className="flex flex-wrap gap-1">
                                {transaction.isInstallment && (
                                  <Badge variant="outline" className="text-xs">
                                    {transaction.currentInstallment}/
                                    {transaction.totalInstallments || transaction.installment?.totalInstallments}
                                  </Badge>
                                )}
                                {transaction.isFixed && (
                                  <Badge variant="secondary" className="text-xs">Fixa</Badge>
                                )}
                                {transaction.tags && (() => {
                                  try {
                                    const tags = JSON.parse(transaction.tags);
                                    return tags.slice(0, 2).map((tag: string) => (
                                      <Badge
                                        key={tag}
                                        variant="outline"
                                        className="cursor-pointer bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100 text-xs"
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

                              <div className="flex flex-shrink-0 gap-1">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    setEditingTransaction(transaction);
                                    setIsFormOpen(true);
                                  }}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {!transaction.recurringExpenseId && !transaction.isInstallment && !transaction.installmentId && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8"
                                    onClick={() => setMakingRecurring(transaction)}
                                    title="Tornar recorrente"
                                  >
                                    <Repeat className="h-4 w-4 text-blue-500" />
                                  </Button>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => setDeletingId(transaction.id)}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
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

      {/* Make Recurring Confirmation */}
      <AlertDialog open={!!makingRecurring} onOpenChange={() => setMakingRecurring(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tornar recorrente</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Deseja criar uma despesa recorrente a partir desta transacao?
                </p>
                {makingRecurring && (
                  <div className="rounded-lg bg-gray-50 p-3 text-sm">
                    <p><strong>Descricao:</strong> {makingRecurring.description}</p>
                    <p><strong>Valor:</strong> {formatCurrency(Math.abs(makingRecurring.amount))}</p>
                    <p><strong>Dia do mes:</strong> {new Date(makingRecurring.date).getDate()}</p>
                    <p><strong>Origem:</strong> {makingRecurring.origin}</p>
                  </div>
                )}
                <p className="text-xs text-gray-500">
                  A transacao sera vinculada a nova despesa recorrente e marcada como fixa.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={recurringLoading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleMakeRecurring} disabled={recurringLoading}>
              {recurringLoading ? "Criando..." : "Criar recorrente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Mobile Filter Drawer */}
      <FilterDrawer
        isOpen={showFilterDrawer}
        onClose={() => setShowFilterDrawer(false)}
        filters={{
          startDate: filterStartDate,
          endDate: filterEndDate,
          category: filterCategory,
          type: filterType,
          origin: filterOrigin,
          isFixed: filterFixed,
          isInstallment: filterInstallment,
          tag: filterTag,
        }}
        onApply={handleFilterDrawerApply}
        categories={categories}
        origins={origins}
        allTags={allTags}
      />
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
