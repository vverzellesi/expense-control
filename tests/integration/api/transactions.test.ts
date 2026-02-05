import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testUser } from '../setup'

// Mock prisma with inline factory (vi.mock is hoisted)
vi.mock('@/lib/db', () => ({
  default: {
    transaction: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn()
    },
    installment: {
      create: vi.fn()
    },
    category: {
      findUnique: vi.fn()
    }
  }
}))

// Import route handlers and prisma mock after mocking
import { GET, POST } from '@/app/api/transactions/route'
import prisma from '@/lib/db'

// Type assertion for mocked prisma
const mockPrisma = prisma as unknown as {
  transaction: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    count: ReturnType<typeof vi.fn>
  }
  installment: {
    create: ReturnType<typeof vi.fn>
  }
  category: {
    findUnique: ReturnType<typeof vi.fn>
  }
}

// Helper to create NextRequest with search params
function createRequest(url: string, options: RequestInit = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options)
}

describe('GET /api/transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return transactions for authenticated user', async () => {
    const mockTransactions = [
      {
        id: 'txn-1',
        description: 'Netflix',
        amount: -39.90,
        date: new Date('2024-01-15'),
        type: 'EXPENSE',
        userId: testUser.id,
        category: { id: 'cat-1', name: 'Servicos', color: '#FF0000' }
      },
      {
        id: 'txn-2',
        description: 'Salary',
        amount: 5000,
        date: new Date('2024-01-05'),
        type: 'INCOME',
        userId: testUser.id,
        category: null
      }
    ]

    mockPrisma.transaction.findMany.mockResolvedValue(mockTransactions)

    const request = createRequest('http://localhost:3000/api/transactions')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveLength(2)
    expect(data[0].description).toBe('Netflix')
    expect(data[1].description).toBe('Salary')
  })

  it('should filter by month and year', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/transactions?month=1&year=2024')
    await GET(request)

    expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: testUser.id,
          date: expect.objectContaining({
            gte: expect.any(Date),
            lte: expect.any(Date)
          })
        })
      })
    )

    // Verify the date range is for January 2024
    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    const dateFilter = call.where.date
    expect(dateFilter.gte.getMonth()).toBe(0) // January
    expect(dateFilter.gte.getFullYear()).toBe(2024)
  })

  it('should filter by custom date range', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest(
      'http://localhost:3000/api/transactions?startDate=2024-01-01&endDate=2024-01-31'
    )
    await GET(request)

    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    expect(call.where.date).toBeDefined()
  })

  it('should filter by categoryId', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/transactions?categoryId=cat-123')
    await GET(request)

    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    expect(call.where.categoryId).toBe('cat-123')
  })

  it('should filter by type (INCOME/EXPENSE)', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/transactions?type=INCOME')
    await GET(request)

    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    expect(call.where.type).toBe('INCOME')
  })

  it('should filter by origin', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/transactions?origin=Cartao%20C6')
    await GET(request)

    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    expect(call.where.origin).toBe('Cartao C6')
  })

  it('should filter fixed expenses', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/transactions?isFixed=true')
    await GET(request)

    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    expect(call.where.isFixed).toBe(true)
  })

  it('should filter installment transactions', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/transactions?isInstallment=true')
    await GET(request)

    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    expect(call.where.isInstallment).toBe(true)
  })

  it('should search by description', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/transactions?search=netflix')
    await GET(request)

    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    expect(call.where.description).toEqual({ contains: 'netflix' })
  })

  it('should filter by tag', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/transactions?tag=essencial')
    await GET(request)

    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    expect(call.where.tags).toEqual({ contains: 'essencial' })
  })

  it('should exclude soft-deleted transactions by default', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/transactions')
    await GET(request)

    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    expect(call.where.deletedAt).toBeNull()
  })

  it('should include soft-deleted transactions when requested', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/transactions?includeDeleted=true')
    await GET(request)

    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    expect(call.where.deletedAt).toBeUndefined()
  })

  it('should order by date descending', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/transactions')
    await GET(request)

    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    expect(call.orderBy).toEqual({ date: 'desc' })
  })

  it('should include category and installment relations', async () => {
    mockPrisma.transaction.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/transactions')
    await GET(request)

    const call = mockPrisma.transaction.findMany.mock.calls[0][0]
    expect(call.include).toEqual({
      category: true,
      installment: true
    })
  })

  it('should handle database errors gracefully', async () => {
    mockPrisma.transaction.findMany.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/transactions')
    const response = await GET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })
})

