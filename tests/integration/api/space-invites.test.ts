// tests/integration/api/space-invites.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  default: {
    spaceMember: { findUnique: vi.fn(), create: vi.fn() },
    spaceInvite: {
      findMany: vi.fn(),
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    space: { findUnique: vi.fn() },
  },
}))

vi.mock('@/lib/auth-utils', () => ({
  getAuthenticatedUserId: vi.fn().mockResolvedValue('test-user-id'),
  unauthorizedResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  ),
}))

vi.mock('@/lib/space-context', () => ({
  validateSpaceAccess: vi.fn(),
  SpacePermissions: vi.fn().mockImplementation((role: string) => ({
    canManageSpace: () => role === 'ADMIN',
  })),
}))

import prisma from '@/lib/db'
import { validateSpaceAccess } from '@/lib/space-context'
import { GET, POST } from '@/app/api/spaces/[spaceId]/invites/route'

const mockPrisma = prisma as unknown as {
  spaceMember: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
  spaceInvite: {
    findMany: ReturnType<typeof vi.fn>
    create: ReturnType<typeof vi.fn>
    findUnique: ReturnType<typeof vi.fn>
    update: ReturnType<typeof vi.fn>
  }
  space: { findUnique: ReturnType<typeof vi.fn> }
}

function createRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options)
}

describe('POST /api/spaces/[spaceId]/invites', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates an email invite when user is ADMIN', async () => {
    ;(validateSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: 'ADMIN',
    })
    mockPrisma.spaceInvite.create.mockResolvedValue({
      id: 'invite-1',
      email: 'partner@email.com',
      role: 'MEMBER',
      code: 'abc123',
      status: 'PENDING',
    })

    const res = await POST(
      createRequest('/api/spaces/space-1/invites', {
        method: 'POST',
        body: JSON.stringify({
          email: 'partner@email.com',
          role: 'MEMBER',
        }),
      }),
      { params: Promise.resolve({ spaceId: 'space-1' }) }
    )

    expect(res.status).toBe(201)
    expect(mockPrisma.spaceInvite.create).toHaveBeenCalled()
  })

  it('returns 403 when non-ADMIN tries to invite', async () => {
    ;(validateSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: 'MEMBER',
    })

    const res = await POST(
      createRequest('/api/spaces/space-1/invites', {
        method: 'POST',
        body: JSON.stringify({
          email: 'partner@email.com',
          role: 'MEMBER',
        }),
      }),
      { params: Promise.resolve({ spaceId: 'space-1' }) }
    )

    expect(res.status).toBe(403)
  })

  it('creates a link invite (no email)', async () => {
    ;(validateSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: 'ADMIN',
    })
    mockPrisma.spaceInvite.create.mockResolvedValue({
      id: 'invite-2',
      email: null,
      role: 'LIMITED',
      code: 'xyz789',
      status: 'PENDING',
    })

    const res = await POST(
      createRequest('/api/spaces/space-1/invites', {
        method: 'POST',
        body: JSON.stringify({ role: 'LIMITED' }),
      }),
      { params: Promise.resolve({ spaceId: 'space-1' }) }
    )

    expect(res.status).toBe(201)
  })
})

describe('GET /api/spaces/[spaceId]/invites', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns pending invites for ADMIN', async () => {
    ;(validateSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: 'ADMIN',
    })
    mockPrisma.spaceInvite.findMany.mockResolvedValue([
      { id: 'invite-1', email: 'test@test.com', status: 'PENDING' },
    ])

    const res = await GET(
      createRequest('/api/spaces/space-1/invites'),
      { params: Promise.resolve({ spaceId: 'space-1' }) }
    )

    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data).toHaveLength(1)
  })

  it('returns 403 for non-ADMIN', async () => {
    ;(validateSpaceAccess as ReturnType<typeof vi.fn>).mockResolvedValue({
      role: 'MEMBER',
    })

    const res = await GET(
      createRequest('/api/spaces/space-1/invites'),
      { params: Promise.resolve({ spaceId: 'space-1' }) }
    )

    expect(res.status).toBe(403)
  })
})
