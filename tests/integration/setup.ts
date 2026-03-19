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
vi.mock('@/lib/auth-utils', () => {
  const { NextResponse } = require('next/server')
  return {
    getAuthenticatedUserId: vi.fn().mockResolvedValue('test-user-id'),
    getAuthContext: vi.fn().mockResolvedValue({
      userId: 'test-user-id',
      spaceId: null,
      permissions: null,
      ownerFilter: { userId: 'test-user-id' },
    }),
    unauthorizedResponse: vi.fn().mockReturnValue(
      new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
    ),
    forbiddenResponse: vi.fn().mockReturnValue(
      new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
    ),
    getOptionalSession: vi.fn().mockResolvedValue({
      user: { id: 'test-user-id', email: 'test@example.com' }
    }),
    handleApiError: vi.fn().mockImplementation((error: unknown, context: string) => {
      return NextResponse.json({ error: `Erro ao ${context}` }, { status: 500 })
    }),
  }
})

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
