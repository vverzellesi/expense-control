// src/app/api/spaces/[spaceId]/members/[memberId]/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthenticatedUserId, unauthorizedResponse } from '@/lib/auth-utils'
import { validateSpaceAccess, SpacePermissions } from '@/lib/space-context'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ spaceId: string; memberId: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId()
    const { spaceId, memberId } = await params
    const membership = await validateSpaceAccess(userId, spaceId)
    const perms = new SpacePermissions(membership.role)

    if (!perms.canManageSpace()) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    const body = await request.json()
    const { role } = body

    if (!role || !['ADMIN', 'MEMBER', 'LIMITED'].includes(role)) {
      return NextResponse.json({ error: 'Role inválido' }, { status: 400 })
    }

    const updated = await prisma.spaceMember.update({
      where: { id: memberId },
      data: { role },
    })

    return NextResponse.json(updated)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedResponse()
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ spaceId: string; memberId: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId()
    const { spaceId, memberId } = await params
    const membership = await validateSpaceAccess(userId, spaceId)
    const perms = new SpacePermissions(membership.role)

    // Can remove self, or admin can remove others
    const targetMember = await prisma.spaceMember.findUnique({
      where: { id: memberId },
    })

    if (!targetMember || targetMember.spaceId !== spaceId) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
    }

    const isSelf = targetMember.userId === userId
    if (!isSelf && !perms.canManageSpace()) {
      return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
    }

    await prisma.spaceMember.delete({ where: { id: memberId } })

    return NextResponse.json({ message: 'Membro removido' })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedResponse()
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Sem acesso' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
