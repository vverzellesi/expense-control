// src/app/api/spaces/[spaceId]/members/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthenticatedUserId, unauthorizedResponse } from '@/lib/auth-utils'
import { validateSpaceAccess } from '@/lib/space-context'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId()
    const { spaceId } = await params
    await validateSpaceAccess(userId, spaceId)

    const members = await prisma.spaceMember.findMany({
      where: { spaceId },
      include: {
        user: { select: { id: true, name: true, email: true, image: true } },
      },
    })

    return NextResponse.json(members)
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
