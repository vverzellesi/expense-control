# MyPocket Test Strategy & Implementation Plan

This document outlines the comprehensive testing strategy for the MyPocket expense-control application, covering unit tests, integration tests, and end-to-end tests.

## Table of Contents

1. [Overview](#overview)
2. [Test Framework Selection](#test-framework-selection)
3. [Directory Structure](#directory-structure)
4. [Unit Tests](#unit-tests)
5. [Integration Tests](#integration-tests)
6. [End-to-End Tests](#end-to-end-tests)
7. [Test Database Strategy](#test-database-strategy)
8. [CI/CD Integration](#cicd-integration)
9. [Implementation Roadmap](#implementation-roadmap)

---

## Overview

### Current State
- **0** test files
- **0** test frameworks installed
- **39** API endpoints
- **12+** utility functions with complex business logic
- **13** Prisma models with relationships

### Goals
1. Establish a maintainable test infrastructure
2. Achieve 80%+ coverage on critical business logic
3. Prevent regressions in core features
4. Enable confident refactoring and feature additions

---

## Test Framework Selection

### Unit & Integration Tests: **Vitest**

**Why Vitest over Jest:**
- Native ESM support (Next.js 14 uses ESM)
- Faster execution (Vite-powered)
- Compatible with Jest API (easy migration path)
- Built-in TypeScript support
- Better Next.js App Router compatibility

**Dependencies:**
```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

### End-to-End Tests: **Playwright**

**Why Playwright:**
- Cross-browser testing (Chrome, Firefox, Safari)
- Excellent Next.js integration
- Auto-wait for elements (less flaky tests)
- Visual regression testing built-in
- Trace viewer for debugging

**Dependencies:**
```bash
npm install -D @playwright/test
npx playwright install
```

---

## Directory Structure

```
expense-control/
├── src/
│   ├── lib/
│   │   ├── categorizer.ts
│   │   ├── categorizer.test.ts          # Unit tests alongside source
│   │   ├── csv-parser.ts
│   │   ├── csv-parser.test.ts
│   │   ├── utils.ts
│   │   └── utils.test.ts
│   └── ...
├── tests/
│   ├── integration/                      # API route tests
│   │   ├── api/
│   │   │   ├── transactions.test.ts
│   │   │   ├── categories.test.ts
│   │   │   ├── recurring.test.ts
│   │   │   ├── investments.test.ts
│   │   │   ├── import.test.ts
│   │   │   └── summary.test.ts
│   │   └── setup.ts                      # Test DB setup
│   ├── e2e/                              # Playwright tests
│   │   ├── auth.spec.ts
│   │   ├── transactions.spec.ts
│   │   ├── investments.spec.ts
│   │   ├── import.spec.ts
│   │   └── fixtures/
│   │       ├── test-user.ts
│   │       └── sample-data.ts
│   ├── fixtures/                         # Shared test data
│   │   ├── transactions.json
│   │   ├── categories.json
│   │   └── csv-samples/
│   │       ├── c6-statement.csv
│   │       ├── itau-statement.csv
│   │       └── btg-statement.csv
│   └── mocks/
│       ├── prisma.ts                     # Prisma mock
│       └── next-auth.ts                  # Auth mock
├── vitest.config.ts
├── playwright.config.ts
└── package.json
```

---

## Unit Tests

### Priority 1: Core Business Logic

#### 1.1 Categorizer (`src/lib/categorizer.test.ts`)

**Test Cases:**

```typescript
// src/lib/categorizer.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  suggestCategory,
  detectRecurringTransaction,
  detectTransfer,
  detectInstallment,
  invalidateRulesCache
} from './categorizer'

describe('detectRecurringTransaction', () => {
  it('should detect Netflix subscription', () => {
    const result = detectRecurringTransaction('NETFLIX.COM 0800123456')
    expect(result).toEqual({
      isRecurring: true,
      name: 'Netflix',
      frequency: 'monthly'
    })
  })

  it('should detect Spotify subscription', () => {
    const result = detectRecurringTransaction('SPOTIFY AB STOCKHOLM')
    expect(result).toEqual({
      isRecurring: true,
      name: 'Spotify',
      frequency: 'monthly'
    })
  })

  it('should detect iFood subscription', () => {
    const result = detectRecurringTransaction('PAG*IFOOD ASSINATURA')
    expect(result).toEqual({
      isRecurring: true,
      name: 'iFood',
      frequency: 'monthly'
    })
  })

  it('should return null for non-recurring transactions', () => {
    const result = detectRecurringTransaction('SUPERMERCADO XYZ')
    expect(result).toBeNull()
  })

  // Test all 50+ patterns
  const subscriptionPatterns = [
    { input: 'AMAZON PRIME VIDEO', expected: 'Amazon Prime' },
    { input: 'DISNEY PLUS', expected: 'Disney+' },
    { input: 'HBO MAX', expected: 'HBO Max' },
    { input: 'UBER *EATS', expected: 'Uber Eats' },
    { input: 'GOOGLE *YOUTUBE PREMIUM', expected: 'YouTube Premium' },
    // ... add all patterns
  ]

  it.each(subscriptionPatterns)(
    'should detect $expected from "$input"',
    ({ input, expected }) => {
      const result = detectRecurringTransaction(input)
      expect(result?.name).toBe(expected)
    }
  )
})

describe('detectTransfer', () => {
  it('should detect PIX transfers', () => {
    expect(detectTransfer('PIX ENVIADO - JOAO SILVA')).toBe(true)
    expect(detectTransfer('PIX RECEBIDO - MARIA')).toBe(true)
  })

  it('should detect TED/DOC transfers', () => {
    expect(detectTransfer('TED ENVIADA 123456')).toBe(true)
    expect(detectTransfer('DOC RECEBIDA')).toBe(true)
  })

  it('should detect inter-account transfers', () => {
    expect(detectTransfer('TRANSF ENTRE CONTAS')).toBe(true)
    expect(detectTransfer('TRANSFERENCIA RECEBIDA')).toBe(true)
  })

  it('should not flag regular purchases', () => {
    expect(detectTransfer('MERCADO LIVRE')).toBe(false)
    expect(detectTransfer('RESTAURANTE ABC')).toBe(false)
  })
})

describe('detectInstallment', () => {
  it('should parse "3/10" format', () => {
    const result = detectInstallment('LOJA XYZ 3/10')
    expect(result).toEqual({
      currentInstallment: 3,
      totalInstallments: 10
    })
  })

  it('should parse "PARCELA 3 DE 10" format', () => {
    const result = detectInstallment('COMPRA PARCELA 3 DE 10')
    expect(result).toEqual({
      currentInstallment: 3,
      totalInstallments: 10
    })
  })

  it('should parse "03/10" with leading zeros', () => {
    const result = detectInstallment('PRODUTO 03/10')
    expect(result).toEqual({
      currentInstallment: 3,
      totalInstallments: 10
    })
  })

  it('should return null for non-installment transactions', () => {
    expect(detectInstallment('COMPRA AVISTA')).toBeNull()
    expect(detectInstallment('PIX ENVIADO')).toBeNull()
  })

  it('should handle edge cases', () => {
    // Single installment
    expect(detectInstallment('COMPRA 1/1')).toEqual({
      currentInstallment: 1,
      totalInstallments: 1
    })
    // High installment count
    expect(detectInstallment('COMPRA 12/48')).toEqual({
      currentInstallment: 12,
      totalInstallments: 48
    })
  })
})

describe('suggestCategory', () => {
  beforeEach(() => {
    invalidateRulesCache()
  })

  it('should match exact keywords', async () => {
    // Mock the database rules
    vi.mock('./db', () => ({
      db: {
        categoryRule: {
          findMany: vi.fn().mockResolvedValue([
            { keyword: 'netflix', categoryId: 'cat-entertainment' },
            { keyword: 'supermercado', categoryId: 'cat-groceries' }
          ])
        }
      }
    }))

    const result = await suggestCategory('NETFLIX MENSALIDADE')
    expect(result).toBe('cat-entertainment')
  })

  it('should be case-insensitive', async () => {
    const result = await suggestCategory('NETFLIX mensalidade')
    expect(result).toBe('cat-entertainment')
  })

  it('should return null when no match found', async () => {
    const result = await suggestCategory('RANDOM UNKNOWN VENDOR')
    expect(result).toBeNull()
  })
})
```

#### 1.2 CSV Parser (`src/lib/csv-parser.test.ts`)

```typescript
// src/lib/csv-parser.test.ts
import { describe, it, expect } from 'vitest'
import { parseCSV, detectBank } from './csv-parser'

describe('detectBank', () => {
  it('should detect C6 Bank format', () => {
    const headers = ['Data Transação', 'Descrição', 'Valor (R$)', 'Tipo Transação']
    expect(detectBank(headers)).toBe('c6')
  })

  it('should detect Itaú format', () => {
    const headers = ['Data', 'Lançamento', 'Ag./Origem', 'Valor']
    expect(detectBank(headers)).toBe('itau')
  })

  it('should detect BTG format', () => {
    const headers = ['Date', 'Description', 'Amount', 'Balance']
    expect(detectBank(headers)).toBe('btg')
  })

  it('should return unknown for unrecognized formats', () => {
    const headers = ['col1', 'col2', 'col3']
    expect(detectBank(headers)).toBe('unknown')
  })
})

describe('parseCSV', () => {
  describe('C6 Bank parsing', () => {
    const c6Sample = `Data Transação,Descrição,Valor (R$),Tipo Transação
15/01/2024,NETFLIX.COM,39.90,Débito
16/01/2024,PIX RECEBIDO - SALARIO,"5.000,00",Crédito`

    it('should parse C6 transactions correctly', async () => {
      const result = await parseCSV(c6Sample, 'c6')

      expect(result).toHaveLength(2)
      expect(result[0]).toEqual({
        date: expect.any(Date),
        description: 'NETFLIX.COM',
        amount: 39.90,
        type: 'EXPENSE'
      })
      expect(result[1]).toEqual({
        date: expect.any(Date),
        description: 'PIX RECEBIDO - SALARIO',
        amount: 5000.00,
        type: 'INCOME'
      })
    })

    it('should handle Brazilian number format (1.234,56)', async () => {
      const csv = `Data Transação,Descrição,Valor (R$),Tipo Transação
15/01/2024,COMPRA,"1.234,56",Débito`

      const result = await parseCSV(csv, 'c6')
      expect(result[0].amount).toBe(1234.56)
    })
  })

  describe('Itaú Bank parsing', () => {
    const itauSample = `Data,Lançamento,Ag./Origem,Valor
15/01/2024,PAG*IFOOD,0001,-45.90
16/01/2024,TED RECEBIDA,0001,1500.00`

    it('should parse Itaú transactions correctly', async () => {
      const result = await parseCSV(itauSample, 'itau')

      expect(result).toHaveLength(2)
      expect(result[0].type).toBe('EXPENSE')
      expect(result[1].type).toBe('INCOME')
    })

    it('should infer type from negative/positive values', async () => {
      const result = await parseCSV(itauSample, 'itau')
      expect(result[0].amount).toBe(45.90) // Stored as positive
      expect(result[0].type).toBe('EXPENSE')
    })
  })
})
```

#### 1.3 Utils (`src/lib/utils.test.ts`)

```typescript
// src/lib/utils.test.ts
import { describe, it, expect } from 'vitest'
import { formatCurrency, formatDate, parseDate, cn } from './utils'

describe('formatCurrency', () => {
  it('should format BRL currency correctly', () => {
    expect(formatCurrency(1234.56)).toBe('R$ 1.234,56')
    expect(formatCurrency(0)).toBe('R$ 0,00')
    expect(formatCurrency(1000000)).toBe('R$ 1.000.000,00')
  })

  it('should handle negative values', () => {
    expect(formatCurrency(-500)).toBe('-R$ 500,00')
  })

  it('should handle decimal precision', () => {
    expect(formatCurrency(10.1)).toBe('R$ 10,10')
    expect(formatCurrency(10.999)).toBe('R$ 11,00') // Rounds
  })
})

describe('formatDate', () => {
  it('should format dates as DD/MM/YYYY', () => {
    const date = new Date('2024-01-15')
    expect(formatDate(date)).toBe('15/01/2024')
  })

  it('should handle string dates', () => {
    expect(formatDate('2024-12-25')).toBe('25/12/2024')
  })
})

describe('parseDate', () => {
  it('should parse DD/MM/YYYY format', () => {
    const result = parseDate('15/01/2024')
    expect(result.getFullYear()).toBe(2024)
    expect(result.getMonth()).toBe(0) // January = 0
    expect(result.getDate()).toBe(15)
  })

  it('should parse ISO format', () => {
    const result = parseDate('2024-01-15')
    expect(result.getFullYear()).toBe(2024)
  })
})

describe('cn (class name merge)', () => {
  it('should merge class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('should handle conditional classes', () => {
    expect(cn('base', false && 'hidden', true && 'visible')).toBe('base visible')
  })

  it('should resolve Tailwind conflicts', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })
})
```

### Priority 2: Additional Utility Tests

| File | Test Coverage Focus |
|------|-------------------|
| `ocr-parser.ts` | Image preprocessing, PDF text extraction |
| `statement-parser.ts` | Extracted text → transaction parsing |
| `auth-utils.ts` | Session validation, unauthorized response |

---

## Integration Tests

### Setup: Test Database

```typescript
// tests/integration/setup.ts
import { PrismaClient } from '@prisma/client'
import { beforeAll, afterAll, beforeEach } from 'vitest'

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.TEST_DATABASE_URL || 'file:./test.db'
    }
  }
})

// Test user fixture
export const testUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  password: 'hashed-password',
  name: 'Test User'
}

export async function setupTestDatabase() {
  // Reset database
  await prisma.$transaction([
    prisma.transaction.deleteMany(),
    prisma.category.deleteMany(),
    prisma.categoryRule.deleteMany(),
    prisma.recurringExpense.deleteMany(),
    prisma.investment.deleteMany(),
    prisma.user.deleteMany()
  ])

  // Create test user
  await prisma.user.create({ data: testUser })
}

export async function cleanupTestDatabase() {
  await prisma.$disconnect()
}

export { prisma }
```

### API Route Tests

#### Transactions API (`tests/integration/api/transactions.test.ts`)

```typescript
// tests/integration/api/transactions.test.ts
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { setupTestDatabase, prisma, testUser } from '../setup'

// Mock NextAuth session
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'test-user-id', email: 'test@example.com' }
  })
}))

