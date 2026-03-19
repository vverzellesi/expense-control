// src/app/api/invites/[code]/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { handleApiError } from '@/lib/auth-utils'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const { code } = await params

    const invite = await prisma.spaceInvite.findUnique({
      where: { code },
      include: { space: { select: { id: true, name: true } } },
    })

    if (!invite || invite.status !== 'PENDING') {
      return NextResponse.json({ error: 'Convite inválido ou já utilizado' }, { status: 404 })
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ error: 'Convite expirado' }, { status: 410 })
    }

    return NextResponse.json({
      spaceName: invite.space.name,
      role: invite.role,
      expiresAt: invite.expiresAt,
    })
  } catch (error) {
    return handleApiError(error, 'buscar convite')
  }
}
