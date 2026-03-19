// src/app/api/spaces/[spaceId]/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthenticatedUserId, handleApiError } from '@/lib/auth-utils'
import { validateSpaceAccess, SpacePermissions, setActiveSpaceId } from '@/lib/space-context'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId()
    const { spaceId } = await params
    const membership = await validateSpaceAccess(userId, spaceId)
    const perms = new SpacePermissions(membership.role)

    if (!perms.canManageSpace()) {
      return NextResponse.json({ error: 'Apenas administradores podem excluir o espaço' }, { status: 403 })
    }

    // Delete space transactions first (schema uses onDelete: SetNull, so we clean up explicitly)
    await prisma.transaction.deleteMany({ where: { spaceId } })

    // Delete the space (cascades: members, invites, categories, origins, budgets, rules, etc.)
    await prisma.space.delete({ where: { id: spaceId } })

    // Clear active space cookie
    await setActiveSpaceId(null)

    return NextResponse.json({ message: 'Espaço excluído' })
  } catch (error) {
    return handleApiError(error, 'excluir espaço')
  }
}
