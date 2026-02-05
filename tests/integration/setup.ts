import { beforeAll, afterAll, beforeEach, vi } from 'vitest'

// Test user fixture
export const testUser = {
  id: 'test-user-id',
  email: 'test@example.com',
  password: '$2a$10$dummyhashfortesting',
  name: 'Test User'
}

// Mock NextAuth for API route testing
vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'test-user-id', email: 'test@example.com' }
  })
}))

// Mock auth-utils
vi.mock('@/lib/auth-utils', () => ({
  getAuthenticatedUserId: vi.fn().mockResolvedValue('test-user-id'),
  unauthorizedResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  ),
  getOptionalSession: vi.fn().mockResolvedValue({
    user: { id: 'test-user-id', email: 'test@example.com' }
  })
}))

beforeAll(async () => {
  console.log('Setting up integration tests...')
})

afterAll(async () => {
  console.log('Cleaning up integration tests...')
})

beforeEach(() => {
  vi.clearAllMocks()
})

export { vi }
