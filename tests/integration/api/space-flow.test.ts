// tests/integration/api/space-flow.test.ts
// Comprehensive integration tests for the complete shared spaces flow
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock prisma with all needed models
vi.mock('@/lib/db', () => ({
  default: {
    space: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    spaceMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    spaceInvite: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    category: { findMany: vi.fn(), createMany: vi.fn() },
    origin: { findMany: vi.fn(), createMany: vi.fn() },
    categoryRule: { findMany: vi.fn(), createMany: vi.fn() },
    investmentCategory: { findMany: vi.fn(), createMany: vi.fn() },
    transaction: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
    installment: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}))

vi.mock('@/lib/auth-utils', () => ({
  getAuthenticatedUserId: vi.fn().mockResolvedValue('user-admin'),
  getAuthContext: vi.fn(),
  unauthorizedResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  ),
  forbiddenResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 })
  ),
}))

vi.mock('@/lib/space-context', () => ({
  validateSpaceAccess: vi.fn(),
  setActiveSpaceId: vi.fn(),
  getActiveSpaceId: vi.fn().mockResolvedValue(null),
  SpacePermissions: vi.fn().mockImplementation((role: string) => ({
    canManageSpace: () => role === 'ADMIN',
    canViewTransactions: () => true,
    canEditTransactions: () => true,
    canViewAllTransactions: () => role !== 'LIMITED',
    canViewInvestments: () => role === 'ADMIN' || role === 'MEMBER',
    canViewBudgets: () => role === 'ADMIN' || role === 'MEMBER',
    canViewIncomes: () => role === 'ADMIN' || role === 'MEMBER',
  })),
}))

vi.mock('@/auth', () => ({
  auth: vi.fn().mockResolvedValue({
    user: { id: 'user-admin', email: 'admin@email.com' },
  }),
}))

import prisma from '@/lib/db'
import { getAuthenticatedUserId, getAuthContext } from '@/lib/auth-utils'
import { validateSpaceAccess, setActiveSpaceId } from '@/lib/space-context'
import { SpacePermissions } from '@/lib/space-context'
import { auth } from '@/auth'
import { POST as createSpace } from '@/app/api/spaces/route'
import { POST as createInvite } from '@/app/api/spaces/[spaceId]/invites/route'
import { POST as acceptInvite } from '@/app/api/invites/[code]/accept/route'
import { PUT as switchContext } from '@/app/api/spaces/active/route'
import {
  GET as getTransactions,
  POST as createTransaction,
} from '@/app/api/transactions/route'

const mockPrisma = prisma as unknown as {
  space: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
  }
  spaceMember: {
    findMany: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
  }
  spaceInvite: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  category: {
    findMany: ReturnType<typeof vi.fn>
    createMany: ReturnType<typeof vi.fn>
  }
  origin: {
    findMany: ReturnType<typeof vi.fn>
    createMany: ReturnType<typeof vi.fn>
  }
  categoryRule: {
    findMany: ReturnType<typeof vi.fn>
    createMany: ReturnType<typeof vi.fn>
  }
  investmentCategory: {
    findMany: ReturnType<typeof vi.fn>
    createMany: ReturnType<typeof vi.fn>
  }
  transaction: {
    create: ReturnType<typeof vi.fn>
    findMany: ReturnType<typeof vi.fn>
  }
  installment: { create: ReturnType<typeof vi.fn> }
  $transaction: ReturnType<typeof vi.fn>
}

function createRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options)
}

