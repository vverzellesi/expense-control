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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
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
import { useToast } from "@/components/ui/use-toast";
import { formatCurrency } from "@/lib/utils";
import { Plus, Pencil, Trash2, RefreshCw, Calendar, Check, Lightbulb, Sparkles } from "lucide-react";
import type { Category, Origin, RecurringExpense, Transaction } from "@/types";

interface RecurringSuggestion {
  description: string;
  normalizedDescription: string;
  avgAmount: number;
  occurrences: number;
  avgDayOfMonth: number;
  categoryId: string | null;
  categoryName: string | null;
  origin: string;
}

interface RecurringExpenseWithTransactions extends RecurringExpense {
  transactions: Transaction[];
}

export default function RecurringPage() {
  const { toast } = useToast();
  const [recurringExpenses, setRecurringExpenses] = useState<RecurringExpenseWithTransactions[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [suggestions, setSuggestions] = useState<RecurringSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<RecurringExpense | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generateAmount, setGenerateAmount] = useState("");
  const [creatingSuggestion, setCreatingSuggestion] = useState<string | null>(null);

  // Form state
  const [description, setDescription] = useState("");
  const [defaultAmount, setDefaultAmount] = useState("");
  const [dayOfMonth, setDayOfMonth] = useState("1");
  const [type, setType] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [origin, setOrigin] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [formLoading, setFormLoading] = useState(false);

  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (editingExpense) {
      setDescription(editingExpense.description);
      setDefaultAmount(String(editingExpense.defaultAmount));
      setDayOfMonth(String(editingExpense.dayOfMonth));
      setType(editingExpense.type as "INCOME" | "EXPENSE");
      setOrigin(editingExpense.origin);
      setCategoryId(editingExpense.categoryId || "");
    } else {
      resetForm();
    }
  }, [editingExpense]);

  function resetForm() {
    setDescription("");
    setDefaultAmount("");
    setDayOfMonth("1");
    setType("EXPENSE");
    setOrigin("");
    setCategoryId("");
  }

  async function fetchData() {
    try {
      setLoading(true);
      const [expensesRes, categoriesRes, originsRes, suggestionsRes] = await Promise.all([
        fetch("/api/recurring"),
        fetch("/api/categories"),
        fetch("/api/origins"),
        fetch("/api/recurring/suggestions"),
      ]);

      const [expensesData, categoriesData, originsData, suggestionsData] = await Promise.all([
        expensesRes.json(),
        categoriesRes.json(),
        originsRes.json(),
        suggestionsRes.json(),
      ]);

      setRecurringExpenses(expensesData);
      setCategories(categoriesData);
      setOrigins(originsData);
      setSuggestions(Array.isArray(suggestionsData) ? suggestionsData : []);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!description || !defaultAmount || !dayOfMonth || !origin) {
      toast({
        title: "Erro",
        description: "Preencha todos os campos obrigatorios",
        variant: "destructive",
      });
      return;
    }

    setFormLoading(true);

    try {
      const url = editingExpense
        ? `/api/recurring/${editingExpense.id}`
        : "/api/recurring";

      const res = await fetch(url, {
        method: editingExpense ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          defaultAmount: parseFloat(defaultAmount),
          dayOfMonth: parseInt(dayOfMonth),
          type,
          origin,
          categoryId: categoryId || null,
        }),
      });

      if (!res.ok) throw new Error();

      toast({
        title: "Sucesso",
        description: editingExpense
          ? "Despesa recorrente atualizada"
          : "Despesa recorrente criada",
      });

      setIsFormOpen(false);
      setEditingExpense(null);
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar despesa recorrente",
        variant: "destructive",
      });
    } finally {
      setFormLoading(false);
    }
  }

  async function handleDelete() {
    if (!deletingId) return;

    try {
      await fetch(`/api/recurring/${deletingId}`, { method: "DELETE" });

      toast({
        title: "Sucesso",
        description: "Despesa recorrente excluida",
      });

      setDeletingId(null);
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao excluir despesa recorrente",
        variant: "destructive",
      });
    }
  }

  async function handleToggleActive(expense: RecurringExpense) {
    try {
      await fetch(`/api/recurring/${expense.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...expense,
          isActive: !expense.isActive,
        }),
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao atualizar status",
        variant: "destructive",
      });
    }
  }

  async function handleGenerate(expense: RecurringExpenseWithTransactions) {
    try {
      const amount = generateAmount ? parseFloat(generateAmount) : undefined;

      const res = await fetch(`/api/recurring/${expense.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          month: currentMonth,
          year: currentYear,
          amount,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Erro ao gerar transação");
      }

      toast({
        title: "Sucesso",
        description: `Transação de ${formatCurrency(Math.abs(data.amount))} criada para este mês`,
      });

      setGeneratingId(null);
      setGenerateAmount("");
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao gerar transação",
        variant: "destructive",
      });
    }
  }

  function hasTransactionThisMonth(expense: RecurringExpenseWithTransactions): boolean {
    return expense.transactions.some((t) => {
      const date = new Date(t.date);
      return date.getMonth() + 1 === currentMonth && date.getFullYear() === currentYear;
    });
  }

  function getLastTransactionAmount(expense: RecurringExpenseWithTransactions): number | null {
    if (expense.transactions.length === 0) return null;
    return Math.abs(expense.transactions[0].amount);
  }

  async function createFromSuggestion(suggestion: RecurringSuggestion) {
    setCreatingSuggestion(suggestion.normalizedDescription);

    try {
      const res = await fetch("/api/recurring", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: suggestion.description,
          defaultAmount: suggestion.avgAmount,
          dayOfMonth: suggestion.avgDayOfMonth,
          type: "EXPENSE",
          origin: suggestion.origin,
          categoryId: suggestion.categoryId,
        }),
      });

      if (!res.ok) throw new Error();

      toast({
        title: "Sucesso",
        description: "Despesa recorrente criada a partir da sugestao",
      });

      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao criar despesa recorrente",
        variant: "destructive",
      });
    } finally {
      setCreatingSuggestion(null);
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  const monthName = currentDate.toLocaleDateString("pt-BR", { month: "long" });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Despesas Recorrentes</h1>
          <p className="text-gray-500">
            Gerencie suas despesas fixas mensais com valores variaveis
          </p>
        </div>
        <Dialog
          open={isFormOpen}
          onOpenChange={(open) => {
            setIsFormOpen(open);
            if (!open) setEditingExpense(null);
          }}
        >
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nova Recorrente
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingExpense ? "Editar Despesa Recorrente" : "Nova Despesa Recorrente"}
              </DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div
                  className={`cursor-pointer rounded-lg border-2 p-3 text-center transition-colors ${
                    type === "EXPENSE"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setType("EXPENSE")}
                >
                  Despesa
                </div>
                <div
                  className={`cursor-pointer rounded-lg border-2 p-3 text-center transition-colors ${
                    type === "INCOME"
                      ? "border-green-500 bg-green-50 text-green-700"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                  onClick={() => setType("INCOME")}
                >
                  Receita
                </div>
              </div>

              <div>
                <Label>Descrição *</Label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Internet, Aluguel, Streaming"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Valor Padrao *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={defaultAmount}
                    onChange={(e) => setDefaultAmount(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label>Dia do Mes *</Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={dayOfMonth}
                    onChange={(e) => setDayOfMonth(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label>Origem *</Label>
                <Select value={origin} onValueChange={setOrigin}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
                    {origins.map((o) => (
                      <SelectItem key={o.id} value={o.name}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Categoria</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                  <SelectContent>
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

              <div className="flex gap-2 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingExpense(null);
                  }}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={formLoading} className="flex-1">
                  {formLoading ? "Salvando..." : editingExpense ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Suggestions Section */}
      {suggestions.length > 0 && (
        <Card className="border-purple-200 bg-purple-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-purple-800">
              <Lightbulb className="h-5 w-5" />
              Sugestoes de Despesas Recorrentes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-purple-700">
              Detectamos padroes de gastos que podem ser recorrentes. Clique para adicionar.
            </p>
            <div className="space-y-2">
              {suggestions.map((suggestion) => (
                <div
                  key={suggestion.normalizedDescription}
                  className="flex items-center justify-between rounded-lg bg-white p-3 shadow-sm"
                >
                  <div>
                    <div className="font-medium">{suggestion.description}</div>
                    <div className="text-sm text-gray-500">
                      {suggestion.occurrences}x nos ultimos 6 meses - Dia ~{suggestion.avgDayOfMonth} - {suggestion.origin}
                      {suggestion.categoryName && ` - ${suggestion.categoryName}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-semibold text-red-600">
                        ~{formatCurrency(suggestion.avgAmount)}
                      </div>
                      <div className="text-xs text-gray-500">media</div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => createFromSuggestion(suggestion)}
                      disabled={creatingSuggestion === suggestion.normalizedDescription}
                    >
                      <Sparkles className="mr-1 h-4 w-4" />
                      {creatingSuggestion === suggestion.normalizedDescription
                        ? "Criando..."
                        : "Adicionar"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generate for current month */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            <span className="capitalize">{monthName} {currentYear}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-gray-500">
            Gere transacoes para o mes atual. Voce pode ajustar o valor se for diferente do padrao.
          </p>
          <div className="space-y-2">
            {recurringExpenses.filter(e => e.isActive).map((expense) => {
              const hasThisMonth = hasTransactionThisMonth(expense);
              const lastAmount = getLastTransactionAmount(expense);

              return (
                <div
                  key={expense.id}
                  className={`flex items-center justify-between rounded-lg border p-3 ${
                    hasThisMonth ? "bg-green-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {expense.category && (
                      <div
                        className="h-4 w-4 rounded-full"
                        style={{ backgroundColor: expense.category.color }}
                      />
                    )}
                    <div>
                      <span className="font-medium">{expense.description}</span>
                      <div className="text-sm text-gray-500">
                        Padrao: {formatCurrency(expense.defaultAmount)}
                        {lastAmount && lastAmount !== expense.defaultAmount && (
                          <span className="ml-2">
                            (ultimo: {formatCurrency(lastAmount)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {hasThisMonth ? (
                      <Badge className="bg-green-500">
                        <Check className="mr-1 h-3 w-3" />
                        Gerado
                      </Badge>
                    ) : generatingId === expense.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder={String(expense.defaultAmount)}
                          value={generateAmount}
                          onChange={(e) => setGenerateAmount(e.target.value)}
                          className="w-28"
                        />
                        <Button size="sm" onClick={() => handleGenerate(expense)}>
                          OK
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setGeneratingId(null);
                            setGenerateAmount("");
                          }}
                        >
                          X
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setGeneratingId(expense.id)}
                      >
                        <RefreshCw className="mr-1 h-3 w-3" />
                        Gerar
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* All recurring expenses */}
      <Card>
        <CardHeader>
          <CardTitle>Todas as Despesas Recorrentes ({recurringExpenses.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {recurringExpenses.length === 0 ? (
            <div className="text-center text-gray-500">
              Nenhuma despesa recorrente cadastrada
            </div>
          ) : (
            <div className="space-y-3">
              {recurringExpenses.map((expense) => (
                <div
                  key={expense.id}
                  className={`flex items-center justify-between rounded-lg border p-4 ${
                    !expense.isActive ? "opacity-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {expense.category && (
                      <div
                        className="h-5 w-5 rounded-full"
                        style={{ backgroundColor: expense.category.color }}
                      />
                    )}
                    <div>
                      <div className="font-medium">{expense.description}</div>
                      <div className="text-sm text-gray-500">
                        Dia {expense.dayOfMonth} - {expense.origin}
                        {expense.category && ` - ${expense.category.name}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div
                        className={`font-semibold ${
                          expense.type === "INCOME" ? "text-green-600" : "text-red-600"
                        }`}
                      >
                        {expense.type === "INCOME" ? "+" : "-"}
                        {formatCurrency(expense.defaultAmount)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {expense.transactions.length} lancamento(s)
                      </div>
                    </div>

                    <Switch
                      checked={expense.isActive}
                      onCheckedChange={() => handleToggleActive(expense)}
                    />

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingExpense(expense);
                        setIsFormOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setDeletingId(expense.id)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
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
              Tem certeza que deseja excluir esta despesa recorrente? As transacoes
              já geradas serão mantidas, mas não estarão mais vinculadas.
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
