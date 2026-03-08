// src/app/api/spaces/route.ts
import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { getAuthenticatedUserId, unauthorizedResponse } from '@/lib/auth-utils'

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
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedResponse()
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
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

    return NextResponse.json(space, { status: 201 })
  } catch (error) {
    if (error instanceof Error && error.message === 'Unauthorized') {
      return unauthorizedResponse()
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

async function copyUserDataToSpace(userId: string, spaceId: string) {
  // Copy categories
  const categories = await prisma.category.findMany({
    where: { userId, spaceId: null },
  })
  if (categories.length > 0) {
    await prisma.category.createMany({
      data: categories.map((c) => ({
        name: c.name,
        color: c.color,
        icon: c.icon,
        userId,
        spaceId,
      })),
    })
  }

  // Copy origins
  const origins = await prisma.origin.findMany({
    where: { userId, spaceId: null },
  })
  if (origins.length > 0) {
    await prisma.origin.createMany({
      data: origins.map((o) => ({
        name: o.name,
        userId,
        spaceId,
      })),
    })
  }

  // Copy investment categories
  const investmentCategories = await prisma.investmentCategory.findMany({
    where: { userId, spaceId: null },
  })
  if (investmentCategories.length > 0) {
    await prisma.investmentCategory.createMany({
      data: investmentCategories.map((ic) => ({
        name: ic.name,
        icon: ic.icon,
        color: ic.color,
        userId,
        spaceId,
      })),
    })
  }

  // Copy category rules (need new category IDs)
  const spaceCategories = await prisma.category.findMany({
    where: { userId, spaceId },
  })
  const categoryNameToId = new Map(spaceCategories.map((c) => [c.name, c.id]))

  const rules = await prisma.categoryRule.findMany({
    where: { userId, spaceId: null },
    include: { category: true },
  })
  const rulesToCreate = rules
    .filter((r) => categoryNameToId.has(r.category.name))
    .map((r) => ({
      keyword: r.keyword,
      categoryId: categoryNameToId.get(r.category.name)!,
      userId,
      spaceId,
    }))
  if (rulesToCreate.length > 0) {
    await prisma.categoryRule.createMany({ data: rulesToCreate })
  }
}
