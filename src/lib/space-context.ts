// src/lib/space-context.ts
import prisma from '@/lib/db'
import { cookies } from 'next/headers'

type SpaceRole = 'ADMIN' | 'MEMBER' | 'LIMITED'

export class SpacePermissions {
  constructor(private role: SpaceRole) {}

  canViewTransactions(): boolean {
    return true // all roles
  }

  canEditTransactions(): boolean {
    return true // all roles (LIMITED edits only own)
  }

  canViewAllTransactions(): boolean {
    return this.role !== 'LIMITED'
  }

  canViewInvestments(): boolean {
    return this.role === 'ADMIN' || this.role === 'MEMBER'
  }

  canViewBudgets(): boolean {
    return this.role === 'ADMIN' || this.role === 'MEMBER'
  }

  canManageSpace(): boolean {
    return this.role === 'ADMIN'
  }

  canViewIncomes(): boolean {
    return this.role === 'ADMIN' || this.role === 'MEMBER'
  }
}

export async function validateSpaceAccess(userId: string, spaceId: string) {
  const membership = await prisma.spaceMember.findUnique({
    where: {
      spaceId_userId: { spaceId, userId },
    },
  })

  if (!membership) {
    // Clear stale cookie when membership no longer exists
    try {
      const cookieStore = await cookies()
      cookieStore.delete('activeSpaceId')
    } catch {
      // Cookie clearing may fail in some contexts, ignore
    }
    throw new Error('Forbidden')
  }

  return membership
}

export async function getActiveSpaceId(): Promise<string | null> {
  const cookieStore = await cookies()
  return cookieStore.get('activeSpaceId')?.value ?? null
}

export async function setActiveSpaceId(spaceId: string | null): Promise<void> {
  const cookieStore = await cookies()
  if (spaceId) {
    cookieStore.set('activeSpaceId', spaceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    })
  } else {
    cookieStore.delete('activeSpaceId')
  }
}
