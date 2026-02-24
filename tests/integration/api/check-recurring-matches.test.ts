import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testUser } from '../setup'

// Mock prisma with inline factory (vi.mock is hoisted)
vi.mock('@/lib/db', () => ({
  default: {
    recurringExpense: {
      findMany: vi.fn(),
    },
  },
}))

// Import route handler and prisma mock after mocking
import { POST } from '@/app/api/transactions/check-recurring-matches/route'
import prisma from '@/lib/db'

// Type assertion for mocked prisma
const mockPrisma = prisma as unknown as {
  recurringExpense: {
    findMany: ReturnType<typeof vi.fn>
  }
}

// Helper to create NextRequest with JSON body
function createRequest(body: unknown): NextRequest {
  return new NextRequest(
    new URL('http://localhost:3000/api/transactions/check-recurring-matches'),
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }
  )
}

describe('POST /api/transactions/check-recurring-matches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.recurringExpense.findMany.mockResolvedValue([])
  })

  describe('matching recurring expenses', () => {
    it('should return match when transaction description matches recurring expense keywords', async () => {
      mockPrisma.recurringExpense.findMany.mockResolvedValue([
        {
          id: 'rec-spotify',
          description: 'SPOTIFY',
          defaultAmount: 19.90,
          origin: 'Extrato C6',
          isActive: true,
          transactions: [],
        },
      ])

      const request = createRequest({
        transactions: [
          { description: 'EBN *SPOTIFY ASSINATURA', amount: -19.90, date: '2026-01-15' },
        ],
        origin: 'Extrato C6',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.hasMatches).toBe(true)
      expect(data.matches).toHaveLength(1)
      expect(data.matches[0]).toEqual({
        index: 0,
        recurringExpenseId: 'rec-spotify',
        recurringDescription: 'SPOTIFY',
        recurringAmount: 19.90,
        hasExistingTransaction: false,
      })
    })

    it('should return hasExistingTransaction=true when recurring already has transaction for the same month', async () => {
      mockPrisma.recurringExpense.findMany.mockResolvedValue([
        {
          id: 'rec-spotify',
          description: 'SPOTIFY',
          defaultAmount: 19.90,
          origin: 'Extrato C6',
          isActive: true,
          transactions: [
            { id: 'existing-tx', date: new Date('2026-01-05T12:00:00') },
          ],
        },
      ])

      const request = createRequest({
        transactions: [
          { description: 'EBN *SPOTIFY', amount: -19.90, date: '2026-01-20' },
        ],
        origin: 'Extrato C6',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.hasMatches).toBe(true)
      expect(data.matches).toHaveLength(1)
      expect(data.matches[0].hasExistingTransaction).toBe(true)
    })

    it('should return hasExistingTransaction=false when recurring has NO transaction for the month', async () => {
      mockPrisma.recurringExpense.findMany.mockResolvedValue([
        {
          id: 'rec-netflix',
          description: 'NETFLIX',
          defaultAmount: 39.90,
          origin: 'Extrato C6',
          isActive: true,
          transactions: [
            { id: 'old-tx', date: new Date('2025-12-05T12:00:00') },
          ],
        },
      ])

      const request = createRequest({
        transactions: [
          { description: 'NETFLIX.COM 0800123', amount: -39.90, date: '2026-02-10' },
        ],
        origin: 'Extrato C6',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.hasMatches).toBe(true)
      expect(data.matches[0].hasExistingTransaction).toBe(false)
    })
  })

  describe('non-matching transactions', () => {
    it('should return no match for transaction with no matching recurring expense', async () => {
      mockPrisma.recurringExpense.findMany.mockResolvedValue([
        {
          id: 'rec-spotify',
          description: 'SPOTIFY',
          defaultAmount: 19.90,
          origin: 'Extrato C6',
          isActive: true,
          transactions: [],
        },
      ])

      const request = createRequest({
        transactions: [
          { description: 'PADARIA DO JOAO', amount: -25.00, date: '2026-01-15' },
        ],
        origin: 'Extrato C6',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.hasMatches).toBe(false)
      expect(data.matches).toHaveLength(0)
    })

    it('should not match when origins differ', async () => {
      mockPrisma.recurringExpense.findMany.mockResolvedValue([
        {
          id: 'rec-spotify',
          description: 'SPOTIFY',
          defaultAmount: 19.90,
          origin: 'Extrato C6',
          isActive: true,
          transactions: [],
        },
      ])

      const request = createRequest({
        transactions: [
          { description: 'EBN *SPOTIFY', amount: -19.90, date: '2026-01-15' },
        ],
        origin: 'Cartao Itau',
      })

      const response = await POST(request)
      const data = await response.json()

      expect(data.hasMatches).toBe(false)
      expect(data.matches).toHaveLength(0)
    })
  })

  describe('multiple matches handling', () => {
    it('should not match when multiple recurring expenses match (conservative)', async () => {
      mockPrisma.recurringExpense.findMany.mockResolvedValue([
        {
          id: 'rec-1',
          description: 'SPOTIFY PREMIUM',
          defaultAmount: 19.90,
          origin: 'Extrato C6',
          isActive: true,
          transactions: [],
        },
        {
          id: 'rec-2',
          description: 'SPOTIFY FAMILY',
          defaultAmount: 34.90,
          origin: 'Extrato C6',
          isActive: true,
          transactions: [],
        },
      ])

      const request = createRequest({
        transactions: [
          { description: 'EBN *SPOTIFY', amount: -19.90, date: '2026-01-15' },
        ],
        origin: 'Extrato C6',
      })

      const response = await POST(request)
      const data = await response.json()

      // Should not match because multiple recurring expenses match
      expect(data.hasMatches).toBe(false)
      expect(data.matches).toHaveLength(0)
    })
  })

  describe('validation', () => {
    it('should return 400 when transactions is not provided', async () => {
      const request = createRequest({})

      const response = await POST(request)
      expect(response.status).toBe(400)

      const data = await response.json()
      expect(data.error).toBeDefined()
    })

    it('should return 400 when transactions is not an array', async () => {
      const request = createRequest({ transactions: 'invalid' })

      const response = await POST(request)
      expect(response.status).toBe(400)
    })
  })
})
