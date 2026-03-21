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
      await setActiveSpaceId(null)
    } catch {
      // Cookie clearing may fail in some contexts, ignore
    }
    throw new Error('Forbidden')
  }

  return membership
}

export async function getActiveSpaceId(): Promise<string | null> {
  const cookieStore = await cookies()
  const value = cookieStore.get('activeSpaceId')?.value
  if (!value || value === 'personal') return null
  return value
}

/**
 * Checks if the user has made an explicit space context choice.
 * Returns false only when no cookie exists (fresh login).
 */
export async function hasExplicitSpaceContext(): Promise<boolean> {
  const cookieStore = await cookies()
  return !!cookieStore.get('activeSpaceId')?.value
}

export async function setActiveSpaceId(spaceId: string | null): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.set('activeSpaceId', spaceId || 'personal', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  })
}

/**
 * Gets the user's first space membership for auto-defaulting.
 */
export async function getUserDefaultSpace(userId: string) {
  return prisma.spaceMember.findFirst({
    where: { userId },
    select: { spaceId: true, role: true },
  })
}
