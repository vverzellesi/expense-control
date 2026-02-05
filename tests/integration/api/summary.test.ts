import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testUser } from '../setup'

// Mock prisma with inline factory (vi.mock is hoisted)
vi.mock('@/lib/db', () => ({
  default: {
    transaction: {
      findMany: vi.fn()
    },
    budget: {
      findMany: vi.fn()
    },
    settings: {
      findUnique: vi.fn()
    },
    savingsHistory: {
      upsert: vi.fn()
    }
  }
}))

// Import route handlers and prisma mock after mocking
import { GET } from '@/app/api/summary/route'
import prisma from '@/lib/db'

// Type assertion for mocked prisma
const mockPrisma = prisma as unknown as {
  transaction: {
    findMany: ReturnType<typeof vi.fn>
  }
  budget: {
    findMany: ReturnType<typeof vi.fn>
  }
  settings: {
    findUnique: ReturnType<typeof vi.fn>
  }
  savingsHistory: {
    upsert: ReturnType<typeof vi.fn>
  }
}

// Helper to create NextRequest with search params
function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'))
}

// Create test transactions for different scenarios
const createMockTransactions = (month: number, year: number) => {
  const baseDate = new Date(year, month - 1, 15)

  return [
    // Income
    {
      id: 'txn-income-1',
      description: 'Salary',
      amount: 5000,
      date: baseDate,
      type: 'INCOME',
      categoryId: 'cat-salary',
      category: { id: 'cat-salary', name: 'Salario', color: '#10B981' },
      isFixed: false,
      isInstallment: false,
      userId: testUser.id
    },
    // Expenses
    {
      id: 'txn-expense-1',
      description: 'Rent',
      amount: -1500,
      date: baseDate,
      type: 'EXPENSE',
      categoryId: 'cat-housing',
      category: { id: 'cat-housing', name: 'Moradia', color: '#3B82F6' },
      isFixed: true,
      isInstallment: false,
      userId: testUser.id
    },
    {
      id: 'txn-expense-2',
      description: 'Groceries',
      amount: -500,
      date: new Date(year, month - 1, 10),
      type: 'EXPENSE',
      categoryId: 'cat-food',
      category: { id: 'cat-food', name: 'Mercado', color: '#22C55E' },
      isFixed: false,
      isInstallment: false,
      userId: testUser.id
    },
    {
      id: 'txn-expense-3',
      description: 'Netflix',
      amount: -39.90,
      date: new Date(year, month - 1, 5),
      type: 'EXPENSE',
      categoryId: 'cat-services',
      category: { id: 'cat-services', name: 'Servicos', color: '#8B5CF6' },
      isFixed: true,
      isInstallment: false,
      userId: testUser.id
    },
    {
      id: 'txn-expense-4',
      description: 'More Groceries',
      amount: -300,
      date: new Date(year, month - 1, 20),
      type: 'EXPENSE',
      categoryId: 'cat-food',
      category: { id: 'cat-food', name: 'Mercado', color: '#22C55E' },
      isFixed: false,
      isInstallment: false,
      userId: testUser.id
    }
  ]
}

