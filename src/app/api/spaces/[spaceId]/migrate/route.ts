// src/app/api/spaces/[spaceId]/migrate/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthenticatedUserId, handleApiError } from '@/lib/auth-utils'
import { validateSpaceAccess } from '@/lib/space-context'

/**
 * GET - Check migration status for the current user
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId()
    const { spaceId } = await params
    const membership = await validateSpaceAccess(userId, spaceId)

    return NextResponse.json({ hasMigrated: membership.hasMigrated })
  } catch (error) {
    return handleApiError(error, 'verificar migração')
  }
}

/**
 * POST - Migrate personal data (categories, origins, rules, transactions) to the space.
 * Each member can migrate their own personal data once.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ spaceId: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId()
    const { spaceId } = await params
    const membership = await validateSpaceAccess(userId, spaceId)

    // Check hasMigrated flag on the membership record
    if (membership.hasMigrated) {
      return NextResponse.json(
        { error: 'Seus dados já foram migrados para este espaço' },
        { status: 409 }
      )
    }

    const result = await prisma.$transaction(async (tx) => {
      // ========== 1. Copy missing categories ==========
      const userCategories = await tx.category.findMany({
        where: { userId, spaceId: null },
      })
      const existingSpaceCategories = await tx.category.findMany({
        where: { spaceId },
      })
      const existingCategoryNames = new Set(existingSpaceCategories.map((c) => c.name))

      const newCategories = userCategories.filter((c) => !existingCategoryNames.has(c.name))
      if (newCategories.length > 0) {
        await tx.category.createMany({
          data: newCategories.map((c) => ({
            name: c.name,
            color: c.color,
            icon: c.icon,
            spaceId,
          })),
        })
      }

      // ========== 2. Copy missing origins ==========
      const userOrigins = await tx.origin.findMany({
        where: { userId, spaceId: null },
      })
      const existingSpaceOrigins = await tx.origin.findMany({
        where: { spaceId },
      })
      const existingOriginNames = new Set(existingSpaceOrigins.map((o) => o.name))

      const newOrigins = userOrigins.filter((o) => !existingOriginNames.has(o.name))
      if (newOrigins.length > 0) {
        await tx.origin.createMany({
          data: newOrigins.map((o) => ({
            name: o.name,
            type: o.type,
            creditLimit: o.creditLimit,
            rotativoRateMonth: o.rotativoRateMonth,
            parcelamentoRate: o.parcelamentoRate,
            cetAnual: o.cetAnual,
            billingCycleDay: o.billingCycleDay,
            dueDateDay: o.dueDateDay,
            spaceId,
          })),
        })
      }

      // ========== 3. Copy missing category rules ==========
      // Re-fetch space categories to include newly created ones
      const allSpaceCategories = await tx.category.findMany({
        where: { spaceId },
      })
      const categoryNameToSpaceId = new Map(allSpaceCategories.map((c) => [c.name, c.id]))

      const userRules = await tx.categoryRule.findMany({
        where: { userId, spaceId: null },
        include: { category: true },
      })
      const existingSpaceRules = await tx.categoryRule.findMany({
        where: { spaceId },
        select: { keyword: true, categoryId: true },
      })
      // Dedup by keyword+categoryId pair (matches the unique constraint)
      const existingRuleKeys = new Set(existingSpaceRules.map((r) => `${r.keyword}::${r.categoryId}`))

      const newRules = userRules
        .filter((r) => {
          const spaceCatId = categoryNameToSpaceId.get(r.category.name)
          return spaceCatId && !existingRuleKeys.has(`${r.keyword}::${spaceCatId}`)
        })
        .map((r) => ({
          keyword: r.keyword,
          categoryId: categoryNameToSpaceId.get(r.category.name)!,
          spaceId,
        }))
      if (newRules.length > 0) {
        await tx.categoryRule.createMany({ data: newRules })
      }

      // ========== 4. Build category ID mapping for transactions ==========
      const categoryMap = new Map<string, string>()
      for (const uc of userCategories) {
        const sc = allSpaceCategories.find((sc) => sc.name === uc.name)
        if (sc) {
          categoryMap.set(uc.id, sc.id)
        }
      }

      // ========== 5. Copy transactions ==========
      const transactions = await tx.transaction.findMany({
        where: { userId, spaceId: null, deletedAt: null },
      })

      const transactionData = transactions.map((txn) => ({
        description: txn.description,
        amount: txn.amount,
        type: txn.type,
        date: txn.date,
        isFixed: txn.isFixed,
        origin: txn.origin,
        tags: txn.tags,
        userId,
        spaceId,
        // Map category to space equivalent, or null if no match
        categoryId: txn.categoryId ? categoryMap.get(txn.categoryId) ?? null : null,
        createdByUserId: userId,
      }))

      let copiedCount = 0
      if (transactionData.length > 0) {
        const result = await tx.transaction.createMany({ data: transactionData })
        copiedCount = result.count
      }

      // ========== 6. Mark migration as done ==========
      await tx.spaceMember.update({
        where: { spaceId_userId: { spaceId, userId } },
        data: { hasMigrated: true },
      })

      return {
        copiedCount,
        newCategories: newCategories.length,
        newOrigins: newOrigins.length,
        newRules: newRules.length,
      }
    })

    return NextResponse.json({
      message: 'Migração concluída',
      ...result,
    })
  } catch (error) {
    return handleApiError(error, 'migrar dados')
  }
}
