import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  detectRecurringTransaction,
  detectTransfer,
  detectInstallment,
  defaultCategories,
  defaultRules,
  defaultInvestmentCategories
} from './categorizer'

// Mock the database module for functions that use it
vi.mock('./db', () => ({
  default: {
    categoryRule: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn()
    },
    category: {
      count: vi.fn(),
      create: vi.fn()
    },
    investmentCategory: {
      findMany: vi.fn(),
      create: vi.fn(),
      createMany: vi.fn()
    },
    origin: {
      createMany: vi.fn()
    }
  }
}))

describe('detectRecurringTransaction', () => {
  describe('streaming services', () => {
    it('should detect Netflix', () => {
      const result = detectRecurringTransaction('NETFLIX.COM 0800123456')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Netflix')
    })

    it('should detect Spotify', () => {
      const result = detectRecurringTransaction('SPOTIFY AB STOCKHOLM')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Spotify')
    })

    it('should detect Amazon Prime', () => {
      const result = detectRecurringTransaction('AMAZON PRIME VIDEO')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Amazon Prime')
    })

    it('should detect Prime Video', () => {
      const result = detectRecurringTransaction('PRIME VIDEO MONTHLY')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Prime Video')
    })

    it('should detect Disney+', () => {
      const result = detectRecurringTransaction('DISNEY+ SUBSCRIPTION')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Disney+')
    })

    it('should detect HBO Max', () => {
      const result = detectRecurringTransaction('HBO MAX MONTHLY')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('HBO Max')
    })

    it('should detect Globoplay', () => {
      const result = detectRecurringTransaction('GLOBOPLAY MENSAL')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Globoplay')
    })

    it('should detect Paramount+', () => {
      const result = detectRecurringTransaction('PARAMOUNT+ SUBSCRIPTION')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Paramount+')
    })

    it('should detect Star+', () => {
      const result = detectRecurringTransaction('STAR+ BRASIL')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Star+')
    })

    it('should detect Deezer', () => {
      const result = detectRecurringTransaction('DEEZER SA')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Deezer')
    })
  })

  describe('food delivery', () => {
    it('should detect iFood', () => {
      const result = detectRecurringTransaction('PAG*IFOOD ASSINATURA')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('iFood')
    })

    it('should detect iFood Club', () => {
      const result = detectRecurringTransaction('IFOOD CLUB MENSAL')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('iFood')
    })

    it('should detect Rappi Prime', () => {
      const result = detectRecurringTransaction('RAPPI PRIME MENSAL')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Rappi Prime')
    })

    it('should detect Uber One', () => {
      const result = detectRecurringTransaction('UBER ONE SUBSCRIPTION')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Uber One')
    })
  })

  describe('telecom services', () => {
    it('should detect Claro', () => {
      const result = detectRecurringTransaction('CLARO TV MENSAL')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Claro')
    })

    it('should detect Vivo', () => {
      const result = detectRecurringTransaction('VIVO FIXO')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Vivo')
    })

    it('should detect Tim', () => {
      const result = detectRecurringTransaction('TIM MOVEL MENSAL')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Tim')
    })

    it('should detect Oi', () => {
      const result = detectRecurringTransaction('OI FIXO MENSAL')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Oi')
    })
  })

  describe('toll services', () => {
    it('should detect Sem Parar', () => {
      const result = detectRecurringTransaction('SEM PARAR MENSALIDADE')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Sem Parar')
    })

    it('should detect Veloe', () => {
      const result = detectRecurringTransaction('VELOE MENSAL')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Veloe')
    })
  })

  describe('cloud and software', () => {
    it('should detect Google One', () => {
      const result = detectRecurringTransaction('GOOGLE ONE STORAGE')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Google One')
    })

    it('should detect Apple services', () => {
      let result = detectRecurringTransaction('APPLE.COM/BILL')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Apple')

      result = detectRecurringTransaction('APPLE MUSIC SUBSCRIPTION')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Apple')

      result = detectRecurringTransaction('APPLE ICLOUD STORAGE')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Apple')
    })

    it('should detect ChatGPT/OpenAI', () => {
      let result = detectRecurringTransaction('CHATGPT PLUS')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('ChatGPT')

      result = detectRecurringTransaction('OPENAI API')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('ChatGPT')
    })

    it('should detect YouTube Premium', () => {
      const result = detectRecurringTransaction('YOUTUBE PREMIUM')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('YouTube Premium')
    })

    it('should detect Dropbox', () => {
      const result = detectRecurringTransaction('DROPBOX PLUS')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Dropbox')
    })

    it('should detect Microsoft 365', () => {
      const result = detectRecurringTransaction('MICROSOFT 365 PERSONAL')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Microsoft 365')
    })

    it('should detect Adobe', () => {
      const result = detectRecurringTransaction('ADOBE CREATIVE CLOUD')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Adobe')
    })

    it('should detect Canva', () => {
      const result = detectRecurringTransaction('CANVA PRO')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Canva')
    })

    it('should detect Notion', () => {
      const result = detectRecurringTransaction('NOTION PLUS')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Notion')
    })

    it('should detect GitHub', () => {
      const result = detectRecurringTransaction('GITHUB PRO')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('GitHub')
    })
  })

  describe('gaming', () => {
    it('should detect PlayStation services', () => {
      let result = detectRecurringTransaction('PLAYSTATION PLUS')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('PlayStation')

      result = detectRecurringTransaction('PLAYSTATION NOW')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('PlayStation')
    })

    it('should detect Xbox services', () => {
      let result = detectRecurringTransaction('XBOX GAME PASS')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Xbox')

      result = detectRecurringTransaction('XBOX LIVE GOLD')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Xbox')
    })

    it('should detect Nintendo', () => {
      const result = detectRecurringTransaction('NINTENDO SWITCH ONLINE')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Nintendo')
    })

    it('should detect Twitch', () => {
      const result = detectRecurringTransaction('TWITCH SUBSCRIPTION')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Twitch')
    })
  })

  describe('wellness and education', () => {
    it('should detect Headspace', () => {
      const result = detectRecurringTransaction('HEADSPACE SUBSCRIPTION')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Headspace')
    })

    it('should detect Calm', () => {
      const result = detectRecurringTransaction('CALM APP')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Calm')
    })

    it('should detect Duolingo', () => {
      const result = detectRecurringTransaction('DUOLINGO PLUS')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Duolingo')
    })

    it('should detect Wellhub/Gympass', () => {
      let result = detectRecurringTransaction('GYMPASS MENSAL')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Wellhub')

      result = detectRecurringTransaction('WELLHUB SUBSCRIPTION')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Wellhub')
    })
  })

  describe('insurance and financial', () => {
    it('should detect Nubank Vida', () => {
      const result = detectRecurringTransaction('NUBANK VIDA')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Nubank Vida')
    })

    it('should detect insurance (Seguro)', () => {
      let result = detectRecurringTransaction('SEGURO AUTO')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Seguro')

      result = detectRecurringTransaction('SEGURO VIDA')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Seguro')

      result = detectRecurringTransaction('SEGURO RESIDENCIAL')
      expect(result.isRecurring).toBe(true)
      expect(result.recurringName).toBe('Seguro')
    })
  })

  describe('non-recurring transactions', () => {
    it('should not detect regular purchases', () => {
      expect(detectRecurringTransaction('SUPERMERCADO XYZ').isRecurring).toBe(false)
      expect(detectRecurringTransaction('RESTAURANTE ABC').isRecurring).toBe(false)
      expect(detectRecurringTransaction('FARMACIA RAIA').isRecurring).toBe(false)
      expect(detectRecurringTransaction('POSTO IPIRANGA').isRecurring).toBe(false)
    })

    it('should return empty recurringName for non-recurring', () => {
      const result = detectRecurringTransaction('RANDOM PURCHASE')
      expect(result.isRecurring).toBe(false)
      expect(result.recurringName).toBeUndefined()
    })
  })

  describe('case insensitivity', () => {
    it('should detect regardless of case', () => {
      expect(detectRecurringTransaction('netflix').isRecurring).toBe(true)
      expect(detectRecurringTransaction('NETFLIX').isRecurring).toBe(true)
      expect(detectRecurringTransaction('Netflix').isRecurring).toBe(true)
      expect(detectRecurringTransaction('NeTfLiX').isRecurring).toBe(true)
    })
  })
})

