import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testUser } from '../setup'

vi.mock('@/lib/db', () => ({
  default: {
    installment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    transaction: {
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }
}))

import { POST } from '@/app/api/installments/[id]/cancel/route'
import prisma from '@/lib/db'

const mockPrisma = prisma as unknown as {
  installment: {
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  transaction: {
    deleteMany: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

function createRequest(url: string): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), { method: 'POST' })
}

function createParams(id: string) {
  return { params: Promise.resolve({ id }) }
}

const now = new Date()
const pastDate1 = new Date(now.getFullYear(), now.getMonth() - 2, 15)
const pastDate2 = new Date(now.getFullYear(), now.getMonth() - 1, 15)
// Use dates clearly in the future (next month+) to avoid boundary issues with current day
const futureDate1 = new Date(now.getFullYear(), now.getMonth() + 1, 15)
const futureDate2 = new Date(now.getFullYear(), now.getMonth() + 2, 15)
const futureDate3 = new Date(now.getFullYear(), now.getMonth() + 3, 15)

const mockInstallment = {
  id: 'inst-1',
  description: 'IPVA',
  totalAmount: 4500,
  totalInstallments: 5,
  installmentAmount: 900,
  startDate: pastDate1,
  userId: testUser.id,
  transactions: [
    { id: 'txn-1', date: pastDate1, currentInstallment: 1, userId: testUser.id },
    { id: 'txn-2', date: pastDate2, currentInstallment: 2, userId: testUser.id },
    { id: 'txn-3', date: futureDate1, currentInstallment: 3, userId: testUser.id },
    { id: 'txn-4', date: futureDate2, currentInstallment: 4, userId: testUser.id },
    { id: 'txn-5', date: futureDate3, currentInstallment: 5, userId: testUser.id },
  ],
}

describe('POST /api/installments/[id]/cancel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should cancel future installments and keep past ones', async () => {
    mockPrisma.installment.findUnique.mockResolvedValue(mockInstallment)
    mockPrisma.$transaction.mockResolvedValue([{ count: 3 }, {}])

    const request = createRequest('http://localhost:3000/api/installments/inst-1/cancel')
    const response = await POST(request, createParams('inst-1'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.cancelledCount).toBe(3)
    expect(data.remainingCount).toBe(2)

    // Verify $transaction was called once with array of 2 operations
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1)
  })

  it('should return 404 for non-existent installment', async () => {
    mockPrisma.installment.findUnique.mockResolvedValue(null)

    const request = createRequest('http://localhost:3000/api/installments/non-existent/cancel')
    const response = await POST(request, createParams('non-existent'))
    const data = await response.json()

    expect(response.status).toBe(404)
    expect(data.error).toBe('Parcelamento não encontrado')
  })

  it('should handle installment with no future transactions', async () => {
    const allPaidInstallment = {
      ...mockInstallment,
      transactions: [
        { id: 'txn-1', date: pastDate1, currentInstallment: 1, userId: testUser.id },
        { id: 'txn-2', date: pastDate2, currentInstallment: 2, userId: testUser.id },
      ],
    }

    mockPrisma.installment.findUnique.mockResolvedValue(allPaidInstallment)

    const request = createRequest('http://localhost:3000/api/installments/inst-1/cancel')
    const response = await POST(request, createParams('inst-1'))
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.cancelledCount).toBe(0)
    expect(data.remainingCount).toBe(2)
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })
})