describe('GET /api/transactions', () => {
  beforeAll(async () => {
    await setupTestDatabase()
  })

  beforeEach(async () => {
    // Clean transactions before each test
    await prisma.transaction.deleteMany()

    // Create test category
    await prisma.category.upsert({
      where: { id: 'cat-1' },
      create: { id: 'cat-1', name: 'Food', color: '#FF0000', userId: testUser.id },
      update: {}
    })
  })

  it('should return transactions for current month', async () => {
    // Create test transaction
    await prisma.transaction.create({
      data: {
        description: 'Test Transaction',
        amount: 100,
        type: 'EXPENSE',
        date: new Date(),
        userId: testUser.id,
        categoryId: 'cat-1'
      }
    })

    const response = await fetch('/api/transactions?month=1&year=2024')
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toHaveLength(1)
    expect(data[0].description).toBe('Test Transaction')
  })

  it('should filter by category', async () => {
    await prisma.transaction.createMany({
      data: [
        { description: 'Food item', amount: 50, type: 'EXPENSE', date: new Date(), userId: testUser.id, categoryId: 'cat-1' },
        { description: 'Other item', amount: 50, type: 'EXPENSE', date: new Date(), userId: testUser.id, categoryId: 'cat-2' }
      ]
    })

    const response = await fetch('/api/transactions?categoryId=cat-1')
    const data = await response.json()

    expect(data).toHaveLength(1)
    expect(data[0].description).toBe('Food item')
  })

  it('should filter by type (INCOME/EXPENSE)', async () => {
    await prisma.transaction.createMany({
      data: [
        { description: 'Salary', amount: 5000, type: 'INCOME', date: new Date(), userId: testUser.id },
        { description: 'Groceries', amount: 200, type: 'EXPENSE', date: new Date(), userId: testUser.id }
      ]
    })

    const response = await fetch('/api/transactions?type=INCOME')
    const data = await response.json()

    expect(data).toHaveLength(1)
    expect(data[0].description).toBe('Salary')
  })

  it('should filter installment transactions', async () => {
    const installment = await prisma.installment.create({
      data: {
        totalInstallments: 10,
        currentInstallment: 1,
        totalAmount: 1000,
        userId: testUser.id
      }
    })

    await prisma.transaction.createMany({
      data: [
        { description: 'Regular purchase', amount: 100, type: 'EXPENSE', date: new Date(), userId: testUser.id },
        { description: 'Installment 1/10', amount: 100, type: 'EXPENSE', date: new Date(), userId: testUser.id, installmentId: installment.id }
      ]
    })

    const response = await fetch('/api/transactions?isInstallment=true')
    const data = await response.json()

    expect(data).toHaveLength(1)
    expect(data[0].installmentId).toBe(installment.id)
  })

  it('should exclude soft-deleted transactions', async () => {
    await prisma.transaction.createMany({
      data: [
        { description: 'Active', amount: 100, type: 'EXPENSE', date: new Date(), userId: testUser.id },
        { description: 'Deleted', amount: 100, type: 'EXPENSE', date: new Date(), userId: testUser.id, deletedAt: new Date() }
      ]
    })

    const response = await fetch('/api/transactions')
    const data = await response.json()

    expect(data).toHaveLength(1)
    expect(data[0].description).toBe('Active')
  })
})

