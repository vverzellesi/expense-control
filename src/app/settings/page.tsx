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
import { Plus, Trash2, Target, Tag, PiggyBank, CheckCircle, XCircle, History, Wallet, Pencil } from "lucide-react";
import type { Category, Budget, CategoryRule, SavingsHistory, Origin } from "@/types";

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

  // Origins
  const [origins, setOrigins] = useState<Origin[]>([]);
  const [newOriginName, setNewOriginName] = useState("");
  const [originSaving, setOriginSaving] = useState(false);
  const [editingOrigin, setEditingOrigin] = useState<Origin | null>(null);
  const [editOriginName, setEditOriginName] = useState("");
  const [deletingOrigin, setDeletingOrigin] = useState<Origin | null>(null);

  // Current month spending
  const [spending, setSpending] = useState<Record<string, number>>({});

  // Savings goal
  const [savingsGoal, setSavingsGoal] = useState("");
  const [savingsGoalSaving, setSavingsGoalSaving] = useState(false);

  // Savings history
  const [savingsHistory, setSavingsHistory] = useState<SavingsHistory[]>([]);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    try {
      setLoading(true);
      const [categoriesRes, budgetsRes, rulesRes, savingsGoalRes, savingsHistoryRes, originsRes] = await Promise.all([
        fetch("/api/categories"),
        fetch("/api/budgets"),
        fetch("/api/rules"),
        fetch("/api/settings?key=savingsGoal"),
        fetch("/api/savings-history?limit=12"),
        fetch("/api/origins"),
      ]);

      const categoriesData = await categoriesRes.json();
      const budgetsData = await budgetsRes.json();
      const rulesData = await rulesRes.json();
      const savingsGoalData = await savingsGoalRes.json();
      const savingsHistoryData = await savingsHistoryRes.json();
      const originsData = await originsRes.json();

      setCategories(categoriesData);
      setBudgets(budgetsData);
      setRules(rulesData);
      if (savingsGoalData?.value) {
        setSavingsGoal(savingsGoalData.value);
      }
      setSavingsHistory(savingsHistoryData || []);
      setOrigins(originsData || []);

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

  async function handleSaveSavingsGoal(e: React.FormEvent) {
    e.preventDefault();

    setSavingsGoalSaving(true);

    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: "savingsGoal",
          value: savingsGoal,
        }),
      });

      if (!res.ok) throw new Error();

      toast({
        title: "Sucesso",
        description: "Meta de economia salva com sucesso",
      });
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao salvar meta de economia",
        variant: "destructive",
      });
    } finally {
      setSavingsGoalSaving(false);
    }
  }

  async function handleAddOrigin(e: React.FormEvent) {
    e.preventDefault();

    if (!newOriginName.trim()) {
      toast({
        title: "Erro",
        description: "Informe o nome da origem",
        variant: "destructive",
      });
      return;
    }

    setOriginSaving(true);

    try {
      const res = await fetch("/api/origins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newOriginName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao criar origem");
      }

      toast({
        title: "Sucesso",
        description: "Origem adicionada com sucesso",
      });

      setNewOriginName("");
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao adicionar origem",
        variant: "destructive",
      });
    } finally {
      setOriginSaving(false);
    }
  }

  async function handleEditOrigin() {
    if (!editingOrigin || !editOriginName.trim()) return;

    try {
      const res = await fetch(`/api/origins?id=${editingOrigin.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editOriginName.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Erro ao atualizar origem");
      }

      toast({
        title: "Sucesso",
        description: "Origem atualizada com sucesso",
      });

      setEditingOrigin(null);
      setEditOriginName("");
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Erro ao atualizar origem",
        variant: "destructive",
      });
    }
  }

  async function handleDeleteOrigin() {
    if (!deletingOrigin) return;

    try {
      const res = await fetch(`/api/origins?id=${deletingOrigin.id}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error();

      toast({
        title: "Sucesso",
        description: "Origem excluída com sucesso",
      });

      setDeletingOrigin(null);
      fetchData();
    } catch (error) {
      toast({
        title: "Erro",
        description: "Erro ao excluir origem",
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
    <div className="space-y-6 px-4 md:px-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="text-gray-500">Gerencie orçamentos e regras de categorização</p>
      </div>

      <Tabs defaultValue="budgets">
        <TabsList className="w-full flex-wrap h-auto gap-1 sm:w-auto sm:flex-nowrap overflow-x-auto">
          <TabsTrigger value="budgets" className="min-h-[44px] flex-1 sm:flex-initial">
            <Target className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Orçamentos</span>
            <span className="sm:hidden">Orçam.</span>
          </TabsTrigger>
          <TabsTrigger value="rules" className="min-h-[44px] flex-1 sm:flex-initial">
            <Tag className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Regras de Categorizacao</span>
            <span className="sm:hidden">Regras</span>
          </TabsTrigger>
          <TabsTrigger value="goals" className="min-h-[44px] flex-1 sm:flex-initial">
            <PiggyBank className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Meta de Economia</span>
            <span className="sm:hidden">Metas</span>
          </TabsTrigger>
          <TabsTrigger value="origins" className="min-h-[44px] flex-1 sm:flex-initial">
            <Wallet className="mr-2 h-4 w-4" />
            <span className="hidden sm:inline">Origens</span>
            <span className="sm:hidden">Origens</span>
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
              <form onSubmit={handleSaveBudget} className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label>Categoria</Label>
                  <Select
                    value={budgetCategoryId}
                    onValueChange={setBudgetCategoryId}
                  >
                    <SelectTrigger className="min-h-[44px]">
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
                <div className="w-full sm:w-40">
                  <Label>Limite Mensal</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={budgetAmount}
                    onChange={(e) => setBudgetAmount(e.target.value)}
                    placeholder="0,00"
                    className="min-h-[44px]"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={budgetSaving} className="w-full sm:w-auto min-h-[44px]">
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
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className="h-4 w-4 rounded-full flex-shrink-0"
                              style={{
                                backgroundColor: budget.category.color,
                              }}
                            />
                            <span className="font-medium truncate">
                              {budget.category.name}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0">
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
                              className="min-h-[44px] min-w-[44px]"
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
              <form onSubmit={handleSaveRule} className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label>Palavra-chave</Label>
                  <Input
                    value={ruleKeyword}
                    onChange={(e) => setRuleKeyword(e.target.value)}
                    placeholder="Ex: UBER, IFOOD, NETFLIX"
                    className="min-h-[44px]"
                  />
                </div>
                <div className="flex-1">
                  <Label>Categoria</Label>
                  <Select
                    value={ruleCategoryId}
                    onValueChange={setRuleCategoryId}
                  >
                    <SelectTrigger className="min-h-[44px]">
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
                  <Button type="submit" disabled={ruleSaving} className="w-full sm:w-auto min-h-[44px]">
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
                <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {rules.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between rounded-lg border p-3"
                    >
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <code className="rounded bg-gray-100 px-2 py-1 text-sm truncate">
                          {rule.keyword}
                        </code>
                        <span className="text-gray-400 flex-shrink-0">-&gt;</span>
                        <div className="flex items-center gap-1 min-w-0">
                          <div
                            className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{
                              backgroundColor: rule.category.color,
                            }}
                          />
                          <span className="text-sm truncate">{rule.category.name}</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="min-h-[44px] min-w-[44px] flex-shrink-0"
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

        <TabsContent value="goals" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PiggyBank className="h-5 w-5" />
                Meta de Economia Mensal
              </CardTitle>
              <CardDescription>
                Defina quanto voce deseja economizar por mes. O progresso sera exibido no dashboard.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSaveSavingsGoal} className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Label>Meta Mensal (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={savingsGoal}
                    onChange={(e) => setSavingsGoal(e.target.value)}
                    placeholder="Ex: 1000.00"
                    className="min-h-[44px]"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    A economia e calculada como: Receitas - Despesas
                  </p>
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={savingsGoalSaving} className="w-full sm:w-auto min-h-[44px]">
                    {savingsGoalSaving ? "Salvando..." : "Salvar Meta"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {savingsGoal && parseFloat(savingsGoal) > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Meta Atual</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-green-600">
                  {formatCurrency(parseFloat(savingsGoal))}
                </div>
                <p className="mt-1 text-sm text-gray-500">por mes</p>
              </CardContent>
            </Card>
          )}

          {/* Savings History Section (Feature 15) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Historico de Metas
              </CardTitle>
              <CardDescription>
                Acompanhe seu progresso em relacao a meta de economia ao longo dos meses
              </CardDescription>
            </CardHeader>
            <CardContent>
              {savingsHistory.length === 0 ? (
                <div className="text-center text-gray-500 py-8">
                  <History className="mx-auto h-12 w-12 text-gray-300 mb-2" />
                  <p>Nenhum historico disponivel</p>
                  <p className="text-sm mt-1">
                    Navegue para meses anteriores no dashboard para registrar o historico
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savingsHistory.map((record) => {
                    const monthNames = [
                      "Janeiro", "Fevereiro", "Marco", "Abril", "Maio", "Junho",
                      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
                    ];
                    const monthName = monthNames[record.month - 1];

                    return (
                      <div
                        key={record.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between rounded-lg border p-4 gap-3 ${
                          record.isAchieved
                            ? "border-green-200 bg-green-50"
                            : "border-red-200 bg-red-50"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {record.isAchieved ? (
                            <CheckCircle className="h-6 w-6 text-green-500 flex-shrink-0" />
                          ) : (
                            <XCircle className="h-6 w-6 text-red-500 flex-shrink-0" />
                          )}
                          <div>
                            <div className="font-medium">
                              {monthName} {record.year}
                            </div>
                            <div className="text-sm text-gray-500">
                              Meta: {formatCurrency(record.goal)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right sm:text-right text-left ml-9 sm:ml-0">
                          <div className={`text-lg font-semibold ${
                            record.actual >= 0 ? "text-green-600" : "text-red-600"
                          }`}>
                            {formatCurrency(record.actual)}
                          </div>
                          <div className={`text-sm ${
                            record.isAchieved ? "text-green-600" : "text-red-600"
                          }`}>
                            {record.percentage >= 0 ? record.percentage.toFixed(0) : 0}% da meta
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="origins" className="space-y-6">
          {/* Add Origin Form */}
          <Card>
            <CardHeader>
              <CardTitle>Adicionar Origem</CardTitle>
              <CardDescription>
                Adicione cartoes, bancos ou metodos de pagamento
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddOrigin} className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <Input
                    value={newOriginName}
                    onChange={(e) => setNewOriginName(e.target.value)}
                    placeholder="Nome da origem"
                    className="min-h-[44px]"
                  />
                </div>
                <div className="flex items-end">
                  <Button type="submit" disabled={originSaving} className="w-full sm:w-auto min-h-[44px]">
                    <Plus className="mr-2 h-4 w-4" />
                    Adicionar
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Origins List */}
          <Card>
            <CardHeader>
              <CardTitle>Suas Origens</CardTitle>
            </CardHeader>
            <CardContent>
              {origins.length === 0 ? (
                <div className="text-center text-gray-500">
                  Nenhuma origem cadastrada
                </div>
              ) : (
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                  {origins.map((origin) => (
                    <div
                      key={origin.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      {editingOrigin?.id === origin.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <Input
                            value={editOriginName}
                            onChange={(e) => setEditOriginName(e.target.value)}
                            className="min-h-[36px]"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleEditOrigin();
                              } else if (e.key === "Escape") {
                                setEditingOrigin(null);
                                setEditOriginName("");
                              }
                            }}
                          />
                          <Button
                            size="sm"
                            onClick={handleEditOrigin}
                            className="min-h-[36px]"
                          >
                            Salvar
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingOrigin(null);
                              setEditOriginName("");
                            }}
                            className="min-h-[36px]"
                          >
                            Cancelar
                          </Button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            <Wallet className="h-4 w-4 text-gray-500 flex-shrink-0" />
                            <span className="font-medium truncate">{origin.name}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-[44px] min-w-[44px]"
                              onClick={() => {
                                setEditingOrigin(origin);
                                setEditOriginName(origin.name);
                              }}
                            >
                              <Pencil className="h-4 w-4 text-gray-500" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="min-h-[44px] min-w-[44px]"
                              onClick={() => setDeletingOrigin(origin)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </>
                      )}
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
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
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
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
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

      {/* Delete Origin Confirmation */}
      <AlertDialog
        open={!!deletingOrigin}
        onOpenChange={() => setDeletingOrigin(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a origem &quot;{deletingOrigin?.name}&quot;?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteOrigin} className="bg-red-600">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
