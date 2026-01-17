"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { Plus, Trash2, Target, Tag } from "lucide-react";
import type { Category, Budget, CategoryRule } from "@/types";

interface BudgetWithCategory extends Budget {
  category: Category;
}

interface RuleWithCategory extends CategoryRule {
  category: Category;
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<BudgetWithCategory[]>([]);
  const [rules, setRules] = useState<RuleWithCategory[]>([]);
  const [loading, setLoading] = useState(true);

  // Budget form
  const [budgetCategoryId, setBudgetCategoryId] = useState("");
  const [budgetAmount, setBudgetAmount] = useState("");
  const [budgetSaving, setBudgetSaving] = useState(false);

  // Rule form
  const [ruleKeyword, setRuleKeyword] = useState("");
  const [ruleCategoryId, setRuleCategoryId] = useState("");
  const [ruleSaving, setRuleSaving] = useState(false);

  // Delete confirmation
  const [deletingBudgetId, setDeletingBudgetId] = useState<string | null>(null);
  const [deletingRuleId, setDeletingRuleId] = useState<string | null>(null);

  // Current month spending
  const [spending, setSpending] = useState<Record<string, number>>({});

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const [categoriesRes, budgetsRes, rulesRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/budgets"),
        fetch("/api/rules"),
      ]);

      const categoriesData = await categoriesRes.json();
      const budgetsData = await budgetsRes.json();
      const rulesData = await rulesRes.json();

      setCategories(categoriesData);
      setBudgets(budgetsData);
      setRules(rulesData);

      // Fetch current month spending
      const now = new Date();
      const summaryRes = await fetch(
        `/api/summary?month=${now.getMonth() + 1}&year=${now.getFullYear()}`
      );
      const summaryData = await summaryRes.json();

      const spendingMap: Record<string, number> = {};
      summaryData.categoryBreakdown?.forEach(
        (item: { categoryId: string; total: number }) => {
          spendingMap[item.categoryId] = item.total;
        }
      );
      setSpending(spendingMap);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveBudget(e: React.FormEvent) {
    e.preventDefault();

    if (!budgetCategoryId || !budgetAmount) {
      toast({
        title: "Erro",
        description: "Selecione uma categoria e informe o valor",
        variant: "destructive",
      });
      return;
    }

    setBudgetSaving(true);

    try {
      const res = await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: budgetCategoryId,
          amount: parseFloat(budgetAmount),
          isActive: true,
        }),
      });

      if (!res.ok) throw new Error();

      toast({
        title: "Sucesso",
        description: "Orçamento salvo com sucesso",
      });

      setBudgetCategoryId("");
      setBudgetAmount("");
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar orçamento",
        variant: "destructive",
      });
    } finally {
      setBudgetSaving(false);
    }
  }

  async function handleToggleBudget(budget: BudgetWithCategory) {
    try {
      await fetch("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: budget.categoryId,
          amount: budget.amount,
          isActive: !budget.isActive,
        }),
      });
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao atualizar orçamento",
        variant: "destructive",
      });
    }
  }

  async function handleDeleteBudget() {
    if (!deletingBudgetId) return;

    try {
      await fetch(`/api/budgets?id=${deletingBudgetId}`, {
        method: "DELETE",
      });
      setDeletingBudgetId(null);
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao excluir orçamento",
        variant: "destructive",
      });
    }
  }

  async function handleSaveRule(e: React.FormEvent) {
    e.preventDefault();

    if (!ruleKeyword || !ruleCategoryId) {
      toast({
        title: "Erro",
        description: "Informe a palavra-chave e selecione uma categoria",
        variant: "destructive",
      });
      return;
    }

    setRuleSaving(true);

    try {
      const res = await fetch("/api/rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          keyword: ruleKeyword,
          categoryId: ruleCategoryId,
        }),
      });

      if (!res.ok) throw new Error();

      toast({
        title: "Sucesso",
        description: "Regra criada com sucesso",
      });

      setRuleKeyword("");
      setRuleCategoryId("");
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao criar regra",
        variant: "destructive",
      });
    } finally {
      setRuleSaving(false);
    }
  }

  async function handleDeleteRule() {
    if (!deletingRuleId) return;

    try {
      await fetch(`/api/rules?id=${deletingRuleId}`, {
        method: "DELETE",
      });
      setDeletingRuleId(null);
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao excluir regra",
        variant: "destructive",
      });
    }
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-gray-500">Carregando...</div>
      </div>
    );
  }

  const categoriesWithoutBudget = categories.filter(
    (c) => !budgets.some((b) => b.categoryId === c.id)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-500">Gerencie orçamentos e regras de categorização</p>
      </div>

      <Tabs defaultValue="budgets">
        <TabsList>
          <TabsTrigger value="budgets">
            <Target className="mr-2 h-4 w-4" />
            Orçamentos
          </TabsTrigger>
          <TabsTrigger value="rules">
            <Tag className="mr-2 h-4 w-4" />
            Regras de Categorizacao
          </TabsTrigger>
        </TabsList>

        <TabsContent value="budgets" className="space-y-6">
          {/* Add Budget Form */}
          <Card>
            <CardHeader>
              <CardTitle>Novo Orçamento</CardTitle>
              <CardDescription>
                Defina um limite mensal para uma categoria
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveBudget} className="flex gap-4">
                <div className="flex-1">
                  <Label>Categoria</Label>
                  <Select
                    value={budgetCategoryId}
                    onValueChange={setBudgetCategoryId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoriesWithoutBudget.map((c) => (
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
                <div className="w-40">
                  <Label>Limite Mensal</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={budgetSaving}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Budgets List */}
          <Card>
            <CardHeader>
              <CardTitle>Orçamentos Configurados</CardTitle>
            </CardHeader>
            <CardContent>
              {budgets.length === 0 ? (
                <div className="text-center text-gray-500">
                  Nenhum orçamento configurado
                </div>
              ) : (
                <div className="space-y-4">
                  {budgets.map((budget) => {
                    const spent = spending[budget.categoryId] || 0;
                    const percentage = Math.min(
                      (spent / budget.amount) * 100,
                      100
                    );
                    const isOver = spent > budget.amount;

                    return (
                      <div
                        key={budget.id}
                        className={`rounded-lg border p-4 ${
                          !budget.isActive ? "opacity-50" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-4 w-4 rounded-full"
                              style={{
                                backgroundColor: budget.category.color,
                              }}
                            />
                            <span className="font-medium">
                              {budget.category.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <span
                                className={
                                  isOver ? "text-red-600" : "text-gray-600"
                                }
                              >
                                {formatCurrency(spent)}
                              </span>
                              <span className="text-gray-400"> / </span>
                              <span className="font-medium">
                                {formatCurrency(budget.amount)}
                              </span>
                            </div>
                            <Switch
                              checked={budget.isActive}
                              onCheckedChange={() => handleToggleBudget(budget)}
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setDeletingBudgetId(budget.id)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </div>
                        {budget.isActive && (
                          <div className="mt-3">
                            <Progress
                              value={percentage}
                              className={`h-2 ${
                                isOver ? "[&>div]:bg-red-500" : ""
                              }`}
                            />
                            <div className="mt-1 flex justify-between text-xs text-gray-500">
                              <span>{percentage.toFixed(0)}% utilizado</span>
                              {isOver && (
                                <span className="text-red-500">
                                  Excedido em {formatCurrency(spent - budget.amount)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="rules" className="space-y-6">
          {/* Add Rule Form */}
          <Card>
            <CardHeader>
              <CardTitle>Nova Regra</CardTitle>
              <CardDescription>
                Crie regras para categorizar transacoes automaticamente durante a
                importacao
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveRule} className="flex gap-4">
                <div className="flex-1">
                  <Label>Palavra-chave</Label>
                  <Input
                    value={ruleKeyword}
                    onChange={(e) => setRuleKeyword(e.target.value)}
                    placeholder="Ex: UBER, IFOOD, NETFLIX"
                  />
                </div>
                <div className="flex-1">
                  <Label>Categoria</Label>
                  <Select
                    value={ruleCategoryId}
                    onValueChange={setRuleCategoryId}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma categoria" />
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
                <div className="flex items-end">
                  <Button type="submit" disabled={ruleSaving}>
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Rules List */}
          <Card>
            <CardHeader>
              <CardTitle>Regras de Categorizacao ({rules.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {rules.length === 0 ? (
                <div className="text-center text-gray-500">
                  Nenhuma regra configurada
                </div>
              ) : (
                <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-gray-100 px-2 py-1 text-sm">
                          {rule.keyword}
                        </code>
                        <span className="text-gray-400">-&gt;</span>
                        <div className="flex items-center gap-1">
                          <div
                            className="h-3 w-3 rounded-full"
                            style={{
                              backgroundColor: rule.category.color,
                            }}
                          />
                          <span className="text-sm">{rule.category.name}</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeletingRuleId(rule.id)}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Delete Budget Confirmation */}
      <AlertDialog
        open={!!deletingBudgetId}
        onOpenChange={() => setDeletingBudgetId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusao</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir este orçamento?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBudget} className="bg-red-600">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Rule Confirmation */}
      <AlertDialog
        open={!!deletingRuleId}
        onOpenChange={() => setDeletingRuleId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusao</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta regra de categorização?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteRule} className="bg-red-600">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