describe('POST /api/transactions', () => {
  it('should create a simple transaction', async () => {
    const response = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'New Transaction',
        amount: 150,
        type: 'EXPENSE',
        date: '2024-01-15',
        categoryId: 'cat-1'
      })
    })

    expect(response.status).toBe(201)
    const data = await response.json()
    expect(data.description).toBe('New Transaction')
    expect(data.amount).toBe(150)
  })

  it('should create installment transactions', async () => {
    const response = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'TV Purchase',
        amount: 300, // Per installment
        type: 'EXPENSE',
        date: '2024-01-15',
        categoryId: 'cat-1',
        installments: 10
      })
    })

    expect(response.status).toBe(201)

    // Verify 10 transactions were created
    const transactions = await prisma.transaction.findMany({
      where: { description: { contains: 'TV Purchase' } }
    })
    expect(transactions).toHaveLength(10)
  })

  it('should auto-categorize based on rules', async () => {
    // Create categorization rule
    await prisma.categoryRule.create({
      data: {
        keyword: 'netflix',
        categoryId: 'cat-entertainment',
        userId: testUser.id
      }
    })

    const response = await fetch('/api/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        description: 'NETFLIX SUBSCRIPTION',
        amount: 39.90,
        type: 'EXPENSE',
        date: '2024-01-15'
        // No categoryId provided
      })
    })

    const data = await response.json()
    expect(data.categoryId).toBe('cat-entertainment')
  })
})