describe('POST /api/transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a simple transaction', async () => {
    const newTransaction = {
      id: 'txn-new',
      description: 'Grocery shopping',
      amount: -150.00,
      date: new Date('2024-01-15'),
      type: 'EXPENSE',
      userId: testUser.id,
      isFixed: false,
      isInstallment: false,
      category: { id: 'cat-mercado', name: 'Mercado', color: '#00FF00' }
    }

    mockPrisma.transaction.create.mockResolvedValue(newTransaction)

    const request = createRequest('http://localhost:3000/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        description: 'Grocery shopping',
        amount: 150.00,
        date: '2024-01-15',
        type: 'EXPENSE',
        categoryId: 'cat-mercado'
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.description).toBe('Grocery shopping')
    expect(mockPrisma.transaction.create).toHaveBeenCalled()
  })

  it('should convert expense amounts to negative', async () => {
    mockPrisma.transaction.create.mockResolvedValue({
      id: 'txn-1',
      amount: -100,
      type: 'EXPENSE'
    })

    const request = createRequest('http://localhost:3000/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        description: 'Test expense',
        amount: 100, // Positive input
        date: '2024-01-15',
        type: 'EXPENSE'
      })
    })

    await POST(request)

    const call = mockPrisma.transaction.create.mock.calls[0][0]
    expect(call.data.amount).toBe(-100) // Should be negative
  })

  it('should keep income amounts positive', async () => {
    mockPrisma.transaction.create.mockResolvedValue({
      id: 'txn-1',
      amount: 5000,
      type: 'INCOME'
    })

    const request = createRequest('http://localhost:3000/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        description: 'Salary',
        amount: 5000,
        date: '2024-01-05',
        type: 'INCOME'
      })
    })

    await POST(request)

    const call = mockPrisma.transaction.create.mock.calls[0][0]
    expect(call.data.amount).toBe(5000) // Should be positive
  })

  it('should create installment transactions', async () => {
    const mockInstallment = {
      id: 'inst-1',
      description: 'TV Purchase',
      totalAmount: 3000,
      totalInstallments: 10,
      installmentAmount: 300
    }

    const mockTransaction = {
      id: 'txn-inst-1',
      description: 'TV Purchase (1/10)',
      amount: -300,
      installmentId: 'inst-1',
      currentInstallment: 1,
      installment: mockInstallment
    }

    mockPrisma.installment.create.mockResolvedValue(mockInstallment)
    mockPrisma.transaction.create.mockResolvedValue(mockTransaction)

    const request = createRequest('http://localhost:3000/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        description: 'TV Purchase',
        amount: 300,
        date: '2024-01-15',
        type: 'EXPENSE',
        isInstallment: true,
        totalInstallments: 10
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(201)
    expect(mockPrisma.installment.create).toHaveBeenCalled()
    // Should create 10 transactions
    expect(mockPrisma.transaction.create).toHaveBeenCalledTimes(10)
  })

  it('should handle tags as array', async () => {
    mockPrisma.transaction.create.mockResolvedValue({
      id: 'txn-1',
      tags: '["essencial","mensal"]'
    })

    const request = createRequest('http://localhost:3000/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        description: 'Test',
        amount: 100,
        date: '2024-01-15',
        type: 'EXPENSE',
        tags: ['essencial', 'mensal']
      })
    })

    await POST(request)

    const call = mockPrisma.transaction.create.mock.calls[0][0]
    expect(call.data.tags).toBe('["essencial","mensal"]')
  })

  it('should set isFixed flag when provided', async () => {
    mockPrisma.transaction.create.mockResolvedValue({
      id: 'txn-1',
      isFixed: true
    })

    const request = createRequest('http://localhost:3000/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        description: 'Rent',
        amount: 2000,
        date: '2024-01-01',
        type: 'EXPENSE',
        isFixed: true
      })
    })

    await POST(request)

    const call = mockPrisma.transaction.create.mock.calls[0][0]
    expect(call.data.isFixed).toBe(true)
  })

  it('should handle database errors gracefully', async () => {
    mockPrisma.transaction.create.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/transactions', {
      method: 'POST',
      body: JSON.stringify({
        description: 'Test',
        amount: 100,
        date: '2024-01-15',
        type: 'EXPENSE'
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })
})
