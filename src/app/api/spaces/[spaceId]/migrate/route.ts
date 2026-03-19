// src/app/api/spaces/[spaceId]/migrate/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthenticatedUserId, handleApiError } from '@/lib/auth-utils'
import { validateSpaceAccess, SpacePermissions } from '@/lib/space-context'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId()
    const { spaceId } = await params
    const membership = await validateSpaceAccess(userId, spaceId)
    const perms = new SpacePermissions(membership.role)

    if (!perms.canManageSpace()) {
      return NextResponse.json({ error: 'Apenas administradores podem migrar dados' }, { status: 403 })
    }

    // Check if user already migrated to this space
    const existingMigrated = await prisma.transaction.findFirst({
      where: { spaceId, createdByUserId: userId },
    })
    if (existingMigrated) {
      return NextResponse.json(
        { error: 'Dados já foram migrados para este espaço' },
        { status: 409 }
      )
    }

    // Get space categories for mapping
    const spaceCategories = await prisma.category.findMany({
      where: { spaceId },
    })
    const userCategories = await prisma.category.findMany({
      where: { userId, spaceId: null },
    })

    // Map user category names to space category IDs
    const categoryMap = new Map<string, string>()
    for (const uc of userCategories) {
      const sc = spaceCategories.find((sc) => sc.name === uc.name)
      if (sc) {
        categoryMap.set(uc.id, sc.id)
      }
    }

    // Copy transactions inside a database transaction
    const transactions = await prisma.transaction.findMany({
      where: { userId, spaceId: null, deletedAt: null },
    })

    const transactionData = transactions.map((tx) => ({
      description: tx.description,
      amount: tx.amount,
      type: tx.type,
      date: tx.date,
      isFixed: tx.isFixed,
      origin: tx.origin,
      tags: tx.tags,
      userId,
      spaceId,
      categoryId: tx.categoryId
        ? categoryMap.get(tx.categoryId) || tx.categoryId
        : null,
      createdByUserId: userId,
    }))

    const result = await prisma.transaction.createMany({
      data: transactionData,
    })

    return NextResponse.json({
      message: `${result.count} transações copiadas para o espaço`,
      copiedCount: result.count,
    })
  } catch (error) {
    return handleApiError(error, 'migrar dados')
  }
}