describe('DELETE /api/transactions/[id]', () => {
  it('should soft-delete a transaction', async () => {
    const transaction = await prisma.transaction.create({
      data: {
        description: 'To Delete',
        amount: 100,
        type: 'EXPENSE',
        date: new Date(),
        userId: testUser.id
      }
    })

    const response = await fetch(`/api/transactions/${transaction.id}`, {
      method: 'DELETE'
    })

    expect(response.status).toBe(200)

    const deleted = await prisma.transaction.findUnique({
      where: { id: transaction.id }
    })
    expect(deleted?.deletedAt).not.toBeNull()
  })
})
```

#### Duplicate Detection (`tests/integration/api/duplicates.test.ts`)

```typescript
describe('POST /api/transactions/check-duplicates', () => {
  it('should detect exact duplicates', async () => {
    await prisma.transaction.create({
      data: {
        description: 'SUPERMERCADO XYZ',
        amount: 150.00,
        date: new Date('2024-01-15'),
        type: 'EXPENSE',
        userId: testUser.id
      }
    })

    const response = await fetch('/api/transactions/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions: [
          { description: 'SUPERMERCADO XYZ', amount: 150.00, date: '2024-01-15' }
        ]
      })
    })

    const data = await response.json()
    expect(data.duplicates).toHaveLength(1)
  })

  it('should detect duplicates within 24h tolerance', async () => {
    await prisma.transaction.create({
      data: {
        description: 'UBER TRIP',
        amount: 25.00,
        date: new Date('2024-01-15T10:00:00'),
        type: 'EXPENSE',
        userId: testUser.id
      }
    })

    const response = await fetch('/api/transactions/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions: [
          { description: 'UBER TRIP', amount: 25.00, date: '2024-01-15T20:00:00' }
        ]
      })
    })

    const data = await response.json()
    expect(data.duplicates).toHaveLength(1)
  })

  it('should detect related installments', async () => {
    // Existing installment 3/10
    const installment = await prisma.installment.create({
      data: {
        totalInstallments: 10,
        currentInstallment: 3,
        totalAmount: 1000,
        baseDescription: 'LOJA COMPRA',
        userId: testUser.id
      }
    })

    await prisma.transaction.create({
      data: {
        description: 'LOJA COMPRA 3/10',
        amount: 100,
        date: new Date('2024-01-15'),
        type: 'EXPENSE',
        userId: testUser.id,
        installmentId: installment.id
      }
    })

    // Importing installment 4/10
    const response = await fetch('/api/transactions/check-duplicates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactions: [
          { description: 'LOJA COMPRA 4/10', amount: 100, date: '2024-02-15' }
        ]
      })
    })

    const data = await response.json()
    expect(data.relatedInstallments).toHaveLength(1)
    expect(data.relatedInstallments[0].installmentId).toBe(installment.id)
  })
})
```

#### Summary API (`tests/integration/api/summary.test.ts`)

```typescript
describe('GET /api/summary', () => {
  beforeEach(async () => {
    // Create categories
    await prisma.category.createMany({
      data: [
        { id: 'cat-food', name: 'Alimentação', color: '#FF0000', userId: testUser.id },
        { id: 'cat-transport', name: 'Transporte', color: '#00FF00', userId: testUser.id }
      ]
    })

    // Create transactions for January 2024
    await prisma.transaction.createMany({
      data: [
        { description: 'Salary', amount: 5000, type: 'INCOME', date: new Date('2024-01-05'), userId: testUser.id },
        { description: 'Groceries', amount: 500, type: 'EXPENSE', date: new Date('2024-01-10'), categoryId: 'cat-food', userId: testUser.id },
        { description: 'Uber', amount: 100, type: 'EXPENSE', date: new Date('2024-01-15'), categoryId: 'cat-transport', userId: testUser.id }
      ]
    })
  })

  it('should calculate totals correctly', async () => {
    const response = await fetch('/api/summary?month=1&year=2024')
    const data = await response.json()

    expect(data.totalIncome).toBe(5000)
    expect(data.totalExpense).toBe(600)
    expect(data.balance).toBe(4400)
  })

  it('should break down by category', async () => {
    const response = await fetch('/api/summary?month=1&year=2024')
    const data = await response.json()

    const foodCategory = data.categoryBreakdown.find((c: any) => c.name === 'Alimentação')
    const transportCategory = data.categoryBreakdown.find((c: any) => c.name === 'Transporte')

    expect(foodCategory.total).toBe(500)
    expect(transportCategory.total).toBe(100)
  })

  it('should calculate weekly breakdown', async () => {
    const response = await fetch('/api/summary?month=1&year=2024')
    const data = await response.json()

    expect(data.weeklyBreakdown).toBeDefined()
    expect(data.weeklyBreakdown).toHaveLength(5) // January has ~5 weeks
  })

  it('should show budget alerts when over budget', async () => {
    // Create budget
    await prisma.budget.create({
      data: {
        categoryId: 'cat-food',
        amount: 400, // Under the 500 spent
        userId: testUser.id
      }
    })

    const response = await fetch('/api/summary?month=1&year=2024')
    const data = await response.json()

    expect(data.budgetAlerts).toHaveLength(1)
    expect(data.budgetAlerts[0].categoryId).toBe('cat-food')
    expect(data.budgetAlerts[0].percentUsed).toBe(125) // 500/400 = 125%
  })
})
```

### Additional Integration Test Files Needed

| File | Coverage |
|------|----------|
| `tests/integration/api/recurring.test.ts` | Recurring expense generation, suggestions, day normalization |
| `tests/integration/api/investments.test.ts` | CRUD, deposits, withdrawals, return calculations |
| `tests/integration/api/import.test.ts` | CSV parsing, duplicate detection, recurring linking |
| `tests/integration/api/auth.test.ts` | Registration, login, password reset |

---

## End-to-End Tests

### Playwright Configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure'
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'mobile',
      use: { ...devices['iPhone 13'] }
    }
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI
  }
})
```

