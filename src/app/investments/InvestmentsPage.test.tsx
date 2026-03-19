import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

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

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

vi.mock('@/components/InvestmentCard', () => ({
  InvestmentCard: () => <div>InvestmentCard</div>,
}))

vi.mock('@/components/InvestmentForm', () => ({
  InvestmentForm: () => <div>InvestmentForm</div>,
}))

import { useSpacePermissions } from '@/lib/hooks/useSpacePermissions'
const mockUseSpacePermissions = useSpacePermissions as ReturnType<typeof vi.fn>

// Mock fetch
global.fetch = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve([]),
})

import InvestmentsPage from './page'

describe('InvestmentsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSpacePermissions.mockReturnValue(mockPermissions)
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([]),
    })
  })

  it('shows investments page when user has permission', () => {
    render(<InvestmentsPage />)
    expect(screen.getByText('Investimentos')).toBeDefined()
  })

  it('shows access denied when canViewInvestments is false', () => {
    mockUseSpacePermissions.mockReturnValue({
      ...mockPermissions,
      canViewInvestments: false,
      isSpaceContext: true,
    })

    render(<InvestmentsPage />)

    expect(screen.getByText('Sem acesso')).toBeDefined()
    expect(screen.queryByText('Novo Investimento')).toBeNull()
  })

  it('shows loading state while permissions are loading', () => {
    mockUseSpacePermissions.mockReturnValue({
      ...mockPermissions,
      loading: true,
    })

    render(<InvestmentsPage />)
    // Should show loading, not access denied
    expect(screen.queryByText('Sem acesso')).toBeNull()
  })
})
