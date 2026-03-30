"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { Wallet, TrendingDown, Percent, PiggyBank } from "lucide-react";

interface FinancialHealthSectionProps {
  income: number;
  expense: number;
  fixedExpensesTotal: number;
  installmentsTotal: number;
  onNavigate?: (path: string) => void;
}

export function getCommitmentLevel(percentage: number): "green" | "yellow" | "red" {
  if (percentage < 70) return "green";
  if (percentage <= 90) return "yellow";
  return "red";
}

export function calculateFinancialHealth(
  income: number,
  expense: number,
  fixedExpensesTotal: number,
  installmentsTotal: number,
) {
  const variableTotal = Math.max(0, expense - fixedExpensesTotal - installmentsTotal);
  const available = income - expense;
  const commitmentPercentage = income > 0 ? (expense / income) * 100 : 0;
  const level = getCommitmentLevel(commitmentPercentage);

  return {
    fixedTotal: fixedExpensesTotal,
    installmentsTotal,
    variableTotal,
    available,
    commitmentPercentage,
    level,
  };
}

const LEVEL_STYLES = {
  green: { text: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
  yellow: { text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  red: { text: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
};

export function FinancialHealthSection({
  income,
  expense,
  fixedExpensesTotal,
  installmentsTotal: installmentsTotalProp,
  onNavigate,
}: FinancialHealthSectionProps) {
  const {
    fixedTotal,
    installmentsTotal,
    variableTotal,
    available,
    commitmentPercentage,
    level,
  } = calculateFinancialHealth(income, expense, fixedExpensesTotal, installmentsTotalProp);

  const hasIncome = income > 0;
  const styles = hasIncome ? LEVEL_STYLES[level] : { text: "text-gray-600", bg: "bg-gray-50", border: "border-gray-200" };

  const rawSegments = hasIncome
    ? [
        { label: "Fixas", value: fixedTotal, color: "bg-slate-400", pct: (fixedTotal / income) * 100 },
        { label: "Parcelas", value: installmentsTotal, color: "bg-blue-400", pct: (installmentsTotal / income) * 100 },
        { label: "Variável", value: variableTotal, color: "bg-purple-400", pct: (variableTotal / income) * 100 },
        { label: "Sobra", value: Math.max(0, available), color: "bg-emerald-400", pct: (Math.max(0, available) / income) * 100 },
      ].filter((s) => s.pct > 0)
    : [];

  // Normalize segments when total exceeds 100% (expenses > income)
  const totalPct = rawSegments.reduce((sum, s) => sum + s.pct, 0);
  const segments = totalPct > 100
    ? rawSegments.map((s) => ({ ...s, pct: (s.pct / totalPct) * 100 }))
    : rawSegments;

  return (
    <div className="space-y-4">
      {/* Metric Cards */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        <Card
          className={onNavigate ? "cursor-pointer hover:ring-2 hover:ring-emerald-500/20 transition-all" : ""}
          {...(onNavigate ? {
            role: "button",
            tabIndex: 0,
            onClick: () => onNavigate("type=INCOME"),
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate("type=INCOME"); } },
          } : {})}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Renda do Mês</CardTitle>
            <Wallet className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(income)}
            </div>
          </CardContent>
        </Card>

        <Card
          className={onNavigate ? "cursor-pointer hover:ring-2 hover:ring-emerald-500/20 transition-all" : ""}
          {...(onNavigate ? {
            role: "button",
            tabIndex: 0,
            onClick: () => onNavigate("type=EXPENSE"),
            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onNavigate("type=EXPENSE"); } },
          } : {})}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Gasto</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {formatCurrency(expense)}
            </div>
          </CardContent>
        </Card>

        <Card className={`${styles.border} ${styles.bg}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Comprometimento</CardTitle>
            <Percent className={`h-4 w-4 ${styles.text}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${styles.text}`}>
              {hasIncome ? `${commitmentPercentage.toFixed(0)}%` : "\u2014"}
            </div>
          </CardContent>
        </Card>

        <Card className={available < 0 ? "border-red-200 bg-red-50" : ""}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Sobra Disponível</CardTitle>
            <PiggyBank className={`h-4 w-4 ${available >= 0 ? "text-emerald-500" : "text-red-500"}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${available >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              {formatCurrency(available)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Commitment Bar */}
      {hasIncome ? (
        <div className="space-y-2">
          <div className="flex h-6 w-full overflow-hidden rounded-full bg-gray-100">
            {segments.map((seg) => (
              <div
                key={seg.label}
                className={`${seg.color} flex items-center justify-center transition-all`}
                style={{ width: `${Math.min(seg.pct, 100)}%` }}
                title={`${seg.label}: ${formatCurrency(seg.value)}`}
              >
                {seg.pct >= 10 && (
                  <span className="text-xs font-medium text-white truncate px-1">
                    {formatCurrency(seg.value)}
                  </span>
                )}
              </div>
            ))}
          </div>
          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-xs text-gray-600">
            {[
              { label: "Fixas", color: "bg-slate-400", value: fixedTotal },
              { label: "Parcelas", color: "bg-blue-400", value: installmentsTotal },
              { label: "Variável", color: "bg-purple-400", value: variableTotal },
              { label: "Sobra", color: "bg-emerald-400", value: Math.max(0, available) },
            ]
              .filter((item) => item.value > 0)
              .map((item) => (
                <div key={item.label} className="flex items-center gap-1.5">
                  <div className={`h-3 w-3 rounded-full ${item.color}`} />
                  <span>{item.label}: {formatCurrency(item.value)}</span>
                </div>
              ))}
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
          Adicione suas receitas para ver o comprometimento da renda
        </div>
      )}
    </div>
  );
}
