import { describe, it, expect, beforeEach, vi } from 'vitest'
import { testUser } from '../setup'

// Mock prisma with inline factory (vi.mock is hoisted)
vi.mock('@/lib/db', () => ({
  default: {
    transaction: {
      findMany: vi.fn(),
    },
    recurringExpense: {
      findMany: vi.fn(),
    },
  },
}))

// Import route handler and prisma mock after mocking
import { GET } from '@/app/api/recurring/suggestions/route'
import prisma from '@/lib/db'

// Type assertion for mocked prisma
const mockPrisma = prisma as unknown as {
  transaction: {
    findMany: ReturnType<typeof vi.fn>
  }
  recurringExpense: {
    findMany: ReturnType<typeof vi.fn>
  }
}

function makeTransaction(overrides: {
  description: string
  amount: number
  date: string
  origin?: string
  categoryId?: string | null
  category?: { name: string } | null
}) {
  return {
    id: `txn-${Math.random().toString(36).slice(2)}`,
    description: overrides.description,
    amount: overrides.amount,
    date: new Date(overrides.date),
    type: 'EXPENSE',
    isInstallment: false,
    recurringExpenseId: null,
    origin: overrides.origin || 'Nubank',
    categoryId: overrides.categoryId || 'cat-1',
    category: overrides.category || { name: 'Assinaturas' },
    userId: testUser.id,
  }
}

describe('GET /api/recurring/suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.recurringExpense.findMany.mockResolvedValue([])
  })

  it('should calculate average amount per month, not per transaction', async () => {
    // Scenario: Netflix charged twice in January (R$20 + R$30 = R$50 for that month)
    // and once each in February (R$25) and March (R$25).
    // Old (wrong) avg: (20+30+25+25)/4 = 25
    // New (correct) avg: (50+25+25)/3 = 33.33
    mockPrisma.transaction.findMany.mockResolvedValue([
      makeTransaction({ description: 'NETFLIX', amount: -20, date: '2026-01-10' }),
      makeTransaction({ description: 'NETFLIX', amount: -30, date: '2026-01-20' }),
      makeTransaction({ description: 'NETFLIX', amount: -25, date: '2026-02-10' }),
      makeTransaction({ description: 'NETFLIX', amount: -25, date: '2026-03-10' }),
    ])

    const response = await GET()
    const data = await response.json()

    expect(data).toHaveLength(1)
    expect(data[0].normalizedDescription).toBe('NETFLIX')
    // Monthly totals: Jan=50, Feb=25, Mar=25 → avg = (50+25+25)/3 ≈ 33.33
    expect(data[0].avgAmount).toBeCloseTo(33.33, 1)
  })

  it('should correctly average when each month has exactly one transaction', async () => {
    // When there's one transaction per month, per-month and per-transaction averages match
    mockPrisma.transaction.findMany.mockResolvedValue([
      makeTransaction({ description: 'SPOTIFY', amount: -19.90, date: '2026-01-15' }),
      makeTransaction({ description: 'SPOTIFY', amount: -19.90, date: '2026-02-15' }),
      makeTransaction({ description: 'SPOTIFY', amount: -21.90, date: '2026-03-15' }),
    ])

    const response = await GET()
    const data = await response.json()

    expect(data).toHaveLength(1)
    // Monthly totals: 19.90, 19.90, 21.90 → avg = 20.57
    expect(data[0].avgAmount).toBeCloseTo(20.57, 1)
  })

  it('should sum multiple transactions within the same month before averaging', async () => {
    // iFood: Jan has 3 orders, Feb has 2 orders, Mar has 1 order
    mockPrisma.transaction.findMany.mockResolvedValue([
      makeTransaction({ description: 'IFOOD', amount: -30, date: '2026-01-05' }),
      makeTransaction({ description: 'IFOOD', amount: -40, date: '2026-01-15' }),
      makeTransaction({ description: 'IFOOD', amount: -50, date: '2026-01-25' }),
      makeTransaction({ description: 'IFOOD', amount: -35, date: '2026-02-10' }),
      makeTransaction({ description: 'IFOOD', amount: -45, date: '2026-02-20' }),
      makeTransaction({ description: 'IFOOD', amount: -60, date: '2026-03-10' }),
    ])

    const response = await GET()
    const data = await response.json()

    expect(data).toHaveLength(1)
    // Monthly totals: Jan=120, Feb=80, Mar=60 → avg = (120+80+60)/3 ≈ 86.67
    expect(data[0].avgAmount).toBeCloseTo(86.67, 1)
  })

  it('should not suggest patterns with fewer than 3 occurrences', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      makeTransaction({ description: 'RARO', amount: -100, date: '2026-01-10' }),
      makeTransaction({ description: 'RARO', amount: -100, date: '2026-02-10' }),
    ])

    const response = await GET()
    const data = await response.json()

    expect(data).toHaveLength(0)
  })

  it('should not suggest patterns that appear in only one month', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([
      makeTransaction({ description: 'UBER', amount: -15, date: '2026-01-05' }),
      makeTransaction({ description: 'UBER', amount: -20, date: '2026-01-10' }),
      makeTransaction({ description: 'UBER', amount: -25, date: '2026-01-15' }),
    ])

    const response = await GET()
    const data = await response.json()

    expect(data).toHaveLength(0)
  })

  it('should exclude existing recurring expenses from suggestions', async () => {
    mockPrisma.recurringExpense.findMany.mockResolvedValue([
      { description: 'NETFLIX' },
    ])
    mockPrisma.transaction.findMany.mockResolvedValue([
      makeTransaction({ description: 'NETFLIX', amount: -20, date: '2026-01-10' }),
      makeTransaction({ description: 'NETFLIX', amount: -20, date: '2026-02-10' }),
      makeTransaction({ description: 'NETFLIX', amount: -20, date: '2026-03-10' }),
    ])

    const response = await GET()
    const data = await response.json()

    expect(data).toHaveLength(0)
  })
})
