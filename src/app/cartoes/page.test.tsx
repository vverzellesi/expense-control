import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock ResizeObserver for Recharts
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

// Mock recharts to avoid rendering issues in test
vi.mock('recharts', () => ({
  BarChart: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  Tooltip: () => <div />,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import CartoesPage from './page'
import type { CardsSummaryResponse } from '@/lib/cards-summary'

function mockCardsSummary(overrides: Partial<CardsSummaryResponse> = {}): CardsSummaryResponse {
  return {
    cards: [
      {
        id: 'card-1',
        name: 'Nubank',
        creditLimit: 5000,
        billingCycleDay: 10,
        dueDateDay: 15,
        currentMonth: {
          total: 1200,
          installmentTotal: 500,
          newExpenseTotal: 400,
          fixedTotal: 300,
          transactionCount: 15,
          limitUsedPercent: 24,
          status: 'healthy',
        },
        projection: { installmentTotal: 300, fixedTotal: 300, estimatedTotal: 600 },
        rates: { rotativoRateMonth: 14.5, parcelamentoRate: 8.2, cetAnual: 350 },
      },
      {
        id: 'card-2',
        name: 'C6 Bank',
        creditLimit: 3000,
        billingCycleDay: 5,
        dueDateDay: 12,
        currentMonth: {
          total: 800,
          installmentTotal: 200,
          newExpenseTotal: 400,
          fixedTotal: 200,
          transactionCount: 10,
          limitUsedPercent: 26.67,
          status: 'healthy',
        },
        projection: { installmentTotal: 200, fixedTotal: 200, estimatedTotal: 400 },
        rates: { rotativoRateMonth: 12.0, parcelamentoRate: 6.5, cetAnual: 280 },
      },
    ],
    totals: {
      totalAllCards: 2000,
      projectedNextMonth: 1000,
    },
    ...overrides,
  }
}

function setupFetchMock(data: CardsSummaryResponse) {
  mockFetch.mockImplementation((url: string) => {
    if (typeof url === 'string' && url.includes('/api/cards/summary')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

describe('CartoesPage - Rates Mobile Card View', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders mobile card view for rates comparison with card data', async () => {
    const data = mockCardsSummary()
    setupFetchMock(data)

    const { container } = render(<CartoesPage />)

    await waitFor(() => {
      expect(screen.getByText('Comparativo de Taxas')).toBeInTheDocument()
    })

    // Mobile card view should exist (md:hidden)
    const mobileRatesView = container.querySelector('.md\\:hidden.space-y-3')
    expect(mobileRatesView).not.toBeNull()

    // Should show card names in the mobile view
    const mobileCards = mobileRatesView!.querySelectorAll('.rounded-lg.border.bg-white.p-4')
    expect(mobileCards.length).toBe(2)

    // Should show rate labels in mobile cards
    expect(mobileRatesView!.textContent).toContain('Rotativo:')
    expect(mobileRatesView!.textContent).toContain('Parcelamento:')
    expect(mobileRatesView!.textContent).toContain('CET Anual:')
    expect(mobileRatesView!.textContent).toContain('Melhor para:')
  })

  it('renders desktop table with hidden md:block class', async () => {
    const data = mockCardsSummary()
    setupFetchMock(data)

    const { container } = render(<CartoesPage />)

    await waitFor(() => {
      expect(screen.getByText('Comparativo de Taxas')).toBeInTheDocument()
    })

    // Desktop table container should have hidden md:block
    const desktopTable = container.querySelector('.hidden.md\\:block')
    expect(desktopTable).not.toBeNull()
    expect(desktopTable!.querySelector('table')).not.toBeNull()
  })

  it('shows rate values in mobile cards', async () => {
    const data = mockCardsSummary()
    setupFetchMock(data)

    const { container } = render(<CartoesPage />)

    await waitFor(() => {
      expect(screen.getByText('Comparativo de Taxas')).toBeInTheDocument()
    })

    const mobileRatesView = container.querySelector('.md\\:hidden.space-y-3')
    expect(mobileRatesView).not.toBeNull()

    // Check specific rate values are displayed
    expect(mobileRatesView!.textContent).toContain('14.5%')
    expect(mobileRatesView!.textContent).toContain('8.2%')
    expect(mobileRatesView!.textContent).toContain('350%')
    expect(mobileRatesView!.textContent).toContain('12%')
    expect(mobileRatesView!.textContent).toContain('6.5%')
    expect(mobileRatesView!.textContent).toContain('280%')
  })

  it('shows "Parcelar" badge for best card in mobile view', async () => {
    const data = mockCardsSummary()
    setupFetchMock(data)

    const { container } = render(<CartoesPage />)

    await waitFor(() => {
      expect(screen.getByText('Comparativo de Taxas')).toBeInTheDocument()
    })

    const mobileRatesView = container.querySelector('.md\\:hidden.space-y-3')
    expect(mobileRatesView).not.toBeNull()

    // C6 Bank has the lowest parcelamento rate (6.5% vs 8.2%), so it should show "Parcelar"
    expect(mobileRatesView!.textContent).toContain('Parcelar')
  })

  it('shows dash for null rates in mobile cards', async () => {
    const data = mockCardsSummary({
      cards: [
        {
          id: 'card-1',
          name: 'Nubank',
          creditLimit: 5000,
          billingCycleDay: 10,
          dueDateDay: 15,
          currentMonth: {
            total: 1200,
            installmentTotal: 500,
            newExpenseTotal: 400,
            fixedTotal: 300,
            transactionCount: 15,
            limitUsedPercent: 24,
            status: 'healthy',
          },
          projection: { installmentTotal: 300, fixedTotal: 300, estimatedTotal: 600 },
          rates: { rotativoRateMonth: null, parcelamentoRate: null, cetAnual: null },
        },
        {
          id: 'card-2',
          name: 'C6 Bank',
          creditLimit: 3000,
          billingCycleDay: 5,
          dueDateDay: 12,
          currentMonth: {
            total: 800,
            installmentTotal: 200,
            newExpenseTotal: 400,
            fixedTotal: 200,
            transactionCount: 10,
            limitUsedPercent: 26.67,
            status: 'healthy',
          },
          projection: { installmentTotal: 200, fixedTotal: 200, estimatedTotal: 400 },
          rates: { rotativoRateMonth: 12.0, parcelamentoRate: 6.5, cetAnual: 280 },
        },
      ],
      totals: { totalAllCards: 2000, projectedNextMonth: 1000 },
    })
    setupFetchMock(data)

    const { container } = render(<CartoesPage />)

    await waitFor(() => {
      expect(screen.getByText('Comparativo de Taxas')).toBeInTheDocument()
    })

    const mobileRatesView = container.querySelector('.md\\:hidden.space-y-3')
    expect(mobileRatesView).not.toBeNull()

    // Should show em dashes for null rates
    expect(mobileRatesView!.textContent).toContain('\u2014')
  })
})
