import { describe, it, expect } from 'vitest'
import { cn, formatCurrency, formatDate, parseDate } from './utils'

describe('cn (class name merge)', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle undefined and null values', () => {
    expect(cn('foo', undefined, 'bar', null)).toBe('foo bar')
  })

  it('should handle conditional classes', () => {
    expect(cn('base', false && 'hidden', true && 'visible')).toBe('base visible')
  })

  it('should resolve Tailwind conflicts (last wins)', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })

  it('should handle array inputs', () => {
    expect(cn(['foo', 'bar'])).toBe('foo bar')
  })

  it('should handle object inputs', () => {
    expect(cn({ foo: true, bar: false, baz: true })).toBe('foo baz')
  })

  it('should handle mixed inputs', () => {
    expect(cn('base', ['array-class'], { 'object-class': true })).toBe('base array-class object-class')
  })

  it('should handle empty inputs', () => {
    expect(cn()).toBe('')
    expect(cn('')).toBe('')
  })
})

describe('formatCurrency', () => {
  // Helper to normalize whitespace (Intl may use non-breaking space)
  const normalize = (str: string) => str.replace(/\s/g, ' ')

  it('should format positive values in BRL', () => {
    expect(normalize(formatCurrency(1234.56))).toBe('R$ 1.234,56')
  })

  it('should format zero', () => {
    expect(normalize(formatCurrency(0))).toBe('R$ 0,00')
  })

  it('should format large values', () => {
    expect(normalize(formatCurrency(1000000))).toBe('R$ 1.000.000,00')
  })

  it('should format negative values', () => {
    const result = normalize(formatCurrency(-500))
    // Brazilian format may use different minus signs
    expect(result).toMatch(/-?\s?R\$\s?500,00/)
  })

  it('should handle decimal precision', () => {
    expect(normalize(formatCurrency(10.1))).toBe('R$ 10,10')
    expect(normalize(formatCurrency(10.999))).toBe('R$ 11,00') // Rounds
  })

  it('should format small values', () => {
    expect(normalize(formatCurrency(0.01))).toBe('R$ 0,01')
    expect(normalize(formatCurrency(0.99))).toBe('R$ 0,99')
  })

  it('should format values with many decimals', () => {
    expect(normalize(formatCurrency(123.456789))).toBe('R$ 123,46')
  })
})

describe('formatDate', () => {
  it('should format Date object as DD/MM/YYYY', () => {
    // Use UTC to avoid timezone issues
    const date = new Date(Date.UTC(2024, 0, 15)) // January 15, 2024
    const result = formatDate(date)
    expect(result).toBe('15/01/2024')
  })

  it('should format ISO string date', () => {
    const result = formatDate('2024-12-25')
    expect(result).toBe('25/12/2024')
  })

  it('should handle end of month dates', () => {
    const date = new Date(Date.UTC(2024, 1, 29)) // Feb 29, 2024 (leap year)
    const result = formatDate(date)
    expect(result).toBe('29/02/2024')
  })

  it('should handle year boundaries', () => {
    const date = new Date(Date.UTC(2024, 11, 31)) // Dec 31, 2024
    const result = formatDate(date)
    expect(result).toBe('31/12/2024')
  })
})

describe('parseDate', () => {
  it('should parse DD/MM/YYYY format', () => {
    const result = parseDate('15/01/2024')
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(0) // January = 0
    expect(result.getDate()).toBe(15)
  })

  it('should parse ISO format (YYYY-MM-DD)', () => {
    const result = parseDate('2024-06-20')
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(5) // June = 5
    expect(result.getDate()).toBe(20)
  })

  it('should parse various DD/MM/YYYY dates', () => {
    // First day of year
    let result = parseDate('01/01/2024')
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(0)
    expect(result.getDate()).toBe(1)

    // Last day of year
    result = parseDate('31/12/2024')
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(11)
    expect(result.getDate()).toBe(31)

    // Leap year date
    result = parseDate('29/02/2024')
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(1)
    expect(result.getDate()).toBe(29)
  })

  it('should handle single digit day/month in DD/MM/YYYY', () => {
    const result = parseDate('5/3/2024')
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(2) // March = 2
    expect(result.getDate()).toBe(5)
  })
})