### Test Fixtures

```typescript
// tests/e2e/fixtures/test-user.ts
import { test as base } from '@playwright/test'

type TestFixtures = {
  authenticatedPage: Page
}

export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Login before test
    await page.goto('/auth/login')
    await page.fill('[name="email"]', 'test@example.com')
    await page.fill('[name="password"]', 'testpassword123')
    await page.click('button[type="submit"]')
    await page.waitForURL('/dashboard')

    await use(page)
  }
})

export { expect } from '@playwright/test'
```

### E2E Test Suites

#### Authentication Flow (`tests/e2e/auth.spec.ts`)

```typescript
// tests/e2e/auth.spec.ts
import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test('should register a new user', async ({ page }) => {
    await page.goto('/auth/register')

    await page.fill('[name="name"]', 'New User')
    await page.fill('[name="email"]', `test-${Date.now()}@example.com`)
    await page.fill('[name="password"]', 'securepassword123')
    await page.fill('[name="confirmPassword"]', 'securepassword123')

    await page.click('button[type="submit"]')

    // Should redirect to dashboard after registration
    await expect(page).toHaveURL('/dashboard')

    // Should have default categories created
    await page.goto('/dashboard/categorias')
    await expect(page.locator('[data-testid="category-item"]')).toHaveCount.greaterThan(0)
  })

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/auth/login')

    await page.fill('[name="email"]', 'test@example.com')
    await page.fill('[name="password"]', 'testpassword123')
    await page.click('button[type="submit"]')

    await expect(page).toHaveURL('/dashboard')
    await expect(page.locator('text=Dashboard')).toBeVisible()
  })

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/auth/login')

    await page.fill('[name="email"]', 'wrong@example.com')
    await page.fill('[name="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    await expect(page.locator('text=Credenciais inválidas')).toBeVisible()
  })

  test('should redirect to login when accessing protected route', async ({ page }) => {
    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})
```

