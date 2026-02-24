import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testUser } from '../setup'

// Mock prisma with inline factory (vi.mock is hoisted)
vi.mock('@/lib/db', () => ({
  default: {
    transaction: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
  },
}))

// Import route handlers and prisma mock after mocking
import { POST } from '@/app/api/transactions/check-duplicates/route'
import prisma from '@/lib/db'

// Type assertion for mocked prisma
const mockPrisma = prisma as unknown as {
  transaction: {
    findFirst: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
}

// Helper to create NextRequest with JSON body
function createRequest(body: unknown): NextRequest {
  return new NextRequest(
    new URL('http://localhost:3000/api/transactions/check-duplicates'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )
}

describe('POST /api/transactions/check-duplicates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.transaction.findFirst.mockResolvedValue(null)
    mockPrisma.transaction.findMany.mockResolvedValue([])
  })

  describe('origin-aware duplicate detection', () => {
    it('should filter duplicates by origin when origin is provided', async () => {
      // Existing transaction from C6
      mockPrisma.transaction.findFirst.mockResolvedValue(null) // No match with origin filter

      const request = createRequest({
        transactions: [
          { description: 'COMPRA XYZ', amount: -50.0, date: '2024-01-15' },
        ],
        origin: 'Cartao Itau',
      })

      const response = await POST(request)
      const data = await response.json()

      // Verify the query included origin filter
      const findFirstCall = mockPrisma.transaction.findFirst.mock.calls[0][0]
      expect(findFirstCall.where).toHaveProperty('origin', 'Cartao Itau')
    })

    it('should NOT filter by origin when origin is not provided', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null)

      const request = createRequest({
        transactions: [
          { description: 'COMPRA XYZ', amount: -50.0, date: '2024-01-15' },
        ],
      })

      const response = await POST(request)
      const data = await response.json()

      // Verify the query did NOT include origin filter
      const findFirstCall = mockPrisma.transaction.findFirst.mock.calls[0][0]
      expect(findFirstCall.where).not.toHaveProperty('origin')
    })

    it('should not flag as duplicate when same description+amount but different origin', async () => {
      // No exact duplicate found with origin filter
      mockPrisma.transaction.findFirst.mockResolvedValue(null)

      const request = createRequest({
        transactions: [
          { description: 'COMPRA XYZ', amount: -50.0, date: '2024-01-15' },
        ],
        origin: 'Cartao Itau',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.duplicates).toEqual([])
      expect(data.hasDuplicates).toBe(false)
    })
  })

  describe('recurring-based duplicate detection', () => {
    it('should detect recurring duplicate when a recurring transaction exists for same month and origin', async () => {
      // No exact duplicate
      mockPrisma.transaction.findFirst.mockResolvedValue(null)

      // Recurring transaction exists for this month
      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'existing-recurring-txn',
          description: 'EBN *SPOTIFY',
          amount: -19.90,
          date: new Date('2024-01-05'),
          origin: 'Nubank',
          recurringExpenseId: 'rec-spotify',
          recurringExpense: {
            id: 'rec-spotify',
            description: 'SPOTIFY',
          },
          deletedAt: null,
        },
      ])

      const request = createRequest({
        transactions: [
          { description: 'EBN *SPOTIFY ASSINATURA', amount: -19.90, date: '2024-01-20' },
        ],
        origin: 'Nubank',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.duplicates).toEqual([0])
      expect(data.hasDuplicates).toBe(true)
    })

    it('should NOT check recurring duplicates when origin is not provided', async () => {
      mockPrisma.transaction.findFirst.mockResolvedValue(null)

      const request = createRequest({
        transactions: [
          { description: 'EBN *SPOTIFY', amount: -19.90, date: '2024-01-20' },
        ],
      })

      const response = await POST(request)
      const data = await response.json()

      // findMany should not be called for recurring check (no origin)
      expect(mockPrisma.transaction.findMany).not.toHaveBeenCalled()
      expect(data.duplicates).toEqual([])
    })
  })
})
