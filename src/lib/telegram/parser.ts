export interface ParsedExpense {
  description: string
  amount: number
  date: Date
}

export function parseExpenseMessage(text: string): ParsedExpense | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // We'll track parts to remove by position
  const removals: Array<{ start: number; end: number }> = []

  // Extract date (DD/MM/YYYY) — look for last occurrence
  const dateRegex = /(\d{2})\/(\d{2})\/(\d{4})/g
  let dateMatch: RegExpExecArray | null = null
  let lastDateMatch: RegExpExecArray | null = null
  while ((dateMatch = dateRegex.exec(trimmed)) !== null) {
    lastDateMatch = dateMatch
  }

  let date: Date
  if (lastDateMatch) {
    const [, day, month, year] = lastDateMatch
    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0)
    removals.push({ start: lastDateMatch.index, end: lastDateMatch.index + lastDateMatch[0].length })
  } else {
    const now = new Date()
    date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0)
  }

  // Extract amount — look for Brazilian number format (last occurrence)
  // Matches: 45,90 | 1.234,56 | 1234,56
  const amountRegex = /(\d{1,3}(?:\.\d{3})*,\d{2}|\d+,\d{2})/g
  let amountMatch: RegExpExecArray | null = null
  let lastAmountMatch: RegExpExecArray | null = null
  while ((amountMatch = amountRegex.exec(trimmed)) !== null) {
    lastAmountMatch = amountMatch
  }

  if (!lastAmountMatch) return null

  const amountStr = lastAmountMatch[1]
  const amount = parseFloat(amountStr.replace(/\./g, "").replace(",", "."))
  if (isNaN(amount) || amount <= 0) return null

  removals.push({ start: lastAmountMatch.index, end: lastAmountMatch.index + lastAmountMatch[0].length })

  // Build description by removing matched parts by position (sorted descending to preserve indices)
  let description = trimmed
  removals.sort((a, b) => b.start - a.start)
  for (const { start, end } of removals) {
    description = description.slice(0, start) + description.slice(end)
  }
  description = description.replace(/\s+/g, " ").trim()

  if (!description) return null

  return { description, amount, date }
}
