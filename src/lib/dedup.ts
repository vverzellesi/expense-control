import prisma from "@/lib/db"

export interface DuplicateCheckParams {
  userId: string
  description: string
  amount: number
  date: Date
}

export async function findDuplicate({
  userId,
  description,
  amount,
  date,
}: DuplicateCheckParams) {
  // Normalize date to start/end of day
  const dayStart = new Date(date)
  dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(date)
  dayEnd.setHours(23, 59, 59, 999)

  const duplicate = await prisma.transaction.findFirst({
    where: {
      userId,
      description: {
        equals: description.trim(),
        mode: "insensitive",
      },
      amount,
      date: {
        gte: dayStart,
        lte: dayEnd,
      },
      deletedAt: null,
    },
  })

  return duplicate
}

export async function filterDuplicates(
  userId: string,
  transactions: Array<{ description: string; amount: number; date: Date }>
): Promise<{ unique: typeof transactions; duplicateCount: number }> {
  const unique: typeof transactions = []
  let duplicateCount = 0

  for (const t of transactions) {
    const dup = await findDuplicate({
      userId,
      description: t.description,
      amount: t.amount,
      date: t.date,
    })
    if (dup) {
      duplicateCount++
    } else {
      unique.push(t)
    }
  }

  return { unique, duplicateCount }
}