#### Transaction Management (`tests/e2e/transactions.spec.ts`)

```typescript
// tests/e2e/transactions.spec.ts
import { test, expect } from './fixtures/test-user'

test.describe('Transaction Management', () => {
  test('should create a new expense', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/transacoes')

    // Open new transaction modal
    await page.click('button:has-text("Nova Transação")')

    // Fill form
    await page.fill('[name="description"]', 'Test Expense')
    await page.fill('[name="amount"]', '150.50')
    await page.selectOption('[name="type"]', 'EXPENSE')
    await page.fill('[name="date"]', '2024-01-15')

    // Select category
    await page.click('[data-testid="category-select"]')
    await page.click('text=Alimentação')

    // Submit
    await page.click('button:has-text("Salvar")')

    // Verify transaction appears in list
    await expect(page.locator('text=Test Expense')).toBeVisible()
    await expect(page.locator('text=R$ 150,50')).toBeVisible()
  })

  test('should create installment transaction', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/transacoes')
    await page.click('button:has-text("Nova Transação")')

    await page.fill('[name="description"]', 'Installment Purchase')
    await page.fill('[name="amount"]', '100')
    await page.selectOption('[name="type"]', 'EXPENSE')

    // Enable installments
    await page.click('[data-testid="installments-toggle"]')
    await page.fill('[name="installments"]', '10')

    await page.click('button:has-text("Salvar")')

    // Verify first installment appears
    await expect(page.locator('text=Installment Purchase 1/10')).toBeVisible()

    // Navigate to check future months have installments
    await page.click('[data-testid="next-month"]')
    await expect(page.locator('text=Installment Purchase 2/10')).toBeVisible()
  })

  test('should edit existing transaction', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/transacoes')

    // Click edit on first transaction
    await page.click('[data-testid="transaction-item"]:first-child [data-testid="edit-button"]')

    // Modify description
    await page.fill('[name="description"]', 'Updated Description')
    await page.click('button:has-text("Salvar")')

    await expect(page.locator('text=Updated Description')).toBeVisible()
  })

  test('should delete transaction (soft delete)', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/transacoes')

    const initialCount = await page.locator('[data-testid="transaction-item"]').count()

    // Delete first transaction
    await page.click('[data-testid="transaction-item"]:first-child [data-testid="delete-button"]')
    await page.click('button:has-text("Confirmar")')

    // Verify count decreased
    await expect(page.locator('[data-testid="transaction-item"]')).toHaveCount(initialCount - 1)

    // Verify in trash
    await page.goto('/dashboard/lixeira')
    await expect(page.locator('[data-testid="deleted-transaction"]')).toHaveCount.greaterThan(0)
  })

  test('should filter transactions', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/transacoes')

    // Open filter drawer
    await page.click('button:has-text("Filtros")')

    // Filter by type
    await page.selectOption('[name="type"]', 'INCOME')
    await page.click('button:has-text("Aplicar")')

    // All visible transactions should be income
    const transactions = page.locator('[data-testid="transaction-item"]')
    const count = await transactions.count()

    for (let i = 0; i < count; i++) {
      await expect(transactions.nth(i).locator('[data-testid="type-badge"]')).toHaveText('Receita')
    }
  })
})
```

#### CSV Import Flow (`tests/e2e/import.spec.ts`)

