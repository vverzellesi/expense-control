import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock auth-utils
vi.mock('@/lib/auth-utils', () => ({
  getAuthContext: vi.fn(),
  unauthorizedResponse: vi.fn(() => {
    const { NextResponse } = require('next/server')
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }),
  handleApiError: vi.fn((error: unknown, context: string) => {
    const { NextResponse } = require('next/server')
    if (error instanceof Error && error.message === 'Unauthorized') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }),
}))

import { GET } from './route'
import { getAuthContext } from '@/lib/auth-utils'

const mockGetAuthContext = getAuthContext as ReturnType<typeof vi.fn>

describe('GET /api/spaces/active/permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns personal permissions when no space context', async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: 'user-1',
      spaceId: null,
      permissions: null,
      ownerFilter: { userId: 'user-1' },
    })

    const response = await GET()
    const body = await response.json()

    expect(body.canViewTransactions).toBe(true)
    expect(body.canEditTransactions).toBe(true)
    expect(body.canViewAllTransactions).toBe(true)
    expect(body.canViewInvestments).toBe(true)
    expect(body.canViewBudgets).toBe(true)
    expect(body.canManageSpace).toBe(false)
    expect(body.canViewIncomes).toBe(true)
    expect(body.isSpaceContext).toBe(false)
    expect(body.role).toBeNull()
  })

  it('returns space permissions based on role', async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: 'user-1',
      spaceId: 'space-1',
      permissions: {
        canViewTransactions: () => true,
        canEditTransactions: () => true,
        canViewAllTransactions: () => false,
        canViewInvestments: () => false,
        canViewBudgets: () => false,
        canManageSpace: () => false,
        canViewIncomes: () => false,
      },
      ownerFilter: { spaceId: 'space-1' },
    })

    const response = await GET()
    const body = await response.json()

    expect(body.canViewTransactions).toBe(true)
    expect(body.canEditTransactions).toBe(true)
    expect(body.canViewAllTransactions).toBe(false)
    expect(body.canViewInvestments).toBe(false)
    expect(body.canViewBudgets).toBe(false)
    expect(body.canManageSpace).toBe(false)
    expect(body.canViewIncomes).toBe(false)
    expect(body.isSpaceContext).toBe(true)
    expect(body.role).toBeNull()
  })

  it('returns admin permissions for ADMIN role', async () => {
    mockGetAuthContext.mockResolvedValue({
      userId: 'user-1',
      spaceId: 'space-1',
      permissions: {
        canViewTransactions: () => true,
        canEditTransactions: () => true,
        canViewAllTransactions: () => true,
        canViewInvestments: () => true,
        canViewBudgets: () => true,
        canManageSpace: () => true,
        canViewIncomes: () => true,
      },
      ownerFilter: { spaceId: 'space-1' },
    })

    const response = await GET()
    const body = await response.json()

    expect(body.canManageSpace).toBe(true)
    expect(body.canViewInvestments).toBe(true)
    expect(body.isSpaceContext).toBe(true)
  })

  it('returns 401 when user is not authenticated', async () => {
    mockGetAuthContext.mockRejectedValue(new Error('Unauthorized'))

    const response = await GET()

    expect(response.status).toBe(401)
  })

  it('returns 500 on unexpected errors', async () => {
    mockGetAuthContext.mockRejectedValue(new Error('Database error'))

    const response = await GET()

    expect(response.status).toBe(500)
  })
})
