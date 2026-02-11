import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testUser } from '../setup'

// Mock prisma with inline factory (vi.mock is hoisted)
vi.mock('@/lib/db', () => ({
  default: {
    transaction: {
      findMany: vi.fn()
    },
    installment: {
      findMany: vi.fn()
    },
    recurringExpense: {
      findMany: vi.fn()
    },
    investmentSnapshot: {
      findMany: vi.fn()
    },
    investment: {
      aggregate: vi.fn()
    }
  }
}))

// Import route handlers and prisma mock after mocking
import { GET as annualGET } from '@/app/api/reports/annual/route'
import { GET as calendarGET } from '@/app/api/reports/calendar/route'
import { GET as categoryTrendsGET } from '@/app/api/reports/category-trends/route'
import { GET as fixedVariableGET } from '@/app/api/reports/fixed-variable/route'
import { GET as installmentsGET } from '@/app/api/reports/installments/route'
import { GET as netWorthGET } from '@/app/api/reports/net-worth/route'
import { GET as originsGET } from '@/app/api/reports/origins/route'
import { GET as recurringGrowthGET } from '@/app/api/reports/recurring-growth/route'
import { getAuthenticatedUserId } from '@/lib/auth-utils'
import prisma from '@/lib/db'

// Type assertions for mocked prisma
const mockPrisma = prisma as unknown as {
  transaction: {
    findMany: ReturnType<typeof vi.fn>
  }
  installment: {
    findMany: ReturnType<typeof vi.fn>
  }
  recurringExpense: {
    findMany: ReturnType<typeof vi.fn>
  }
  investmentSnapshot: {
    findMany: ReturnType<typeof vi.fn>
  }
  investment: {
    aggregate: ReturnType<typeof vi.fn>
  }
}

const mockGetAuthenticatedUserId = getAuthenticatedUserId as ReturnType<typeof vi.fn>

// Helper to create NextRequest with search params
function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'))
}

// ============================================================
// /api/reports/annual
// ============================================================
describe('GET /api/reports/annual', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUserId.mockResolvedValue(testUser.id)
  })

  it('should return annual data with correct structure when authenticated', async () => {
    const mockCurrentYearTx = [
      {
        id: 'txn-1',
        amount: 5000,
        type: 'INCOME',
        date: new Date(2024, 0, 15),
        userId: testUser.id
      },
      {
        id: 'txn-2',
        amount: -1500,
        type: 'EXPENSE',
        date: new Date(2024, 0, 20),
        userId: testUser.id
      },
      {
        id: 'txn-3',
        amount: -800,
        type: 'EXPENSE',
        date: new Date(2024, 2, 10),
        userId: testUser.id
      }
    ]
    const mockPrevYearTx = [
      {
        id: 'txn-prev-1',
        amount: 4000,
        type: 'INCOME',
        date: new Date(2023, 0, 15),
        userId: testUser.id
      }
    ]

    // Promise.all calls findMany twice: current year, then previous year
    mockPrisma.transaction.findMany
      .mockResolvedValueOnce(mockCurrentYearTx)
      .mockResolvedValueOnce(mockPrevYearTx)

    const request = createRequest('http://localhost:3000/api/reports/annual?year=2024')
    const response = await annualGET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('months')
    expect(data).toHaveProperty('totals')
    expect(data.months).toHaveLength(12)
    expect(data.months[0]).toHaveProperty('month')
    expect(data.months[0]).toHaveProperty('monthLabel')
    expect(data.months[0]).toHaveProperty('income')
    expect(data.months[0]).toHaveProperty('expense')
    expect(data.months[0]).toHaveProperty('prevIncome')
    expect(data.months[0]).toHaveProperty('prevExpense')
    expect(data.months[0]).toHaveProperty('incomeChange')
    expect(data.months[0]).toHaveProperty('expenseChange')

    // January: income 5000, expense 1500
    expect(data.months[0].income).toBe(5000)
    expect(data.months[0].expense).toBe(1500)
    expect(data.months[0].prevIncome).toBe(4000)

    // Totals
    expect(data.totals.income).toBe(5000)
    expect(data.totals.expense).toBe(2300)
    expect(data.totals.prevIncome).toBe(4000)
  })

  it('should return 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockRejectedValue(new Error('Unauthorized'))

    const request = createRequest('http://localhost:3000/api/reports/annual?year=2024')
    const response = await annualGET(request)

    expect(response.status).toBe(401)
  })

  it('should return 500 on database error', async () => {
    mockPrisma.transaction.findMany.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/reports/annual?year=2024')
    const response = await annualGET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })
})

