"use client";

import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { SimulationResult } from "@/lib/simulation-engine";

interface ImpactSummaryCardsProps {
  result: SimulationResult | null;
  averageIncome: number;
}

export function ImpactSummaryCards({ result, averageIncome }: ImpactSummaryCardsProps) {
  const hasSimulation = result && result.monthlyInstallment > 0;

  return (
    <div className="grid gap-4 md:grid-cols-3">
      {/* Parcela mensal */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-gray-500">Parcela mensal</p>
          <p className="text-2xl font-bold text-emerald-600">
            {hasSimulation ? formatCurrency(result.monthlyInstallment) : "\u2014"}
          </p>
          <p className="text-xs text-gray-400">
            {hasSimulation ? "adicionado ao seu fluxo" : "preencha a simulacao"}
          </p>
        </CardContent>
      </Card>

      {/* Mes mais apertado */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-gray-500">Mes mais apertado</p>
          {hasSimulation && result.tightestMonth ? (
            <>
              <p className={cn(
                "text-2xl font-bold",
                result.tightestMonth.freeBalance < 0
                  ? "text-red-600"
                  : result.tightestMonth.freeBalance < averageIncome * 0.1
                    ? "text-yellow-600"
                    : "text-gray-900"
              )}>
                {result.tightestMonth.label}
              </p>
              <p className={cn(
                "text-sm",
                result.tightestMonth.freeBalance < 0 ? "text-red-500" : "text-gray-500"
              )}>
                {result.tightestMonth.freeBalance < 0 ? "Faltam " : "Sobram "}
                {formatCurrency(Math.abs(result.tightestMonth.freeBalance))}
              </p>
            </>
          ) : (
            <p className="text-2xl font-bold text-gray-300">{"\u2014"}</p>
          )}
        </CardContent>
      </Card>

      {/* Comprometimento */}
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-gray-500">Comprometimento da renda</p>
          {hasSimulation ? (
            <div className="flex items-baseline gap-2">
              <span className="text-lg text-gray-500">
                {result.commitmentBefore.toFixed(0)}%
              </span>
              <span className="text-gray-400">&rarr;</span>
              <span className={cn(
                "text-2xl font-bold",
                result.commitmentAfter > 100
                  ? "text-red-600"
                  : result.commitmentAfter > 80
                    ? "text-yellow-600"
                    : "text-emerald-600"
              )}>
                {result.commitmentAfter.toFixed(0)}%
              </span>
            </div>
          ) : (
            <p className="text-2xl font-bold text-gray-300">{"\u2014"}</p>
          )}
          <p className="text-xs text-gray-400">da renda media mensal</p>
        </CardContent>
      </Card>
    </div>
  );
}
