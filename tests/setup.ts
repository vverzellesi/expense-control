import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

// Mock Next.js router
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn()
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/'
}))

// Mock NextAuth
vi.mock('next-auth/react', () => ({
  useSession: () => ({
    data: {
      user: { id: 'test-user-id', email: 'test@example.com', name: 'Test User' }
    },
    status: 'authenticated'
  }),
  signIn: vi.fn(),
  signOut: vi.fn()
}))

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks()
})