// ============================================================
// /api/reports/calendar
// ============================================================
describe('GET /api/reports/calendar', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUserId.mockResolvedValue(testUser.id)
  })

  it('should return calendar data with correct structure when authenticated', async () => {
    const mockTransactions = [
      {
        description: 'Groceries',
        amount: -150,
        date: new Date(2024, 0, 5)
      },
      {
        description: 'Coffee',
        amount: -20,
        date: new Date(2024, 0, 5)
      },
      {
        description: 'Rent',
        amount: -2000,
        date: new Date(2024, 0, 10)
      }
    ]

    mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions)

    const request = createRequest('http://localhost:3000/api/reports/calendar?month=1&year=2024')
    const response = await calendarGET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('days')
    expect(data).toHaveProperty('summary')
    expect(data).toHaveProperty('maxExpense')

    // January has 31 days
    expect(data.days).toHaveLength(31)

    // Day 5 should have 2 transactions with total 170
    const day5 = data.days.find((d: { dayOfMonth: number }) => d.dayOfMonth === 5)
    expect(day5.totalExpense).toBe(170)
    expect(day5.transactionCount).toBe(2)

    // Summary
    expect(data.summary).toHaveProperty('highestDay')
    expect(data.summary).toHaveProperty('lowestDay')
    expect(data.summary).toHaveProperty('averageDaily')
    expect(data.summary).toHaveProperty('zeroDays')

    // Highest day should be day 10 (Rent = 2000)
    expect(data.summary.highestDay.total).toBe(2000)

    // Max expense = 2000
    expect(data.maxExpense).toBe(2000)
  })

  it('should return 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockRejectedValue(new Error('Unauthorized'))

    const request = createRequest('http://localhost:3000/api/reports/calendar?month=1&year=2024')
    const response = await calendarGET(request)

    expect(response.status).toBe(401)
  })

  it('should return 500 on database error', async () => {
    mockPrisma.transaction.findMany.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/reports/calendar?month=1&year=2024')
    const response = await calendarGET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })
})

// ============================================================
// /api/reports/category-trends
// ============================================================
describe('GET /api/reports/category-trends', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUserId.mockResolvedValue(testUser.id)
  })

  it('should return category trends data with correct structure when authenticated', async () => {
    const mockTransactions = [
      {
        amount: -500,
        type: 'EXPENSE',
        date: new Date(2024, 0, 15),
        categoryId: 'cat-food',
        category: { id: 'cat-food', name: 'Alimentacao', color: '#22C55E' }
      },
      {
        amount: -300,
        type: 'EXPENSE',
        date: new Date(2024, 1, 15),
        categoryId: 'cat-food',
        category: { id: 'cat-food', name: 'Alimentacao', color: '#22C55E' }
      },
      {
        amount: -100,
        type: 'EXPENSE',
        date: new Date(2024, 0, 10),
        categoryId: 'cat-transport',
        category: { id: 'cat-transport', name: 'Transporte', color: '#3B82F6' }
      }
    ]

    mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions)

    const request = createRequest('http://localhost:3000/api/reports/category-trends?year=2024')
    const response = await categoryTrendsGET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('months')
    expect(data).toHaveProperty('categories')
    expect(data).toHaveProperty('highlights')
    expect(data.months).toHaveLength(12)

    // Should have 2 categories
    expect(data.categories).toHaveLength(2)

    // Alimentacao should be first (highest total: 800)
    expect(data.categories[0].categoryName).toBe('Alimentacao')
    expect(data.categories[0].total).toBe(800)
    expect(data.categories[0].monthlyTotals).toHaveLength(12)
    expect(data.categories[0].monthlyTotals[0]).toBe(500)
    expect(data.categories[0].monthlyTotals[1]).toBe(300)

    // Highlights
    expect(data.highlights).toHaveProperty('mostGrown')
    expect(data.highlights).toHaveProperty('mostShrunk')
  })

  it('should return 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockRejectedValue(new Error('Unauthorized'))

    const request = createRequest('http://localhost:3000/api/reports/category-trends?year=2024')
    const response = await categoryTrendsGET(request)

    expect(response.status).toBe(401)
  })

  it('should return 500 on database error', async () => {
    mockPrisma.transaction.findMany.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/reports/category-trends?year=2024')
    const response = await categoryTrendsGET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })
})

