import { describe, it, expect, beforeEach, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { testUser } from '../setup'

// Mock prisma with inline factory (vi.mock is hoisted)
vi.mock('@/lib/db', () => ({
  default: {
    recurringExpense: {
      findMany: vi.fn()
    },
    transaction: {
      create: vi.fn(),
      update: vi.fn()
    },
    billPayment: {
      findMany: vi.fn(),
      update: vi.fn()
    }
  }
}))

// Import route handlers and prisma mock after mocking
import { POST } from '@/app/api/import/route'
import prisma from '@/lib/db'

// Type assertion for mocked prisma
const mockPrisma = prisma as unknown as {
  recurringExpense: {
    findMany: ReturnType<typeof vi.fn>
  }
  transaction: {
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  billPayment: {
    findMany: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
}

// Helper to create NextRequest with JSON body
function createRequest(body: unknown): NextRequest {
  return new NextRequest(new URL('http://localhost:3000/api/import'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
}

// Helper to create a mock transaction response
function createMockTransaction(id: string, description: string, amount: number, date: string) {
  return {
    id,
    description,
    amount,
    date: new Date(date),
    type: 'EXPENSE',
    origin: 'Nubank',
    categoryId: null,
    category: null,
    isFixed: false,
    isInstallment: false,
    userId: testUser.id,
    recurringExpense: null
  }
}

describe('POST /api/import - Carryover Linking', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Default mock returns - no recurring expenses
    mockPrisma.recurringExpense.findMany.mockResolvedValue([])
    // Default - no bill payments
    mockPrisma.billPayment.findMany.mockResolvedValue([])
  })

  describe('Basic import functionality', () => {
    it('should import transactions without carryover linking when no carryover patterns', async () => {
      const mockTransaction = createMockTransaction(
        'txn-1',
        'NETFLIX',
        -39.90,
        '2024-02-15'
      )
      mockPrisma.transaction.create.mockResolvedValue(mockTransaction)

      const request = createRequest({
        transactions: [
          { description: 'NETFLIX', amount: 39.90, date: '2024-02-15', type: 'EXPENSE' }
        ],
        origin: 'Nubank'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.count).toBe(1)
      expect(data.carryoverLinkedCount).toBe(0)
      expect(data.linkedCarryovers).toHaveLength(0)
      expect(mockPrisma.billPayment.update).not.toHaveBeenCalled()
    })

    it('should return error for invalid transactions', async () => {
      const request = createRequest({
        transactions: 'invalid'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Transacoes invalidas')
    })
  })

  describe('Carryover detection and linking', () => {
    it('should detect and link carryover transaction that matches existing BillPayment', async () => {
      // Setup: BillPayment from January 2024 with R$ 2,000 carried
      const mockBillPayment = {
        id: 'bp-1',
        billMonth: 1, // January
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 5000,
        amountPaid: 3000,
        amountCarried: 2000,
        paymentType: 'PARTIAL',
        linkedTransactionId: null,
        carryoverTransactionId: null,
        interestRate: null,
        interestAmount: null,
        userId: testUser.id,
        createdAt: new Date()
      }

      mockPrisma.billPayment.findMany.mockResolvedValue([mockBillPayment])

      // Imported carryover transaction in February 2024 statement
      // Amount is R$ 2,150 (original R$ 2,000 + 7.5% interest)
      const carryoverTransaction = createMockTransaction(
        'txn-carryover-1',
        'SALDO ROTATIVO',
        -2150,
        '2024-02-10'
      )
      mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)
      mockPrisma.billPayment.update.mockResolvedValue({
        ...mockBillPayment,
        linkedTransactionId: carryoverTransaction.id,
        interestRate: 7.5,
        interestAmount: 150
      })

      const request = createRequest({
        transactions: [
          { description: 'SALDO ROTATIVO', amount: 2150, date: '2024-02-10', type: 'EXPENSE' }
        ],
        origin: 'Nubank'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.count).toBe(1)
      expect(data.carryoverLinkedCount).toBe(1)
      expect(data.linkedCarryovers).toHaveLength(1)
      expect(data.linkedCarryovers[0]).toEqual({
        transactionId: 'txn-carryover-1',
        billPaymentId: 'bp-1',
        fromBill: '1/2024',
        interestRate: 7.5,
        interestAmount: 150
      })

      // Verify BillPayment was updated
      expect(mockPrisma.billPayment.update).toHaveBeenCalledWith({
        where: { id: 'bp-1' },
        data: {
          linkedTransactionId: 'txn-carryover-1',
          interestRate: 7.5,
          interestAmount: 150
        }
      })
    })

    it('should detect carryover but import normally when no matching BillPayment exists', async () => {
      // No BillPayment exists
      mockPrisma.billPayment.findMany.mockResolvedValue([])

      const carryoverTransaction = createMockTransaction(
        'txn-carryover-1',
        'SALDO ANTERIOR',
        -1500,
        '2024-02-10'
      )
      mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)

      const request = createRequest({
        transactions: [
          { description: 'SALDO ANTERIOR', amount: 1500, date: '2024-02-10', type: 'EXPENSE' }
        ],
        origin: 'Nubank'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.count).toBe(1)
      expect(data.carryoverLinkedCount).toBe(0)
      expect(data.linkedCarryovers).toHaveLength(0)
      // Transaction should still be created
      expect(mockPrisma.transaction.create).toHaveBeenCalled()
      // BillPayment update should NOT be called
      expect(mockPrisma.billPayment.update).not.toHaveBeenCalled()
    })

    it('should not link carryover when origin does not match', async () => {
      // BillPayment exists but for a different card
      const mockBillPayment = {
        id: 'bp-1',
        billMonth: 1,
        billYear: 2024,
        origin: 'Itau', // Different origin
        totalBillAmount: 5000,
        amountPaid: 3000,
        amountCarried: 2000,
        paymentType: 'PARTIAL',
        linkedTransactionId: null,
        carryoverTransactionId: null,
        userId: testUser.id,
        createdAt: new Date()
      }

      // Mock should return empty array when origin doesn't match (simulating Prisma's WHERE clause)
      // The real findMatchingBillPayment queries with origin='Nubank', which won't match 'Itau'
      mockPrisma.billPayment.findMany.mockImplementation(async (params: { where?: { origin?: string } }) => {
        // Simulate Prisma filtering: only return if origin matches
        if (params?.where?.origin === mockBillPayment.origin) {
          return [mockBillPayment]
        }
        return []
      })

      const carryoverTransaction = createMockTransaction(
        'txn-carryover-1',
        'SALDO ROTATIVO',
        -2100,
        '2024-02-10'
      )
      mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)

      const request = createRequest({
        transactions: [
          { description: 'SALDO ROTATIVO', amount: 2100, date: '2024-02-10', type: 'EXPENSE' }
        ],
        origin: 'Nubank' // Transaction is from Nubank but BillPayment is Itau
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.carryoverLinkedCount).toBe(0)
      expect(mockPrisma.billPayment.update).not.toHaveBeenCalled()
    })
  })

  describe('Interest calculation', () => {
    it('should calculate interest correctly when actual amount exceeds expected', async () => {
      // BillPayment with R$ 1,000 carried
      const mockBillPayment = {
        id: 'bp-interest',
        billMonth: 3,
        billYear: 2024,
        origin: 'C6',
        totalBillAmount: 3000,
        amountPaid: 2000,
        amountCarried: 1000,
        paymentType: 'PARTIAL',
        linkedTransactionId: null,
        carryoverTransactionId: null,
        userId: testUser.id,
        createdAt: new Date()
      }

      mockPrisma.billPayment.findMany.mockResolvedValue([mockBillPayment])

      // Imported with R$ 1,150 (15% interest)
      const carryoverTransaction = createMockTransaction(
        'txn-interest',
        'FINANC FATURA',
        -1150,
        '2024-04-10'
      )
      mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)
      mockPrisma.billPayment.update.mockResolvedValue({
        ...mockBillPayment,
        linkedTransactionId: carryoverTransaction.id,
        interestRate: 15,
        interestAmount: 150
      })

      const request = createRequest({
        transactions: [
          { description: 'FINANC FATURA', amount: 1150, date: '2024-04-10', type: 'EXPENSE' }
        ],
        origin: 'C6'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.linkedCarryovers[0].interestRate).toBe(15)
      expect(data.linkedCarryovers[0].interestAmount).toBe(150)
    })

    it('should calculate zero interest when amounts match exactly', async () => {
      const mockBillPayment = {
        id: 'bp-no-interest',
        billMonth: 5,
        billYear: 2024,
        origin: 'BTG',
        totalBillAmount: 2000,
        amountPaid: 1500,
        amountCarried: 500,
        paymentType: 'PARTIAL',
        linkedTransactionId: null,
        carryoverTransactionId: null,
        userId: testUser.id,
        createdAt: new Date()
      }

      mockPrisma.billPayment.findMany.mockResolvedValue([mockBillPayment])

      // Imported with exact same amount (no interest)
      const carryoverTransaction = createMockTransaction(
        'txn-no-interest',
        'SALDO FATURA ANT',
        -500,
        '2024-06-10'
      )
      mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)
      mockPrisma.billPayment.update.mockResolvedValue({
        ...mockBillPayment,
        linkedTransactionId: carryoverTransaction.id,
        interestRate: 0,
        interestAmount: 0
      })

      const request = createRequest({
        transactions: [
          { description: 'SALDO FATURA ANT', amount: 500, date: '2024-06-10', type: 'EXPENSE' }
        ],
        origin: 'BTG'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.linkedCarryovers[0].interestRate).toBe(0)
      expect(data.linkedCarryovers[0].interestAmount).toBe(0)
    })
  })

  describe('Soft-delete of placeholder transaction', () => {
    it('should soft-delete old carryover transaction when BillPayment has one', async () => {
      const mockBillPayment = {
        id: 'bp-with-placeholder',
        billMonth: 6,
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 4000,
        amountPaid: 3000,
        amountCarried: 1000,
        paymentType: 'PARTIAL',
        linkedTransactionId: null,
        carryoverTransactionId: 'old-placeholder-txn', // Existing placeholder
        userId: testUser.id,
        createdAt: new Date()
      }

      mockPrisma.billPayment.findMany.mockResolvedValue([mockBillPayment])

      const carryoverTransaction = createMockTransaction(
        'txn-new-carryover',
        'ROTATIVO',
        -1080,
        '2024-07-10'
      )
      mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)
      mockPrisma.transaction.update.mockResolvedValue({
        id: 'old-placeholder-txn',
        deletedAt: new Date()
      })
      mockPrisma.billPayment.update.mockResolvedValue({
        ...mockBillPayment,
        linkedTransactionId: carryoverTransaction.id,
        interestRate: 8,
        interestAmount: 80
      })

      const request = createRequest({
        transactions: [
          { description: 'ROTATIVO', amount: 1080, date: '2024-07-10', type: 'EXPENSE' }
        ],
        origin: 'Nubank'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.carryoverLinkedCount).toBe(1)

      // Verify the old placeholder transaction was soft-deleted
      expect(mockPrisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'old-placeholder-txn' },
        data: { deletedAt: expect.any(Date) }
      })
    })

    it('should not attempt soft-delete when BillPayment has no carryover transaction', async () => {
      const mockBillPayment = {
        id: 'bp-no-placeholder',
        billMonth: 7,
        billYear: 2024,
        origin: 'Inter',
        totalBillAmount: 2500,
        amountPaid: 2000,
        amountCarried: 500,
        paymentType: 'PARTIAL',
        linkedTransactionId: null,
        carryoverTransactionId: null, // No existing placeholder
        userId: testUser.id,
        createdAt: new Date()
      }

      mockPrisma.billPayment.findMany.mockResolvedValue([mockBillPayment])

      const carryoverTransaction = createMockTransaction(
        'txn-carryover',
        'PGTO MINIMO',
        -540,
        '2024-08-10'
      )
      mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)
      mockPrisma.billPayment.update.mockResolvedValue({
        ...mockBillPayment,
        linkedTransactionId: carryoverTransaction.id,
        interestRate: 8,
        interestAmount: 40
      })

      const request = createRequest({
        transactions: [
          { description: 'PGTO MINIMO', amount: 540, date: '2024-08-10', type: 'EXPENSE' }
        ],
        origin: 'Inter'
      })

      const response = await POST(request)

      expect(response.status).toBe(201)

      // Transaction.update should only be called for soft-delete
      // Since no carryoverTransactionId exists, it should not be called
      expect(mockPrisma.transaction.update).not.toHaveBeenCalled()
    })
  })

  describe('Multiple carryover transactions in one import', () => {
    it('should handle multiple carryover transactions from different cards', async () => {
      // BillPayments from two different cards
      const mockBillPayments = [
        {
          id: 'bp-nubank',
          billMonth: 8,
          billYear: 2024,
          origin: 'Nubank',
          totalBillAmount: 3000,
          amountPaid: 2000,
          amountCarried: 1000,
          paymentType: 'PARTIAL',
          linkedTransactionId: null,
          carryoverTransactionId: null,
          userId: testUser.id,
          createdAt: new Date()
        },
        {
          id: 'bp-itau',
          billMonth: 8,
          billYear: 2024,
          origin: 'Itau',
          totalBillAmount: 5000,
          amountPaid: 3000,
          amountCarried: 2000,
          paymentType: 'PARTIAL',
          linkedTransactionId: null,
          carryoverTransactionId: null,
          userId: testUser.id,
          createdAt: new Date()
        }
      ]

      // Filter by origin in the mock
      mockPrisma.billPayment.findMany.mockImplementation(({ where }) => {
        const filtered = mockBillPayments.filter(bp => bp.origin === where.origin)
        return Promise.resolve(filtered)
      })

      // Create mocks for each transaction
      const nubankCarryover = createMockTransaction(
        'txn-nubank-carryover',
        'SALDO ROTATIVO',
        -1100,
        '2024-09-10'
      )
      const itauCarryover = createMockTransaction(
        'txn-itau-carryover',
        'SALDO ANTERIOR',
        -2200,
        '2024-09-10'
      )
      const regularTxn = createMockTransaction(
        'txn-regular',
        'NETFLIX',
        -39.90,
        '2024-09-10'
      )

      let txnCount = 0
      mockPrisma.transaction.create.mockImplementation(() => {
        txnCount++
        if (txnCount === 1) return Promise.resolve(nubankCarryover)
        if (txnCount === 2) return Promise.resolve(itauCarryover)
        return Promise.resolve(regularTxn)
      })

      mockPrisma.billPayment.update.mockResolvedValue({})

      // Import with transactions from both cards and a regular transaction
      const request = createRequest({
        transactions: [
          { description: 'SALDO ROTATIVO', amount: 1100, date: '2024-09-10', type: 'EXPENSE', origin: 'Nubank' },
          { description: 'SALDO ANTERIOR', amount: 2200, date: '2024-09-10', type: 'EXPENSE', origin: 'Itau' },
          { description: 'NETFLIX', amount: 39.90, date: '2024-09-10', type: 'EXPENSE' }
        ]
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.count).toBe(3)
      expect(data.carryoverLinkedCount).toBe(2)
      expect(data.linkedCarryovers).toHaveLength(2)

      // Verify both carryovers were linked
      expect(data.linkedCarryovers).toContainEqual(
        expect.objectContaining({
          transactionId: 'txn-nubank-carryover',
          billPaymentId: 'bp-nubank'
        })
      )
      expect(data.linkedCarryovers).toContainEqual(
        expect.objectContaining({
          transactionId: 'txn-itau-carryover',
          billPaymentId: 'bp-itau'
        })
      )
    })

    it('should link some carryovers while others have no match', async () => {
      // Only one BillPayment exists
      const mockBillPayment = {
        id: 'bp-only-one',
        billMonth: 9,
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 2000,
        amountPaid: 1500,
        amountCarried: 500,
        paymentType: 'PARTIAL',
        linkedTransactionId: null,
        carryoverTransactionId: null,
        userId: testUser.id,
        createdAt: new Date()
      }

      // Mock to return only Nubank BillPayment
      mockPrisma.billPayment.findMany.mockImplementation(({ where }) => {
        if (where.origin === 'Nubank') {
          return Promise.resolve([mockBillPayment])
        }
        return Promise.resolve([])
      })

      const nubankCarryover = createMockTransaction(
        'txn-nubank',
        'SALDO ROTATIVO',
        -540,
        '2024-10-10'
      )
      const c6Carryover = createMockTransaction(
        'txn-c6',
        'SALDO ANTERIOR',
        -800,
        '2024-10-10'
      )

      let txnCount = 0
      mockPrisma.transaction.create.mockImplementation(() => {
        txnCount++
        if (txnCount === 1) return Promise.resolve(nubankCarryover)
        return Promise.resolve(c6Carryover)
      })

      mockPrisma.billPayment.update.mockResolvedValue({})

      const request = createRequest({
        transactions: [
          { description: 'SALDO ROTATIVO', amount: 540, date: '2024-10-10', type: 'EXPENSE', origin: 'Nubank' },
          { description: 'SALDO ANTERIOR', amount: 800, date: '2024-10-10', type: 'EXPENSE', origin: 'C6' }
        ]
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.count).toBe(2)
      expect(data.carryoverLinkedCount).toBe(1) // Only Nubank linked
      expect(data.linkedCarryovers).toHaveLength(1)
      expect(data.linkedCarryovers[0].billPaymentId).toBe('bp-only-one')
    })
  })

  describe('Carryover pattern detection', () => {
    const carryoverPatterns = [
      'SALDO ANTERIOR',
      'SALDO FATURA ANT',
      'SALDO ROTATIVO',
      'ROTATIVO',
      'FINANCIAMENTO FATURA',
      'FINANC FATURA',
      'PARCELAMENTO FATURA',
      'PGTO MINIMO',
      'PAGAMENTO MINIMO'
    ]

    carryoverPatterns.forEach(pattern => {
      it(`should detect carryover pattern: "${pattern}"`, async () => {
        const mockBillPayment = {
          id: 'bp-pattern-test',
          billMonth: 10,
          billYear: 2024,
          origin: 'Nubank',
          totalBillAmount: 1000,
          amountPaid: 700,
          amountCarried: 300,
          paymentType: 'PARTIAL',
          linkedTransactionId: null,
          carryoverTransactionId: null,
          userId: testUser.id,
          createdAt: new Date()
        }

        mockPrisma.billPayment.findMany.mockResolvedValue([mockBillPayment])

        const carryoverTransaction = createMockTransaction(
          'txn-pattern',
          pattern,
          -330,
          '2024-11-10'
        )
        mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)
        mockPrisma.billPayment.update.mockResolvedValue({
          ...mockBillPayment,
          linkedTransactionId: carryoverTransaction.id
        })

        const request = createRequest({
          transactions: [
            { description: pattern, amount: 330, date: '2024-11-10', type: 'EXPENSE' }
          ],
          origin: 'Nubank'
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(201)
        expect(data.carryoverLinkedCount).toBe(1)
      })
    })

    it('should not detect regular transactions as carryover', async () => {
      const regularDescriptions = [
        'NETFLIX',
        'SPOTIFY',
        'UBER TRIP',
        'IFOOD PEDIDO',
        'AMAZON PRIME'
      ]

      mockPrisma.billPayment.findMany.mockResolvedValue([])

      for (const desc of regularDescriptions) {
        const mockTransaction = createMockTransaction('txn-regular', desc, -50, '2024-11-15')
        mockPrisma.transaction.create.mockResolvedValue(mockTransaction)

        const request = createRequest({
          transactions: [
            { description: desc, amount: 50, date: '2024-11-15', type: 'EXPENSE' }
          ],
          origin: 'Nubank'
        })

        const response = await POST(request)
        const data = await response.json()

        expect(response.status).toBe(201)
        expect(data.carryoverLinkedCount).toBe(0)
      }
    })
  })

  describe('Edge cases', () => {
    it('should handle January carryover looking for December previous year BillPayment', async () => {
      // BillPayment from December 2023
      const mockBillPayment = {
        id: 'bp-december',
        billMonth: 12,
        billYear: 2023,
        origin: 'Nubank',
        totalBillAmount: 3000,
        amountPaid: 2500,
        amountCarried: 500,
        paymentType: 'PARTIAL',
        linkedTransactionId: null,
        carryoverTransactionId: null,
        userId: testUser.id,
        createdAt: new Date()
      }

      mockPrisma.billPayment.findMany.mockResolvedValue([mockBillPayment])

      // Carryover in January 2024
      const carryoverTransaction = createMockTransaction(
        'txn-jan-carryover',
        'SALDO ROTATIVO',
        -550,
        '2024-01-10'
      )
      mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)
      mockPrisma.billPayment.update.mockResolvedValue({
        ...mockBillPayment,
        linkedTransactionId: carryoverTransaction.id,
        interestRate: 10,
        interestAmount: 50
      })

      const request = createRequest({
        transactions: [
          { description: 'SALDO ROTATIVO', amount: 550, date: '2024-01-10', type: 'EXPENSE' }
        ],
        origin: 'Nubank'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.carryoverLinkedCount).toBe(1)
      expect(data.linkedCarryovers[0].fromBill).toBe('12/2023')
    })

    it('should not link when BillPayment is already linked', async () => {
      // BillPayment already has linkedTransactionId
      const mockBillPayment = {
        id: 'bp-already-linked',
        billMonth: 11,
        billYear: 2024,
        origin: 'Nubank',
        totalBillAmount: 2000,
        amountPaid: 1500,
        amountCarried: 500,
        paymentType: 'PARTIAL',
        linkedTransactionId: 'existing-txn', // Already linked!
        carryoverTransactionId: null,
        userId: testUser.id,
        createdAt: new Date()
      }

      // The findMany query filters for linkedTransactionId: null,
      // so this should return empty
      mockPrisma.billPayment.findMany.mockResolvedValue([])

      const carryoverTransaction = createMockTransaction(
        'txn-orphan-carryover',
        'SALDO ROTATIVO',
        -540,
        '2024-12-10'
      )
      mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)

      const request = createRequest({
        transactions: [
          { description: 'SALDO ROTATIVO', amount: 540, date: '2024-12-10', type: 'EXPENSE' }
        ],
        origin: 'Nubank'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.carryoverLinkedCount).toBe(0)
      expect(mockPrisma.billPayment.update).not.toHaveBeenCalled()
    })

    it('should handle carryover linking error gracefully without failing import', async () => {
      const mockBillPayment = {
        id: 'bp-error',
        billMonth: 1,
        billYear: 2025,
        origin: 'Nubank',
        totalBillAmount: 1000,
        amountPaid: 800,
        amountCarried: 200,
        paymentType: 'PARTIAL',
        linkedTransactionId: null,
        carryoverTransactionId: null,
        userId: testUser.id,
        createdAt: new Date()
      }

      mockPrisma.billPayment.findMany.mockResolvedValue([mockBillPayment])

      const carryoverTransaction = createMockTransaction(
        'txn-error-carryover',
        'SALDO ROTATIVO',
        -220,
        '2025-02-10'
      )
      mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)

      // Simulate error during BillPayment update
      mockPrisma.billPayment.update.mockRejectedValue(new Error('Database error'))

      const request = createRequest({
        transactions: [
          { description: 'SALDO ROTATIVO', amount: 220, date: '2025-02-10', type: 'EXPENSE' }
        ],
        origin: 'Nubank'
      })

      const response = await POST(request)
      const data = await response.json()

      // Import should still succeed
      expect(response.status).toBe(201)
      expect(data.count).toBe(1)
      // But carryover linking failed
      expect(data.carryoverLinkedCount).toBe(0)
    })

    it('should match carryover within 50% tolerance for interest charges', async () => {
      // BillPayment with R$ 1,000 carried
      const mockBillPayment = {
        id: 'bp-tolerance',
        billMonth: 2,
        billYear: 2025,
        origin: 'Nubank',
        totalBillAmount: 2000,
        amountPaid: 1000,
        amountCarried: 1000,
        paymentType: 'PARTIAL',
        linkedTransactionId: null,
        carryoverTransactionId: null,
        userId: testUser.id,
        createdAt: new Date()
      }

      mockPrisma.billPayment.findMany.mockResolvedValue([mockBillPayment])

      // Carryover with 40% interest (within 50% tolerance)
      const carryoverTransaction = createMockTransaction(
        'txn-high-interest',
        'SALDO ROTATIVO',
        -1400,
        '2025-03-10'
      )
      mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)
      mockPrisma.billPayment.update.mockResolvedValue({
        ...mockBillPayment,
        linkedTransactionId: carryoverTransaction.id,
        interestRate: 40,
        interestAmount: 400
      })

      const request = createRequest({
        transactions: [
          { description: 'SALDO ROTATIVO', amount: 1400, date: '2025-03-10', type: 'EXPENSE' }
        ],
        origin: 'Nubank'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.carryoverLinkedCount).toBe(1)
      expect(data.linkedCarryovers[0].interestRate).toBe(40)
    })
  })

  describe('Response message formatting', () => {
    it('should include carryover count in response message', async () => {
      const mockBillPayment = {
        id: 'bp-msg-test',
        billMonth: 3,
        billYear: 2025,
        origin: 'Nubank',
        totalBillAmount: 1000,
        amountPaid: 700,
        amountCarried: 300,
        paymentType: 'PARTIAL',
        linkedTransactionId: null,
        carryoverTransactionId: null,
        userId: testUser.id,
        createdAt: new Date()
      }

      mockPrisma.billPayment.findMany.mockResolvedValue([mockBillPayment])

      const carryoverTransaction = createMockTransaction(
        'txn-msg',
        'SALDO ROTATIVO',
        -330,
        '2025-04-10'
      )
      mockPrisma.transaction.create.mockResolvedValue(carryoverTransaction)
      mockPrisma.billPayment.update.mockResolvedValue({
        ...mockBillPayment,
        linkedTransactionId: carryoverTransaction.id
      })

      const request = createRequest({
        transactions: [
          { description: 'SALDO ROTATIVO', amount: 330, date: '2025-04-10', type: 'EXPENSE' }
        ],
        origin: 'Nubank'
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(201)
      expect(data.message).toContain('1 transacoes importadas')
      expect(data.message).toContain('1 vinculadas a saldo rolado')
    })
  })
})
