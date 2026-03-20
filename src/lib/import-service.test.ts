import { describe, it, expect } from 'vitest'
import { replaceInstallmentNumber } from './import-service'

describe('replaceInstallmentNumber', () => {
  it('should replace "- Parcela X/Y" format', () => {
    expect(replaceInstallmentNumber('LOJA XYZ - Parcela 3/10', 5, 10))
      .toBe('LOJA XYZ - Parcela 5/10')
  })

  it('should replace "Parcela X/Y" format', () => {
    expect(replaceInstallmentNumber('LOJA XYZ Parcela 3/10', 5, 10))
      .toBe('LOJA XYZ Parcela 5/10')
  })

  it('should replace "PARC X/Y" format', () => {
    expect(replaceInstallmentNumber('LOJA XYZ PARC 3/10', 5, 10))
      .toBe('LOJA XYZ PARC 5/10')
  })

  it('should replace "PARC X DE Y" format', () => {
    expect(replaceInstallmentNumber('LOJA XYZ PARC 3 DE 10', 5, 10))
      .toBe('LOJA XYZ PARC 5 DE 10')
  })

  it('should replace "PARCELA X DE Y" format', () => {
    expect(replaceInstallmentNumber('COMPRA PARCELA 3 DE 6', 4, 6))
      .toBe('COMPRA PARCELA 4 DE 6')
  })

  it('should replace "Parcela X DE Y" case insensitive', () => {
    expect(replaceInstallmentNumber('LOJA Parcela 2 de 12', 3, 12))
      .toBe('LOJA Parcela 3 de 12')
  })

  it('should replace trailing "X/Y" format', () => {
    expect(replaceInstallmentNumber('LOJA XYZ 3/10', 5, 10))
      .toBe('LOJA XYZ 5/10')
  })

  it('should handle case insensitivity', () => {
    expect(replaceInstallmentNumber('LOJA XYZ - parcela 3/10', 5, 10))
      .toBe('LOJA XYZ - parcela 5/10')
  })

  it('should fallback to appending when no pattern found', () => {
    expect(replaceInstallmentNumber('COMPRA AVISTA', 2, 5))
      .toBe('COMPRA AVISTA (2/5)')
  })

  it('should handle single digit installments', () => {
    expect(replaceInstallmentNumber('LOJA - Parcela 1/3', 2, 3))
      .toBe('LOJA - Parcela 2/3')
  })
})
