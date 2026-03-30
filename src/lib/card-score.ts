export type ScoreLevel = "healthy" | "warning" | "critical";

export interface CardScoreResult {
  origin: string;
  score: number; // 0-100
  level: ScoreLevel;
  factors: {
    limitUsage: { value: number; weight: number; score: number };
    installmentRatio: { value: number; weight: number; score: number };
    financedHistory: { value: number; weight: number; score: number };
    trend: { value: number; weight: number; score: number }; // -1 growing, 0 stable, 1 shrinking
  };
  recommendation: string;
}

interface CardData {
  origin: string;
  creditLimit: number | null;
  currentMonthTotal: number;
  installmentTotal: number;
  billPayments: Array<{
    billMonth: number;
    billYear: number;
    paymentType: string;
    amountCarried: number;
    totalBillAmount: number;
  }>;
  previousMonthTotal: number;
}

// Weights for each factor (must sum to 100)
const WEIGHTS = {
  limitUsage: 35,
  installmentRatio: 25,
  financedHistory: 25,
  trend: 15,
};

function scoreLimitUsage(used: number, limit: number | null): number {
  if (!limit || limit <= 0) return 70; // Unknown limit = neutral
  const pct = (used / limit) * 100;
  if (pct <= 30) return 100;
  if (pct <= 60) return 80;
  if (pct <= 80) return 50;
  if (pct <= 100) return 20;
  return 0; // Over limit
}

function scoreInstallmentRatio(
  installmentTotal: number,
  monthTotal: number
): number {
  if (monthTotal <= 0) return 100;
  const pct = (installmentTotal / monthTotal) * 100;
  if (pct <= 20) return 100;
  if (pct <= 40) return 75;
  if (pct <= 60) return 50;
  if (pct <= 80) return 25;
  return 0;
}

function scoreFinancedHistory(
  billPayments: CardData["billPayments"],
  currentMonth: number,
  currentYear: number
): number {
  // Count consecutive months with PARTIAL/FINANCED from most recent
  let consecutive = 0;
  for (let i = 0; i < 6; i++) {
    const targetDate = new Date(currentYear, currentMonth - 1 - i, 1);
    const nm = targetDate.getMonth() + 1;
    const y = targetDate.getFullYear();

    const bp = billPayments.find((p) => p.billMonth === nm && p.billYear === y);
    if (
      bp &&
      (bp.paymentType === "PARTIAL" || bp.paymentType === "FINANCED")
    ) {
      consecutive++;
    } else {
      break;
    }
  }

  if (consecutive === 0) return 100;
  if (consecutive === 1) return 70;
  if (consecutive === 2) return 40;
  return 10; // 3+ months
}

function scoreTrend(
  currentTotal: number,
  previousTotal: number
): { value: number; score: number } {
  if (previousTotal <= 0) return { value: 0, score: 70 };
  const change = ((currentTotal - previousTotal) / previousTotal) * 100;
  const value = change > 5 ? -1 : change < -5 ? 1 : 0;
  const score = value === 1 ? 100 : value === 0 ? 70 : 40;
  return { value, score };
}

function getRecommendation(
  score: number,
  factors: CardScoreResult["factors"]
): string {
  // Check critical factors BEFORE overall score
  if (factors.financedHistory.score <= 40) {
    return "Crítico \u2014 fatura parcelada/financiada recentemente. Priorize o pagamento integral.";
  }
  if (factors.limitUsage.score <= 20) {
    return "Crítico \u2014 uso do limite está muito alto. Reduza gastos neste cartão urgentemente.";
  }
  if (score >= 80)
    return "Saudável \u2014 continue pagando integral.";
  if (factors.limitUsage.score <= 50) {
    return "Atenção \u2014 uso do limite está alto. Considere reduzir gastos neste cartão.";
  }
  if (factors.installmentRatio.score <= 50) {
    return "Atenção \u2014 parcelas representam grande parte da fatura. Evite novas compras parceladas.";
  }
  return "Atenção \u2014 monitore o uso deste cartão para evitar endividamento.";
}

export function calculateCardScore(
  card: CardData,
  currentMonth: number,
  currentYear: number
): CardScoreResult {
  const limitScore = scoreLimitUsage(card.currentMonthTotal, card.creditLimit);
  const installmentScore = scoreInstallmentRatio(
    card.installmentTotal,
    card.currentMonthTotal
  );
  const financedScore = scoreFinancedHistory(
    card.billPayments,
    currentMonth,
    currentYear
  );
  const trendResult = scoreTrend(
    card.currentMonthTotal,
    card.previousMonthTotal
  );

  const score = Math.round(
    (limitScore * WEIGHTS.limitUsage +
      installmentScore * WEIGHTS.installmentRatio +
      financedScore * WEIGHTS.financedHistory +
      trendResult.score * WEIGHTS.trend) /
      100
  );

  const level: ScoreLevel =
    score >= 70 ? "healthy" : score >= 40 ? "warning" : "critical";

  const factors = {
    limitUsage: {
      value: card.creditLimit
        ? (card.currentMonthTotal / card.creditLimit) * 100
        : 0,
      weight: WEIGHTS.limitUsage,
      score: limitScore,
    },
    installmentRatio: {
      value:
        card.currentMonthTotal > 0
          ? (card.installmentTotal / card.currentMonthTotal) * 100
          : 0,
      weight: WEIGHTS.installmentRatio,
      score: installmentScore,
    },
    financedHistory: {
      value: financedScore,
      weight: WEIGHTS.financedHistory,
      score: financedScore,
    },
    trend: {
      value: trendResult.value,
      weight: WEIGHTS.trend,
      score: trendResult.score,
    },
  };

  return {
    origin: card.origin,
    score,
    level,
    factors,
    recommendation: getRecommendation(score, factors),
  };
}