// ============================================================
// /api/reports/fixed-variable
// ============================================================
describe('GET /api/reports/fixed-variable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUserId.mockResolvedValue(testUser.id)
  })

  it('should return fixed/variable data with correct structure when authenticated', async () => {
    const mockTransactions = [
      {
        description: 'Rent',
        amount: -2000,
        date: new Date(2024, 0, 5),
        isFixed: true,
        categoryId: 'cat-housing',
        category: { name: 'Moradia' }
      },
      {
        description: 'Netflix',
        amount: -39.90,
        date: new Date(2024, 0, 10),
        isFixed: true,
        categoryId: 'cat-services',
        category: { name: 'Servicos' }
      },
      {
        description: 'Groceries',
        amount: -500,
        date: new Date(2024, 0, 15),
        isFixed: false,
        categoryId: 'cat-food',
        category: { name: 'Mercado' }
      },
      {
        description: 'Restaurant',
        amount: -150,
        date: new Date(2024, 0, 20),
        isFixed: false,
        categoryId: 'cat-food',
        category: { name: 'Mercado' }
      }
    ]

    mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions)

    const request = createRequest('http://localhost:3000/api/reports/fixed-variable?month=1&year=2024')
    const response = await fixedVariableGET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('currentMonth')
    expect(data).toHaveProperty('monthlyBreakdown')
    expect(data).toHaveProperty('fixedExpenses')
    expect(data).toHaveProperty('topVariableExpenses')

    // Current month: fixed = 2039.90, variable = 650, total = 2689.90
    expect(data.currentMonth.fixed).toBeCloseTo(2039.90, 1)
    expect(data.currentMonth.variable).toBe(650)
    expect(data.currentMonth.total).toBeCloseTo(2689.90, 1)
    expect(data.currentMonth).toHaveProperty('fixedPercentage')

    // Monthly breakdown should have 12 entries
    expect(data.monthlyBreakdown).toHaveLength(12)

    // Fixed expenses list
    expect(data.fixedExpenses.length).toBeGreaterThanOrEqual(1)
    expect(data.fixedExpenses[0]).toHaveProperty('description')
    expect(data.fixedExpenses[0]).toHaveProperty('amount')
    expect(data.fixedExpenses[0]).toHaveProperty('categoryName')

    // Top variable expenses
    expect(data.topVariableExpenses.length).toBeGreaterThanOrEqual(1)
    expect(data.topVariableExpenses[0]).toHaveProperty('description')
    expect(data.topVariableExpenses[0]).toHaveProperty('amount')
  })

  it('should return 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockRejectedValue(new Error('Unauthorized'))

    const request = createRequest('http://localhost:3000/api/reports/fixed-variable?month=1&year=2024')
    const response = await fixedVariableGET(request)

    expect(response.status).toBe(401)
  })

  it('should return 500 on database error', async () => {
    mockPrisma.transaction.findMany.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/reports/fixed-variable?month=1&year=2024')
    const response = await fixedVariableGET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })
})

