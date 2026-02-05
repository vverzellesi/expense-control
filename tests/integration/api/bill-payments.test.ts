import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testUser } from '../setup'

// Mock prisma with inline factory (vi.mock is hoisted)
vi.mock('@/lib/db', () => ({
  default: {
    billPayment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn()
    },
    installment: {
      create: vi.fn(),
      delete: vi.fn()
    },
    transaction: {
      update: vi.fn()
    },
    $transaction: vi.fn((fn: (prisma: unknown) => Promise<unknown>) => fn({
      billPayment: {
        delete: vi.fn()
      },
      installment: {
        delete: vi.fn()
      },
      transaction: {
        update: vi.fn()
      }
    }))
  }
}))

// Import route handlers and prisma mock after mocking
import { GET, POST } from '@/app/api/bill-payments/route'
import {
  GET as GET_BY_ID,
  PUT,
  DELETE
} from '@/app/api/bill-payments/[id]/route'
import prisma from '@/lib/db'

// Type assertion for mocked prisma
const mockPrisma = prisma as unknown as {
  billPayment: {
    findMany: ReturnType<typeof vi.fn>
    findFirst: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  installment: {
    create: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  transaction: {
    update: ReturnType<typeof vi.fn>
  }
  $transaction: ReturnType<typeof vi.fn>
}

// Helper to create NextRequest with search params
function createRequest(url: string, options: RequestInit = {}): NextRequest {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options)
}

// Mock bill payment data
const createMockBillPayment = (overrides = {}) => ({
  id: 'bp-1',
  billMonth: 1,
  billYear: 2024,
  origin: 'Nubank',
  totalBillAmount: 5000,
  amountPaid: 3000,
  amountCarried: 2000,
  paymentType: 'PARTIAL',
  interestRate: null,
  interestAmount: null,
  installmentId: null,
  installment: null,
  entryTransactionId: null,
  carryoverTransactionId: null,
  linkedTransactionId: null,
  userId: testUser.id,
  createdAt: new Date('2024-01-15'),
  updatedAt: new Date('2024-01-15'),
  ...overrides
})

describe('GET /api/bill-payments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return all bill payments for authenticated user', async () => {
    const mockPayments = [
      createMockBillPayment({ id: 'bp-1', billMonth: 1 }),
      createMockBillPayment({ id: 'bp-2', billMonth: 2 })
    ]

    mockPrisma.billPayment.findMany.mockResolvedValue(mockPayments)

    const request = createRequest('http://localhost:3000/api/bill-payments')
    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveLength(2)
    expect(data[0].id).toBe('bp-1')
    expect(data[1].id).toBe('bp-2')
  })

  it('should filter by month', async () => {
    mockPrisma.billPayment.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/bill-payments?month=6')
    await GET(request)

    expect(mockPrisma.billPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: testUser.id,
          billMonth: 6
        })
      })
    )
  })

  it('should filter by year', async () => {
    mockPrisma.billPayment.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/bill-payments?year=2024')
    await GET(request)

    expect(mockPrisma.billPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: testUser.id,
          billYear: 2024
        })
      })
    )
  })

  it('should filter by origin', async () => {
    mockPrisma.billPayment.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/bill-payments?origin=Nubank')
    await GET(request)

    expect(mockPrisma.billPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: testUser.id,
          origin: 'Nubank'
        })
      })
    )
  })

  it('should filter by multiple parameters', async () => {
    mockPrisma.billPayment.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/bill-payments?month=1&year=2024&origin=Nubank')
    await GET(request)

    expect(mockPrisma.billPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: testUser.id,
          billMonth: 1,
          billYear: 2024,
          origin: 'Nubank'
        }
      })
    )
  })

  it('should include installment relation', async () => {
    mockPrisma.billPayment.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/bill-payments')
    await GET(request)

    expect(mockPrisma.billPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: { installment: true }
      })
    )
  })

  it('should order by year and month descending', async () => {
    mockPrisma.billPayment.findMany.mockResolvedValue([])

    const request = createRequest('http://localhost:3000/api/bill-payments')
    await GET(request)

    expect(mockPrisma.billPayment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [
          { billYear: 'desc' },
          { billMonth: 'desc' }
        ]
      })
    )
  })

  it('should handle database errors gracefully', async () => {
    mockPrisma.billPayment.findMany.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/bill-payments')
    const response = await GET(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('Erro ao buscar pagamentos de fatura')
  })
})

