import { describe, it, expect, vi, beforeEach } from 'vitest'
import { parseCSV, detectBankFromContent, isC6ExchangeRateRow, detectStatementType, detectOriginFromCSV } from './csv-parser'

// Mock the categorizer module
vi.mock('./categorizer', () => ({
  suggestCategory: vi.fn().mockResolvedValue(null),
  detectInstallment: vi.fn().mockReturnValue({ isInstallment: false })
}))

// Import the mocked functions to control them in tests
import { suggestCategory, detectInstallment } from './categorizer'

describe('detectBankFromContent', () => {
  it('should detect C6 Bank', () => {
    expect(detectBankFromContent('C6 Bank Statement')).toBe('Cartão C6')
    expect(detectBankFromContent('c6bank monthly')).toBe('Cartão C6')
  })

  it('should detect Itau', () => {
    expect(detectBankFromContent('Itau Unibanco')).toBe('Cartão Itaú')
    expect(detectBankFromContent('ITAÚ BANKLINE')).toBe('Cartão Itaú')
  })

  it('should detect BTG', () => {
    expect(detectBankFromContent('BTG Pactual')).toBe('Cartão BTG')
  })

  it('should return default for unknown banks', () => {
    expect(detectBankFromContent('Unknown Bank Statement')).toBe('Importação CSV')
    expect(detectBankFromContent('')).toBe('Importação CSV')
  })

  it('should be case insensitive', () => {
    expect(detectBankFromContent('c6 BANK')).toBe('Cartão C6')
    expect(detectBankFromContent('ITAU')).toBe('Cartão Itaú')
    expect(detectBankFromContent('btg')).toBe('Cartão BTG')
  })
})

describe('isC6ExchangeRateRow', () => {
  it('should detect cotação variants', () => {
    expect(isC6ExchangeRateRow('Cotação do Dólar')).toBe(true)
    expect(isC6ExchangeRateRow('COTACAO USD')).toBe(true)
    expect(isC6ExchangeRateRow('cotação usd: r$5,43')).toBe(true)
  })

  it('should detect CUUSD/CUEUR', () => {
    expect(isC6ExchangeRateRow('CUUSD 20.00')).toBe(true)
    expect(isC6ExchangeRateRow('CUEUR 15.00')).toBe(true)
  })

  it('should detect spread rows', () => {
    expect(isC6ExchangeRateRow('SPREAD OPENAI')).toBe(true)
    expect(isC6ExchangeRateRow('Spread cambial')).toBe(true)
  })

  it('should NOT detect regular transactions', () => {
    expect(isC6ExchangeRateRow('OPENAI *CHATGPT SUBSCR SA')).toBe(false)
    expect(isC6ExchangeRateRow('IOF Transações Exterior')).toBe(false)
    expect(isC6ExchangeRateRow('NETFLIX.COM')).toBe(false)
    expect(isC6ExchangeRateRow('SUPERMERCADO XYZ')).toBe(false)
  })
})

describe('detectOriginFromCSV', () => {
  it('should detect C6 fatura', () => {
    const result = detectOriginFromCSV('C6 Bank fatura', ['Data', 'Descricao', 'Valor', 'Categoria'])
    expect(result.origin).toBe('Cartão C6')
    expect(result.bank).toBe('C6')
    expect(result.statementType).toBe('fatura')
  })

  it('should detect C6 extrato', () => {
    const result = detectOriginFromCSV('C6 Bank extrato', ['Data', 'Descricao', 'Valor', 'Saldo'])
    expect(result.origin).toBe('Extrato C6')
    expect(result.bank).toBe('C6')
    expect(result.statementType).toBe('extrato')
  })

  it('should detect Itaú extrato by Lancamento column', () => {
    const result = detectOriginFromCSV('Itau Bankline', ['Data', 'Lancamento', 'Valor'])
    expect(result.origin).toBe('Extrato Itaú')
    expect(result.statementType).toBe('extrato')
  })

  it('should detect BTG extrato by Historico column', () => {
    const result = detectOriginFromCSV('BTG Pactual', ['Data', 'Historico', 'Valor'])
    expect(result.origin).toBe('Extrato BTG')
    expect(result.statementType).toBe('extrato')
  })

  it('should return "Importação CSV" for unknown bank', () => {
    const result = detectOriginFromCSV('Unknown Bank', ['Data', 'Descricao', 'Valor'])
    expect(result.origin).toBe('Importação CSV')
    expect(result.bank).toBeNull()
  })
})

