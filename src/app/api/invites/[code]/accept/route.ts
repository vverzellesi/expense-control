// src/app/api/invites/[code]/accept/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthenticatedUserId, unauthorizedResponse } from '@/lib/auth-utils'
import { auth } from '@/auth'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId()
    const { code } = await params

    const invite = await prisma.spaceInvite.findUnique({
      where: { code },
      include: { space: true },
    })

    if (!invite || invite.status !== 'PENDING') {
      return NextResponse.json({ error: 'Convite inválido' }, { status: 404 })
    }

    if (invite.expiresAt < new Date()) {
      await prisma.spaceInvite.update({
        where: { id: invite.id },
        data: { status: 'EXPIRED' },
      })
      return NextResponse.json({ error: 'Convite expirado' }, { status: 410 })
    }

    // MVP: limitar a um espaço por usuário
    const existingMemberships = await prisma.spaceMember.findMany({
      where: { userId },
    })
    if (existingMemberships.length > 0) {
      return NextResponse.json(
        { error: 'Você já participa de um espaço. No momento, só é possível participar de um espaço.' },
        { status: 409 }
      )
    }

    // Verify email match for email-targeted invites
    if (invite.email) {
      const session = await auth()
      if (session?.user?.email?.toLowerCase() !== invite.email.toLowerCase()) {
        return NextResponse.json({ error: 'Este convite foi enviado para outro email' }, { status: 403 })
      }
    }

    // Check if already a member
    const existingMember = await prisma.spaceMember.findUnique({
      where: {
        spaceId_userId: { spaceId: invite.spaceId, userId },
      },
    })

    if (existingMember) {
      return NextResponse.json({ error: 'Já é membro deste espaço' }, { status: 409 })
    }

    // Add as member and mark invite as accepted
    await prisma.$transaction([
      prisma.spaceMember.create({
        data: {
          spaceId: invite.spaceId,
          userId,
          role: invite.role,
        },
      }),
      prisma.spaceInvite.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' },
      }),
    ])

    return NextResponse.json({
      message: 'Convite aceito',
      space: invite.space,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedResponse()
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
