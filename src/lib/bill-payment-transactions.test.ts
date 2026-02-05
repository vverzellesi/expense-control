import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  generatePartialPaymentTransactions,
  generateFinancedPaymentTransactions,
  generateBillPaymentTransactions,
  deleteBillPaymentTransactions,
  softDeleteCarryoverTransaction,
} from './bill-payment-transactions'

// Mock the database module
vi.mock('./db', () => ({
  default: {
    transaction: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    installment: {
      create: vi.fn(),
      delete: vi.fn(),
    },
    billPayment: {
      findFirst: vi.fn(),
    },
  },
}))

import prisma from './db'

const mockedPrisma = prisma as unknown as {
  transaction: {
    create: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
    deleteMany: ReturnType<typeof vi.fn>
  }
  installment: {
    create: ReturnType<typeof vi.fn>
    delete: ReturnType<typeof vi.fn>
  }
  billPayment: {
    findFirst: ReturnType<typeof vi.fn>
  }
}

describe('bill-payment-transactions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('generatePartialPaymentTransactions', () => {
    beforeEach(() => {
      // Setup default mock returns for transaction creation
      mockedPrisma.transaction.create
        .mockResolvedValueOnce({ id: 'payment-tx-id' })
        .mockResolvedValueOnce({ id: 'carryover-tx-id' })
    })

    it('should create payment and carryover transactions for partial payment', async () => {
      const result = await generatePartialPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 10000,
        userId: 'user-123',
      })

      expect(result.entryTransactionId).toBe('payment-tx-id')
      expect(result.carryoverTransactionId).toBe('carryover-tx-id')
      expect(result.amountCarried).toBe(2000)
      expect(result.interestAmount).toBe(0)
    })

    it('should create payment transaction with correct data', async () => {
      await generatePartialPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 10000,
        userId: 'user-123',
      })

      expect(mockedPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'Pagamento Fatura Janeiro/2026 - Nubank',
            amount: -10000,
            type: 'EXPENSE',
            origin: 'Nubank',
            userId: 'user-123',
            isFixed: false,
            isInstallment: false,
          }),
        })
      )
    })

    it('should create carryover transaction in the next month', async () => {
      await generatePartialPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 10000,
        userId: 'user-123',
      })

      const carryoverCall = mockedPrisma.transaction.create.mock.calls[1][0]
      expect(carryoverCall.data.description).toBe('Saldo Anterior Fatura Janeiro/2026 - Nubank')
      expect(carryoverCall.data.amount).toBe(-2000)
      // Carryover should be in February
      const carryoverDate = carryoverCall.data.date as Date
      expect(carryoverDate.getMonth()).toBe(1) // February (0-indexed)
      expect(carryoverDate.getFullYear()).toBe(2026)
    })

    it('should handle year rollover for carryover (December to January)', async () => {
      await generatePartialPaymentTransactions({
        billMonth: 12,
        billYear: 2025,
        origin: 'Nubank',
        totalBillAmount: 5000,
        amountPaid: 3000,
        userId: 'user-123',
      })

      const carryoverCall = mockedPrisma.transaction.create.mock.calls[1][0]
      expect(carryoverCall.data.description).toBe('Saldo Anterior Fatura Dezembro/2025 - Nubank')
      const carryoverDate = carryoverCall.data.date as Date
      expect(carryoverDate.getMonth()).toBe(0) // January
      expect(carryoverDate.getFullYear()).toBe(2026)
    })

    it('should calculate interest on carried amount', async () => {
      const result = await generatePartialPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 10000,
        interestRate: 10, // 10%
        userId: 'user-123',
      })

      expect(result.amountCarried).toBe(2000)
      expect(result.interestAmount).toBe(200) // 10% of 2000

      // Carryover amount should include interest
      const carryoverCall = mockedPrisma.transaction.create.mock.calls[1][0]
      expect(carryoverCall.data.amount).toBe(-2200) // 2000 + 200 interest
    })

    it('should use provided categoryId if specified', async () => {
      await generatePartialPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 10000,
        userId: 'user-123',
        categoryId: 'cat-123',
      })

      expect(mockedPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            categoryId: 'cat-123',
          }),
        })
      )
    })
  })

  describe('generateFinancedPaymentTransactions', () => {
    beforeEach(() => {
      mockedPrisma.transaction.create.mockImplementation(() =>
        Promise.resolve({ id: `tx-${Math.random().toString(36).substr(2, 9)}` })
      )
      mockedPrisma.installment.create.mockResolvedValue({ id: 'installment-id' })
    })

    it('should create entry transaction and installment record', async () => {
      const result = await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 4000, // Entry
        installments: 4,
        userId: 'user-123',
      })

      expect(result.entryTransactionId).toBeDefined()
      expect(result.installmentId).toBe('installment-id')
      expect(result.amountCarried).toBe(8000)
      expect(result.installmentAmount).toBe(2000) // 8000 / 4
      expect(result.installmentTransactionIds).toHaveLength(4)
    })

    it('should create entry transaction with correct description', async () => {
      await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 4000,
        installments: 4,
        userId: 'user-123',
      })

      // First call is the entry transaction
      const entryCall = mockedPrisma.transaction.create.mock.calls[0][0]
      expect(entryCall.data.description).toBe('Entrada Financiamento Fatura Janeiro/2026 - Nubank')
      expect(entryCall.data.amount).toBe(-4000)
    })

    it('should create installment record with correct data', async () => {
      await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 4000,
        installments: 4,
        userId: 'user-123',
      })

      expect(mockedPrisma.installment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            description: 'Financiamento Fatura Janeiro/2026 - Nubank',
            totalAmount: 8000, // Carried amount
            totalInstallments: 4,
            installmentAmount: 2000,
            origin: 'Nubank',
            userId: 'user-123',
          }),
        })
      )
    })

    it('should create financing transactions for each installment', async () => {
      await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 4000,
        installments: 4,
        userId: 'user-123',
      })

      // 1 entry + 4 installments = 5 calls
      expect(mockedPrisma.transaction.create).toHaveBeenCalledTimes(5)

      // Check installment transactions (calls 1-4, 0 is entry)
      for (let i = 1; i <= 4; i++) {
        const installmentCall = mockedPrisma.transaction.create.mock.calls[i][0]
        expect(installmentCall.data.description).toBe(
          `Financiamento Fatura Janeiro/2026 - Nubank (${i}/4)`
        )
        expect(installmentCall.data.amount).toBe(-2000)
        expect(installmentCall.data.isInstallment).toBe(true)
        expect(installmentCall.data.installmentId).toBe('installment-id')
        expect(installmentCall.data.currentInstallment).toBe(i)
      }
    })

    it('should create installments in consecutive months starting from next month', async () => {
      await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 4000,
        installments: 4,
        userId: 'user-123',
      })

      // Check dates: Feb, Mar, Apr, May
      const expectedMonths = [1, 2, 3, 4] // 0-indexed: Feb, Mar, Apr, May
      for (let i = 1; i <= 4; i++) {
        const installmentCall = mockedPrisma.transaction.create.mock.calls[i][0]
        const date = installmentCall.data.date as Date
        expect(date.getMonth()).toBe(expectedMonths[i - 1])
        expect(date.getFullYear()).toBe(2026)
      }
    })

    it('should handle year rollover for installments', async () => {
      await generateFinancedPaymentTransactions({
        billMonth: 11, // November
        billYear: 2025,
        origin: 'Nubank',
        totalBillAmount: 6000,
        amountPaid: 1000,
        installments: 3,
        userId: 'user-123',
      })

      // Installments should be: Dec 2025, Jan 2026, Feb 2026
      const call1 = mockedPrisma.transaction.create.mock.calls[1][0]
      const date1 = call1.data.date as Date
      expect(date1.getMonth()).toBe(11) // December
      expect(date1.getFullYear()).toBe(2025)

      const call2 = mockedPrisma.transaction.create.mock.calls[2][0]
      const date2 = call2.data.date as Date
      expect(date2.getMonth()).toBe(0) // January
      expect(date2.getFullYear()).toBe(2026)

      const call3 = mockedPrisma.transaction.create.mock.calls[3][0]
      const date3 = call3.data.date as Date
      expect(date3.getMonth()).toBe(1) // February
      expect(date3.getFullYear()).toBe(2026)
    })

    it('should calculate interest and include in installment amounts', async () => {
      const result = await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 4000,
        installments: 4,
        interestRate: 10, // 10%
        userId: 'user-123',
      })

      // Principal: 8000, Interest: 800, Total: 8800
      // Installment: 8800 / 4 = 2200
      expect(result.amountCarried).toBe(8000)
      expect(result.interestAmount).toBe(800)
      expect(result.installmentAmount).toBe(2200)

      // Check installment record total includes interest
      expect(mockedPrisma.installment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            totalAmount: 8800,
            installmentAmount: 2200,
          }),
        })
      )
    })
  })

  describe('generateBillPaymentTransactions', () => {
    beforeEach(() => {
      mockedPrisma.transaction.create.mockImplementation(() =>
        Promise.resolve({ id: `tx-${Math.random().toString(36).substr(2, 9)}` })
      )
      mockedPrisma.installment.create.mockResolvedValue({ id: 'installment-id' })
    })

    it('should dispatch to partial payment handler for PARTIAL type', async () => {
      const result = await generateBillPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 10000,
        paymentType: 'PARTIAL',
        userId: 'user-123',
      })

      expect(result.entryTransactionId).toBeDefined()
      expect(result.carryoverTransactionId).toBeDefined()
      expect(result.installmentId).toBeUndefined()
    })

    it('should dispatch to financed payment handler for FINANCED type', async () => {
      const result = await generateBillPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 4000,
        paymentType: 'FINANCED',
        installments: 4,
        userId: 'user-123',
      })

      expect(result.entryTransactionId).toBeDefined()
      expect(result.installmentId).toBe('installment-id')
      expect(result.carryoverTransactionId).toBeUndefined()
    })

    it('should throw error for FINANCED without installments', async () => {
      await expect(
        generateBillPaymentTransactions({
          billMonth: 1,
          billYear: 2026,
          origin: 'Nubank',
          totalBillAmount: 12000,
          amountPaid: 4000,
          paymentType: 'FINANCED',
          userId: 'user-123',
        })
      ).rejects.toThrow('Numero de parcelas e obrigatorio para financiamento')
    })

    it('should throw error for invalid payment type', async () => {
      await expect(
        generateBillPaymentTransactions({
          billMonth: 1,
          billYear: 2026,
          origin: 'Nubank',
          totalBillAmount: 12000,
          amountPaid: 4000,
          paymentType: 'INVALID' as 'PARTIAL',
          userId: 'user-123',
        })
      ).rejects.toThrow('Tipo de pagamento invalido')
    })
  })

  describe('deleteBillPaymentTransactions', () => {
    it('should throw error if bill payment not found', async () => {
      mockedPrisma.billPayment.findFirst.mockResolvedValue(null)

      await expect(
        deleteBillPaymentTransactions('bp-123', 'user-123')
      ).rejects.toThrow('Pagamento de fatura nao encontrado')
    })

    it('should delete entry transaction if exists', async () => {
      mockedPrisma.billPayment.findFirst.mockResolvedValue({
        id: 'bp-123',
        entryTransactionId: 'entry-tx-id',
        carryoverTransactionId: null,
        installmentId: null,
      })
      mockedPrisma.transaction.delete.mockResolvedValue({ id: 'entry-tx-id' })

      await deleteBillPaymentTransactions('bp-123', 'user-123')

      expect(mockedPrisma.transaction.delete).toHaveBeenCalledWith({
        where: { id: 'entry-tx-id' },
      })
    })

    it('should delete carryover transaction if exists', async () => {
      mockedPrisma.billPayment.findFirst.mockResolvedValue({
        id: 'bp-123',
        entryTransactionId: 'entry-tx-id',
        carryoverTransactionId: 'carryover-tx-id',
        installmentId: null,
      })
      mockedPrisma.transaction.delete.mockResolvedValue({ id: 'tx-id' })

      await deleteBillPaymentTransactions('bp-123', 'user-123')

      expect(mockedPrisma.transaction.delete).toHaveBeenCalledWith({
        where: { id: 'carryover-tx-id' },
      })
    })

    it('should delete installment and its transactions if exists', async () => {
      mockedPrisma.billPayment.findFirst.mockResolvedValue({
        id: 'bp-123',
        entryTransactionId: 'entry-tx-id',
        carryoverTransactionId: null,
        installmentId: 'installment-id',
      })
      mockedPrisma.transaction.delete.mockResolvedValue({ id: 'tx-id' })
      mockedPrisma.transaction.deleteMany.mockResolvedValue({ count: 4 })
      mockedPrisma.installment.delete.mockResolvedValue({ id: 'installment-id' })

      await deleteBillPaymentTransactions('bp-123', 'user-123')

      expect(mockedPrisma.transaction.deleteMany).toHaveBeenCalledWith({
        where: { installmentId: 'installment-id', userId: 'user-123' },
      })
      expect(mockedPrisma.installment.delete).toHaveBeenCalledWith({
        where: { id: 'installment-id' },
      })
    })

    it('should not fail if transactions already deleted', async () => {
      mockedPrisma.billPayment.findFirst.mockResolvedValue({
        id: 'bp-123',
        entryTransactionId: 'entry-tx-id',
        carryoverTransactionId: 'carryover-tx-id',
        installmentId: null,
      })
      // Simulate already deleted transactions
      mockedPrisma.transaction.delete.mockRejectedValue(new Error('Not found'))

      // Should not throw
      await expect(
        deleteBillPaymentTransactions('bp-123', 'user-123')
      ).resolves.toBeUndefined()
    })
  })

  describe('softDeleteCarryoverTransaction', () => {
    it('should set deletedAt on the carryover transaction', async () => {
      const mockDate = new Date('2026-01-15T12:00:00')
      vi.setSystemTime(mockDate)

      mockedPrisma.transaction.update.mockResolvedValue({ id: 'carryover-tx-id' })

      await softDeleteCarryoverTransaction('carryover-tx-id', 'user-123')

      expect(mockedPrisma.transaction.update).toHaveBeenCalledWith({
        where: { id: 'carryover-tx-id', userId: 'user-123' },
        data: { deletedAt: expect.any(Date) },
      })

      vi.useRealTimers()
    })
  })

  describe('month formatting', () => {
    beforeEach(() => {
      mockedPrisma.transaction.create
        .mockResolvedValueOnce({ id: 'payment-tx-id' })
        .mockResolvedValueOnce({ id: 'carryover-tx-id' })
    })

    it('should format all month names correctly', async () => {
      const monthNames = [
        'Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
        'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
      ]

      for (let month = 1; month <= 12; month++) {
        vi.clearAllMocks()
        mockedPrisma.transaction.create
          .mockResolvedValueOnce({ id: 'payment-tx-id' })
          .mockResolvedValueOnce({ id: 'carryover-tx-id' })

        await generatePartialPaymentTransactions({
          billMonth: month,
          billYear: 2026,
          origin: 'Test',
          totalBillAmount: 1000,
          amountPaid: 500,
          userId: 'user-123',
        })

        const paymentCall = mockedPrisma.transaction.create.mock.calls[0][0]
        expect(paymentCall.data.description).toContain(monthNames[month - 1])
      }
    })
  })

  describe('edge cases - interest calculation', () => {
    beforeEach(() => {
      mockedPrisma.transaction.create.mockImplementation(() =>
        Promise.resolve({ id: `tx-${Math.random().toString(36).substr(2, 9)}` })
      )
      mockedPrisma.installment.create.mockResolvedValue({ id: 'installment-id' })
    })

    it('should handle null interest rate (no interest)', async () => {
      const result = await generatePartialPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 10000,
        amountPaid: 8000,
        interestRate: null,
        userId: 'user-123',
      })

      expect(result.interestAmount).toBe(0)
      expect(result.amountCarried).toBe(2000)

      const carryoverCall = mockedPrisma.transaction.create.mock.calls[1][0]
      expect(carryoverCall.data.amount).toBe(-2000) // No interest added
    })

    it('should handle undefined interest rate (no interest)', async () => {
      const result = await generatePartialPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 10000,
        amountPaid: 8000,
        userId: 'user-123',
      })

      expect(result.interestAmount).toBe(0)
      expect(result.amountCarried).toBe(2000)
    })

    it('should handle zero interest rate (no interest)', async () => {
      const result = await generatePartialPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 10000,
        amountPaid: 8000,
        interestRate: 0,
        userId: 'user-123',
      })

      expect(result.interestAmount).toBe(0)
      expect(result.amountCarried).toBe(2000)
    })

    it('should handle high interest rate for FINANCED payment', async () => {
      const result = await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 10000,
        amountPaid: 2000,
        installments: 4,
        interestRate: 50, // 50% interest
        userId: 'user-123',
      })

      // Principal: 8000, Interest: 4000 (50% of 8000), Total: 12000
      // Installment: 12000 / 4 = 3000
      expect(result.amountCarried).toBe(8000)
      expect(result.interestAmount).toBe(4000)
      expect(result.installmentAmount).toBe(3000)
    })

    it('should handle fractional interest amounts correctly', async () => {
      const result = await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 10000,
        amountPaid: 3000,
        installments: 3,
        interestRate: 15.5, // 15.5% interest
        userId: 'user-123',
      })

      // Principal: 7000, Interest: 1085 (15.5% of 7000), Total: 8085
      // Installment: 8085 / 3 = 2695
      expect(result.amountCarried).toBe(7000)
      expect(result.interestAmount).toBe(1085)
      expect(result.installmentAmount).toBeCloseTo(2695, 0)
    })
  })

  describe('edge cases - installment counts', () => {
    beforeEach(() => {
      mockedPrisma.transaction.create.mockImplementation(() =>
        Promise.resolve({ id: `tx-${Math.random().toString(36).substr(2, 9)}` })
      )
      mockedPrisma.installment.create.mockResolvedValue({ id: 'installment-id' })
    })

    it('should handle single installment (1)', async () => {
      const result = await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 5000,
        amountPaid: 1000,
        installments: 1,
        userId: 'user-123',
      })

      expect(result.installmentTransactionIds).toHaveLength(1)
      expect(result.installmentAmount).toBe(4000) // Full carried amount in one installment

      // Check transaction description
      const installmentCall = mockedPrisma.transaction.create.mock.calls[1][0]
      expect(installmentCall.data.description).toBe(
        'Financiamento Fatura Janeiro/2026 - Nubank (1/1)'
      )
    })

    it('should handle maximum installments (48)', async () => {
      const result = await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 48000,
        amountPaid: 0,
        installments: 48,
        userId: 'user-123',
      })

      expect(result.installmentTransactionIds).toHaveLength(48)
      expect(result.installmentAmount).toBe(1000) // 48000 / 48

      // 1 entry + 48 installments = 49 calls
      expect(mockedPrisma.transaction.create).toHaveBeenCalledTimes(49)
    })

    it('should handle 2 installments', async () => {
      const result = await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 6000,
        amountPaid: 2000,
        installments: 2,
        userId: 'user-123',
      })

      expect(result.installmentTransactionIds).toHaveLength(2)
      expect(result.installmentAmount).toBe(2000) // 4000 / 2

      // Check installment descriptions
      const call1 = mockedPrisma.transaction.create.mock.calls[1][0]
      expect(call1.data.description).toBe('Financiamento Fatura Janeiro/2026 - Nubank (1/2)')

      const call2 = mockedPrisma.transaction.create.mock.calls[2][0]
      expect(call2.data.description).toBe('Financiamento Fatura Janeiro/2026 - Nubank (2/2)')
    })
  })

  describe('edge cases - amounts', () => {
    beforeEach(() => {
      mockedPrisma.transaction.create.mockImplementation(() =>
        Promise.resolve({ id: `tx-${Math.random().toString(36).substr(2, 9)}` })
      )
      mockedPrisma.installment.create.mockResolvedValue({ id: 'installment-id' })
    })

    it('should handle zero entry payment (full financing)', async () => {
      const result = await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 12000,
        amountPaid: 0,
        installments: 4,
        userId: 'user-123',
      })

      expect(result.amountCarried).toBe(12000)
      expect(result.installmentAmount).toBe(3000)

      // Entry transaction should have amount 0 (or -0 which is equivalent for zero payments)
      const entryCall = mockedPrisma.transaction.create.mock.calls[0][0]
      // JavaScript: -Math.abs(0) produces -0, which is mathematically equal to 0
      expect(Object.is(entryCall.data.amount, 0) || Object.is(entryCall.data.amount, -0)).toBe(true)
    })

    it('should handle large amounts', async () => {
      const result = await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 1000000, // R$ 1,000,000
        amountPaid: 100000,
        installments: 12,
        userId: 'user-123',
      })

      expect(result.amountCarried).toBe(900000)
      expect(result.installmentAmount).toBe(75000)
    })

    it('should handle small amounts with cents', async () => {
      const result = await generatePartialPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 100.50,
        amountPaid: 50.25,
        userId: 'user-123',
      })

      expect(result.amountCarried).toBe(50.25)
    })

    it('should ensure amounts are negative for expenses', async () => {
      await generatePartialPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 1000,
        amountPaid: 600,
        userId: 'user-123',
      })

      const paymentCall = mockedPrisma.transaction.create.mock.calls[0][0]
      expect(paymentCall.data.amount).toBeLessThan(0)
      expect(paymentCall.data.amount).toBe(-600)

      const carryoverCall = mockedPrisma.transaction.create.mock.calls[1][0]
      expect(carryoverCall.data.amount).toBeLessThan(0)
      expect(carryoverCall.data.amount).toBe(-400)
    })
  })

  describe('edge cases - dates', () => {
    beforeEach(() => {
      mockedPrisma.transaction.create.mockImplementation(() =>
        Promise.resolve({ id: `tx-${Math.random().toString(36).substr(2, 9)}` })
      )
      mockedPrisma.installment.create.mockResolvedValue({ id: 'installment-id' })
    })

    it('should set date to day 15 to avoid timezone issues', async () => {
      await generatePartialPaymentTransactions({
        billMonth: 6,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 1000,
        amountPaid: 500,
        userId: 'user-123',
      })

      const paymentCall = mockedPrisma.transaction.create.mock.calls[0][0]
      const paymentDate = paymentCall.data.date as Date
      expect(paymentDate.getDate()).toBe(15)

      const carryoverCall = mockedPrisma.transaction.create.mock.calls[1][0]
      const carryoverDate = carryoverCall.data.date as Date
      expect(carryoverDate.getDate()).toBe(15)
    })

    it('should handle multiple year rollovers for long installment plans', async () => {
      await generateFinancedPaymentTransactions({
        billMonth: 6, // June 2025
        billYear: 2025,
        origin: 'Nubank',
        totalBillAmount: 24000,
        amountPaid: 0,
        installments: 24, // 2 years of installments
        userId: 'user-123',
      })

      // First installment: July 2025
      const firstCall = mockedPrisma.transaction.create.mock.calls[1][0]
      const firstDate = firstCall.data.date as Date
      expect(firstDate.getMonth()).toBe(6) // July
      expect(firstDate.getFullYear()).toBe(2025)

      // 7th installment: January 2026
      const seventhCall = mockedPrisma.transaction.create.mock.calls[7][0]
      const seventhDate = seventhCall.data.date as Date
      expect(seventhDate.getMonth()).toBe(0) // January
      expect(seventhDate.getFullYear()).toBe(2026)

      // 19th installment: January 2027
      const nineteenthCall = mockedPrisma.transaction.create.mock.calls[19][0]
      const nineteenthDate = nineteenthCall.data.date as Date
      expect(nineteenthDate.getMonth()).toBe(0) // January
      expect(nineteenthDate.getFullYear()).toBe(2027)

      // Last installment (24th): June 2027
      const lastCall = mockedPrisma.transaction.create.mock.calls[24][0]
      const lastDate = lastCall.data.date as Date
      expect(lastDate.getMonth()).toBe(5) // June
      expect(lastDate.getFullYear()).toBe(2027)
    })

    it('should set installment start date in next month', async () => {
      await generateFinancedPaymentTransactions({
        billMonth: 3, // March
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 6000,
        amountPaid: 1000,
        installments: 2,
        userId: 'user-123',
      })

      expect(mockedPrisma.installment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            startDate: expect.any(Date),
          }),
        })
      )

      const installmentCall = mockedPrisma.installment.create.mock.calls[0][0]
      const startDate = installmentCall.data.startDate as Date
      expect(startDate.getMonth()).toBe(3) // April (next month)
      expect(startDate.getFullYear()).toBe(2026)
    })
  })

  describe('edge cases - origins and descriptions', () => {
    beforeEach(() => {
      mockedPrisma.transaction.create.mockImplementation(() =>
        Promise.resolve({ id: `tx-${Math.random().toString(36).substr(2, 9)}` })
      )
      mockedPrisma.installment.create.mockResolvedValue({ id: 'installment-id' })
    })

    it('should include origin in all transaction descriptions', async () => {
      await generatePartialPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'C6 Bank',
        totalBillAmount: 1000,
        amountPaid: 500,
        userId: 'user-123',
      })

      const paymentCall = mockedPrisma.transaction.create.mock.calls[0][0]
      expect(paymentCall.data.description).toContain('C6 Bank')
      expect(paymentCall.data.origin).toBe('C6 Bank')

      const carryoverCall = mockedPrisma.transaction.create.mock.calls[1][0]
      expect(carryoverCall.data.description).toContain('C6 Bank')
      expect(carryoverCall.data.origin).toBe('C6 Bank')
    })

    it('should handle origin with special characters', async () => {
      await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Itau Uniclass',
        totalBillAmount: 3000,
        amountPaid: 1000,
        installments: 2,
        userId: 'user-123',
      })

      const entryCall = mockedPrisma.transaction.create.mock.calls[0][0]
      expect(entryCall.data.description).toBe('Entrada Financiamento Fatura Janeiro/2026 - Itau Uniclass')
    })

    it('should pass origin to installment record', async () => {
      await generateFinancedPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'BTG Pactual',
        totalBillAmount: 3000,
        amountPaid: 1000,
        installments: 2,
        userId: 'user-123',
      })

      expect(mockedPrisma.installment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            origin: 'BTG Pactual',
          }),
        })
      )
    })
  })

  describe('generateBillPaymentTransactions - additional edge cases', () => {
    beforeEach(() => {
      mockedPrisma.transaction.create.mockImplementation(() =>
        Promise.resolve({ id: `tx-${Math.random().toString(36).substr(2, 9)}` })
      )
      mockedPrisma.installment.create.mockResolvedValue({ id: 'installment-id' })
    })

    it('should throw error for FINANCED with zero installments', async () => {
      await expect(
        generateBillPaymentTransactions({
          billMonth: 1,
          billYear: 2026,
          origin: 'Nubank',
          totalBillAmount: 12000,
          amountPaid: 4000,
          paymentType: 'FINANCED',
          installments: 0,
          userId: 'user-123',
        })
      ).rejects.toThrow('Numero de parcelas e obrigatorio para financiamento')
    })

    it('should throw error for FINANCED with negative installments', async () => {
      await expect(
        generateBillPaymentTransactions({
          billMonth: 1,
          billYear: 2026,
          origin: 'Nubank',
          totalBillAmount: 12000,
          amountPaid: 4000,
          paymentType: 'FINANCED',
          installments: -1,
          userId: 'user-123',
        })
      ).rejects.toThrow('Numero de parcelas e obrigatorio para financiamento')
    })

    it('should pass interest rate to PARTIAL handler', async () => {
      const result = await generateBillPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 10000,
        amountPaid: 8000,
        paymentType: 'PARTIAL',
        interestRate: 5,
        userId: 'user-123',
      })

      expect(result.interestAmount).toBe(100) // 5% of 2000 carried
    })

    it('should pass interest rate to FINANCED handler', async () => {
      const result = await generateBillPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 10000,
        amountPaid: 2000,
        paymentType: 'FINANCED',
        installments: 4,
        interestRate: 10,
        userId: 'user-123',
      })

      expect(result.interestAmount).toBe(800) // 10% of 8000 carried
    })

    it('should pass categoryId to handlers', async () => {
      await generateBillPaymentTransactions({
        billMonth: 1,
        billYear: 2026,
        origin: 'Nubank',
        totalBillAmount: 5000,
        amountPaid: 3000,
        paymentType: 'PARTIAL',
        categoryId: 'category-bills',
        userId: 'user-123',
      })

      const paymentCall = mockedPrisma.transaction.create.mock.calls[0][0]
      expect(paymentCall.data.categoryId).toBe('category-bills')
    })
  })
})
