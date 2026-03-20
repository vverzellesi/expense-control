import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock useSpacePermissions
const mockPermissions = {
  canViewTransactions: true,
  canEditTransactions: true,
  canViewAllTransactions: true,
  canViewInvestments: true,
  canViewBudgets: true,
  canManageSpace: false,
  canViewIncomes: true,
  isSpaceContext: false,
  role: null,
  loading: false,
}

vi.mock('@/lib/hooks/useSpacePermissions', () => ({
  useSpacePermissions: vi.fn(() => mockPermissions),
}))

// Mock chart components
vi.mock('@/components/Charts/CategoryPieChart', () => ({
  CategoryPieChart: () => <div data-testid="pie-chart">PieChart</div>,
}))
vi.mock('@/components/Charts/MonthlyBarChart', () => ({
  MonthlyBarChart: () => <div data-testid="bar-chart">BarChart</div>,
}))
vi.mock('@/components/onboarding/OnboardingModal', () => ({
  OnboardingModal: () => null,
}))
vi.mock('@/components/InvestmentDashboardCard', () => ({
  InvestmentDashboardCard: () => <div data-testid="investment-card">InvestmentDashboardCard</div>,
}))
vi.mock('@/components/FinancialHealthSection', () => ({
  FinancialHealthSection: (props: any) => (
    <div data-testid="financial-health">
      FinancialHealthSection income={props.income} expense={props.expense} fixedExpensesTotal={props.fixedExpensesTotal} installmentsTotal={props.installmentsTotal}
    </div>
  ),
}))

import { useSpacePermissions } from '@/lib/hooks/useSpacePermissions'
const mockUseSpacePermissions = useSpacePermissions as ReturnType<typeof vi.fn>

const mockSummaryData = {
  summary: { income: 5000, expense: 3000, balance: 2000 },
  comparison: {
    incomeChange: 10,
    expenseChange: -5,
    balanceChange: 20,
    previousMonth: { income: 4500, expense: 3200, balance: 1300 },
  },
  savingsGoal: null,
  categoryBreakdown: [],
  monthlyData: [],
  budgetAlerts: [],
  allBudgets: [],
  fixedExpenses: [],
  fixedExpensesTotal: 0,
  installmentsTotal: 0,
  upcomingInstallments: [],
  weeklySummary: null,
  weeklyBreakdown: null,
}

global.fetch = vi.fn()

import Dashboard from './page'

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSpacePermissions.mockReturnValue(mockPermissions)
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockSummaryData),
    })
  })

  it('shows InvestmentDashboardCard when user has canViewInvestments', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.queryByText('Carregando...')).toBeNull()
    })

    expect(screen.getByTestId('investment-card')).toBeDefined()
  })

  it('hides InvestmentDashboardCard when canViewInvestments is false', async () => {
    mockUseSpacePermissions.mockReturnValue({
      ...mockPermissions,
      canViewInvestments: false,
      isSpaceContext: true,
    })

    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.queryByText('Carregando...')).toBeNull()
    })

    expect(screen.queryByTestId('investment-card')).toBeNull()
  })

  it('renders FinancialHealthSection with summary data', async () => {
    render(<Dashboard />)

    await waitFor(() => {
      expect(screen.queryByText('Carregando...')).toBeNull()
    })

    expect(screen.getByTestId('financial-health')).toBeDefined()
    expect(screen.getByText(/income=5000/)).toBeDefined()
    expect(screen.getByText(/expense=3000/)).toBeDefined()
  })
})