describe('detectTransfer', () => {
  describe('credit card payments', () => {
    it('should detect PAGTO FATURA', () => {
      expect(detectTransfer('PAGTO FATURA CARTAO')).toBe(true)
      expect(detectTransfer('PAGTO DE FATURA')).toBe(true)
    })

    it('should detect PAGAMENTO CARTAO', () => {
      expect(detectTransfer('PAGAMENTO CARTAO C6')).toBe(true)
      expect(detectTransfer('PAGAMENTO DE CARTÃO')).toBe(true)
    })

    it('should detect bank-specific card payments', () => {
      expect(detectTransfer('FATURA C6')).toBe(true)
      expect(detectTransfer('FATURA ITAU')).toBe(true)
      expect(detectTransfer('FATURA ITAÚ')).toBe(true)
      expect(detectTransfer('FATURA BTG')).toBe(true)
      expect(detectTransfer('FATURA NUBANK')).toBe(true)
      expect(detectTransfer('FATURA BRADESCO')).toBe(true)
      expect(detectTransfer('FATURA SANTANDER')).toBe(true)
    })

    it('should detect PAG FAT abbreviation', () => {
      expect(detectTransfer('PAG FAT CARTAO')).toBe(true)
    })

    it('should detect DEBITO AUTOMATICO CARTAO', () => {
      expect(detectTransfer('DEBITO AUTOMATICO CARTAO')).toBe(true)
      expect(detectTransfer('DEBITO AUTO FATURA')).toBe(true)
    })
  })

  describe('internal transfers', () => {
    it('should detect transfers between accounts', () => {
      expect(detectTransfer('TRANSF ENTRE CONTAS')).toBe(true)
      expect(detectTransfer('TRANSF CONTA PROPRIA')).toBe(true)
      expect(detectTransfer('TRANSF PRÓPRIA')).toBe(true)
    })

    it('should detect TRANSFERENCIA', () => {
      expect(detectTransfer('TRANSFERENCIA ENTRE CONTAS')).toBe(true)
      expect(detectTransfer('TRANSFERENCIA PROPRIA')).toBe(true)
    })
  })

  describe('investments', () => {
    it('should detect APLICACAO and RESGATE', () => {
      expect(detectTransfer('APLICACAO CDB')).toBe(true)
      expect(detectTransfer('APLICAÇÃO LCI')).toBe(true)
      expect(detectTransfer('RESGATE POUPANCA')).toBe(true)
    })

    it('should detect INVESTIMENTO', () => {
      expect(detectTransfer('INVESTIMENTO CDB')).toBe(true)
      expect(detectTransfer('INVEST TESOURO DIRETO')).toBe(true)
      expect(detectTransfer('INVESTIMENTO POUPANÇA')).toBe(true)
    })
  })

  describe('non-transfers', () => {
    it('should not detect regular purchases', () => {
      expect(detectTransfer('MERCADO LIVRE COMPRA')).toBe(false)
      expect(detectTransfer('UBER TRIP')).toBe(false)
      expect(detectTransfer('NETFLIX SUBSCRIPTION')).toBe(false)
    })

    it('should not detect PIX (not a transfer type in this context)', () => {
      // PIX by itself is not a transfer pattern in this implementation
      expect(detectTransfer('PIX ENVIADO')).toBe(false)
    })
  })
})