// ============================================================
// /api/reports/installments
// ============================================================
describe('GET /api/reports/installments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUserId.mockResolvedValue(testUser.id)
  })

  it('should return installments data with correct structure when authenticated', async () => {
    const mockInstallments = [
      {
        id: 'inst-1',
        description: 'TV Purchase',
        installmentAmount: 300,
        totalInstallments: 10,
        startDate: new Date(2024, 0, 15),
        userId: testUser.id,
        transactions: [
          {
            id: 'txn-1',
            amount: -300,
            date: new Date(2024, 0, 15),
            deletedAt: null
          },
          {
            id: 'txn-2',
            amount: -300,
            date: new Date(2024, 1, 15),
            deletedAt: null
          },
          {
            id: 'txn-3',
            amount: -300,
            date: new Date(2024, 2, 15),
            deletedAt: null
          }
        ]
      },
      {
        id: 'inst-2',
        description: 'Phone Purchase',
        installmentAmount: 200,
        totalInstallments: 5,
        startDate: new Date(2024, 0, 10),
        userId: testUser.id,
        transactions: [
          {
            id: 'txn-4',
            amount: -200,
            date: new Date(2024, 0, 10),
            deletedAt: null
          },
          {
            id: 'txn-5',
            amount: -200,
            date: new Date(2024, 1, 10),
            deletedAt: null
          },
          {
            id: 'txn-6',
            amount: -200,
            date: new Date(2024, 2, 10),
            deletedAt: null
          },
          {
            id: 'txn-7',
            amount: -200,
            date: new Date(2024, 3, 10),
            deletedAt: null
          },
          {
            id: 'txn-8',
            amount: -200,
            date: new Date(2024, 4, 10),
            deletedAt: null
          }
        ]
      }
    ]

    mockPrisma.installment.findMany.mockResolvedValue(mockInstallments)

    const request = createRequest('http://localhost:3000/api/reports/installments?year=2024')
    const response = await installmentsGET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('summary')
    expect(data).toHaveProperty('timeline')
    expect(data).toHaveProperty('installments')

    // Summary
    expect(data.summary).toHaveProperty('activeCount')
    expect(data.summary).toHaveProperty('monthlyTotal')
    expect(data.summary).toHaveProperty('totalRemaining')

    // TV Purchase: 10 total, 3 paid, 7 remaining, active
    // Phone Purchase: 5 total, 5 paid, 0 remaining, not active
    expect(data.summary.activeCount).toBe(1) // only TV is active
    expect(data.summary.monthlyTotal).toBe(300) // only TV's monthly amount

    // Timeline should have 12 entries
    expect(data.timeline).toHaveLength(12)

    // Installment list should have 2 entries
    expect(data.installments).toHaveLength(2)
    expect(data.installments[0]).toHaveProperty('description')
    expect(data.installments[0]).toHaveProperty('installmentAmount')
    expect(data.installments[0]).toHaveProperty('totalInstallments')
    expect(data.installments[0]).toHaveProperty('paidInstallments')
    expect(data.installments[0]).toHaveProperty('remainingInstallments')
    expect(data.installments[0]).toHaveProperty('isActive')
  })

  it('should return 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockRejectedValue(new Error('Unauthorized'))

    const request = createRequest('http://localhost:3000/api/reports/installments?year=2024')
    const response = await installmentsGET(request)

    expect(response.status).toBe(401)
  })

  it('should return 500 on database error', async () => {
    mockPrisma.installment.findMany.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/reports/installments?year=2024')
    const response = await installmentsGET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })
})

