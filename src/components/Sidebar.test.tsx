import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, render, screen } from '@testing-library/react'

// Mock next-auth/react
vi.mock('next-auth/react', () => ({
  useSession: vi.fn(() => ({ data: { user: { name: 'Test', email: 'test@test.com' } } })),
  signOut: vi.fn(),
}))

// Mock next/navigation
vi.mock('next/navigation', () => ({
  usePathname: vi.fn(() => '/dashboard'),
}))

// Mock next/image
vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}))

// Mock child components
vi.mock('@/components/onboarding/OnboardingModal', () => ({
  OnboardingModal: () => null,
}))
vi.mock('@/components/SpaceSwitcher', () => ({
  SpaceSwitcher: () => null,
}))
vi.mock('@/components/PendingInvites', () => ({
  PendingInvites: () => null,
}))

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

import { useSpacePermissions } from '@/lib/hooks/useSpacePermissions'
const mockUseSpacePermissions = useSpacePermissions as ReturnType<typeof vi.fn>

// Mock fetch for alerts
global.fetch = vi.fn().mockResolvedValue({
  json: () => Promise.resolve({ budgetAlerts: [] }),
})

import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseSpacePermissions.mockReturnValue(mockPermissions)
    global.fetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ alertCount: 0 }),
    })
  })

  it('shows all navigation items in personal context', () => {
    render(<Sidebar />)

    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Investimentos').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Projeção').length).toBeGreaterThan(0)
  })

  it('hides Investimentos when canViewInvestments is false', () => {
    mockUseSpacePermissions.mockReturnValue({
      ...mockPermissions,
      canViewInvestments: false,
      isSpaceContext: true,
    })

    render(<Sidebar />)

    expect(screen.queryByText('Investimentos')).toBeNull()
  })

  it('hides budget-related items when canViewBudgets is false', () => {
    mockUseSpacePermissions.mockReturnValue({
      ...mockPermissions,
      canViewBudgets: false,
      isSpaceContext: true,
    })

    render(<Sidebar />)

    // Projeção and Simulador depend on budget/income data
    expect(screen.queryByText('Projeção')).toBeNull()
    expect(screen.queryByText('Simulador')).toBeNull()
  })

  it('shows all items for ADMIN in space context', () => {
    mockUseSpacePermissions.mockReturnValue({
      ...mockPermissions,
      canViewInvestments: true,
      canViewBudgets: true,
      canManageSpace: true,
      isSpaceContext: true,
    })

    render(<Sidebar />)

    expect(screen.getAllByText('Dashboard').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Investimentos').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Projeção').length).toBeGreaterThan(0)
  })

  describe('alerts fetching', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('does not poll /api/summary on a timer (DB compute protection)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ alertCount: 0 }),
      })
      global.fetch = fetchMock as unknown as typeof fetch

      render(<Sidebar />)

      // Initial mount triggers one fetch
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

      // Advance well past the old 5-minute polling interval
      await act(async () => {
        vi.advanceTimersByTime(30 * 60 * 1000)
      })

      // Still only the initial call — no background polling
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('refetches alerts when the tab becomes visible again', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ alertCount: 0 }),
      })
      global.fetch = fetchMock as unknown as typeof fetch

      render(<Sidebar />)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

      // Simulate tab hidden then visible after debounce window
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => true,
      })
      document.dispatchEvent(new Event('visibilitychange'))

      await act(async () => {
        vi.advanceTimersByTime(60 * 1000)
      })

      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false,
      })
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })

      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    })

    it('does not refetch on visibilitychange within the 30s debounce window', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ alertCount: 0 }),
      })
      global.fetch = fetchMock as unknown as typeof fetch

      render(<Sidebar />)
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

      // Tab becomes visible immediately (well within 30s debounce)
      Object.defineProperty(document, 'hidden', {
        configurable: true,
        get: () => false,
      })
      await act(async () => {
        document.dispatchEvent(new Event('visibilitychange'))
      })

      // Debounce prevents a second fetch
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })
})
