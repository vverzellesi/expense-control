"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Scenario } from "@/lib/simulation-engine";

interface ScenarioComparisonProps {
  scenarios: Scenario[];
  onSelectScenario: (totalInstallments: number) => void;
}

export function ScenarioComparison({ scenarios, onSelectScenario }: ScenarioComparisonProps) {
  if (scenarios.length === 0) return null;

  return (
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-3">Comparacao de cenarios</h3>
      <div className="grid gap-4 md:grid-cols-3">
        {scenarios.map((scenario) => (
          <Card
            key={scenario.id}
            className={cn(
              "cursor-pointer transition-all hover:shadow-md",
              scenario.isOriginal && "border-emerald-500 border-2",
            )}
            onClick={() => onSelectScenario(scenario.totalInstallments)}
          >
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-gray-900">{scenario.name}</h4>
                <div className="flex gap-1">
                  {scenario.hasRisk && (
                    <Badge variant="destructive" className="text-xs">
                      Risco
                    </Badge>
                  )}
                  {scenario.isRecommended && (
                    <Badge className="bg-emerald-100 text-emerald-700 text-xs">
                      Recomendado
                    </Badge>
                  )}
                </div>
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Parcela:</span>
                  <span className="font-medium">
                    {formatCurrency(scenario.monthlyAmount)}/mes
                  </span>
                </div>
                {scenario.tightestMonth && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Mes mais apertado:</span>
                    <span className={cn(
                      "font-medium",
                      scenario.tightestMonth.freeBalance < 0 ? "text-red-600" : "text-gray-900"
                    )}>
                      {scenario.tightestMonth.label}
                    </span>
                  </div>
                )}
                {scenario.tightestMonth && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Saldo no pior mes:</span>
                    <span className={cn(
                      "font-medium",
                      scenario.tightestMonth.freeBalance < 0 ? "text-red-600" : "text-gray-900"
                    )}>
                      {formatCurrency(scenario.tightestMonth.freeBalance)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Comprometimento:</span>
                  <span className={cn(
                    "font-medium",
                    scenario.avgCommitment > 100 ? "text-red-600" :
                    scenario.avgCommitment > 80 ? "text-yellow-600" : "text-gray-900"
                  )}>
                    {scenario.avgCommitment.toFixed(0)}%
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