// ============================================================
// /api/reports/net-worth
// ============================================================
describe('GET /api/reports/net-worth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUserId.mockResolvedValue(testUser.id)
  })

  it('should return net worth data with correct structure when authenticated', async () => {
    const mockTransactions = [
      {
        amount: 5000,
        type: 'INCOME',
        date: new Date(2024, 0, 5)
      },
      {
        amount: -2000,
        type: 'EXPENSE',
        date: new Date(2024, 0, 15)
      },
      {
        amount: 4500,
        type: 'INCOME',
        date: new Date(2024, 1, 5)
      }
    ]
    const mockSnapshots = [
      { month: 1, totalValue: 10000 },
      { month: 2, totalValue: 12000 }
    ]
    const mockAggregate = {
      _sum: { currentValue: 15000, totalInvested: 12000 }
    }

    mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions)
    mockPrisma.investmentSnapshot.findMany.mockResolvedValue(mockSnapshots)
    mockPrisma.investment.aggregate.mockResolvedValue(mockAggregate)

    const request = createRequest('http://localhost:3000/api/reports/net-worth?year=2024')
    const response = await netWorthGET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('months')
    expect(data).toHaveProperty('current')
    expect(data.months).toHaveLength(12)

    // Each month should have the right structure
    expect(data.months[0]).toHaveProperty('monthLabel')
    expect(data.months[0]).toHaveProperty('income')
    expect(data.months[0]).toHaveProperty('expense')
    expect(data.months[0]).toHaveProperty('cashDelta')
    expect(data.months[0]).toHaveProperty('cumulativeCash')
    expect(data.months[0]).toHaveProperty('investmentValue')
    expect(data.months[0]).toHaveProperty('netWorth')

    // Current summary
    expect(data.current).toHaveProperty('netWorth')
    expect(data.current).toHaveProperty('cashBalance')
    expect(data.current).toHaveProperty('investmentValue')
    expect(data.current).toHaveProperty('monthlyChange')
  })

  it('should return 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockRejectedValue(new Error('Unauthorized'))

    const request = createRequest('http://localhost:3000/api/reports/net-worth?year=2024')
    const response = await netWorthGET(request)

    expect(response.status).toBe(401)
  })

  it('should return 500 on database error', async () => {
    mockPrisma.transaction.findMany.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/reports/net-worth?year=2024')
    const response = await netWorthGET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })
})

// ============================================================
// /api/reports/origins
// ============================================================
describe('GET /api/reports/origins', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUserId.mockResolvedValue(testUser.id)
  })

  it('should return origins data with correct structure when authenticated', async () => {
    const mockTransactions = [
      {
        origin: 'Nubank',
        amount: -500
      },
      {
        origin: 'Nubank',
        amount: -300
      },
      {
        origin: 'Itau',
        amount: -200
      },
      {
        origin: null,
        amount: -100
      }
    ]

    mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions)

    const request = createRequest('http://localhost:3000/api/reports/origins?month=1&year=2024')
    const response = await originsGET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('origins')
    expect(data).toHaveProperty('totalExpense')

    // 3 origins: Nubank, Itau, "Sem origem"
    expect(data.origins).toHaveLength(3)
    expect(data.totalExpense).toBe(1100)

    // Origins should be sorted by totalExpense descending
    // Nubank: 800, Itau: 200, Sem origem: 100
    expect(data.origins[0].origin).toBe('Nubank')
    expect(data.origins[0].totalExpense).toBe(800)
    expect(data.origins[0].transactionCount).toBe(2)
    expect(data.origins[0]).toHaveProperty('averageExpense')
    expect(data.origins[0]).toHaveProperty('percentage')
    expect(data.origins[0].averageExpense).toBe(400)

    expect(data.origins[1].origin).toBe('Itau')
    expect(data.origins[1].totalExpense).toBe(200)

    expect(data.origins[2].origin).toBe('Sem origem')
    expect(data.origins[2].totalExpense).toBe(100)
  })

  it('should return 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockRejectedValue(new Error('Unauthorized'))

    const request = createRequest('http://localhost:3000/api/reports/origins?month=1&year=2024')
    const response = await originsGET(request)

    expect(response.status).toBe(401)
  })

  it('should return 500 on database error', async () => {
    mockPrisma.transaction.findMany.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/reports/origins?month=1&year=2024')
    const response = await originsGET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })
})

