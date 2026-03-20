import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  FinancialHealthSection,
  calculateFinancialHealth,
  getCommitmentLevel,
} from "./FinancialHealthSection";

describe("getCommitmentLevel", () => {
  it("returns green when below 70%", () => {
    expect(getCommitmentLevel(0)).toBe("green");
    expect(getCommitmentLevel(50)).toBe("green");
    expect(getCommitmentLevel(69.9)).toBe("green");
  });

  it("returns yellow when between 70% and 90%", () => {
    expect(getCommitmentLevel(70)).toBe("yellow");
    expect(getCommitmentLevel(80)).toBe("yellow");
    expect(getCommitmentLevel(90)).toBe("yellow");
  });

  it("returns red when above 90%", () => {
    expect(getCommitmentLevel(91)).toBe("red");
    expect(getCommitmentLevel(100)).toBe("red");
    expect(getCommitmentLevel(150)).toBe("red");
  });
});

describe("calculateFinancialHealth", () => {
  it("calculates totals correctly", () => {
    const result = calculateFinancialHealth(
      5000,
      3000,
      [{ amount: -1000 }, { amount: -500 }],
      [{ amount: -300, date: "2026-03-15" }],
      3,
      2026,
    );
    expect(result.fixedTotal).toBe(1500);
    expect(result.installmentsTotal).toBe(300);
    expect(result.variableTotal).toBe(1200);
    expect(result.available).toBe(2000);
    expect(result.commitmentPercentage).toBe(60);
    expect(result.level).toBe("green");
  });

  it("filters installments by current month", () => {
    const result = calculateFinancialHealth(
      5000,
      3000,
      [],
      [
        { amount: -300, date: "2026-03-15" },
        { amount: -200, date: "2026-04-15" },
      ],
      3,
      2026,
    );
    expect(result.installmentsTotal).toBe(300);
  });

  it("handles zero income", () => {
    const result = calculateFinancialHealth(0, 500, [{ amount: -500 }], [], 3, 2026);
    expect(result.commitmentPercentage).toBe(0);
    expect(result.available).toBe(-500);
    expect(result.level).toBe("green");
  });

  it("clamps variable to zero when fixed + installments exceed expense", () => {
    const result = calculateFinancialHealth(
      5000,
      1000,
      [{ amount: -800 }, { amount: -500 }],
      [],
      3,
      2026,
    );
    expect(result.variableTotal).toBe(0);
  });

  it("returns red level for high commitment", () => {
    const result = calculateFinancialHealth(
      5000,
      4800,
      [{ amount: -2000 }],
      [],
      3,
      2026,
    );
    expect(result.commitmentPercentage).toBe(96);
    expect(result.level).toBe("red");
  });

  it("returns yellow level for moderate commitment", () => {
    const result = calculateFinancialHealth(
      5000,
      4000,
      [{ amount: -2000 }],
      [],
      3,
      2026,
    );
    expect(result.commitmentPercentage).toBe(80);
    expect(result.level).toBe("yellow");
  });
});

const makeTransaction = (overrides: Partial<any> = {}) => ({
  id: "1",
  description: "Test",
  amount: -1000,
  date: new Date("2026-03-15"),
  type: "EXPENSE" as const,
  origin: "",
  isFixed: true,
  isInstallment: false,
  tags: null,
  categoryTagId: null,
  categoryId: null,
  installmentId: null,
  currentInstallment: null,
  totalInstallments: null,
  recurringExpenseId: null,
  deletedAt: null,
  userId: null,
  spaceId: null,
  isPrivate: false,
  createdByUserId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  category: null,
  ...overrides,
});

describe("FinancialHealthSection", () => {
  const defaultProps = {
    income: 5000,
    expense: 3000,
    fixedExpenses: [makeTransaction({ amount: -1500, description: "Aluguel" })],
    upcomingInstallments: [],
    currentMonth: 3,
    currentYear: 2026,
  };

  it("renders all four metric cards", () => {
    render(<FinancialHealthSection {...defaultProps} />);
    expect(screen.getByText("Renda do Mês")).toBeDefined();
    expect(screen.getByText("Despesas Fixas")).toBeDefined();
    expect(screen.getByText("Comprometimento")).toBeDefined();
    expect(screen.getByText("Sobra Disponível")).toBeDefined();
  });

  it("shows commitment percentage", () => {
    render(<FinancialHealthSection {...defaultProps} />);
    expect(screen.getByText("60%")).toBeDefined();
  });

  it("shows empty state when income is zero", () => {
    render(<FinancialHealthSection {...defaultProps} income={0} expense={0} />);
    expect(
      screen.getByText("Adicione suas receitas para ver o comprometimento da renda"),
    ).toBeDefined();
    expect(screen.getByText("\u2014")).toBeDefined();
  });

  it("shows red styling when expenses exceed income", () => {
    render(<FinancialHealthSection {...defaultProps} income={3000} expense={4000} />);
    expect(screen.getByText("133%")).toBeDefined();
  });

  it("renders commitment bar segments", () => {
    const { container } = render(<FinancialHealthSection {...defaultProps} />);
    const bar = container.querySelector(".rounded-full.bg-gray-100");
    expect(bar).toBeDefined();
    expect(bar?.children.length).toBeGreaterThan(0);
  });

  it("renders legend items for non-zero segments", () => {
    render(<FinancialHealthSection {...defaultProps} />);
    expect(screen.getByText(/Fixas:/)).toBeDefined();
    expect(screen.getByText(/Variável:/)).toBeDefined();
    expect(screen.getByText(/Sobra:/)).toBeDefined();
  });

  it("renders bar when expenses exceed income (overflow normalized)", () => {
    const { container } = render(
      <FinancialHealthSection {...defaultProps} income={3000} expense={5000} />,
    );
    const bar = container.querySelector(".rounded-full.bg-gray-100");
    expect(bar).toBeDefined();
    // All segments should still render (normalized to 100%)
    expect(bar?.children.length).toBeGreaterThan(0);
  });
});