describe('POST /api/bill-payments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should create a PARTIAL payment', async () => {
    const newPayment = createMockBillPayment()

    mockPrisma.billPayment.findFirst.mockResolvedValue(null) // No duplicate
    mockPrisma.billPayment.create.mockResolvedValue(newPayment)

    const request = createRequest('http://localhost:3000/api/bill-payments', {
      method: 'POST',
      body: JSON.stringify({
        billMonth: 1,
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 5000,
        paymentType: 'PARTIAL',
        amountPaid: 3000
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.paymentType).toBe('PARTIAL')
    expect(mockPrisma.billPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          billMonth: 1,
          billYear: 2024,
          origin: 'Nubank',
          totalBillAmount: 5000,
          amountPaid: 3000,
          amountCarried: 2000, // 5000 - 3000
          paymentType: 'PARTIAL',
          userId: testUser.id
        })
      })
    )
  })

  it('should create a FINANCED payment with installments', async () => {
    const financedPayment = createMockBillPayment({
      paymentType: 'FINANCED',
      interestRate: 5,
      interestAmount: 100
    })

    mockPrisma.billPayment.findFirst.mockResolvedValue(null)
    mockPrisma.billPayment.create.mockResolvedValue(financedPayment)

    const request = createRequest('http://localhost:3000/api/bill-payments', {
      method: 'POST',
      body: JSON.stringify({
        billMonth: 1,
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 5000,
        paymentType: 'FINANCED',
        amountPaid: 3000,
        installments: 6,
        interestRate: 5
      })
    })

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(201)
    expect(data.paymentType).toBe('FINANCED')
  })

  it('should calculate interest amount when rate is provided', async () => {
    const paymentWithInterest = createMockBillPayment({
      interestRate: 10,
      interestAmount: 200 // 2000 * 10%
    })

    mockPrisma.billPayment.findFirst.mockResolvedValue(null)
    mockPrisma.billPayment.create.mockResolvedValue(paymentWithInterest)

    const request = createRequest('http://localhost:3000/api/bill-payments', {
      method: 'POST',
      body: JSON.stringify({
        billMonth: 1,
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 5000,
        paymentType: 'PARTIAL',
        amountPaid: 3000,
        interestRate: 10
      })
    })

    await POST(request)

    expect(mockPrisma.billPayment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          interestRate: 10,
          interestAmount: 200 // amountCarried (2000) * interestRate (10) / 100
        })
      })
    )
  })

  it('should return 400 when required fields are missing', async () => {
    const request = createRequest('http://localhost:3000/api/bill-payments', {
      method: 'POST',
      body: JSON.stringify({
        billMonth: 1
        // Missing: billYear, origin, totalBillAmount, paymentType, amountPaid
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toContain('Campos obrigatorios')
  })

  it('should return 400 when billMonth is invalid (out of range)', async () => {
    const request = createRequest('http://localhost:3000/api/bill-payments', {
      method: 'POST',
      body: JSON.stringify({
        billMonth: 13, // Invalid
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 5000,
        paymentType: 'PARTIAL',
        amountPaid: 3000
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('billMonth deve estar entre 1 e 12')
  })

  it('should return 400 when paymentType is invalid', async () => {
    const request = createRequest('http://localhost:3000/api/bill-payments', {
      method: 'POST',
      body: JSON.stringify({
        billMonth: 1,
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 5000,
        paymentType: 'INVALID_TYPE',
        amountPaid: 3000
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe("paymentType deve ser 'PARTIAL' ou 'FINANCED'")
  })

  it('should return 400 when amountPaid is greater than or equal to totalBillAmount', async () => {
    const request = createRequest('http://localhost:3000/api/bill-payments', {
      method: 'POST',
      body: JSON.stringify({
        billMonth: 1,
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 5000,
        paymentType: 'PARTIAL',
        amountPaid: 5000 // Equal to total
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('amountPaid deve ser menor que totalBillAmount para pagamento parcial')
  })

  it('should return 400 when FINANCED type has less than 2 installments', async () => {
    const request = createRequest('http://localhost:3000/api/bill-payments', {
      method: 'POST',
      body: JSON.stringify({
        billMonth: 1,
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 5000,
        paymentType: 'FINANCED',
        amountPaid: 3000,
        installments: 1 // Must be at least 2
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Para parcelamento, o numero de parcelas deve ser pelo menos 2')
  })

  it('should return 409 when duplicate payment exists', async () => {
    const existingPayment = createMockBillPayment()
    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)

    const request = createRequest('http://localhost:3000/api/bill-payments', {
      method: 'POST',
      body: JSON.stringify({
        billMonth: 1,
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 5000,
        paymentType: 'PARTIAL',
        amountPaid: 3000
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(409)
    const data = await response.json()
    expect(data.error).toContain('Ja existe um pagamento registrado')
  })

  it('should handle database errors gracefully', async () => {
    mockPrisma.billPayment.findFirst.mockResolvedValue(null)
    mockPrisma.billPayment.create.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/bill-payments', {
      method: 'POST',
      body: JSON.stringify({
        billMonth: 1,
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 5000,
        paymentType: 'PARTIAL',
        amountPaid: 3000
      })
    })

    const response = await POST(request)

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('Erro ao criar pagamento de fatura')
  })
})

describe('GET /api/bill-payments/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should return a single bill payment', async () => {
    const mockPayment = createMockBillPayment()
    mockPrisma.billPayment.findFirst.mockResolvedValue(mockPayment)

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1')
    const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'bp-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.id).toBe('bp-1')
    expect(data.origin).toBe('Nubank')
  })

  it('should include installment relation', async () => {
    const mockPayment = createMockBillPayment({
      installment: {
        id: 'inst-1',
        description: 'Parcelamento fatura',
        totalInstallments: 6
      }
    })
    mockPrisma.billPayment.findFirst.mockResolvedValue(mockPayment)

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1')
    await GET_BY_ID(request, { params: Promise.resolve({ id: 'bp-1' }) })

    expect(mockPrisma.billPayment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bp-1', userId: testUser.id },
        include: { installment: true }
      })
    )
  })

  it('should return 404 when payment not found', async () => {
    mockPrisma.billPayment.findFirst.mockResolvedValue(null)

    const request = createRequest('http://localhost:3000/api/bill-payments/non-existent')
    const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'non-existent' }) })

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Pagamento de fatura nao encontrado')
  })

  it('should handle database errors gracefully', async () => {
    mockPrisma.billPayment.findFirst.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1')
    const response = await GET_BY_ID(request, { params: Promise.resolve({ id: 'bp-1' }) })

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('Erro ao buscar pagamento de fatura')
  })
})

describe('PUT /api/bill-payments/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should update interest rate', async () => {
    const existingPayment = createMockBillPayment()
    const updatedPayment = createMockBillPayment({
      interestRate: 15,
      interestAmount: 300 // 2000 * 15%
    })

    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)
    mockPrisma.billPayment.update.mockResolvedValue(updatedPayment)

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1', {
      method: 'PUT',
      body: JSON.stringify({
        interestRate: 15
      })
    })

    const response = await PUT(request, { params: Promise.resolve({ id: 'bp-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.interestRate).toBe(15)
    expect(mockPrisma.billPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'bp-1' },
        data: expect.objectContaining({
          interestRate: 15,
          interestAmount: 300 // amountCarried (2000) * 15 / 100
        })
      })
    )
  })

  it('should update amountPaid and recalculate amountCarried', async () => {
    const existingPayment = createMockBillPayment()
    const updatedPayment = createMockBillPayment({
      amountPaid: 4000,
      amountCarried: 1000
    })

    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)
    mockPrisma.billPayment.update.mockResolvedValue(updatedPayment)

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1', {
      method: 'PUT',
      body: JSON.stringify({
        amountPaid: 4000
      })
    })

    const response = await PUT(request, { params: Promise.resolve({ id: 'bp-1' }) })

    expect(response.status).toBe(200)
    expect(mockPrisma.billPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amountPaid: 4000,
          amountCarried: 1000 // 5000 - 4000
        })
      })
    )
  })

  it('should update paymentType', async () => {
    const existingPayment = createMockBillPayment()
    const updatedPayment = createMockBillPayment({ paymentType: 'FINANCED' })

    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)
    mockPrisma.billPayment.update.mockResolvedValue(updatedPayment)

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1', {
      method: 'PUT',
      body: JSON.stringify({
        paymentType: 'FINANCED',
        installments: 6
      })
    })

    const response = await PUT(request, { params: Promise.resolve({ id: 'bp-1' }) })

    expect(response.status).toBe(200)
    expect(mockPrisma.billPayment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          paymentType: 'FINANCED'
        })
      })
    )
  })

  it('should return 400 when amountPaid exceeds totalBillAmount', async () => {
    const existingPayment = createMockBillPayment()
    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1', {
      method: 'PUT',
      body: JSON.stringify({
        amountPaid: 6000 // Greater than totalBillAmount (5000)
      })
    })

    const response = await PUT(request, { params: Promise.resolve({ id: 'bp-1' }) })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('amountPaid deve ser menor que totalBillAmount para pagamento parcial')
  })

  it('should return 400 when paymentType is invalid', async () => {
    const existingPayment = createMockBillPayment()
    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1', {
      method: 'PUT',
      body: JSON.stringify({
        paymentType: 'INVALID'
      })
    })

    const response = await PUT(request, { params: Promise.resolve({ id: 'bp-1' }) })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe("paymentType deve ser 'PARTIAL' ou 'FINANCED'")
  })

  it('should return 400 when FINANCED type has insufficient installments', async () => {
    const existingPayment = createMockBillPayment()
    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1', {
      method: 'PUT',
      body: JSON.stringify({
        paymentType: 'FINANCED',
        installments: 1
      })
    })

    const response = await PUT(request, { params: Promise.resolve({ id: 'bp-1' }) })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Para parcelamento, o numero de parcelas deve ser pelo menos 2')
  })

  it('should return 400 when no valid fields to update', async () => {
    const existingPayment = createMockBillPayment()
    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1', {
      method: 'PUT',
      body: JSON.stringify({
        invalidField: 'value'
      })
    })

    const response = await PUT(request, { params: Promise.resolve({ id: 'bp-1' }) })

    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBe('Nenhum campo valido para atualizar')
  })

  it('should return 404 when payment not found', async () => {
    mockPrisma.billPayment.findFirst.mockResolvedValue(null)

    const request = createRequest('http://localhost:3000/api/bill-payments/non-existent', {
      method: 'PUT',
      body: JSON.stringify({
        interestRate: 10
      })
    })

    const response = await PUT(request, { params: Promise.resolve({ id: 'non-existent' }) })

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Pagamento de fatura nao encontrado')
  })

  it('should handle database errors gracefully', async () => {
    const existingPayment = createMockBillPayment()
    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)
    mockPrisma.billPayment.update.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1', {
      method: 'PUT',
      body: JSON.stringify({
        interestRate: 10
      })
    })

    const response = await PUT(request, { params: Promise.resolve({ id: 'bp-1' }) })

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('Erro ao atualizar pagamento de fatura')
  })
})

