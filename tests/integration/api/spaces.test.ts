// tests/integration/api/spaces.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  default: {
    space: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    spaceMember: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
    },
    category: { findMany: vi.fn(), createMany: vi.fn() },
    origin: { findMany: vi.fn(), createMany: vi.fn() },
    categoryRule: { findMany: vi.fn(), createMany: vi.fn() },
    investmentCategory: { findMany: vi.fn(), createMany: vi.fn() },
  },
}))

vi.mock('@/lib/auth-utils', () => ({
  getAuthenticatedUserId: vi.fn().mockResolvedValue('test-user-id'),
  unauthorizedResponse: vi.fn().mockReturnValue(
    new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  ),
}))

import prisma from '@/lib/db'
import { GET, POST } from '@/app/api/spaces/route'

const mockPrisma = prisma as unknown as {
  space: { findMany: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> }
  spaceMember: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> }
  category: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> }
  origin: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> }
  categoryRule: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> }
  investmentCategory: { findMany: ReturnType<typeof vi.fn>; createMany: ReturnType<typeof vi.fn> }
}

function createRequest(url: string, options?: RequestInit) {
  return new NextRequest(new URL(url, 'http://localhost:3000'), options)
}

describe('GET /api/spaces', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns spaces the user is a member of', async () => {
    mockPrisma.spaceMember.findMany.mockResolvedValue([
      {
        space: { id: 'space-1', name: 'Familia Silva', createdBy: 'test-user-id' },
        role: 'ADMIN',
      },
    ])

    const res = await GET(createRequest('/api/spaces'))
    const data = await res.json()

    expect(res.status).toBe(200)
    expect(data).toHaveLength(1)
    expect(data[0].space.name).toBe('Familia Silva')
  })
})

describe('POST /api/spaces', () => {
  beforeEach(() => vi.clearAllMocks())

  it('creates a space and adds creator as ADMIN', async () => {
    mockPrisma.space.create.mockResolvedValue({
      id: 'space-new',
      name: 'Minha Familia',
      createdBy: 'test-user-id',
    })
    mockPrisma.category.findMany.mockResolvedValue([])
    mockPrisma.origin.findMany.mockResolvedValue([])
    mockPrisma.categoryRule.findMany.mockResolvedValue([])
    mockPrisma.investmentCategory.findMany.mockResolvedValue([])

    const res = await POST(
      createRequest('/api/spaces', {
        method: 'POST',
        body: JSON.stringify({ name: 'Minha Familia' }),
      })
    )
    const data = await res.json()

    expect(res.status).toBe(201)
    expect(mockPrisma.space.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'Minha Familia',
          createdBy: 'test-user-id',
          members: {
            create: { userId: 'test-user-id', role: 'ADMIN' },
          },
        }),
      })
    )
  })

  it('returns 400 if name is missing', async () => {
    const res = await POST(
      createRequest('/api/spaces', {
        method: 'POST',
        body: JSON.stringify({}),
      })
    )
    expect(res.status).toBe(400)
  })
})
