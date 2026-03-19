import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  default: {
    transaction: {
      findMany: vi.fn(),
    },
  },
}))

vi.mock('@/lib/auth-utils', () => ({
  getAuthContext: vi.fn().mockResolvedValue({
    userId: 'test-user-id',
    spaceId: null,
    permissions: null,
    ownerFilter: { userId: 'test-user-id' },
  }),
  unauthorizedResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  ),
  forbiddenResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  ),
}))

import prisma from '@/lib/db'
import { GET } from '@/app/api/transactions/unusual/route'

const mockPrisma = prisma as unknown as {
  transaction: { findMany: ReturnType<typeof vi.fn> }
}

function createRequest(url: string) {
  return new NextRequest(new URL(url, 'http://localhost:3000'))
}

function makeTransaction(overrides: Record<string, unknown>) {
  return {
    id: 'tx-1',
    description: 'Test',
    amount: -100,
    date: new Date('2026-03-15'),
    type: 'EXPENSE',
    categoryId: 'cat-1',
    category: { id: 'cat-1', name: 'Alimentação', color: '#FF0000' },
    deletedAt: null,
    investmentTransaction: null,
    ...overrides,
  }
}

describe('GET /api/transactions/unusual', () => {
  beforeEach(() => vi.clearAllMocks())

  it('calculates average by month count, not transaction count', async () => {
    // Historical: 6 transactions across 3 months, total R$ 600
    // Per-transaction avg: 600/6 = R$ 100 (WRONG - old behavior)
    // Per-month avg: 600/3 = R$ 200 (CORRECT - new behavior)
    const historicalTransactions = [
      makeTransaction({ id: 'h1', amount: -80, date: new Date('2025-10-05') }),
      makeTransaction({ id: 'h2', amount: -120, date: new Date('2025-10-20') }),
      makeTransaction({ id: 'h3', amount: -90, date: new Date('2025-11-10') }),
      makeTransaction({ id: 'h4', amount: -110, date: new Date('2025-11-25') }),
      makeTransaction({ id: 'h5', amount: -100, date: new Date('2025-12-05') }),
      makeTransaction({ id: 'h6', amount: -100, date: new Date('2025-12-20') }),
    ]

    // Current month: single transaction of R$ 250
    // With per-transaction avg (R$ 100): 250 > 2*100=200 → flagged as unusual (BUG)
    // With per-month avg (R$ 200): 250 < 2*200=400 → NOT unusual (CORRECT)
    const currentMonthTransactions = [
      makeTransaction({ id: 'c1', amount: -250, date: new Date('2026-01-15') }),
    ]

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce(currentMonthTransactions) // current month query
      .mockResolvedValueOnce(historicalTransactions) // historical query

    const res = await GET(createRequest('/api/transactions/unusual?month=1&year=2026&threshold=2'))
    const data = await res.json()

    expect(res.status).toBe(200)
    // R$ 250 should NOT be flagged because monthly average is R$ 200 and 250 < 2*200
    expect(data.transactions).toHaveLength(0)
  })

  it('flags transaction when it exceeds threshold times monthly average', async () => {
    // Historical: 4 transactions across 2 months, total R$ 400
    // Monthly average: 400/2 = R$ 200
    const historicalTransactions = [
      makeTransaction({ id: 'h1', amount: -150, date: new Date('2025-11-05') }),
      makeTransaction({ id: 'h2', amount: -50, date: new Date('2025-11-20') }),
      makeTransaction({ id: 'h3', amount: -100, date: new Date('2025-12-10') }),
      makeTransaction({ id: 'h4', amount: -100, date: new Date('2025-12-25') }),
    ]

    // Current month: R$ 500 transaction > 2 * R$ 200 = R$ 400 → unusual
    const currentMonthTransactions = [
      makeTransaction({ id: 'c1', amount: -500, date: new Date('2026-01-10') }),
    ]

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce(currentMonthTransactions)
      .mockResolvedValueOnce(historicalTransactions)

    const res = await GET(createRequest('/api/transactions/unusual?month=1&year=2026&threshold=2'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.transactions).toHaveLength(1)
    expect(data.transactions[0].id).toBe('c1')
    expect(data.transactions[0].amount).toBe(500)
    expect(data.transactions[0].categoryAverage).toBe(200)
    expect(data.transactions[0].exceedsBy).toBe(150) // (500-200)/200 * 100
  })

  it('requires at least 2 months of history for a category', async () => {
    // Historical: only 1 month of data
    const historicalTransactions = [
      makeTransaction({ id: 'h1', amount: -50, date: new Date('2025-12-10') }),
      makeTransaction({ id: 'h2', amount: -50, date: new Date('2025-12-20') }),
    ]

    const currentMonthTransactions = [
      makeTransaction({ id: 'c1', amount: -1000, date: new Date('2026-01-10') }),
    ]

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce(currentMonthTransactions)
      .mockResolvedValueOnce(historicalTransactions)

    const res = await GET(createRequest('/api/transactions/unusual?month=1&year=2026'))
    const data = await res.json()

    expect(res.status).toBe(200)
    // Should not flag because only 1 month of history
    expect(data.transactions).toHaveLength(0)
  })

  it('skips transactions without a category', async () => {
    const historicalTransactions = [
      makeTransaction({ id: 'h1', amount: -100, date: new Date('2025-11-10') }),
      makeTransaction({ id: 'h2', amount: -100, date: new Date('2025-12-10') }),
    ]

    const currentMonthTransactions = [
      makeTransaction({ id: 'c1', amount: -1000, date: new Date('2026-01-10'), categoryId: null, category: null }),
    ]

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce(currentMonthTransactions)
      .mockResolvedValueOnce(historicalTransactions)

    const res = await GET(createRequest('/api/transactions/unusual?month=1&year=2026'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.transactions).toHaveLength(0)
  })

  it('returns transactions sorted by exceedsBy percentage descending', async () => {
    const historicalTransactions = [
      // Category 1: 2 months, total R$ 200 → avg R$ 100/month
      makeTransaction({ id: 'h1', amount: -100, date: new Date('2025-11-10'), categoryId: 'cat-1' }),
      makeTransaction({ id: 'h2', amount: -100, date: new Date('2025-12-10'), categoryId: 'cat-1' }),
      // Category 2: 2 months, total R$ 100 → avg R$ 50/month
      makeTransaction({ id: 'h3', amount: -50, date: new Date('2025-11-10'), categoryId: 'cat-2', category: { id: 'cat-2', name: 'Transporte', color: '#00FF00' } }),
      makeTransaction({ id: 'h4', amount: -50, date: new Date('2025-12-10'), categoryId: 'cat-2', category: { id: 'cat-2', name: 'Transporte', color: '#00FF00' } }),
    ]

    const currentMonthTransactions = [
      // Cat-1: R$ 300 vs avg R$ 100 → 200% exceeds
      makeTransaction({ id: 'c1', amount: -300, date: new Date('2026-01-10'), categoryId: 'cat-1' }),
      // Cat-2: R$ 200 vs avg R$ 50 → 300% exceeds
      makeTransaction({ id: 'c2', amount: -200, date: new Date('2026-01-10'), categoryId: 'cat-2', category: { id: 'cat-2', name: 'Transporte', color: '#00FF00' } }),
    ]

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce(currentMonthTransactions)
      .mockResolvedValueOnce(historicalTransactions)

    const res = await GET(createRequest('/api/transactions/unusual?month=1&year=2026&threshold=2'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.transactions).toHaveLength(2)
    // Cat-2 (300% exceeds) should come before Cat-1 (200% exceeds)
    expect(data.transactions[0].id).toBe('c2')
    expect(data.transactions[1].id).toBe('c1')
  })

  it('returns empty when no transactions exist', async () => {
    mockPrisma.transaction.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const res = await GET(createRequest('/api/transactions/unusual?month=1&year=2026'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.transactions).toHaveLength(0)
  })

  it('uses default threshold of 2 when not specified', async () => {
    // Monthly avg: R$ 100. Transaction: R$ 180 (< 2*100=200, not unusual)
    const historicalTransactions = [
      makeTransaction({ id: 'h1', amount: -100, date: new Date('2025-11-10') }),
      makeTransaction({ id: 'h2', amount: -100, date: new Date('2025-12-10') }),
    ]

    const currentMonthTransactions = [
      makeTransaction({ id: 'c1', amount: -180, date: new Date('2026-01-10') }),
    ]

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce(currentMonthTransactions)
      .mockResolvedValueOnce(historicalTransactions)

    const res = await GET(createRequest('/api/transactions/unusual?month=1&year=2026'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.transactions).toHaveLength(0)
  })

  it('respects custom threshold parameter', async () => {
    // Monthly avg: R$ 100. Transaction: R$ 180 (> 1.5*100=150, unusual with threshold=1.5)
    const historicalTransactions = [
      makeTransaction({ id: 'h1', amount: -100, date: new Date('2025-11-10') }),
      makeTransaction({ id: 'h2', amount: -100, date: new Date('2025-12-10') }),
    ]

    const currentMonthTransactions = [
      makeTransaction({ id: 'c1', amount: -180, date: new Date('2026-01-10') }),
    ]

    mockPrisma.transaction.findMany
      .mockResolvedValueOnce(currentMonthTransactions)
      .mockResolvedValueOnce(historicalTransactions)

    const res = await GET(createRequest('/api/transactions/unusual?month=1&year=2026&threshold=1.5'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data.transactions).toHaveLength(1)
    expect(data.transactions[0].amount).toBe(180)
    expect(data.transactions[0].categoryAverage).toBe(100)
  })
})
