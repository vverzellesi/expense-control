import { test as base, Page } from '@playwright/test'

type TestFixtures = {
  authenticatedPage: Page
}

// Test user credentials
export const TEST_USER = {
  email: 'e2e-test@example.com',
  password: 'testpassword123',
  name: 'E2E Test User'
}

// Extend base test with authentication fixture
export const test = base.extend<TestFixtures>({
  authenticatedPage: async ({ page }, use) => {
    // Navigate to login
    await page.goto('/auth/login')

    // Fill login form
    await page.fill('[name="email"]', TEST_USER.email)
    await page.fill('[name="password"]', TEST_USER.password)

    // Submit and wait for navigation
    await page.click('button[type="submit"]')
    await page.waitForURL('/dashboard', { timeout: 10000 })

    // Use the authenticated page
    await use(page)
  }
})

export { expect } from '@playwright/test'
