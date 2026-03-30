export type DebtSeverity = "warning" | "critical";

export interface DebtAlert {
  origin: string;
  severity: DebtSeverity;
  consecutiveMonths: number;
  installmentPercentages: number[]; // % of bill that are installments per month
  amountCarriedTrend: number[]; // amountCarried over the months
  totalCarried: number;
  recommendation: string;
}

interface BillPaymentData {
  billMonth: number;
  billYear: number;
  origin: string;
  totalBillAmount: number;
  amountPaid: number;
  amountCarried: number;
  paymentType: string; // "PARTIAL" | "FINANCED"
}

export function analyzeDebtPattern(
  billPayments: BillPaymentData[],
  currentMonth: number,
  currentYear: number,
): DebtAlert[] {
  // Group by origin
  const byOrigin = new Map<string, BillPaymentData[]>();
  for (const bp of billPayments) {
    const existing = byOrigin.get(bp.origin) || [];
    existing.push(bp);
    byOrigin.set(bp.origin, existing);
  }

  const alerts: DebtAlert[] = [];

  for (const [origin, payments] of Array.from(byOrigin.entries())) {
    // Sort by date (newest first)
    const sorted = payments.sort((a: BillPaymentData, b: BillPaymentData) => {
      const dateA = a.billYear * 12 + a.billMonth;
      const dateB = b.billYear * 12 + b.billMonth;
      return dateB - dateA;
    });

    // Count consecutive months with PARTIAL or FINANCED from most recent
    let consecutiveMonths = 0;
    const installmentPercentages: number[] = [];
    const amountCarriedTrend: number[] = [];

    // Check last 6 months backwards (usar Date para evitar bugs em boundaries de ano)
    for (let i = 0; i < 6; i++) {
      const targetDate = new Date(currentYear, currentMonth - 1 - i, 1);
      const normalizedMonth = targetDate.getMonth() + 1;
      const targetYear = targetDate.getFullYear();

      const payment = sorted.find(
        (p: BillPaymentData) => p.billMonth === normalizedMonth && p.billYear === targetYear,
      );

      if (payment && (payment.paymentType === "PARTIAL" || payment.paymentType === "FINANCED")) {
        consecutiveMonths++;
        const pct = payment.totalBillAmount > 0
          ? (payment.amountCarried / payment.totalBillAmount) * 100
          : 0;
        installmentPercentages.push(Math.round(pct));
        amountCarriedTrend.push(payment.amountCarried);
      } else {
        break; // Consecutive streak broken
      }
    }

    if (consecutiveMonths >= 2) {
      const severity: DebtSeverity = consecutiveMonths >= 3 ? "critical" : "warning";
      const totalCarried = amountCarriedTrend[0] || 0; // Most recent

      const recommendation = severity === "critical"
        ? "Para quebrar o ciclo, pague a fatura integral por 2 meses consecutivos."
        : "Atenção: fatura parcelada por 2 meses seguidos. Tente pagar integral no próximo mês.";

      alerts.push({
        origin,
        severity,
        consecutiveMonths,
        installmentPercentages: installmentPercentages.reverse(),
        amountCarriedTrend: amountCarriedTrend.reverse(),
        totalCarried,
        recommendation,
      });
    }
  }

  return alerts.sort((a, b) => {
    if (a.severity === "critical" && b.severity !== "critical") return -1;
    if (b.severity === "critical" && a.severity !== "critical") return 1;
    return b.consecutiveMonths - a.consecutiveMonths;
  });
}