// ============================================================
// /api/reports/recurring-growth
// ============================================================
describe('GET /api/reports/recurring-growth', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetAuthenticatedUserId.mockResolvedValue(testUser.id)
  })

  it('should return recurring growth data with correct structure when authenticated', async () => {
    const mockRecurringExpenses = [
      {
        id: 're-1',
        description: 'Netflix',
        isActive: true,
        userId: testUser.id,
        category: { id: 'cat-1', name: 'Streaming', color: '#E50914' },
        transactions: [
          {
            id: 'txn-1',
            amount: -39.90,
            date: new Date(2024, 0, 5),
            deletedAt: null
          },
          {
            id: 'txn-2',
            amount: -44.90,
            date: new Date(2024, 5, 5),
            deletedAt: null
          }
        ]
      },
      {
        id: 're-2',
        description: 'Spotify',
        isActive: true,
        userId: testUser.id,
        category: { id: 'cat-2', name: 'Musica', color: '#1DB954' },
        transactions: [
          {
            id: 'txn-3',
            amount: -21.90,
            date: new Date(2024, 0, 10),
            deletedAt: null
          },
          {
            id: 'txn-4',
            amount: -21.90,
            date: new Date(2024, 5, 10),
            deletedAt: null
          }
        ]
      },
      {
        id: 're-3',
        description: 'Old gym',
        isActive: false,
        userId: testUser.id,
        category: null,
        transactions: []
      }
    ]

    mockPrisma.recurringExpense.findMany.mockResolvedValue(mockRecurringExpenses)

    const request = createRequest('http://localhost:3000/api/reports/recurring-growth?year=2024')
    const response = await recurringGrowthGET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveProperty('summary')
    expect(data).toHaveProperty('items')

    // Summary
    expect(data.summary).toHaveProperty('totalMonthly')
    expect(data.summary).toHaveProperty('increasedCount')
    expect(data.summary).toHaveProperty('decreasedCount')
    expect(data.summary).toHaveProperty('averageGrowthPercent')

    // totalMonthly = Netflix current (44.90) + Spotify current (21.90) = 66.80
    // Old gym is inactive, so excluded from totalMonthly
    expect(data.summary.totalMonthly).toBeCloseTo(66.80, 1)

    // Netflix: increased from 39.90 to 44.90 => increased
    // Spotify: no change (21.90 to 21.90)
    expect(data.summary.increasedCount).toBe(1)
    expect(data.summary.decreasedCount).toBe(0)

    // Items should be 3 (all recurring expenses)
    expect(data.items).toHaveLength(3)
    expect(data.items[0]).toHaveProperty('description')
    expect(data.items[0]).toHaveProperty('currentAmount')
    expect(data.items[0]).toHaveProperty('firstAmount')
    expect(data.items[0]).toHaveProperty('changeAmount')
    expect(data.items[0]).toHaveProperty('changePercent')
    expect(data.items[0]).toHaveProperty('monthlyAmounts')
    expect(data.items[0].monthlyAmounts).toHaveLength(12)
  })

  it('should return 401 when unauthenticated', async () => {
    mockGetAuthenticatedUserId.mockRejectedValue(new Error('Unauthorized'))

    const request = createRequest('http://localhost:3000/api/reports/recurring-growth?year=2024')
    const response = await recurringGrowthGET(request)

    expect(response.status).toBe(401)
  })

  it('should return 500 on database error', async () => {
    mockPrisma.recurringExpense.findMany.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/reports/recurring-growth?year=2024')
    const response = await recurringGrowthGET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })
})
