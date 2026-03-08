// src/app/api/spaces/[spaceId]/migrate/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthenticatedUserId, unauthorizedResponse } from '@/lib/auth-utils'
import { validateSpaceAccess } from '@/lib/space-context'

export async function POST(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId()
    const { spaceId } = await params
    await validateSpaceAccess(userId, spaceId)

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

    // Copy transactions
    const transactions = await prisma.transaction.findMany({
      where: { userId, spaceId: null, deletedAt: null },
    })

    let copiedCount = 0
    for (const tx of transactions) {
      const mappedCategoryId = tx.categoryId
        ? categoryMap.get(tx.categoryId) || tx.categoryId
        : null

      await prisma.transaction.create({
        data: {
          description: tx.description,
          amount: tx.amount,
          type: tx.type,
          date: tx.date,
          isFixed: tx.isFixed,
          origin: tx.origin,
          tags: tx.tags,
          userId,
          spaceId,
          categoryId: mappedCategoryId,
          createdByUserId: userId,
        },
      })
      copiedCount++
    }

    return NextResponse.json({
      message: `${copiedCount} transacoes copiadas para o espaco`,
      copiedCount,
    })
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
