// src/app/api/spaces/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthenticatedUserId, handleApiError } from '@/lib/auth-utils'
import { setActiveSpaceId } from '@/lib/space-context'

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId()

    const memberships = await prisma.spaceMember.findMany({
      where: { userId },
      include: {
        space: {
          select: { id: true, name: true, createdBy: true, createdAt: true },
        },
      },
    })

    return NextResponse.json(memberships)
  } catch (error) {
    return handleApiError(error, 'buscar espaços')
  }
}

export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    // Create space with creator as ADMIN
    const space = await prisma.space.create({
      data: {
        name: name.trim(),
        createdBy: userId,
        members: {
          create: { userId, role: 'ADMIN' },
        },
      },
      include: { members: true },
    })

    // Copy user's categories, origins, rules, investment categories to space
    await copyUserDataToSpace(userId, space.id)

    // Auto-activate the new space
    await setActiveSpaceId(space.id)

    return NextResponse.json(space, { status: 201 })
  } catch (error) {
    return handleApiError(error, 'criar espaço')
  }
}

async function copyUserDataToSpace(userId: string, spaceId: string) {
  await prisma.$transaction(async (tx) => {
    // Copy categories
    const categories = await tx.category.findMany({
      where: { userId, spaceId: null },
    })
    if (categories.length > 0) {
      await tx.category.createMany({
        data: categories.map((c) => ({
          name: c.name,
          color: c.color,
          icon: c.icon,
          spaceId,
        })),
      })
    }

    // Copy origins
    const origins = await tx.origin.findMany({
      where: { userId, spaceId: null },
    })
    if (origins.length > 0) {
      await tx.origin.createMany({
        data: origins.map((o) => ({
          name: o.name,
          spaceId,
        })),
      })
    }

    // Copy investment categories
    const investmentCategories = await tx.investmentCategory.findMany({
      where: { userId, spaceId: null },
    })
    if (investmentCategories.length > 0) {
      await tx.investmentCategory.createMany({
        data: investmentCategories.map((ic) => ({
          name: ic.name,
          icon: ic.icon,
          color: ic.color,
          spaceId,
        })),
      })
    }

    // Copy category rules (need new category IDs)
    const spaceCategories = await tx.category.findMany({
      where: { spaceId },
    })
    const categoryNameToId = new Map(spaceCategories.map((c) => [c.name, c.id]))

    const rules = await tx.categoryRule.findMany({
      where: { userId, spaceId: null },
      include: { category: true },
    })
    const rulesToCreate = rules
      .filter((r) => categoryNameToId.has(r.category.name))
      .map((r) => ({
        keyword: r.keyword,
        categoryId: categoryNameToId.get(r.category.name)!,
        spaceId,
      }))
    if (rulesToCreate.length > 0) {
      await tx.categoryRule.createMany({ data: rulesToCreate })
    }
  })
}