describe('detectStatementType', () => {
  it('should detect fatura when "Categoria" column exists', () => {
    expect(detectStatementType(['Data', 'Descricao', 'Valor', 'Categoria'])).toBe('fatura')
  })

  it('should detect fatura when "Estabelecimento" column exists', () => {
    expect(detectStatementType(['Data', 'Estabelecimento', 'Valor'])).toBe('fatura')
  })

  it('should detect extrato when "Saldo" column exists', () => {
    expect(detectStatementType(['Data', 'Descricao', 'Valor', 'Saldo'])).toBe('extrato')
  })

  it('should detect extrato when "Lancamento" column exists', () => {
    expect(detectStatementType(['Data', 'Lancamento', 'Valor'])).toBe('extrato')
  })

  it('should detect extrato when "Historico" column exists (BTG)', () => {
    expect(detectStatementType(['Data', 'Historico', 'Valor'])).toBe('extrato')
  })

  it('should be case insensitive', () => {
    expect(detectStatementType(['DATA', 'DESCRICAO', 'VALOR', 'CATEGORIA'])).toBe('fatura')
    expect(detectStatementType(['data', 'lancamento', 'valor'])).toBe('extrato')
  })

  it('should default to fatura for generic columns', () => {
    expect(detectStatementType(['Data', 'Descricao', 'Valor'])).toBe('fatura')
  })
})