describe('DELETE /api/bill-payments/:id', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should delete a bill payment without transactions', async () => {
    const existingPayment = createMockBillPayment({
      installment: null,
      entryTransactionId: null,
      carryoverTransactionId: null
    })

    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        billPayment: {
          delete: vi.fn().mockResolvedValue(existingPayment)
        },
        transaction: {
          update: vi.fn()
        },
        installment: {
          delete: vi.fn()
        }
      }
      return fn(mockTx)
    })

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1', {
      method: 'DELETE'
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'bp-1' }) })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
  })

  it('should soft delete entry and carryover transactions', async () => {
    const existingPayment = createMockBillPayment({
      entryTransactionId: 'txn-entry-1',
      carryoverTransactionId: 'txn-carry-1',
      installment: null
    })

    let transactionUpdateCalls: { where: { id: string }; data: { deletedAt: Date } }[] = []
    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        billPayment: {
          delete: vi.fn().mockResolvedValue(existingPayment)
        },
        transaction: {
          update: vi.fn().mockImplementation((args: { where: { id: string }; data: { deletedAt: Date } }) => {
            transactionUpdateCalls.push(args)
            return Promise.resolve({})
          })
        },
        installment: {
          delete: vi.fn()
        }
      }
      return fn(mockTx)
    })

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1', {
      method: 'DELETE'
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'bp-1' }) })

    expect(response.status).toBe(200)
    // Should have updated both entry and carryover transactions
    expect(transactionUpdateCalls.length).toBe(2)
    expect(transactionUpdateCalls.some(call => call.where.id === 'txn-entry-1')).toBe(true)
    expect(transactionUpdateCalls.some(call => call.where.id === 'txn-carry-1')).toBe(true)
  })

  it('should delete installment and soft delete its transactions', async () => {
    const existingPayment = createMockBillPayment({
      entryTransactionId: null,
      carryoverTransactionId: null,
      installment: {
        id: 'inst-1',
        transactions: [
          { id: 'txn-inst-1' },
          { id: 'txn-inst-2' },
          { id: 'txn-inst-3' }
        ]
      }
    })

    let transactionUpdateCalls: { where: { id: string } }[] = []
    let installmentDeleteCalled = false
    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)
    mockPrisma.$transaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        billPayment: {
          delete: vi.fn().mockResolvedValue(existingPayment)
        },
        transaction: {
          update: vi.fn().mockImplementation((args: { where: { id: string } }) => {
            transactionUpdateCalls.push(args)
            return Promise.resolve({})
          })
        },
        installment: {
          delete: vi.fn().mockImplementation(() => {
            installmentDeleteCalled = true
            return Promise.resolve({})
          })
        }
      }
      return fn(mockTx)
    })

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1', {
      method: 'DELETE'
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'bp-1' }) })

    expect(response.status).toBe(200)
    // Should have soft deleted all 3 installment transactions
    expect(transactionUpdateCalls.length).toBe(3)
    expect(installmentDeleteCalled).toBe(true)
  })

  it('should return 404 when payment not found', async () => {
    mockPrisma.billPayment.findFirst.mockResolvedValue(null)

    const request = createRequest('http://localhost:3000/api/bill-payments/non-existent', {
      method: 'DELETE'
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'non-existent' }) })

    expect(response.status).toBe(404)
    const data = await response.json()
    expect(data.error).toBe('Pagamento de fatura nao encontrado')
  })

  it('should handle database errors gracefully', async () => {
    const existingPayment = createMockBillPayment()
    mockPrisma.billPayment.findFirst.mockResolvedValue(existingPayment)
    mockPrisma.$transaction.mockRejectedValue(new Error('Database error'))

    const request = createRequest('http://localhost:3000/api/bill-payments/bp-1', {
      method: 'DELETE'
    })

    const response = await DELETE(request, { params: Promise.resolve({ id: 'bp-1' }) })

    expect(response.status).toBe(500)
    const data = await response.json()
    expect(data.error).toBe('Erro ao excluir pagamento de fatura')
  })
})
