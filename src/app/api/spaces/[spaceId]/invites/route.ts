// src/app/api/spaces/[spaceId]/invites/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthenticatedUserId, handleApiError } from '@/lib/auth-utils'
import { validateSpaceAccess, SpacePermissions } from '@/lib/space-context'
import { randomBytes } from 'crypto'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId()
    const { spaceId } = await params
    const membership = await validateSpaceAccess(userId, spaceId)
    const perms = new SpacePermissions(membership.role)

    if (!perms.canManageSpace()) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const invites = await prisma.spaceInvite.findMany({
      where: { spaceId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    })

    return NextResponse.json(invites)
  } catch (error) {
    return handleApiError(error, 'buscar convites')
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId()
    const { spaceId } = await params
    const membership = await validateSpaceAccess(userId, spaceId)
    const perms = new SpacePermissions(membership.role)

    if (!perms.canManageSpace()) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await request.json()
    const { email, role } = body

    if (!role || !['ADMIN', 'MEMBER', 'LIMITED'].includes(role)) {
      return NextResponse.json({ error: 'Role inválido' }, { status: 400 })
    }

    const code = randomBytes(16).toString('hex')
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const invite = await prisma.spaceInvite.create({
      data: {
        spaceId,
        email: email?.toLowerCase() || null,
        code,
        role,
        expiresAt,
      },
    })

    return NextResponse.json(invite, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'criar convite')
  }
}