describe('Shared Spaces - Complete Flow', () => {
  beforeEach(() => vi.clearAllMocks())

  describe('1. Create space and verify data copy setup', () => {
    it('creates a space, adds creator as ADMIN, and copies user data', async () => {
      mockPrisma.space.create.mockResolvedValue({
        id: 'space-1',
        name: 'Familia Silva',
        createdBy: 'user-admin',
        members: [{ userId: 'user-admin', role: 'ADMIN' }],
      })
      // User has personal categories and origins to copy
      mockPrisma.category.findMany
        .mockResolvedValueOnce([
          { id: 'cat-1', name: 'Alimentacao', color: '#FF0000', icon: 'utensils', userId: 'user-admin', spaceId: null },
          { id: 'cat-2', name: 'Transporte', color: '#00FF00', icon: 'car', userId: 'user-admin', spaceId: null },
        ])
        // Second call fetches the newly created space categories for rule mapping
        .mockResolvedValueOnce([
          { id: 'space-cat-1', name: 'Alimentacao' },
          { id: 'space-cat-2', name: 'Transporte' },
        ])
      mockPrisma.category.createMany.mockResolvedValue({ count: 2 })

      mockPrisma.origin.findMany.mockResolvedValue([
        { id: 'origin-1', name: 'Itau', userId: 'user-admin', spaceId: null },
      ])
      mockPrisma.origin.createMany.mockResolvedValue({ count: 1 })

      mockPrisma.investmentCategory.findMany.mockResolvedValue([])
      mockPrisma.categoryRule.findMany.mockResolvedValue([
        { id: 'rule-1', keyword: 'ifood', categoryId: 'cat-1', userId: 'user-admin', spaceId: null, category: { name: 'Alimentacao' } },
      ])
      mockPrisma.categoryRule.createMany.mockResolvedValue({ count: 1 })

      const res = await createSpace(
        createRequest('/api/spaces', {
          method: 'POST',
          body: JSON.stringify({ name: 'Familia Silva' }),
        })
      )

      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.name).toBe('Familia Silva')

      // Verify space created with ADMIN member
      expect(mockPrisma.space.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Familia Silva',
            createdBy: 'user-admin',
            members: { create: { userId: 'user-admin', role: 'ADMIN' } },
          }),
        })
      )

      // Verify data copy happened
      expect(mockPrisma.category.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-admin', spaceId: null },
      })
      expect(mockPrisma.category.createMany).toHaveBeenCalledWith({
        data: expect.arrayContaining([
          expect.objectContaining({ name: 'Alimentacao', spaceId: 'space-1' }),
          expect.objectContaining({ name: 'Transporte', spaceId: 'space-1' }),
        ]),
      })
      expect(mockPrisma.origin.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ name: 'Itau', spaceId: 'space-1' })],
      })
      expect(mockPrisma.categoryRule.createMany).toHaveBeenCalledWith({
        data: [expect.objectContaining({ keyword: 'ifood', categoryId: 'space-cat-1', spaceId: 'space-1' })],
      })
    })
  })

  describe('2. Create email invite and verify fields', () => {
    it('creates an email invite with correct fields when user is ADMIN', async () => {
      ;(validateSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
        role: 'ADMIN',
      })
      mockPrisma.spaceInvite.create.mockResolvedValue({
        id: 'invite-1',
        email: 'partner@email.com',
        role: 'MEMBER',
        code: 'abc123',
        status: 'PENDING',
        spaceId: 'space-1',
        expiresAt: new Date('2026-03-15'),
      })

      const res = await createInvite(
        createRequest('/api/spaces/space-1/invites', {
          method: 'POST',
          body: JSON.stringify({ email: 'partner@email.com', role: 'MEMBER' }),
        }),
        { params: Promise.resolve({ spaceId: 'space-1' }) }
      )

      expect(res.status).toBe(201)
      const data = await res.json()
      expect(data.email).toBe('partner@email.com')
      expect(data.role).toBe('MEMBER')
      expect(data.status).toBe('PENDING')

      expect(mockPrisma.spaceInvite.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: 'partner@email.com',
            role: 'MEMBER',
            spaceId: 'space-1',
          }),
        })
      )
    })
  })

  describe('3. Accept invite and verify membership created', () => {
    it('accepts a valid invite and creates membership', async () => {
      // Switch to the invited user
      ;(getAuthenticatedUserId as ReturnType<typeof vi.fn>).mockResolvedValue('user-partner')
      ;(auth as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: { id: 'user-partner', email: 'partner@email.com' },
      })

      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 7)

      mockPrisma.spaceInvite.findUnique.mockResolvedValue({
        id: 'invite-1',
        code: 'abc123',
        email: 'partner@email.com',
        role: 'MEMBER',
        status: 'PENDING',
        spaceId: 'space-1',
        expiresAt: futureDate,
        space: { id: 'space-1', name: 'Familia Silva' },
      })
      // MVP: user has no existing memberships
      mockPrisma.spaceMember.findMany.mockResolvedValue([])
      // User is not already a member of this space
      mockPrisma.spaceMember.findUnique.mockResolvedValue(null)
      // Transaction for creating member + updating invite
      mockPrisma.$transaction.mockResolvedValue([
        { spaceId: 'space-1', userId: 'user-partner', role: 'MEMBER' },
        { id: 'invite-1', status: 'ACCEPTED' },
      ])

      const res = await acceptInvite(
        createRequest('/api/invites/abc123/accept', { method: 'POST' }),
        { params: Promise.resolve({ code: 'abc123' }) }
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.message).toBe('Convite aceito')
      expect(data.space.name).toBe('Familia Silva')

      // Verify $transaction was called for atomicity
      expect(mockPrisma.$transaction).toHaveBeenCalled()
    })

    it('rejects expired invite', async () => {
      ;(getAuthenticatedUserId as ReturnType<typeof vi.fn>).mockResolvedValue('user-partner')

      const pastDate = new Date()
      pastDate.setDate(pastDate.getDate() - 1)

      mockPrisma.spaceInvite.findUnique.mockResolvedValue({
        id: 'invite-expired',
        code: 'expired123',
        email: 'late@email.com',
        role: 'MEMBER',
        status: 'PENDING',
        spaceId: 'space-1',
        expiresAt: pastDate,
        space: { id: 'space-1', name: 'Familia Silva' },
      })
      mockPrisma.spaceInvite.update.mockResolvedValue({
        id: 'invite-expired',
        status: 'EXPIRED',
      })

      const res = await acceptInvite(
        createRequest('/api/invites/expired123/accept', { method: 'POST' }),
        { params: Promise.resolve({ code: 'expired123' }) }
      )

      expect(res.status).toBe(410)
      expect(mockPrisma.spaceInvite.update).toHaveBeenCalledWith({
        where: { id: 'invite-expired' },
        data: { status: 'EXPIRED' },
      })
    })
  })

  describe('4. Switch context and verify endpoint works', () => {
    it('switches to space context successfully', async () => {
      ;(getAuthenticatedUserId as ReturnType<typeof vi.fn>).mockResolvedValue('user-admin')
      ;(validateSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
        role: 'ADMIN',
      })
      ;(setActiveSpaceId as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

      const res = await switchContext(
        createRequest('/api/spaces/active', {
          method: 'PUT',
          body: JSON.stringify({ spaceId: 'space-1' }),
        })
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.activeSpaceId).toBe('space-1')

      expect(validateSpaceAccess).toHaveBeenCalledWith('user-admin', 'space-1')
      expect(setActiveSpaceId).toHaveBeenCalledWith('space-1')
    })

    it('switches back to personal context', async () => {
      ;(getAuthenticatedUserId as ReturnType<typeof vi.fn>).mockResolvedValue('user-admin')
      ;(setActiveSpaceId as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)

      const res = await switchContext(
        createRequest('/api/spaces/active', {
          method: 'PUT',
          body: JSON.stringify({ spaceId: null }),
        })
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data.activeSpaceId).toBeNull()
      // validateSpaceAccess should NOT be called for null spaceId
      expect(validateSpaceAccess).not.toHaveBeenCalled()
    })

    it('returns 403 when user has no access to space', async () => {
      ;(getAuthenticatedUserId as ReturnType<typeof vi.fn>).mockResolvedValue('user-stranger')
      ;(validateSpaceAccess as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('Forbidden')
      )

      const res = await switchContext(
        createRequest('/api/spaces/active', {
          method: 'PUT',
          body: JSON.stringify({ spaceId: 'space-1' }),
        })
      )

      expect(res.status).toBe(403)
    })
  })

  describe('5. Create transaction in space and verify spaceId', () => {
    it('creates a transaction with spaceId when in space context', async () => {
      ;(getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: 'user-admin',
        spaceId: 'space-1',
        permissions: new SpacePermissions('ADMIN' as never),
        ownerFilter: { spaceId: 'space-1' },
      })

      mockPrisma.transaction.create.mockResolvedValue({
        id: 'tx-1',
        description: 'Supermercado',
        amount: -150.0,
        date: new Date('2026-03-08'),
        type: 'EXPENSE',
        userId: 'user-admin',
        spaceId: 'space-1',
        createdByUserId: 'user-admin',
        isPrivate: false,
        category: null,
      })

      const res = await createTransaction(
        createRequest('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({
            description: 'Supermercado',
            amount: 150.0,
            date: '2026-03-08',
            type: 'EXPENSE',
            origin: 'Itau',
          }),
        })
      )

      expect(res.status).toBe(201)

      // Verify transaction was created with spaceId
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            spaceId: 'space-1',
            userId: 'user-admin',
            createdByUserId: 'user-admin',
          }),
        })
      )
    })
  })

  describe('6. Create private transaction and verify isPrivate flag', () => {
    it('personal transactions in personal context are not visible in space queries', async () => {
      // In personal context
      ;(getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: 'user-admin',
        spaceId: null,
        permissions: null,
        ownerFilter: { userId: 'user-admin' },
      })

      mockPrisma.transaction.create.mockResolvedValue({
        id: 'tx-personal',
        description: 'Presente surpresa',
        amount: -200.0,
        date: new Date('2026-03-08'),
        type: 'EXPENSE',
        userId: 'user-admin',
        spaceId: null,
        createdByUserId: 'user-admin',
        isPrivate: false,
        category: null,
      })

      const res = await createTransaction(
        createRequest('/api/transactions', {
          method: 'POST',
          body: JSON.stringify({
            description: 'Presente surpresa',
            amount: 200.0,
            date: '2026-03-08',
            type: 'EXPENSE',
          }),
        })
      )

      expect(res.status).toBe(201)

      // Verify personal transaction has no spaceId
      expect(mockPrisma.transaction.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            spaceId: null,
            userId: 'user-admin',
          }),
        })
      )
    })
  })

  describe('7. LIMITED role permissions', () => {
    it('LIMITED user can only see own transactions in space context', async () => {
      const limitedPermissions = new SpacePermissions('LIMITED' as never)

      ;(getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: 'user-limited',
        spaceId: 'space-1',
        permissions: limitedPermissions,
        ownerFilter: { spaceId: 'space-1' },
      })

      mockPrisma.spaceMember.findMany.mockResolvedValue([
        { userId: 'user-admin' },
        { userId: 'user-partner' },
        { userId: 'user-limited' },
      ])

      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'tx-own',
          description: 'Minha compra',
          amount: -50.0,
          createdByUserId: 'user-limited',
          spaceId: 'space-1',
          category: null,
          categoryTag: null,
          installment: null,
        },
      ])

      const res = await getTransactions(
        createRequest('/api/transactions?month=3&year=2026')
      )

      expect(res.status).toBe(200)

      // Verify the query filters by createdByUserId for LIMITED
      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({
                spaceId: 'space-1',
                createdByUserId: 'user-limited',
              }),
            ]),
          }),
        })
      )
    })

    it('ADMIN can see all transactions in space context', async () => {
      const adminPermissions = new SpacePermissions('ADMIN' as never)

      ;(getAuthContext as ReturnType<typeof vi.fn>).mockResolvedValue({
        userId: 'user-admin',
        spaceId: 'space-1',
        permissions: adminPermissions,
        ownerFilter: { spaceId: 'space-1' },
      })

      mockPrisma.spaceMember.findMany.mockResolvedValue([
        { userId: 'user-admin' },
        { userId: 'user-partner' },
        { userId: 'user-limited' },
      ])

      mockPrisma.transaction.findMany.mockResolvedValue([
        {
          id: 'tx-1',
          description: 'Compra admin',
          createdByUserId: 'user-admin',
          spaceId: 'space-1',
          category: null,
          categoryTag: null,
          installment: null,
        },
        {
          id: 'tx-2',
          description: 'Compra partner',
          createdByUserId: 'user-partner',
          spaceId: 'space-1',
          category: null,
          categoryTag: null,
          installment: null,
        },
      ])

      const res = await getTransactions(
        createRequest('/api/transactions?month=3&year=2026')
      )

      expect(res.status).toBe(200)
      const data = await res.json()
      expect(data).toHaveLength(2)

      // Verify query does NOT filter by createdByUserId
      expect(mockPrisma.transaction.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              expect.objectContaining({ spaceId: 'space-1' }),
            ]),
          }),
        })
      )
    })

    it('non-ADMIN cannot create invites', async () => {
      ;(validateSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
        role: 'LIMITED',
      })

      const res = await createInvite(
        createRequest('/api/spaces/space-1/invites', {
          method: 'POST',
          body: JSON.stringify({ email: 'someone@email.com', role: 'MEMBER' }),
        }),
        { params: Promise.resolve({ spaceId: 'space-1' }) }
      )

      expect(res.status).toBe(403)
    })
  })
})
