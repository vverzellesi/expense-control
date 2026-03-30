import { describe, it, expect } from "vitest";
import { analyzeDebtPattern } from "./debt-detector";

describe("analyzeDebtPattern", () => {
  it("detects critical pattern with 3+ consecutive financed months", () => {
    const payments = [
      { billMonth: 1, billYear: 2026, origin: "C6", totalBillAmount: 5000, amountPaid: 3000, amountCarried: 2000, paymentType: "FINANCED" },
      { billMonth: 2, billYear: 2026, origin: "C6", totalBillAmount: 5500, amountPaid: 3000, amountCarried: 2500, paymentType: "FINANCED" },
      { billMonth: 3, billYear: 2026, origin: "C6", totalBillAmount: 6000, amountPaid: 3000, amountCarried: 3000, paymentType: "PARTIAL" },
    ];

    const alerts = analyzeDebtPattern(payments, 3, 2026);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].consecutiveMonths).toBe(3);
    expect(alerts[0].origin).toBe("C6");
  });

  it("detects warning with 2 consecutive months", () => {
    const payments = [
      { billMonth: 2, billYear: 2026, origin: "Itau", totalBillAmount: 3000, amountPaid: 2000, amountCarried: 1000, paymentType: "PARTIAL" },
      { billMonth: 3, billYear: 2026, origin: "Itau", totalBillAmount: 3500, amountPaid: 2000, amountCarried: 1500, paymentType: "PARTIAL" },
    ];

    const alerts = analyzeDebtPattern(payments, 3, 2026);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].severity).toBe("warning");
    expect(alerts[0].consecutiveMonths).toBe(2);
  });

  it("returns no alert when streak is broken by full payment", () => {
    const payments = [
      { billMonth: 1, billYear: 2026, origin: "C6", totalBillAmount: 3000, amountPaid: 2000, amountCarried: 1000, paymentType: "PARTIAL" },
      // Month 2: paid in full (no BillPayment record)
      { billMonth: 3, billYear: 2026, origin: "C6", totalBillAmount: 3000, amountPaid: 2000, amountCarried: 1000, paymentType: "PARTIAL" },
    ];

    const alerts = analyzeDebtPattern(payments, 3, 2026);
    // Only month 3 is consecutive (month 2 has no record = full payment)
    expect(alerts).toHaveLength(0);
  });

  it("returns empty for no bill payments", () => {
    expect(analyzeDebtPattern([], 3, 2026)).toEqual([]);
  });

  it("sorts critical before warning", () => {
    const payments = [
      { billMonth: 2, billYear: 2026, origin: "A", totalBillAmount: 1000, amountPaid: 500, amountCarried: 500, paymentType: "PARTIAL" },
      { billMonth: 3, billYear: 2026, origin: "A", totalBillAmount: 1000, amountPaid: 500, amountCarried: 500, paymentType: "PARTIAL" },
      { billMonth: 1, billYear: 2026, origin: "B", totalBillAmount: 2000, amountPaid: 1000, amountCarried: 1000, paymentType: "FINANCED" },
      { billMonth: 2, billYear: 2026, origin: "B", totalBillAmount: 2000, amountPaid: 1000, amountCarried: 1000, paymentType: "FINANCED" },
      { billMonth: 3, billYear: 2026, origin: "B", totalBillAmount: 2000, amountPaid: 1000, amountCarried: 1000, paymentType: "FINANCED" },
    ];

    const alerts = analyzeDebtPattern(payments, 3, 2026);
    expect(alerts[0].severity).toBe("critical");
    expect(alerts[0].origin).toBe("B");
  });

  it("includes amount carried trend", () => {
    const payments = [
      { billMonth: 1, billYear: 2026, origin: "X", totalBillAmount: 5000, amountPaid: 3000, amountCarried: 2000, paymentType: "FINANCED" },
      { billMonth: 2, billYear: 2026, origin: "X", totalBillAmount: 5500, amountPaid: 3000, amountCarried: 2500, paymentType: "FINANCED" },
      { billMonth: 3, billYear: 2026, origin: "X", totalBillAmount: 6000, amountPaid: 3000, amountCarried: 3000, paymentType: "FINANCED" },
    ];

    const alerts = analyzeDebtPattern(payments, 3, 2026);
    expect(alerts[0].amountCarriedTrend).toEqual([2000, 2500, 3000]);
  });
});
