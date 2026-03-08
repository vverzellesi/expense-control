// src/app/api/invites/pending/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthenticatedUserId, unauthorizedResponse } from '@/lib/auth-utils'
import { auth } from '@/auth'

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId()
    const session = await auth()
    const email = session?.user?.email

    if (!email) {
      return NextResponse.json([])
    }

    const invites = await prisma.spaceInvite.findMany({
      where: {
        email: email.toLowerCase(),
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      include: {
        space: { select: { id: true, name: true } },
      },
    })

    return NextResponse.json(invites)
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedResponse()
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
