// src/app/api/spaces/active/route.ts
import { NextResponse } from 'next/server'
import { getAuthenticatedUserId, handleApiError } from '@/lib/auth-utils'
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
    return handleApiError(error, 'trocar contexto')
  }
}
