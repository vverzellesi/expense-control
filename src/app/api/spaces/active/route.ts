// src/app/api/spaces/active/route.ts
import { NextResponse } from 'next/server'
import { getAuthenticatedUserId, unauthorizedResponse } from '@/lib/auth-utils'
import { setActiveSpaceId, validateSpaceAccess } from '@/lib/space-context'

export async function PUT(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const body = await request.json()
    const { spaceId } = body // null = conta pessoal

    if (spaceId) {
      await validateSpaceAccess(userId, spaceId)
    }

    await setActiveSpaceId(spaceId)

    return NextResponse.json({ activeSpaceId: spaceId })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedResponse()
    }
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ error: 'Sem acesso ao espaço' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
