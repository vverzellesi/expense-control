import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock auth
vi.mock('@/auth', () => ({
  auth: vi.fn(),
}))

// Mock space-context
vi.mock('./space-context', () => ({
  getActiveSpaceId: vi.fn(),
  validateSpaceAccess: vi.fn(),
  hasExplicitSpaceContext: vi.fn(),
  getUserDefaultSpace: vi.fn(),
  setActiveSpaceId: vi.fn(),
  SpacePermissions: vi.fn().mockImplementation((role: string) => ({
    _role: role,
  })),
}))

import { auth } from '@/auth'
import { getActiveSpaceId, validateSpaceAccess, SpacePermissions, hasExplicitSpaceContext, getUserDefaultSpace, setActiveSpaceId } from './space-context'
import { getAuthContext, forbiddenResponse } from './auth-utils'

const mockAuth = auth as ReturnType<typeof vi.fn>
const mockGetActiveSpaceId = getActiveSpaceId as ReturnType<typeof vi.fn>
const mockValidateSpaceAccess = validateSpaceAccess as ReturnType<typeof vi.fn>
const mockHasExplicit = hasExplicitSpaceContext as ReturnType<typeof vi.fn>
const mockGetDefaultSpace = getUserDefaultSpace as ReturnType<typeof vi.fn>
const mockSetActiveSpaceId = setActiveSpaceId as ReturnType<typeof vi.fn>

describe('getAuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns personal context when explicit personal context is set', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockHasExplicit.mockResolvedValue(true)
    mockGetActiveSpaceId.mockResolvedValue(null)

    const ctx = await getAuthContext()

    expect(ctx).toEqual({
      userId: 'user-1',
      spaceId: null,
      permissions: null,
      ownerFilter: { userId: 'user-1' },
    })
    expect(mockValidateSpaceAccess).not.toHaveBeenCalled()
  })

  it('returns space context when active space exists', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockHasExplicit.mockResolvedValue(true)
    mockGetActiveSpaceId.mockResolvedValue('space-1')
    mockValidateSpaceAccess.mockResolvedValue({
      id: 'member-1',
      spaceId: 'space-1',
      userId: 'user-1',
      role: 'ADMIN',
    })

    const ctx = await getAuthContext()

    expect(ctx.userId).toBe('user-1')
    expect(ctx.spaceId).toBe('space-1')
    expect(ctx.permissions).toBeDefined()
    expect(ctx.ownerFilter).toEqual({ spaceId: 'space-1' })
    expect(SpacePermissions).toHaveBeenCalledWith('ADMIN')
  })

  it('auto-defaults to space when no explicit context and user has space', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockHasExplicit.mockResolvedValue(false)
    mockGetDefaultSpace.mockResolvedValue({ spaceId: 'space-1', role: 'ADMIN' })

    const ctx = await getAuthContext()

    expect(ctx.spaceId).toBe('space-1')
    expect(ctx.ownerFilter).toEqual({ spaceId: 'space-1' })
    expect(mockSetActiveSpaceId).toHaveBeenCalledWith('space-1')
  })

  it('sets personal context when no explicit context and no spaces', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockHasExplicit.mockResolvedValue(false)
    mockGetDefaultSpace.mockResolvedValue(null)
    mockGetActiveSpaceId.mockResolvedValue(null)

    const ctx = await getAuthContext()

    expect(ctx).toEqual({
      userId: 'user-1',
      spaceId: null,
      permissions: null,
      ownerFilter: { userId: 'user-1' },
    })
    expect(mockSetActiveSpaceId).toHaveBeenCalledWith(null)
  })

  it('throws Unauthorized when no session', async () => {
    mockAuth.mockResolvedValue(null)

    await expect(getAuthContext()).rejects.toThrow('Unauthorized')
  })

  it('throws Forbidden when user is not a space member', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })
    mockHasExplicit.mockResolvedValue(true)
    mockGetActiveSpaceId.mockResolvedValue('space-1')
    mockValidateSpaceAccess.mockRejectedValue(new Error('Forbidden'))

    await expect(getAuthContext()).rejects.toThrow('Forbidden')
  })
})

describe('forbiddenResponse', () => {
  it('returns 403 JSON response', async () => {
    const response = forbiddenResponse()
    expect(response.status).toBe(403)
    const body = await response.json()
    expect(body).toEqual({ error: 'Forbidden' })
  })
})