describe('detectInstallment', () => {
  describe('Parcela X/Y format', () => {
    it('should detect "- Parcela X/Y" format', () => {
      const result = detectInstallment('EC *DEBORAEXCURSOES - Parcela 5/6')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(5)
      expect(result.totalInstallments).toBe(6)
    })

    it('should detect "– Parcela X/Y" format (en dash)', () => {
      const result = detectInstallment('LOJA XYZ – Parcela 3/10')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(3)
      expect(result.totalInstallments).toBe(10)
    })

    it('should detect "Parcela X/Y" without dash', () => {
      const result = detectInstallment('COMPRA PARCELA 2/5')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(2)
      expect(result.totalInstallments).toBe(5)
    })
  })

  describe('PARC X/Y and PARC X DE Y formats', () => {
    it('should detect PARC X/Y format', () => {
      const result = detectInstallment('LOJA ABC PARC 4/12')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(4)
      expect(result.totalInstallments).toBe(12)
    })

    it('should detect PARCELA X DE Y format', () => {
      const result = detectInstallment('COMPRA PARCELA 3 DE 6')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(3)
      expect(result.totalInstallments).toBe(6)
    })
  })

  describe('generic X/Y format', () => {
    it('should detect simple X/Y format', () => {
      const result = detectInstallment('MERCADOLIVRE 3/10')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(3)
      expect(result.totalInstallments).toBe(10)
    })

    it('should detect with leading zeros', () => {
      const result = detectInstallment('PRODUTO 03/10')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(3)
      expect(result.totalInstallments).toBe(10)
    })
  })

  describe('X DE Y format', () => {
    it('should detect X DE Y format', () => {
      const result = detectInstallment('COMPRA 5 DE 12')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(5)
      expect(result.totalInstallments).toBe(12)
    })
  })

  describe('edge cases and validation', () => {
    it('should handle single installment (1/1)', () => {
      // Single installment is not considered installment (total must be > 1)
      const result = detectInstallment('COMPRA 1/1')
      expect(result.isInstallment).toBe(false)
    })

    it('should handle high installment counts (up to 48)', () => {
      const result = detectInstallment('TV SAMSUNG 12/48')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(12)
      expect(result.totalInstallments).toBe(48)
    })

    it('should reject installments > 48', () => {
      const result = detectInstallment('COMPRA 1/100')
      expect(result.isInstallment).toBe(false)
    })

    it('should reject when current > total', () => {
      const result = detectInstallment('COMPRA 10/5')
      expect(result.isInstallment).toBe(false)
    })

    it('should reject when current is 0', () => {
      const result = detectInstallment('COMPRA 0/10')
      expect(result.isInstallment).toBe(false)
    })

    it('should detect "- Parcela" without number (C6 format)', () => {
      const result = detectInstallment('MP *MOBYDICK - Parcela')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBeUndefined()
      expect(result.totalInstallments).toBeUndefined()
    })

    it('should detect "Parcela" at end without number', () => {
      const result = detectInstallment('LOJA ABC Parcela')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBeUndefined()
    })
  })

  describe('non-installment transactions', () => {
    it('should not detect regular transactions', () => {
      expect(detectInstallment('COMPRA AVISTA').isInstallment).toBe(false)
      expect(detectInstallment('PIX ENVIADO').isInstallment).toBe(false)
      expect(detectInstallment('NETFLIX SUBSCRIPTION').isInstallment).toBe(false)
    })

    it('should not confuse dates with installments', () => {
      // Dates like 15/01 shouldn't be detected as installments
      // because they usually have year or month that makes total > 48
      // or the pattern doesn't match the description context
      const result = detectInstallment('DATA 15/01/2024')
      // This might match but would fail validation (01 is not > 1)
      // Let's check actual behavior
      expect(result.isInstallment).toBe(false)
    })
  })

  describe('real-world examples from C6/Itau statements', () => {
    it('should parse C6 credit card statement examples', () => {
      let result = detectInstallment('MP *MOBYDICK - Parcela 4/5')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(4)
      expect(result.totalInstallments).toBe(5)

      result = detectInstallment('MERCADO*MULTIXIMPORTA - Parcela 4/12')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(4)
      expect(result.totalInstallments).toBe(12)

      result = detectInstallment('SALLES TENIS SQUASH L - Parcela 4/6')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(4)
      expect(result.totalInstallments).toBe(6)

      result = detectInstallment('RAIA DROGASIL SA - Parcela 2/3')
      expect(result.isInstallment).toBe(true)
      expect(result.currentInstallment).toBe(2)
      expect(result.totalInstallments).toBe(3)
    })
  })
})

