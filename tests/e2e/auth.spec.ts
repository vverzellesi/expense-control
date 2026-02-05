import { test, expect } from '@playwright/test'

test.describe('Authentication', () => {
  test.describe('Login Page', () => {
    test('should display login form', async ({ page }) => {
      await page.goto('/auth/login')

      // Check page title or heading
      await expect(page.locator('h1, h2').first()).toBeVisible()

      // Check for email and password fields
      await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()
      await expect(page.locator('input[type="password"], input[name="password"]')).toBeVisible()

      // Check for submit button
      await expect(page.locator('button[type="submit"]')).toBeVisible()
    })

    test('should show error for invalid credentials', async ({ page }) => {
      await page.goto('/auth/login')

      // Fill in invalid credentials
      await page.fill('input[type="email"], input[name="email"]', 'invalid@example.com')
      await page.fill('input[type="password"], input[name="password"]', 'wrongpassword')

      // Submit the form
      await page.click('button[type="submit"]')

      // Should show an error message (wait for it to appear)
      await expect(
        page.locator('text=/invalid|incorret|erro|credenciais/i').first()
      ).toBeVisible({ timeout: 10000 })
    })

    test('should have link to registration page', async ({ page }) => {
      await page.goto('/auth/login')

      // Look for register link
      const registerLink = page.locator('a[href*="register"], a:has-text("Cadastr"), a:has-text("Criar conta")')
      await expect(registerLink.first()).toBeVisible()
    })

    test('should have link to forgot password', async ({ page }) => {
      await page.goto('/auth/login')

      // Look for forgot password link
      const forgotLink = page.locator('a[href*="forgot"], a:has-text("Esquec"), a:has-text("Recuperar")')
      await expect(forgotLink.first()).toBeVisible()
    })
  })

  test.describe('Registration Page', () => {
    test('should display registration form', async ({ page }) => {
      await page.goto('/auth/register')

      // Check for form fields
      await expect(page.locator('input[name="name"], input[placeholder*="Nome"]').first()).toBeVisible()
      await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()
      await expect(page.locator('input[type="password"]').first()).toBeVisible()

      // Check for submit button
      await expect(page.locator('button[type="submit"]')).toBeVisible()
    })

    test('should validate required fields', async ({ page }) => {
      await page.goto('/auth/register')

      // Try to submit empty form
      await page.click('button[type="submit"]')

      // Form should not navigate away (still on register page)
      await expect(page).toHaveURL(/register/)
    })

    test('should validate email format', async ({ page }) => {
      await page.goto('/auth/register')

      // Fill invalid email
      await page.fill('input[name="name"], input[placeholder*="Nome"]', 'Test User')
      await page.fill('input[type="email"], input[name="email"]', 'invalid-email')
      await page.fill('input[type="password"]', 'password123')

      // Submit
      await page.click('button[type="submit"]')

      // Should still be on register page or show error
      await expect(page).toHaveURL(/register/)
    })

    test('should have link to login page', async ({ page }) => {
      await page.goto('/auth/register')

      // Look for login link
      const loginLink = page.locator('a[href*="login"], a:has-text("Entrar"), a:has-text("Login")')
      await expect(loginLink.first()).toBeVisible()
    })
  })

  test.describe('Forgot Password Page', () => {
    test('should display forgot password form', async ({ page }) => {
      await page.goto('/auth/forgot-password')

      // Check for email field
      await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible()

      // Check for submit button
      await expect(page.locator('button[type="submit"]')).toBeVisible()
    })

    test('should have link back to login', async ({ page }) => {
      await page.goto('/auth/forgot-password')

      // Look for login link
      const loginLink = page.locator('a[href*="login"], a:has-text("Voltar"), a:has-text("Login")')
      await expect(loginLink.first()).toBeVisible()
    })
  })

  test.describe('Protected Routes', () => {
    test('should redirect to login when accessing dashboard unauthenticated', async ({ page }) => {
      await page.goto('/dashboard')

      // Should redirect to login page
      await expect(page).toHaveURL(/login/)
    })

    test('should redirect to login when accessing transactions page unauthenticated', async ({ page }) => {
      await page.goto('/dashboard/transacoes')

      // Should redirect to login page
      await expect(page).toHaveURL(/login/)
    })

    test('should redirect to login when accessing investments page unauthenticated', async ({ page }) => {
      await page.goto('/investments')

      // Should redirect to login page
      await expect(page).toHaveURL(/login/)
    })
  })

  test.describe('Public Pages', () => {
    test('should allow access to landing page', async ({ page }) => {
      await page.goto('/')

      // Should not redirect
      expect(page.url()).not.toContain('login')

      // Should show landing page content
      await expect(page.locator('body')).toBeVisible()
    })
  })
})
