"use client";

import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { InvestmentCategoryBadge } from "@/components/InvestmentCategoryBadge";
import { formatCurrency } from "@/lib/utils";
import { TrendingUp, TrendingDown, Target } from "lucide-react";
import type { Investment } from "@/types";

interface InvestmentCardProps {
  investment: Investment;
  onUpdateValue?: (investment: Investment) => void;
  onDeposit?: (investment: Investment) => void;
  onWithdraw?: (investment: Investment) => void;
}

export function InvestmentCard({
  investment,
  onUpdateValue,
  onDeposit,
  onWithdraw,
}: InvestmentCardProps) {
  const isPositiveReturn = investment.totalReturn >= 0;

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-gray-900 truncate">
            {investment.name}
          </h3>
          <InvestmentCategoryBadge
            name={investment.category.name}
            color={investment.category.color}
          />
        </div>
        {investment.broker && (
          <p className="text-xs text-gray-500">{investment.broker}</p>
        )}
      </CardHeader>

      <CardContent className="flex-1 space-y-4">
        {/* Current Value */}
        <div>
          <p className="text-sm text-gray-500">Valor Atual</p>
          <p className="text-2xl font-bold text-gray-900">
            {formatCurrency(investment.currentValue)}
          </p>
        </div>

        {/* Return */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {isPositiveReturn ? (
              <TrendingUp className="h-4 w-4 text-green-600" />
            ) : (
              <TrendingDown className="h-4 w-4 text-red-600" />
            )}
            <span
              className={`text-sm font-medium ${
                isPositiveReturn ? "text-green-600" : "text-red-600"
              }`}
            >
              {formatCurrency(investment.totalReturn)}
            </span>
          </div>
          <span
            className={`text-sm font-semibold ${
              isPositiveReturn ? "text-green-600" : "text-red-600"
            }`}
          >
            ({isPositiveReturn ? "+" : ""}
            {investment.totalReturnPercent.toFixed(2)}%)
          </span>
        </div>

        {/* Goal Progress */}
        {investment.goalAmount != null && investment.goalProgress != null && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-1 text-gray-600">
                <Target className="h-4 w-4" />
                <span>Meta</span>
              </div>
              <span className="font-medium text-gray-900">
                {formatCurrency(investment.goalAmount)}
              </span>
            </div>
            <Progress
              value={Math.min(investment.goalProgress ?? 0, 100)}
              className="h-2 [&>div]:bg-emerald-500"
            />
            <p className="text-xs text-gray-500 text-right">
              {(investment.goalProgress ?? 0).toFixed(1)}% atingido
            </p>
          </div>
        )}

        {/* Total Invested Info */}
        <div className="flex justify-between text-xs text-gray-500 pt-2 border-t">
          <span>Total Investido: {formatCurrency(investment.totalInvested)}</span>
          {investment.totalWithdrawn > 0 && (
            <span>Retirado: {formatCurrency(investment.totalWithdrawn)}</span>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex gap-2 pt-0">
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onUpdateValue?.(investment)}
        >
          Atualizar Valor
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onDeposit?.(investment)}
        >
          Aporte
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => onWithdraw?.(investment)}
        >
          Resgate
        </Button>
      </CardFooter>
    </Card>
  );
}
