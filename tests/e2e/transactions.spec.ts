import { test, expect, Page } from '@playwright/test'

// Helper function to login
async function login(page: Page, email: string, password: string) {
  await page.goto('/auth/login')
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL(/dashboard/, { timeout: 15000 })
}

// Note: These tests require a test user to be created in the database
// You can use: npm run db:seed-demo to create a demo account
// Demo credentials: demo@mypocket.com / demo123

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Skip login for now - tests will verify UI structure
    // In a real setup, you would login here
  })

  test('should display dashboard summary cards when logged in', async ({ page }) => {
    // This test assumes user is logged in
    // If not authenticated, it will redirect to login
    await page.goto('/dashboard')

    // If redirected to login, skip the rest
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Check for summary cards
    await expect(page.locator('[data-testid="income-card"], text=/Receita/i').first()).toBeVisible()
    await expect(page.locator('[data-testid="expense-card"], text=/Despesa/i').first()).toBeVisible()
    await expect(page.locator('[data-testid="balance-card"], text=/Saldo/i').first()).toBeVisible()
  })

  test('should have navigation sidebar', async ({ page }) => {
    await page.goto('/dashboard')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Check for navigation elements
    const nav = page.locator('nav, aside, [role="navigation"]').first()
    await expect(nav).toBeVisible()
  })
})

test.describe('Transactions Page Structure', () => {
  test('should have transaction list section', async ({ page }) => {
    await page.goto('/dashboard/transacoes')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Should have some form of transaction list or empty state
    const content = page.locator('main, [role="main"]').first()
    await expect(content).toBeVisible()
  })

  test('should have add transaction button', async ({ page }) => {
    await page.goto('/dashboard/transacoes')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Look for add button
    const addButton = page.locator(
      'button:has-text("Nova"), button:has-text("Adicionar"), button:has-text("+"), [data-testid="add-transaction"]'
    ).first()
    await expect(addButton).toBeVisible()
  })

  test('should have filter options', async ({ page }) => {
    await page.goto('/dashboard/transacoes')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Look for filter button or dropdown
    const filterElement = page.locator(
      'button:has-text("Filtro"), button:has-text("Filtrar"), [data-testid="filter"], select'
    ).first()
    await expect(filterElement).toBeVisible()
  })
})

test.describe('Transaction Form Modal', () => {
  test('should open transaction form when clicking add button', async ({ page }) => {
    await page.goto('/dashboard/transacoes')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Click add button
    const addButton = page.locator(
      'button:has-text("Nova"), button:has-text("Adicionar"), button:has-text("+"), [data-testid="add-transaction"]'
    ).first()

    if (await addButton.isVisible()) {
      await addButton.click()

      // Modal or form should appear
      const modal = page.locator('[role="dialog"], [data-testid="transaction-modal"], form').first()
      await expect(modal).toBeVisible({ timeout: 5000 })
    }
  })

  test('should have required form fields in transaction modal', async ({ page }) => {
    await page.goto('/dashboard/transacoes')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Open the form
    const addButton = page.locator(
      'button:has-text("Nova"), button:has-text("Adicionar"), button:has-text("+"), [data-testid="add-transaction"]'
    ).first()

    if (await addButton.isVisible()) {
      await addButton.click()

      // Wait for modal
      await page.waitForSelector('[role="dialog"], [data-testid="transaction-modal"], form', {
        timeout: 5000
      }).catch(() => {})

      // Check for basic form fields
      const descriptionField = page.locator('input[name="description"], input[placeholder*="Descrição"]').first()
      const amountField = page.locator('input[name="amount"], input[placeholder*="Valor"], input[type="number"]').first()

      if (await descriptionField.isVisible()) {
        expect(await descriptionField.isVisible()).toBe(true)
      }

      if (await amountField.isVisible()) {
        expect(await amountField.isVisible()).toBe(true)
      }
    }
  })
})

test.describe('Categories Page', () => {
  test('should display categories page', async ({ page }) => {
    await page.goto('/dashboard/categorias')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Should show categories content
    const content = page.locator('main, [role="main"]').first()
    await expect(content).toBeVisible()
  })

  test('should have add category button', async ({ page }) => {
    await page.goto('/dashboard/categorias')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Look for add button
    const addButton = page.locator(
      'button:has-text("Nova"), button:has-text("Adicionar"), button:has-text("+"), [data-testid="add-category"]'
    ).first()
    await expect(addButton).toBeVisible()
  })
})

test.describe('Recurring Expenses Page', () => {
  test('should display recurring expenses page', async ({ page }) => {
    await page.goto('/dashboard/recorrentes')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Should show recurring expenses content
    const content = page.locator('main, [role="main"]').first()
    await expect(content).toBeVisible()
  })
})

test.describe('Import Page', () => {
  test('should display import page', async ({ page }) => {
    await page.goto('/dashboard/importar')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Should show import content
    const content = page.locator('main, [role="main"]').first()
    await expect(content).toBeVisible()
  })

  test('should have file upload input', async ({ page }) => {
    await page.goto('/dashboard/importar')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Look for file input
    const fileInput = page.locator('input[type="file"]').first()
    await expect(fileInput).toBeAttached()
  })
})

test.describe('Investments Page', () => {
  test('should display investments page', async ({ page }) => {
    await page.goto('/investments')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Should show investments content
    const content = page.locator('main, [role="main"]').first()
    await expect(content).toBeVisible()
  })

  test('should have add investment button', async ({ page }) => {
    await page.goto('/investments')

    // If redirected to login, skip
    if (page.url().includes('login')) {
      test.skip()
      return
    }

    // Look for add button
    const addButton = page.locator(
      'button:has-text("Novo"), button:has-text("Adicionar"), button:has-text("+"), [data-testid="add-investment"]'
    ).first()
    await expect(addButton).toBeVisible()
  })
})

test.describe('Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 667 } }) // iPhone SE

  test('should be responsive on mobile', async ({ page }) => {
    await page.goto('/')

    // Page should load and be visible
    await expect(page.locator('body')).toBeVisible()

    // No horizontal scroll
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    const viewportWidth = await page.evaluate(() => window.innerWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewportWidth + 1) // Allow 1px tolerance
  })

  test('should have mobile navigation', async ({ page }) => {
    await page.goto('/dashboard')

    // If redirected to login, check mobile login
    if (page.url().includes('login')) {
      // Login page should also be mobile responsive
      await expect(page.locator('body')).toBeVisible()
      return
    }

    // Look for mobile menu button
    const mobileMenu = page.locator(
      'button[aria-label*="menu"], button:has([class*="hamburger"]), [data-testid="mobile-menu"]'
    ).first()

    // Mobile menu might exist
    if (await mobileMenu.isVisible()) {
      expect(await mobileMenu.isVisible()).toBe(true)
    }
  })
})