```typescript
// tests/e2e/import.spec.ts
import { test, expect } from './fixtures/test-user'
import path from 'path'

test.describe('CSV Import', () => {
  test('should import C6 bank statement', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard/importar')

    // Upload CSV file
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles(path.join(__dirname, '../fixtures/csv-samples/c6-statement.csv'))

    // Should show preview
    await expect(page.locator('[data-testid="import-preview"]')).toBeVisible()
    await expect(page.locator('[data-testid="preview-row"]')).toHaveCount.greaterThan(0)

    // Should detect bank
    await expect(page.locator('text=C6 Bank')).toBeVisible()

    // Confirm import
    await page.click('button:has-text("Importar")')

    // Should show success message
    await expect(page.locator('text=transações importadas')).toBeVisible()

    // Verify transactions exist
    await page.goto('/dashboard/transacoes')
    await expect(page.locator('[data-testid="transaction-item"]')).toHaveCount.greaterThan(0)
  })

  test('should detect and warn about duplicates', async ({ authenticatedPage: page }) => {
    // First import
    await page.goto('/dashboard/importar')
    await page.locator('input[type="file"]').setInputFiles(
      path.join(__dirname, '../fixtures/csv-samples/c6-statement.csv')
    )
    await page.click('button:has-text("Importar")')
    await page.waitForSelector('text=transações importadas')

    // Second import of same file
    await page.goto('/dashboard/importar')
    await page.locator('input[type="file"]').setInputFiles(
      path.join(__dirname, '../fixtures/csv-samples/c6-statement.csv')
    )

    // Should show duplicate warning
    await expect(page.locator('[data-testid="duplicate-warning"]')).toBeVisible()
    await expect(page.locator('text=duplicadas')).toBeVisible()
  })

  test('should suggest linking to recurring expenses', async ({ authenticatedPage: page }) => {
    // Create recurring expense first
    await page.goto('/dashboard/recorrentes')
    await page.click('button:has-text("Nova Despesa")')
    await page.fill('[name="description"]', 'Netflix')
    await page.fill('[name="amount"]', '39.90')
    await page.click('button:has-text("Salvar")')

    // Import CSV with Netflix transaction
    await page.goto('/dashboard/importar')
    await page.locator('input[type="file"]').setInputFiles(
      path.join(__dirname, '../fixtures/csv-samples/netflix-statement.csv')
    )

    // Should suggest linking
    await expect(page.locator('[data-testid="recurring-suggestion"]')).toBeVisible()
    await expect(page.locator('text=Netflix')).toBeVisible()
  })
})
```

#### Investment Management (`tests/e2e/investments.spec.ts`)

```typescript
// tests/e2e/investments.spec.ts
import { test, expect } from './fixtures/test-user'

test.describe('Investment Management', () => {
  test('should create new investment', async ({ authenticatedPage: page }) => {
    await page.goto('/investments')

    await page.click('button:has-text("Novo Investimento")')

    await page.fill('[name="name"]', 'Tesouro Selic')
    await page.fill('[name="currentValue"]', '10000')
    await page.fill('[name="goalAmount"]', '50000')

    // Select category
    await page.click('[data-testid="category-select"]')
    await page.click('text=Renda Fixa')

    await page.click('button:has-text("Salvar")')

    await expect(page.locator('text=Tesouro Selic')).toBeVisible()
    await expect(page.locator('text=R$ 10.000,00')).toBeVisible()
  })

  test('should add deposit to investment', async ({ authenticatedPage: page }) => {
    await page.goto('/investments')

    // Click on investment card
    await page.click('[data-testid="investment-card"]:first-child')

    // Add deposit
    await page.click('button:has-text("Depositar")')
    await page.fill('[name="amount"]', '1000')
    await page.fill('[name="date"]', '2024-01-20')
    await page.click('button:has-text("Confirmar")')

    // Value should update
    await expect(page.locator('[data-testid="current-value"]')).toContainText('11.000')
  })

  test('should show portfolio summary', async ({ authenticatedPage: page }) => {
    await page.goto('/investments')

    // Summary card should show totals
    await expect(page.locator('[data-testid="total-invested"]')).toBeVisible()
    await expect(page.locator('[data-testid="total-return"]')).toBeVisible()
    await expect(page.locator('[data-testid="category-distribution"]')).toBeVisible()
  })

  test('should calculate returns correctly', async ({ authenticatedPage: page }) => {
    await page.goto('/investments')

    // Create investment with known values
    await page.click('button:has-text("Novo Investimento")')
    await page.fill('[name="name"]', 'Return Test')
    await page.fill('[name="currentValue"]', '11000') // Current value
    await page.fill('[name="totalInvested"]', '10000') // Original investment
    await page.click('button:has-text("Salvar")')

    // Return should be 10%
    await expect(page.locator('[data-testid="return-percentage"]')).toContainText('10%')
  })
})
```

#### Dashboard Analytics (`tests/e2e/dashboard.spec.ts`)

```typescript
// tests/e2e/dashboard.spec.ts
import { test, expect } from './fixtures/test-user'

test.describe('Dashboard', () => {
  test('should display monthly summary', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard')

    await expect(page.locator('[data-testid="total-income"]')).toBeVisible()
    await expect(page.locator('[data-testid="total-expense"]')).toBeVisible()
    await expect(page.locator('[data-testid="balance"]')).toBeVisible()
  })

  test('should show category breakdown chart', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard')

    await expect(page.locator('[data-testid="category-chart"]')).toBeVisible()
  })

  test('should navigate between months', async ({ authenticatedPage: page }) => {
    await page.goto('/dashboard')

    const currentMonth = await page.locator('[data-testid="current-month"]').textContent()

    await page.click('[data-testid="prev-month"]')

    const newMonth = await page.locator('[data-testid="current-month"]').textContent()
    expect(newMonth).not.toBe(currentMonth)
  })

  test('should show budget alerts when over budget', async ({ authenticatedPage: page }) => {
    // Setup: Create budget and exceed it
    await page.goto('/dashboard/orcamentos')
    await page.click('button:has-text("Novo Orçamento")')
    await page.fill('[name="amount"]', '100')
    await page.click('[data-testid="category-select"]')
    await page.click('text=Alimentação')
    await page.click('button:has-text("Salvar")')

    // Create transaction exceeding budget
    await page.goto('/dashboard/transacoes')
    await page.click('button:has-text("Nova Transação")')
    await page.fill('[name="description"]', 'Big Meal')
    await page.fill('[name="amount"]', '150')
    await page.click('[data-testid="category-select"]')
    await page.click('text=Alimentação')
    await page.click('button:has-text("Salvar")')

    // Check dashboard for alert
    await page.goto('/dashboard')
    await expect(page.locator('[data-testid="budget-alert"]')).toBeVisible()
    await expect(page.locator('text=Alimentação')).toBeVisible()
  })
})
```

