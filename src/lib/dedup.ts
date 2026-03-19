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

export async function filterDuplicates<T extends { description: string; amount: number; date: Date }>(
  userId: string,
  transactions: T[]
): Promise<{ unique: T[]; duplicateCount: number }> {
  if (transactions.length === 0) {
    return { unique: [], duplicateCount: 0 }
  }

  // Find the date range across all transactions
  let minDate = transactions[0].date
  let maxDate = transactions[0].date
  for (const t of transactions) {
    if (t.date < minDate) minDate = t.date
    if (t.date > maxDate) maxDate = t.date
  }

  const rangeStart = new Date(minDate)
  rangeStart.setHours(0, 0, 0, 0)
  const rangeEnd = new Date(maxDate)
  rangeEnd.setHours(23, 59, 59, 999)

  // Batch fetch all potential duplicates in the date range
  const existing = await prisma.transaction.findMany({
    where: {
      userId,
      date: { gte: rangeStart, lte: rangeEnd },
      deletedAt: null,
    },
    select: { description: true, amount: true, date: true },
  })

  // Build a lookup set for O(1) matching
  const existingSet = new Set(
    existing.map(e => {
      const d = new Date(e.date)
      return `${e.description.trim().toLowerCase()}|${e.amount}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    })
  )

  const unique: T[] = []
  let duplicateCount = 0

  for (const t of transactions) {
    const d = new Date(t.date)
    const key = `${t.description.trim().toLowerCase()}|${t.amount}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (existingSet.has(key)) {
      duplicateCount++
    } else {
      unique.push(t)
    }
  }

  return { unique, duplicateCount }
}
