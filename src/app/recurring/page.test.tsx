import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

// Mock ResizeObserver for Radix UI
beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
})

// Mock useToast
vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import RecurringPage from './page'

function mockRecurringExpense(overrides: Record<string, unknown> = {}) {
  return {
    id: `re-${Math.random().toString(36).slice(2, 8)}`,
    description: 'Test Expense',
    defaultAmount: 100,
    dayOfMonth: 5,
    type: 'EXPENSE',
    origin: 'Nubank',
    categoryId: null,
    category: null,
    isActive: true,
    autoGenerate: true,
    transactions: [],
    userId: 'user-1',
    spaceId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function setupFetchMock(expenses: ReturnType<typeof mockRecurringExpense>[]) {
  mockFetch.mockImplementation((url: string) => {
    if (url === '/api/recurring') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve(expenses) })
    }
    if (url === '/api/categories') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }
    if (url === '/api/origins') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }
    if (url === '/api/recurring/suggestions') {
      return Promise.resolve({ ok: true, json: () => Promise.resolve([]) })
    }
    return Promise.resolve({ ok: true, json: () => Promise.resolve({}) })
  })
}

describe('RecurringPage - total value display', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('shows total expense value for active expenses only', async () => {
    const expenses = [
      mockRecurringExpense({ description: 'Internet', defaultAmount: 120, isActive: true }),
      mockRecurringExpense({ description: 'Netflix', defaultAmount: 30, isActive: true }),
      mockRecurringExpense({ description: 'Old Sub', defaultAmount: 50, isActive: false }),
    ]
    setupFetchMock(expenses)

    render(<RecurringPage />)

    await waitFor(() => {
      expect(screen.queryByText('Carregando...')).toBeNull()
    })

    // Total should be 120 + 30 = 150 (excluding inactive 50)
    expect(screen.getByText('R$ 150,00')).toBeInTheDocument()
  })

  it('shows income total when there are active income items', async () => {
    const expenses = [
      mockRecurringExpense({ description: 'Internet', defaultAmount: 100, type: 'EXPENSE' }),
      mockRecurringExpense({ description: 'Salary', defaultAmount: 5000, type: 'INCOME' }),
    ]
    setupFetchMock(expenses)

    render(<RecurringPage />)

    await waitFor(() => {
      expect(screen.queryByText('Carregando...')).toBeNull()
    })

    expect(screen.getByText('R$ 100,00')).toBeInTheDocument()
    expect(screen.getByText('Receita:')).toBeInTheDocument()
    expect(screen.getByText('R$ 5.000,00')).toBeInTheDocument()
  })

  it('does not show income label when no active income items exist', async () => {
    const expenses = [
      mockRecurringExpense({ description: 'Internet', defaultAmount: 100, type: 'EXPENSE' }),
      mockRecurringExpense({ description: 'Old Income', defaultAmount: 3000, type: 'INCOME', isActive: false }),
    ]
    setupFetchMock(expenses)

    render(<RecurringPage />)

    await waitFor(() => {
      expect(screen.queryByText('Carregando...')).toBeNull()
    })

    expect(screen.getByText('R$ 100,00')).toBeInTheDocument()
    expect(screen.queryByText('Receita:')).not.toBeInTheDocument()
  })

  it('does not show total when list is empty', async () => {
    setupFetchMock([])

    render(<RecurringPage />)

    await waitFor(() => {
      expect(screen.queryByText('Carregando...')).toBeNull()
    })

    expect(screen.queryByText('Total:')).not.toBeInTheDocument()
    expect(screen.getByText('Nenhuma despesa recorrente cadastrada')).toBeInTheDocument()
  })
})
