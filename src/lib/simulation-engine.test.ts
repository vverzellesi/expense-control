import { describe, it, expect } from 'vitest'
import { calculateSimulation, generateScenarios } from './simulation-engine'
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

describe('generateScenarios', () => {
  describe('scenario generation', () => {
    it('generates 3 scenarios: a vista, chosen, and long-term', () => {
      const baseline = makeBaseline(24)
      const scenarios = generateScenarios(3000, 6, baseline, 5000)

      expect(scenarios).toHaveLength(3)
      expect(scenarios[0].name).toBe('A vista')
      expect(scenarios[0].totalInstallments).toBe(1)
      expect(scenarios[0].monthlyAmount).toBe(3000)

      expect(scenarios[1].name).toBe('6x (escolhido)')
      expect(scenarios[1].totalInstallments).toBe(6)
      expect(scenarios[1].monthlyAmount).toBe(500)
      expect(scenarios[1].isOriginal).toBe(true)

      expect(scenarios[2].name).toBe('12x')
      expect(scenarios[2].totalInstallments).toBe(12)
      expect(scenarios[2].monthlyAmount).toBe(250)
    })

    it('marks the original scenario (index 1) as isOriginal', () => {
      const baseline = makeBaseline(24)
      const scenarios = generateScenarios(3000, 6, baseline, 5000)

      expect(scenarios[0].isOriginal).toBe(false)
      expect(scenarios[1].isOriginal).toBe(true)
      expect(scenarios[2].isOriginal).toBe(false)
    })

    it('caps long-term installments at 24', () => {
      const baseline = makeBaseline(24)
      const scenarios = generateScenarios(6000, 18, baseline, 5000)

      // 18 * 2 = 36, but capped at 24
      const longScenario = scenarios[2]
      expect(longScenario.totalInstallments).toBe(24)
    })

    it('generates only 2 scenarios when long installments equals chosen', () => {
      const baseline = makeBaseline(24)
      // 1x: a vista, chosen is 1x => long would be 2 but != 1, so 3 scenarios
      // Actually: if totalInstallments=12, long=24 => 3 scenarios
      // If totalInstallments=12, long=min(24,24)=24, 24 != 12 => 3 scenarios
      // If totalInstallments=1, long=min(2,24)=2, 2 != 1 => still 3
      // To get 2 scenarios: need totalInstallments > 1 AND longInstallments == totalInstallments
      // That means: min(totalInstallments*2, 24) == totalInstallments
      // Only possible if totalInstallments >= 24 (since *2 => 48 capped to 24, but 24 != 48)
      // Actually: min(24*2, 24) = 24 == 24 => only 2 scenarios for installments=24
      const scenarios = generateScenarios(6000, 24, baseline, 5000)
      expect(scenarios).toHaveLength(2)
      expect(scenarios[0].name).toBe('A vista')
      expect(scenarios[1].name).toBe('24x (escolhido)')
    })
  })

  describe('risk and recommendation badges', () => {
    it('marks scenario as hasRisk when any month has negative free balance', () => {
      // Income 5000, expenses 4800 => free 200 before simulation
      // A vista: 3000 added to month 1 => 4800+3000=7800 > 5000 => risk
      const baseline = makeBaseline(12, 4800)
      const scenarios = generateScenarios(3000, 6, baseline, 5000)

      expect(scenarios[0].hasRisk).toBe(true) // A vista: 3000 in one month
    })

    it('marks recommended scenario as the one with highest minimum free balance', () => {
      const baseline = makeBaseline(24, 3000)
      const scenarios = generateScenarios(3000, 6, baseline, 5000)

      // Longer installments have smaller monthly amount => higher minimum free balance
      // 12x: 250/month => tightest = 5000 - 3000 - 250 = 1750
      // 6x:  500/month => tightest = 5000 - 3000 - 500 = 1500
      // 1x: 3000/month1 => tightest = 5000 - 3000 - 3000 = -1000
      // The 12x scenario should be recommended (highest min free balance)
      const recommended = scenarios.find((s) => s.isRecommended)
      expect(recommended).toBeDefined()
      expect(recommended!.totalInstallments).toBe(12)
    })

    it('only one scenario is marked as recommended', () => {
      const baseline = makeBaseline(24, 3000)
      const scenarios = generateScenarios(3000, 6, baseline, 5000)

      const recommendedCount = scenarios.filter((s) => s.isRecommended).length
      expect(recommendedCount).toBe(1)
    })
  })

  describe('edge cases', () => {
    it('returns empty array when totalAmount is 0', () => {
      const baseline = makeBaseline(12)
      const scenarios = generateScenarios(0, 6, baseline, 5000)
      expect(scenarios).toHaveLength(0)
    })

    it('returns empty array when totalInstallments is 0', () => {
      const baseline = makeBaseline(12)
      const scenarios = generateScenarios(3000, 0, baseline, 5000)
      expect(scenarios).toHaveLength(0)
    })

    it('returns empty array when totalAmount is negative', () => {
      const baseline = makeBaseline(12)
      const scenarios = generateScenarios(-1000, 6, baseline, 5000)
      expect(scenarios).toHaveLength(0)
    })

    it('includes avgCommitment from calculateSimulation', () => {
      const baseline = makeBaseline(24, 3000)
      const scenarios = generateScenarios(3000, 6, baseline, 5000)

      // Each scenario should have a numeric avgCommitment
      scenarios.forEach((s) => {
        expect(typeof s.avgCommitment).toBe('number')
        expect(s.avgCommitment).toBeGreaterThan(0)
      })
    })

    it('includes tightestMonth info from calculateSimulation', () => {
      const baseline = makeBaseline(24, 3000)
      const scenarios = generateScenarios(3000, 6, baseline, 5000)

      scenarios.forEach((s) => {
        expect(s.tightestMonth).not.toBeNull()
        expect(s.tightestMonth!.label).toBeDefined()
        expect(typeof s.tightestMonth!.freeBalance).toBe('number')
      })
    })
  })
})
