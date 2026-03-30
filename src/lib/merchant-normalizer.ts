const KNOWN_PREFIXES = [
  /^IFD\*/i,
  /^PAG\*/i,
  /^PIX\s*(QR\s*-?\s*)?/i,
  /^MP\*/i,
  /^PAGAMENTO\*?/i,
  /^PG\*/i,
  /^CDB\*/i,
  /^COMPRA\s+NO\s+(DEBITO|CREDITO)\s*/i,
];

export function normalizeMerchant(description: string): string {
  let normalized = description.trim();

  for (const prefix of KNOWN_PREFIXES) {
    normalized = normalized.replace(prefix, "");
  }

  normalized = normalized.trim();

  if (!normalized) {
    // Fallback to original description with title case
    return description
      .trim()
      .toLowerCase()
      .replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());
  }

  // Title case: first letter of each word uppercase, rest lowercase
  normalized = normalized
    .toLowerCase()
    .replace(/(?:^|\s)\S/g, (char) => char.toUpperCase());

  return normalized;
}

export interface MerchantGroup {
  merchant: string;
  total: number;
  count: number;
  average: number;
  transactions: Array<{ id: string; description: string; amount: number; date: Date }>;
}

export function groupByMerchant(
  transactions: Array<{ id: string; description: string; amount: number; date: Date }>
): MerchantGroup[] {
  const groups = new Map<string, MerchantGroup>();

  for (const tx of transactions) {
    const merchant = normalizeMerchant(tx.description);
    const existing = groups.get(merchant);

    if (existing) {
      existing.total += Math.abs(tx.amount);
      existing.count += 1;
      existing.transactions.push(tx);
    } else {
      groups.set(merchant, {
        merchant,
        total: Math.abs(tx.amount),
        count: 1,
        average: 0,
        transactions: [tx],
      });
    }
  }

  const result = Array.from(groups.values());
  for (const group of result) {
    group.average = group.total / group.count;
  }

  return result.sort((a, b) => b.total - a.total);
}
