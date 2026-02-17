import { describe, it, expect } from 'vitest'
import { calculateSimulation } from './simulation-engine'
import type { BaselineMonth } from '@/types'

function makeBaseline(count: number, currentExpenses = 3000): BaselineMonth[] {
  return Array.from({ length: count }, (_, i) => ({
    month: ((new Date().getMonth() + i) % 12) + 1,
    year: 2026,
    label: `Mes ${i + 1}`,
    currentExpenses,
    recurringExpenses: 2000,
    installmentsTotal: 1000,
  }))
}

describe('calculateSimulation', () => {
  describe('basic installment calculation', () => {
    it('distributes totalAmount across installments correctly', () => {
      const baseline = makeBaseline(12)
      const result = calculateSimulation(baseline, 5000, [
        { totalAmount: 3000, totalInstallments: 6, isActive: true },
      ])

      expect(result.monthlyInstallment).toBe(500)
    })

    it('adds simulationExpenses only to months within installment range', () => {
      const baseline = makeBaseline(12)
      const result = calculateSimulation(baseline, 5000, [
        { totalAmount: 3000, totalInstallments: 6, isActive: true },
      ])

      // First 6 months should have simulation expenses
      for (let i = 0; i < 6; i++) {
        expect(result.months[i].simulationExpenses).toBe(500)
      }
      // Months 7-12 should have no simulation expenses
      for (let i = 6; i < 12; i++) {
        expect(result.months[i].simulationExpenses).toBe(0)
      }
    })
  })

  describe('tightest month calculation', () => {
    it('finds the month with lowest free balance among impacted months', () => {
      const baseline = makeBaseline(12, 3000)
      const result = calculateSimulation(baseline, 5000, [
        { totalAmount: 6000, totalInstallments: 3, isActive: true },
      ])

      // 2000/month installment, 3000 expenses => freeBalance = 5000 - 3000 - 2000 = 0
      expect(result.tightestMonth).not.toBeNull()
      expect(result.tightestMonth!.freeBalance).toBe(0)
    })

    it('returns null tightestMonth when no simulations are active', () => {
      const baseline = makeBaseline(12)
      const result = calculateSimulation(baseline, 5000, [])

      expect(result.tightestMonth).toBeNull()
    })
  })

  describe('commitment percentages', () => {
    it('calculates commitmentBefore as average baseline expenses / income', () => {
      const baseline = makeBaseline(12, 3000)
      const result = calculateSimulation(baseline, 5000, [
        { totalAmount: 3000, totalInstallments: 6, isActive: true },
      ])

      // 3000 / 5000 = 60%
      expect(result.commitmentBefore).toBe(60)
    })

    it('calculates commitmentAfter as average total expenses over impacted months / income', () => {
      const baseline = makeBaseline(12, 3000)
      const result = calculateSimulation(baseline, 5000, [
        { totalAmount: 6000, totalInstallments: 3, isActive: true },
      ])

      // Impacted months: 3000 + 2000 = 5000 total expenses each
      // 5000 / 5000 = 100%
      expect(result.commitmentAfter).toBe(100)
    })
  })

  describe('multiple simulations', () => {
    it('sums installments from all active simulations per month', () => {
      const baseline = makeBaseline(12)
      const result = calculateSimulation(baseline, 5000, [
        { totalAmount: 1200, totalInstallments: 6, isActive: true },
        { totalAmount: 600, totalInstallments: 3, isActive: true },
      ])

      // Month 0: 1200/6 + 600/3 = 200 + 200 = 400
      expect(result.months[0].simulationExpenses).toBe(400)
      // Month 3: only first simulation still active: 200
      expect(result.months[3].simulationExpenses).toBe(200)
      // Month 6+: no simulation
      expect(result.months[6].simulationExpenses).toBe(0)
    })

    it('ignores inactive simulations', () => {
      const baseline = makeBaseline(12)
      const result = calculateSimulation(baseline, 5000, [
        { totalAmount: 3000, totalInstallments: 6, isActive: true },
        { totalAmount: 9000, totalInstallments: 3, isActive: false },
      ])

      expect(result.monthlyInstallment).toBe(500)
      expect(result.months[0].simulationExpenses).toBe(500)
    })
  })

  describe('edge cases', () => {
    it('handles zero averageIncome without division by zero', () => {
      const baseline = makeBaseline(12)
      const result = calculateSimulation(baseline, 0, [
        { totalAmount: 3000, totalInstallments: 6, isActive: true },
      ])

      expect(result.commitmentBefore).toBe(0)
      expect(result.commitmentAfter).toBe(0)
      result.months.forEach((m) => {
        expect(m.commitmentPercent).toBe(0)
      })
    })

    it('handles simulation with zero installments gracefully', () => {
      const baseline = makeBaseline(12)
      const result = calculateSimulation(baseline, 5000, [
        { totalAmount: 3000, totalInstallments: 0, isActive: true },
      ])

      // Should skip this simulation (guard against division by zero)
      expect(result.monthlyInstallment).toBe(0)
      result.months.forEach((m) => {
        expect(m.simulationExpenses).toBe(0)
      })
    })

    it('sets isOverBudget when total expenses exceed income', () => {
      const baseline = makeBaseline(12, 4500)
      const result = calculateSimulation(baseline, 5000, [
        { totalAmount: 6000, totalInstallments: 6, isActive: true },
      ])

      // 4500 + 1000 = 5500 > 5000
      expect(result.months[0].isOverBudget).toBe(true)
      expect(result.months[0].freeBalance).toBe(-500)
    })

    it('computes totalWithSimulation correctly', () => {
      const baseline = makeBaseline(12, 3000)
      const result = calculateSimulation(baseline, 5000, [
        { totalAmount: 3000, totalInstallments: 6, isActive: true },
      ])

      expect(result.months[0].totalWithSimulation).toBe(3500) // 3000 + 500
    })

    it('handles empty baseline array', () => {
      const result = calculateSimulation([], 5000, [
        { totalAmount: 3000, totalInstallments: 6, isActive: true },
      ])

      expect(result.months).toHaveLength(0)
      expect(result.tightestMonth).toBeNull()
      expect(result.commitmentBefore).toBe(0)
    })
  })
})
