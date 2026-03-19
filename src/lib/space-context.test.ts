// src/lib/space-context.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock prisma
vi.mock('@/lib/db', () => ({
  default: {
    spaceMember: {
      findUnique: vi.fn(),
    },
  },
}))

import prisma from '@/lib/db'
import { validateSpaceAccess, SpacePermissions } from './space-context'

const mockPrisma = prisma as unknown as {
  spaceMember: { findUnique: ReturnType<typeof vi.fn> }
}

describe('SpacePermissions', () => {
  it('ADMIN can access all modules', () => {
    const perms = new SpacePermissions('ADMIN')
    expect(perms.canViewTransactions()).toBe(true)
    expect(perms.canEditTransactions()).toBe(true)
    expect(perms.canViewInvestments()).toBe(true)
    expect(perms.canViewBudgets()).toBe(true)
    expect(perms.canManageSpace()).toBe(true)
    expect(perms.canViewAllTransactions()).toBe(true)
  })

  it('MEMBER can access all except space management', () => {
    const perms = new SpacePermissions('MEMBER')
    expect(perms.canViewTransactions()).toBe(true)
    expect(perms.canEditTransactions()).toBe(true)
    expect(perms.canViewInvestments()).toBe(true)
    expect(perms.canViewBudgets()).toBe(true)
    expect(perms.canManageSpace()).toBe(false)
    expect(perms.canViewAllTransactions()).toBe(true)
  })

  it('LIMITED can only view/edit own transactions', () => {
    const perms = new SpacePermissions('LIMITED')
    expect(perms.canViewTransactions()).toBe(true)
    expect(perms.canEditTransactions()).toBe(true)
    expect(perms.canViewInvestments()).toBe(false)
    expect(perms.canViewBudgets()).toBe(false)
    expect(perms.canManageSpace()).toBe(false)
    expect(perms.canViewAllTransactions()).toBe(false)
  })
})

describe('validateSpaceAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns membership when user is a member', async () => {
    mockPrisma.spaceMember.findUnique.mockResolvedValue({
      id: 'member-1',
      spaceId: 'space-1',
      userId: 'user-1',
      role: 'ADMIN',
    })

    const result = await validateSpaceAccess('user-1', 'space-1')
    expect(result).toEqual({
      id: 'member-1',
      spaceId: 'space-1',
      userId: 'user-1',
      role: 'ADMIN',
    })
  })

  it('throws when user is not a member', async () => {
    mockPrisma.spaceMember.findUnique.mockResolvedValue(null)

    await expect(validateSpaceAccess('user-1', 'space-1'))
      .rejects.toThrow('Forbidden')
  })
})