---

## Test Database Strategy

### Option 1: SQLite Test Database (Recommended for Local)

```bash
# .env.test
DATABASE_URL="file:./test.db"
```

**Pros:** Fast, no external dependencies
**Cons:** Slight differences from production PostgreSQL

### Option 2: Docker PostgreSQL

```yaml
# docker-compose.test.yml
version: '3.8'
services:
  test-db:
    image: postgres:15
    environment:
      POSTGRES_DB: mypocket_test
      POSTGRES_USER: test
      POSTGRES_PASSWORD: test
    ports:
      - "5433:5432"
```

```bash
# .env.test
DATABASE_URL="postgresql://test:test@localhost:5433/mypocket_test"
```

### Database Reset Strategy

```typescript
// tests/helpers/db-reset.ts
import { prisma } from '@/lib/db'

export async function resetDatabase() {
  // Delete in dependency order
  await prisma.$transaction([
    prisma.investmentTransaction.deleteMany(),
    prisma.investmentSnapshot.deleteMany(),
    prisma.investment.deleteMany(),
    prisma.investmentCategory.deleteMany(),
    prisma.transaction.deleteMany(),
    prisma.installment.deleteMany(),
    prisma.recurringExpense.deleteMany(),
    prisma.categoryRule.deleteMany(),
    prisma.budget.deleteMany(),
    prisma.category.deleteMany(),
    prisma.origin.deleteMany(),
    prisma.settings.deleteMany(),
    prisma.savingsHistory.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.passwordResetCode.deleteMany(),
    prisma.user.deleteMany()
  ])
}

export async function seedTestData() {
  // Create test user and default data
  const user = await prisma.user.create({
    data: {
      id: 'test-user-id',
      email: 'test@example.com',
      password: '$2a$10$...' // bcrypt hash of 'testpassword123'
    }
  })

  // Initialize defaults (mirrors production behavior)
  await initializeUserDefaults(user.id)

  return user
}
```

---

## CI/CD Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/test.yml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npm run test:unit

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json

  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_DB: mypocket_test
          POSTGRES_USER: test
          POSTGRES_PASSWORD: test
        ports:
          - 5432:5432
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npx prisma migrate deploy
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/mypocket_test
      - run: npm run test:integration
        env:
          DATABASE_URL: postgresql://test:test@localhost:5432/mypocket_test

  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e

      - name: Upload Playwright Report
        uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

### Package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:all": "npm run test:unit && npm run test:integration && npm run test:e2e"
  }
}
```

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1)
- [ ] Install Vitest and configure
- [ ] Install Playwright and configure
- [ ] Set up test database infrastructure
- [ ] Create mock utilities (Prisma, NextAuth)
- [ ] Write first unit tests for `utils.ts`

### Phase 2: Core Business Logic (Week 2)
- [ ] Complete `categorizer.ts` unit tests
- [ ] Complete `csv-parser.ts` unit tests
- [ ] Add `ocr-parser.ts` tests
- [ ] Achieve 80% coverage on `/src/lib/`

### Phase 3: API Integration Tests (Week 3)
- [ ] Transactions API tests
- [ ] Summary API tests
- [ ] Import API tests
- [ ] Duplicate detection tests

### Phase 4: E2E Critical Paths (Week 4)
- [ ] Authentication flow
- [ ] Transaction CRUD flow
- [ ] CSV import flow
- [ ] Dashboard viewing

### Phase 5: Extended Coverage (Week 5+)
- [ ] Investment management E2E
- [ ] Recurring expenses E2E
- [ ] Budget management E2E
- [ ] Mobile responsive tests

---

## Test Coverage Goals

| Area | Target Coverage | Priority |
|------|----------------|----------|
| `src/lib/categorizer.ts` | 95% | Critical |
| `src/lib/csv-parser.ts` | 90% | Critical |
| `src/lib/utils.ts` | 100% | High |
| API Routes | 80% | High |
| Components | 60% | Medium |
| E2E Flows | 10 critical paths | High |

---

## Quick Start Commands

```bash
# Install test dependencies
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom @playwright/test

# Initialize Playwright
npx playwright install

# Run all tests
npm run test:all

# Run unit tests with watch mode
npm run test

# Run E2E tests with UI
npm run test:e2e:ui
```

---

## Notes

1. **Mocking NextAuth**: Use `vi.mock('@/auth')` to mock authentication in API tests
2. **Timezone handling**: Always use UTC in tests to avoid flaky date comparisons
3. **Parallel execution**: Playwright tests run in parallel by default; ensure test isolation
4. **Test data cleanup**: Each test should clean up after itself or use isolated transactions
5. **Flaky test prevention**: Use Playwright's auto-waiting; avoid arbitrary `sleep()` calls