describe('default constants', () => {
  describe('defaultCategories', () => {
    it('should have expected categories', () => {
      expect(defaultCategories).toHaveLength(12)

      const categoryNames = defaultCategories.map((c) => c.name)
      expect(categoryNames).toContain('Moradia')
      expect(categoryNames).toContain('Alimentacao')
      expect(categoryNames).toContain('Mercado')
      expect(categoryNames).toContain('Transporte')
      expect(categoryNames).toContain('Saude')
      expect(categoryNames).toContain('Lazer')
      expect(categoryNames).toContain('Educacao')
      expect(categoryNames).toContain('Servicos')
      expect(categoryNames).toContain('Compras')
      expect(categoryNames).toContain('Salario')
      expect(categoryNames).toContain('Investimentos')
      expect(categoryNames).toContain('Outros')
    })

    it('should have valid colors (hex format)', () => {
      defaultCategories.forEach((category) => {
        expect(category.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      })
    })

    it('should have icons defined', () => {
      defaultCategories.forEach((category) => {
        expect(category.icon).toBeDefined()
        expect(category.icon.length).toBeGreaterThan(0)
      })
    })
  })

  describe('defaultRules', () => {
    it('should have rules for common services', () => {
      const keywords = defaultRules.map((r) => r.keyword)
      expect(keywords).toContain('UBER')
      expect(keywords).toContain('IFOOD')
      expect(keywords).toContain('NETFLIX')
      expect(keywords).toContain('SPOTIFY')
    })

    it('should map to valid categories', () => {
      const categoryNames = defaultCategories.map((c) => c.name)
      defaultRules.forEach((rule) => {
        expect(categoryNames).toContain(rule.category)
      })
    })
  })

  describe('defaultInvestmentCategories', () => {
    it('should have expected investment categories', () => {
      expect(defaultInvestmentCategories).toHaveLength(4)

      const names = defaultInvestmentCategories.map((c) => c.name)
      expect(names).toContain('Renda Fixa')
      expect(names).toContain('Renda Variável')
      expect(names).toContain('Cripto')
      expect(names).toContain('Previdência')
    })

    it('should have valid colors (hex format)', () => {
      defaultInvestmentCategories.forEach((category) => {
        expect(category.color).toMatch(/^#[0-9A-Fa-f]{6}$/)
      })
    })
  })
})
