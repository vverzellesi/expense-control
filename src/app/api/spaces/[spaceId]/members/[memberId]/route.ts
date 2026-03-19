// src/app/api/spaces/[spaceId]/members/[memberId]/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthenticatedUserId, unauthorizedResponse, handleApiError } from '@/lib/auth-utils'
import { validateSpaceAccess, SpacePermissions } from '@/lib/space-context'

async function ensureNotLastAdmin(spaceId: string, targetRole: string) {
  if (targetRole !== 'ADMIN') return
  const adminCount = await prisma.spaceMember.count({
    where: { spaceId, role: 'ADMIN' },
  })
  if (adminCount <= 1) {
    return NextResponse.json(
      { error: 'O espaço precisa ter pelo menos um administrador' },
      { status: 400 }
    )
  }
  return null
}

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

    // Verify target member belongs to this space
    const targetMember = await prisma.spaceMember.findUnique({
      where: { id: memberId },
    })
    if (!targetMember || targetMember.spaceId !== spaceId) {
      return NextResponse.json({ error: 'Membro não encontrado' }, { status: 404 })
    }

    const body = await request.json()
    const { role } = body

    if (!role || !['ADMIN', 'MEMBER', 'LIMITED'].includes(role)) {
      return NextResponse.json({ error: 'Role inválido' }, { status: 400 })
    }

    // Prevent demoting the last admin
    if (targetMember.role === 'ADMIN' && role !== 'ADMIN') {
      const blocked = await ensureNotLastAdmin(spaceId, targetMember.role)
      if (blocked) return blocked
    }

    const updated = await prisma.spaceMember.update({
      where: { id: memberId },
      data: { role },
    })

    return NextResponse.json(updated)
  } catch (error) {
    return handleApiError(error, 'atualizar membro')
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

    // Prevent removing the last admin
    const blocked = await ensureNotLastAdmin(spaceId, targetMember.role)
    if (blocked) return blocked

    await prisma.spaceMember.delete({ where: { id: memberId } })

    return NextResponse.json({ message: 'Membro removido' })
  } catch (error) {
    return handleApiError(error, 'remover membro')
  }
}