describe('parseCSV', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset mocks to default behavior
    vi.mocked(suggestCategory).mockResolvedValue(null)
    vi.mocked(detectInstallment).mockReturnValue({ isInstallment: false })
  })

  describe('C6 Bank format', () => {
    it('should parse C6 CSV with standard columns', async () => {
      // Brazilian format: . for thousands, , for decimals
      const csv = `Data,Descricao,Valor,Categoria
15/01/2024,NETFLIX.COM,"-39,90",Servicos
16/01/2024,SUPERMERCADO XYZ,"-150,00",Mercado`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(2)
      expect(result[0].description).toBe('NETFLIX.COM')
      expect(result[0].amount).toBe(-39.90)
      expect(result[1].description).toBe('SUPERMERCADO XYZ')
      expect(result[1].amount).toBe(-150.00)
    })

    it('should handle Brazilian number format (1.234,56)', async () => {
      const csv = `Data,Descricao,Valor
15/01/2024,COMPRA GRANDE,"1.234,56"`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].amount).toBe(-1234.56) // Converted to negative for expenses
    })

    it('should handle values with thousands separator', async () => {
      const csv = `Data,Descricao,Valor
15/01/2024,SALARIO,"10.500,00"`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].amount).toBe(-10500.00)
    })

    it('should parse dates correctly', async () => {
      const csv = `Data,Descricao,Valor
31/12/2024,COMPRA,"-100,00"`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      const date = result[0].date
      expect(date.getFullYear()).toBe(2024)
      expect(date.getMonth()).toBe(11) // December = 11
      expect(date.getDate()).toBe(31)
    })
  })

  describe('Itau format', () => {
    it('should parse Itau CSV with lancamento column', async () => {
      const csv = `Data,Lancamento,Valor
15/01/2024,PIX RECEBIDO,"-200,00"
16/01/2024,COMPRA DEBITO,"-50,00"`

      const result = await parseCSV(csv, 'Cartão Itaú')

      expect(result).toHaveLength(2)
      expect(result[0].description).toBe('PIX RECEBIDO')
      expect(result[1].description).toBe('COMPRA DEBITO')
    })
  })

  describe('BTG format', () => {
    it('should parse BTG CSV with historico column', async () => {
      const csv = `Data,Historico,Valor
15/01/2024,TED ENVIADA,"-1.000,00"
16/01/2024,RENDIMENTO CDB,"50,00"`

      const result = await parseCSV(csv, 'Cartão BTG')

      expect(result).toHaveLength(2)
      expect(result[0].description).toBe('TED ENVIADA')
      expect(result[1].description).toBe('RENDIMENTO CDB')
    })
  })

  describe('installment detection', () => {
    it('should detect installments and include info', async () => {
      vi.mocked(detectInstallment).mockReturnValue({
        isInstallment: true,
        currentInstallment: 3,
        totalInstallments: 10
      })

      const csv = `Data,Descricao,Valor
15/01/2024,LOJA XYZ 3/10,"-100,00"`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].isInstallment).toBe(true)
      expect(result[0].currentInstallment).toBe(3)
      expect(result[0].totalInstallments).toBe(10)
    })

    it('should mark non-installment transactions', async () => {
      vi.mocked(detectInstallment).mockReturnValue({ isInstallment: false })

      const csv = `Data,Descricao,Valor
15/01/2024,COMPRA AVISTA,"-100,00"`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].isInstallment).toBe(false)
      expect(result[0].currentInstallment).toBeUndefined()
      expect(result[0].totalInstallments).toBeUndefined()
    })
  })

  describe('category suggestion', () => {
    it('should include suggested category when found', async () => {
      vi.mocked(suggestCategory).mockResolvedValue({
        id: 'cat-services',
        name: 'Serviços',
        color: '#FF0000',
        userId: 'user-1'
      })

      const csv = `Data,Descricao,Valor
15/01/2024,NETFLIX,"-39,90"`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].suggestedCategoryId).toBe('cat-services')
    })

    it('should handle no category suggestion', async () => {
      vi.mocked(suggestCategory).mockResolvedValue(null)

      const csv = `Data,Descricao,Valor
15/01/2024,RANDOM VENDOR,"-100,00"`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].suggestedCategoryId).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('should handle empty CSV', async () => {
      const csv = `Data,Descricao,Valor`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(0)
    })

    it('should skip rows with missing required fields', async () => {
      const csv = `Data,Descricao,Valor
15/01/2024,VALID,"-100,00"
,MISSING DATE,"-50,00"
16/01/2024,,"-25,00"`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('VALID')
    })

    it('should skip rows with invalid amounts', async () => {
      const csv = `Data,Descricao,Valor
15/01/2024,VALID,"-100,00"
16/01/2024,INVALID,abc`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('VALID')
    })

    it('should reject unknown bank format', async () => {
      const csv = `Unknown,Columns,Here
value1,value2,value3`

      await expect(parseCSV(csv, 'Unknown')).rejects.toThrow(
        'Formato de arquivo não reconhecido'
      )
    })

    it('should handle values with spaces', async () => {
      const csv = `Data,Descricao,Valor
15/01/2024,  TRIMMED DESCRIPTION  ,"-100,00"`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('TRIMMED DESCRIPTION')
    })

    it('should convert all amounts to negative (credit card expenses)', async () => {
      const csv = `Data,Descricao,Valor
15/01/2024,COMPRA,"100,00"
16/01/2024,OUTRA COMPRA,"-50,00"`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(2)
      expect(result[0].amount).toBe(-100.00) // Positive converted to negative
      expect(result[1].amount).toBe(-50.00) // Already negative
    })
  })

  describe('C6 international transactions', () => {
    it('should skip exchange rate informational rows (Cotação)', async () => {
      const csv = `Data,Descricao,Valor,Categoria
24/02/2024,OPENAI *CHATGPT SUBSCR SA,"-108,68",Servicos
24/02/2024,Cotação do Dólar,"-5,43",
24/02/2024,IOF Transações Exterior,"-3,80",`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(2)
      expect(result[0].description).toBe('OPENAI *CHATGPT SUBSCR SA')
      expect(result[0].amount).toBe(-108.68)
      expect(result[1].description).toBe('IOF Transações Exterior')
      expect(result[1].amount).toBe(-3.80)
    })

    it('should skip CUUSD/CUEUR currency info rows', async () => {
      const csv = `Data,Descricao,Valor,Categoria
24/02/2024,OPENAI *CHATGPT SUBSCR SA,"-108,68",Servicos
24/02/2024,CUUSD 20.00,"-5,43",`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('OPENAI *CHATGPT SUBSCR SA')
      expect(result[0].amount).toBe(-108.68)
    })

    it('should skip spread rows', async () => {
      const csv = `Data,Descricao,Valor,Categoria
24/02/2024,OPENAI *CHATGPT SUBSCR SA,"-108,68",Servicos
24/02/2024,SPREAD OPENAI,"-2,15",`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('OPENAI *CHATGPT SUBSCR SA')
    })

    it('should keep IOF rows as real transactions', async () => {
      const csv = `Data,Descricao,Valor,Categoria
24/02/2024,IOF Transações Exterior,"-3,80",`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('IOF Transações Exterior')
      expect(result[0].amount).toBe(-3.80)
    })

    it('should handle multiple international transactions in same CSV', async () => {
      const csv = `Data,Descricao,Valor,Categoria
24/02/2024,OPENAI *CHATGPT SUBSCR SA,"-108,68",Servicos
24/02/2024,Cotação do Dólar,"-5,43",
24/02/2024,IOF Transações Exterior,"-3,80",
25/02/2024,SPOTIFY USA,"-34,90",Servicos
25/02/2024,Cotação USD,"-5,40",
25/02/2024,IOF Transações Exterior,"-1,20",
26/02/2024,SUPERMERCADO XYZ,"-150,00",Mercado`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(5) // 2 main + 2 IOF + 1 domestic
      const descriptions = result.map(r => r.description)
      expect(descriptions).not.toContain('Cotação do Dólar')
      expect(descriptions).not.toContain('Cotação USD')
      expect(descriptions).toContain('OPENAI *CHATGPT SUBSCR SA')
      expect(descriptions).toContain('SPOTIFY USA')
      expect(descriptions).toContain('SUPERMERCADO XYZ')
    })
  })

  describe('column name variations', () => {
    it('should handle "Estabelecimento" instead of "Descricao"', async () => {
      const csv = `Data,Estabelecimento,Valor
15/01/2024,LOJA XYZ,"-100,00"`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('LOJA XYZ')
    })

    it('should handle case variations in column names', async () => {
      const csv = `DATA,DESCRICAO,VALOR
15/01/2024,COMPRA,"-100,00"`

      const result = await parseCSV(csv, 'Cartão C6')

      expect(result).toHaveLength(1)
      expect(result[0].description).toBe('COMPRA')
    })
  })
})
