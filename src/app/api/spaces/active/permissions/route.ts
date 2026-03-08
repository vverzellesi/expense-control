import { NextResponse } from 'next/server'
import { getAuthContext } from '@/lib/auth-utils'
import { unauthorizedResponse } from '@/lib/auth-utils'

export async function GET() {
  try {
    const ctx = await getAuthContext()

    if (!ctx.spaceId || !ctx.permissions) {
      return NextResponse.json({
        canViewTransactions: true,
        canEditTransactions: true,
        canViewAllTransactions: true,
        canViewInvestments: true,
        canViewBudgets: true,
        canManageSpace: false,
        canViewIncomes: true,
        isSpaceContext: false,
        role: null,
      })
    }

    return NextResponse.json({
      canViewTransactions: ctx.permissions.canViewTransactions(),
      canEditTransactions: ctx.permissions.canEditTransactions(),
      canViewAllTransactions: ctx.permissions.canViewAllTransactions(),
      canViewInvestments: ctx.permissions.canViewInvestments(),
      canViewBudgets: ctx.permissions.canViewBudgets(),
      canManageSpace: ctx.permissions.canManageSpace(),
      canViewIncomes: ctx.permissions.canViewIncomes(),
      isSpaceContext: true,
      role: null, // role is internal
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedResponse()
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