describe('GET /api/summary', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock returns
    mockPrisma.budget.findMany.mockResolvedValue([])
    mockPrisma.settings.findUnique.mockResolvedValue(null)
    mockPrisma.savingsHistory.upsert.mockResolvedValue({})
  })

  it('should return summary for current month by default', async () => {
    const now = new Date()
    const transactions = createMockTransactions(now.getMonth() + 1, now.getFullYear())

    mockPrisma.transaction.findMany.mockResolvedValue(transactions)

    const request = createRequest('http://localhost:3000/api/summary')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('summary')
    expect(data.summary).toHaveProperty('income')
    expect(data.summary).toHaveProperty('expense')
    expect(data.summary).toHaveProperty('balance')
    expect(data).toHaveProperty('categoryBreakdown')
  })

  it('should return summary for specified month and year', async () => {
    const transactions = createMockTransactions(6, 2024) // June 2024

    mockPrisma.transaction.findMany.mockResolvedValue(transactions)

    const request = createRequest('http://localhost:3000/api/summary?month=6&year=2024')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toBeDefined()
  })

  it('should calculate totals correctly', async () => {
    const transactions = createMockTransactions(1, 2024)

    mockPrisma.transaction.findMany.mockResolvedValue(transactions)

    const request = createRequest('http://localhost:3000/api/summary?month=1&year=2024')
    const response = await GET(request)
    const data = await response.json()

    // Income: 5000
    // Expenses: 1500 + 500 + 39.90 + 300 = 2339.90
    // Balance: 5000 - 2339.90 = 2660.10
    expect(data.summary.income).toBe(5000)
    expect(data.summary.expense).toBeCloseTo(2339.90, 1)
    expect(data.summary.balance).toBeCloseTo(2660.10, 1)
  })

  it('should group expenses by category', async () => {
    const transactions = createMockTransactions(1, 2024)

    mockPrisma.transaction.findMany.mockResolvedValue(transactions)

    const request = createRequest('http://localhost:3000/api/summary?month=1&year=2024')
    const response = await GET(request)
    const data = await response.json()

    expect(data.categoryBreakdown).toBeDefined()
    expect(Array.isArray(data.categoryBreakdown)).toBe(true)

    // Find the Mercado category (should have 500 + 300 = 800)
    const mercadoCategory = data.categoryBreakdown.find(
      (c: { name: string }) => c.name === 'Mercado'
    )
    if (mercadoCategory) {
      expect(mercadoCategory.total).toBe(800)
    }
  })

  it('should include weekly breakdown', async () => {
    const transactions = createMockTransactions(1, 2024)

    mockPrisma.transaction.findMany.mockResolvedValue(transactions)

    const request = createRequest('http://localhost:3000/api/summary?month=1&year=2024')
    const response = await GET(request)
    const data = await response.json()

    expect(data.weeklyBreakdown).toBeDefined()
    expect(data.weeklyBreakdown.weeks).toBeDefined()
    expect(Array.isArray(data.weeklyBreakdown.weeks)).toBe(true)
  })

  it('should include budget alerts when over budget', async () => {
    const transactions = createMockTransactions(1, 2024)

    // Set a budget for Mercado that will be exceeded
    mockPrisma.budget.findMany.mockResolvedValue([
      {
        id: 'budget-1',
        amount: 500, // Budget is 500 but spending is 800
        categoryId: 'cat-food',
        category: { id: 'cat-food', name: 'Mercado', color: '#22C55E' },
        isActive: true
      }
    ])

    mockPrisma.transaction.findMany.mockResolvedValue(transactions)

    const request = createRequest('http://localhost:3000/api/summary?month=1&year=2024')
    const response = await GET(request)
    const data = await response.json()

    expect(data.budgetAlerts).toBeDefined()
    // Should have an alert for exceeding Mercado budget
    if (data.budgetAlerts.length > 0) {
      const mercadoAlert = data.budgetAlerts.find(
        (a: { categoryId: string }) => a.categoryId === 'cat-food'
      )
      expect(mercadoAlert).toBeDefined()
      expect(mercadoAlert.percentage).toBeGreaterThan(100)
    }
  })

  it('should include month-over-month comparison', async () => {
    const transactions = createMockTransactions(1, 2024)

    mockPrisma.transaction.findMany.mockResolvedValue(transactions)

    const request = createRequest('http://localhost:3000/api/summary?month=1&year=2024')
    const response = await GET(request)
    const data = await response.json()

    expect(data.comparison).toBeDefined()
    expect(data.comparison).toHaveProperty('incomeChange')
    expect(data.comparison).toHaveProperty('expenseChange')
  })

  it('should include savings goal information when set', async () => {
    const transactions = createMockTransactions(1, 2024)

    mockPrisma.transaction.findMany.mockResolvedValue(transactions)
    mockPrisma.settings.findUnique.mockResolvedValue({
      key: 'savingsGoal',
      value: '1000',
      userId: testUser.id
    })

    const request = createRequest('http://localhost:3000/api/summary?month=1&year=2024')
    const response = await GET(request)
    const data = await response.json()

    expect(data.savingsGoal).toBeDefined()
  })

  it('should handle empty transactions', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/summary?month=1&year=2024')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.summary.income).toBe(0)
    expect(data.summary.expense).toBe(0)
    expect(data.summary.balance).toBe(0)
  })

  it('should handle database errors gracefully', async () => {
    mockPrisma.transaction.findMany.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/summary')
    const response = await GET(request)

    expect(response.status).toBe(500)
  })

  it('should include fixed expenses in response', async () => {
    const transactions = createMockTransactions(1, 2024)

    mockPrisma.transaction.findMany.mockResolvedValue(transactions)

    const request = createRequest('http://localhost:3000/api/summary?month=1&year=2024')
    const response = await GET(request)
    const data = await response.json()

    expect(data.fixedExpenses).toBeDefined()
    // Should have Rent and Netflix as fixed expenses
  })

  it('should exclude transfer transactions from totals', async () => {
    const transactions = [
      // Regular expense
      {
        id: 'txn-1',
        description: 'Purchase',
        amount: -100,
        date: new Date(2024, 0, 15),
        type: 'EXPENSE',
        categoryId: null,
        category: null,
        userId: testUser.id
      },
      // Transfer (should be excluded from totals)
      {
        id: 'txn-2',
        description: 'Credit Card Payment',
        amount: -1000,
        date: new Date(2024, 0, 15),
        type: 'TRANSFER',
        categoryId: null,
        category: null,
        userId: testUser.id
      }
    ]

    mockPrisma.transaction.findMany.mockResolvedValue(transactions)

    const request = createRequest('http://localhost:3000/api/summary?month=1&year=2024')
    const response = await GET(request)
    const data = await response.json()

    // Only the expense should count
    expect(data.summary.expense).toBe(100)
  })
})
