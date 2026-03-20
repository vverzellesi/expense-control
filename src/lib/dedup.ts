import prisma from "@/lib/db"

/**
 * Normalizes a transaction description for fuzzy comparison.
 * Removes dots, asterisks, slashes, accents, collapses spaces, lowercases.
 */
export function normalizeDescription(description: string): string {
  return description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip accents
    .toLowerCase()
    .replace(/[.*\/\\]/g, "")        // remove dots, asterisks, slashes
    .replace(/\s+/g, " ")            // collapse multiple spaces
    .trim()
}

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

  // Fetch candidates by amount and date, then compare normalized descriptions in JS
  const candidates = await prisma.transaction.findMany({
    where: {
      userId,
      amount,
      date: {
        gte: dayStart,
        lte: dayEnd,
      },
      deletedAt: null,
    },
  })

  const normalizedInput = normalizeDescription(description)
  return candidates.find(
    (c) => normalizeDescription(c.description) === normalizedInput
  ) ?? null
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

  // Build a lookup set for O(1) matching using normalized descriptions
  const existingSet = new Set(
    existing.map(e => {
      const d = new Date(e.date)
      return `${normalizeDescription(e.description)}|${e.amount}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    })
  )

  const unique: T[] = []
  let duplicateCount = 0

  for (const t of transactions) {
    const d = new Date(t.date)
    const key = `${normalizeDescription(t.description)}|${t.amount}|${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    if (existingSet.has(key)) {
      duplicateCount++
    } else {
      unique.push(t)
    }
  }

  return { unique, duplicateCount }
}
