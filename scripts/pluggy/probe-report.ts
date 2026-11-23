import { toBusinessDate } from "@/lib/pluggy/dates";
import { mapPluggyTransaction } from "@/lib/pluggy/mapper";
import { applyBatchRules, type BatchEntry } from "@/lib/pluggy/rules";
import type {
  MappedPluggyTransaction,
  PluggyAccount,
  PluggyBill,
  PluggyItem,
  PluggyTransaction,
  TransactionCoverage,
} from "@/lib/pluggy/types";

/**
 * Montagem pura do relatório da sonda. Por padrão o relatório só tem forma e
 * estatística: nenhuma descrição, valor, id, nome de banco ou de conta.
 * Com detailed = true inclui amostras reais (o arquivo fica só em personal/).
 */

export interface ProbeAccountData {
  account: PluggyAccount;
  transactions: PluggyTransaction[] | null;
  transactionsError: string | null;
  coverage: TransactionCoverage | null;
  /** null = não consultado (só cartões consultam /bills). */
  bills: PluggyBill[] | null;
  billsError: string | null;
}

export interface ProbeData {
  generatedAt: Date;
  item: PluggyItem;
  accounts: ProbeAccountData[];
}

const SAMPLE_LIMIT = 15;
const SHAPE_LIMIT = 5;
/** Tolerância, em reais, para considerar o resíduo da fatura zero. */
const RESIDUAL_TOLERANCE = 0.05;

type Counter = Map<string, number>;

function bump(counter: Counter, key: string, by = 1): void {
  counter.set(key, (counter.get(key) ?? 0) + by);
}

function counterTable(title: string, counter: Counter, sortByKey = true): string[] {
  if (counter.size === 0) return ["- " + title + ": nenhum"];
  const entries = Array.from(counter.entries());
  entries.sort(sortByKey ? (a, b) => a[0].localeCompare(b[0]) : (a, b) => b[1] - a[1]);
  return ["", "| " + title + " | Quantidade |", "|---|---|", ...entries.map(([k, v]) => "| " + k + " | " + v + " |")];
}

/** Forma da descrição: cada sequência de letras vira "a" e de dígitos vira "9" (esconde o tamanho das palavras). */
export function descriptionShape(description: string): string {
  return description
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[A-Za-z]+/g, "a")
    .replace(/\d+/g, "9")
    .replace(/\s+/g, " ")
    .slice(0, 60);
}

/** Faixa do formato de data: poucas categorias, sem listar cada horário. */
export function dateBucket(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "só data";
  if (/T03:00(?::00(?:\.0+)?)?Z$/.test(trimmed) || /T00:00(?::00(?:\.0+)?)?-03:?00$/.test(trimmed)) {
    return "meia-noite de São Paulo";
  }
  if (/T00:00(?::00(?:\.0+)?)?(?:Z|[+-]00:?00)?$/.test(trimmed)) return "meia-noite UTC ou sem fuso";
  if (/T\d{2}:\d{2}/.test(trimmed)) return "com horário";
  return "outros";
}

function daysBetween(fromMs: number, isoDate: string): number | null {
  const at = Date.parse(isoDate);
  if (Number.isNaN(at)) return null;
  return Math.round((at - fromMs) / 86_400_000);
}

function keysOf(objects: Array<Record<string, unknown> | null | undefined>): string {
  const keys = new Set<string>();
  for (const object of objects) if (object) Object.keys(object).forEach((key) => keys.add(key));
  return keys.size ? Array.from(keys).sort().join(", ") : "nenhum";
}

function accountType(account: PluggyAccount): "BANK" | "CREDIT" | null {
  return account.type === "BANK" || account.type === "CREDIT" ? account.type : null;
}

/** Valor do registro na moeda da conta, em reais (positivo). */
function amountInAccount(tx: PluggyTransaction, account: PluggyAccount): number {
  const sameCurrency = tx.currencyCode.toUpperCase() === account.currencyCode.toUpperCase();
  const value = !sameCurrency && typeof tx.amountInAccountCurrency === "number" ? tx.amountInAccountCurrency : tx.amount;
  return Math.abs(value);
}

/** Mapeia todas as contas e aplica as regras de lote do item inteiro. */
function previewMapping(data: ProbeData): { mapped: Map<number, MappedPluggyTransaction[]>; errors: Map<number, number> } {
  const batch: BatchEntry[] = [];
  const owners: number[] = [];
  const errors = new Map<number, number>();
  data.accounts.forEach((entry, accountIndex) => {
    const type = accountType(entry.account);
    if (!type) return;
    for (const tx of entry.transactions ?? []) {
      try {
        const mapped = mapPluggyTransaction(tx, { type, currencyCode: entry.account.currencyCode });
        batch.push({ accountId: entry.account.id, itemId: data.item.id, operationType: tx.operationType, mapped });
        owners.push(accountIndex);
      } catch {
        errors.set(accountIndex, (errors.get(accountIndex) ?? 0) + 1);
      }
    }
  });
  const result = applyBatchRules(batch);
  const mapped = new Map<number, MappedPluggyTransaction[]>();
  result.forEach((item, index) => {
    const owner = owners[index];
    if (!mapped.has(owner)) mapped.set(owner, []);
    mapped.get(owner)!.push(item);
  });
  return { mapped, errors };
}

function itemSection(item: PluggyItem, generatedAt: Date, detailed: boolean): string[] {
  const lines = ["## Item", ""];
  lines.push("- status: " + item.status);
  lines.push("- executionStatus: " + (item.executionStatus ?? "não informado"));
  lines.push("- lastUpdatedAt: " + (item.lastUpdatedAt ?? "não informado"));
  lines.push("- createdAt: " + (item.createdAt ?? "não informado"));
  if (item.consentExpiresAt) {
    const days = daysBetween(generatedAt.getTime(), item.consentExpiresAt);
    lines.push("- consentExpiresAt: " + item.consentExpiresAt + (days !== null ? " (em " + days + " dias)" : ""));
  } else {
    lines.push("- consentExpiresAt: não informado");
  }
  lines.push("- campos presentes no item: " + keysOf([item as Record<string, unknown>]));
  if (detailed) {
    const connector = (item as Record<string, unknown>).connector as Record<string, unknown> | undefined;
    if (connector && typeof connector.name === "string") lines.push("- conector (detalhado): " + connector.name);
  }
  return lines;
}

function transactionSection(
  data: ProbeAccountData,
  mapped: MappedPluggyTransaction[] | undefined,
  mappingErrors: number,
  detailed: boolean
): string[] {
  const lines: string[] = [];
  if (data.transactionsError) {
    lines.push("- transações: leitura falhou (" + data.transactionsError + ")");
    return lines;
  }
  const txs = data.transactions ?? [];
  lines.push("- transações lidas: " + txs.length);
  if (data.coverage) {
    lines.push("- cobertura: " + (data.coverage.minDate ?? "-") + " a " + (data.coverage.maxDate ?? "-"));
  }

  const byStatus: Counter = new Map();
  const byDirection: Counter = new Map();
  const byMonth: Counter = new Map();
  const sign: Counter = new Map();
  const dateBuckets: Counter = new Map();
  const currencies: Counter = new Map();
  const operationTypes: Counter = new Map();
  const providerIds = new Set<string>();
  let withProviderId = 0;
  let withMetadata = 0;
  let withBillId = 0;
  let withPurchaseDate = 0;
  let withMetaInstallment = 0;
  let withAmountInAccountCurrency = 0;
  let withCreatedAt = 0;
  const installmentShapes: string[] = [];

  for (const tx of txs) {
    bump(byStatus, tx.status);
    bump(byDirection, tx.type);
    const day = toBusinessDate(tx.date);
    bump(byMonth, day ? day.slice(0, 7) : "data inválida");
    bump(sign, tx.type + " / " + (tx.amount > 0 ? "positivo" : tx.amount < 0 ? "negativo" : "zero"));
    bump(dateBuckets, dateBucket(tx.date));
    bump(currencies, tx.currencyCode);
    bump(operationTypes, tx.type + " / " + (tx.operationType ?? "sem operationType"));
    if (tx.providerId && tx.providerId.trim()) {
      withProviderId++;
      providerIds.add(tx.providerId.trim());
    }
    if (typeof tx.amountInAccountCurrency === "number") withAmountInAccountCurrency++;
    if (tx.createdAt) withCreatedAt++;
    const meta = tx.creditCardMetadata;
    if (meta) withMetadata++;
    if (meta?.billId) withBillId++;
    if (meta?.purchaseDate) withPurchaseDate++;
    const metaInstallment = Number.isInteger(meta?.installmentNumber) && Number.isInteger(meta?.totalInstallments);
    if (metaInstallment) withMetaInstallment++;
    if (metaInstallment && installmentShapes.length < SHAPE_LIMIT) {
      installmentShapes.push(
        "metadado " + meta!.installmentNumber + "/" + meta!.totalInstallments +
          (meta!.purchaseDate ? ", com data da compra" : ", sem data da compra") +
          "; forma da descrição: " + descriptionShape(tx.description)
      );
    }
  }

  lines.push("- com providerId: " + withProviderId + " (distintos: " + providerIds.size + ")");
  lines.push("- com creditCardMetadata: " + withMetadata);
  lines.push("- com billId: " + withBillId);
  lines.push("- com purchaseDate: " + withPurchaseDate);
  lines.push("- com amountInAccountCurrency: " + withAmountInAccountCurrency);
  lines.push("- com createdAt: " + withCreatedAt);
  lines.push("- campos vistos nas transações: " + keysOf(txs as Array<Record<string, unknown>>));
  lines.push(
    "- campos vistos em creditCardMetadata: " +
      keysOf(txs.map((tx) => (tx.creditCardMetadata ?? null) as Record<string, unknown> | null))
  );
  lines.push(...counterTable("Status", byStatus));
  lines.push(...counterTable("Direção (type)", byDirection));
  lines.push(...counterTable("Direção / sinal de amount", sign));
  lines.push(...counterTable("Direção / operationType", operationTypes));
  lines.push(...counterTable("Formato da data", dateBuckets, false));
  lines.push(...counterTable("Moeda da transação", currencies));
  lines.push(...counterTable("Mês (São Paulo)", byMonth));
  lines.push("", "Parcelas:");
  lines.push("- com número/total no metadado: " + withMetaInstallment);
  for (const shape of installmentShapes) lines.push("  - " + shape);

  if (mapped) {
    const mappedTypes: Counter = new Map();
    const dispositions: Counter = new Map();
    const creditKinds: Counter = new Map();
    let installmentsFromMapping = 0;
    for (const item of mapped) {
      bump(mappedTypes, item.type);
      bump(
        dispositions,
        item.preDisposition ? item.preDisposition.disposition + " / " + item.preDisposition.reasonCode : "sem destino prévio"
      );
      bump(creditKinds, item.creditKind ?? "null");
      if (item.installmentNumber !== null) installmentsFromMapping++;
    }
    lines.push("", "Prévia do mapeamento (sem padrões do usuário, pendentes importados, regras de lote aplicadas):");
    lines.push(...counterTable("Tipo mapeado", mappedTypes));
    lines.push(...counterTable("Destino prévio", dispositions, false));
    lines.push(...counterTable("creditKind", creditKinds));
    lines.push("- parcelas reconhecidas pelo mapeamento: " + installmentsFromMapping);
    lines.push("- registros que o mapeamento recusou: " + mappingErrors);
  }

  if (detailed && txs.length) {
    lines.push("", "Amostras reais (detalhado):", "", "| Data | Status | Tipo | operationType | Valor | Moeda | Descrição | Parcela |", "|---|---|---|---|---|---|---|---|");
    for (const tx of txs.slice(0, SAMPLE_LIMIT)) {
      const meta = tx.creditCardMetadata;
      const installment = meta?.installmentNumber ? meta.installmentNumber + "/" + (meta.totalInstallments ?? "?") : "";
      lines.push(
        "| " +
          [tx.date, tx.status, tx.type, tx.operationType ?? "", String(tx.amount), tx.currencyCode, tx.description.replace(/\|/g, "/"), installment].join(" | ") +
          " |"
      );
    }
  }
  return lines;
}

interface BillCheck {
  dueDate: string;
  total: number;
  debits: number;
  credits: number;
  residual: number | null;
}

/**
 * Conferência de fatura: total(n) = total(n−1) + débitos(n) − créditos(n) + resíduo(n).
 * Débitos e créditos são as transações com o billId da fatura, em valor absoluto.
 */
export function billChecks(data: ProbeAccountData): BillCheck[] {
  const bills = [...(data.bills ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const sums = new Map<string, { debits: number; credits: number }>();
  for (const tx of data.transactions ?? []) {
    const billId = tx.creditCardMetadata?.billId;
    if (!billId) continue;
    const sum = sums.get(billId) ?? { debits: 0, credits: 0 };
    const value = amountInAccount(tx, data.account);
    if (tx.type === "DEBIT") sum.debits += value;
    else sum.credits += value;
    sums.set(billId, sum);
  }
  return bills.map((bill, index) => {
    const sum = sums.get(bill.id) ?? { debits: 0, credits: 0 };
    const previous = index > 0 ? bills[index - 1].totalAmount : null;
    const residual = previous === null ? null : bill.totalAmount - previous - sum.debits + sum.credits;
    return { dueDate: bill.dueDate, total: bill.totalAmount, debits: sum.debits, credits: sum.credits, residual };
  });
}

function billSection(data: ProbeAccountData, detailed: boolean): string[] {
  if (data.bills === null && !data.billsError) return [];
  const lines = ["", "Faturas (/bills):"];
  if (data.billsError) {
    lines.push("- leitura falhou (" + data.billsError + ")");
    return lines;
  }
  const bills = data.bills ?? [];
  lines.push("- faturas: " + bills.length);
  if (!bills.length) return lines;
  lines.push("- campos vistos: " + keysOf(bills as Array<Record<string, unknown>>));
  const dueDates = bills.map((bill) => bill.dueDate).sort();
  lines.push("- vencimentos: " + dueDates[0] + " a " + dueDates[dueDates.length - 1]);
  lines.push("- formato de dueDate: " + Array.from(new Set(bills.map((bill) => dateBucket(bill.dueDate)))).join(", "));
  lines.push("- moedas: " + Array.from(new Set(bills.map((bill) => bill.totalAmountCurrencyCode ?? "não informada"))).join(", "));

  const checks = billChecks(data);
  const signs: Counter = new Map();
  for (const check of checks) {
    if (check.residual === null) continue;
    const sign =
      check.residual < -RESIDUAL_TOLERANCE ? "negativo" : check.residual > RESIDUAL_TOLERANCE ? "positivo" : "zero";
    bump(signs, sign);
  }
  lines.push("", "Conferência: total(n) = total(n−1) + débitos(n) − créditos(n) + resíduo(n), tolerância R$ 0,05.");
  lines.push(...counterTable("Sinal do resíduo", signs));
  lines.push("- primeira fatura sem anterior para comparar: 1");
  if (detailed) {
    lines.push("", "| Vencimento | Total | Débitos | Créditos | Resíduo |", "|---|---|---|---|---|");
    for (const check of checks) {
      lines.push(
        "| " +
          [check.dueDate, check.total.toFixed(2), check.debits.toFixed(2), check.credits.toFixed(2), check.residual === null ? "-" : check.residual.toFixed(2)].join(" | ") +
          " |"
      );
    }
  }
  return lines;
}

export function buildProbeReport(data: ProbeData, options: { detailed: boolean }): string {
  const preview = previewMapping(data);
  const lines = [
    "# Sonda Pluggy (somente leitura)",
    "",
    "Gerado em " + data.generatedAt.toISOString() + (options.detailed ? " — modo DETALHADO (contém dados reais)" : " — dados mascarados"),
    "",
    ...itemSection(data.item, data.generatedAt, options.detailed),
    "",
    "## Contas",
  ];
  data.accounts.forEach((entry, index) => {
    const account = entry.account;
    lines.push(
      "",
      "### Conta " + (index + 1) + " — " + account.type + (account.subtype ? " / " + account.subtype : "") + ", moeda " + account.currencyCode,
      ""
    );
    const mapped = accountType(account) ? preview.mapped.get(index) ?? [] : undefined;
    lines.push(...transactionSection(entry, mapped, preview.errors.get(index) ?? 0, options.detailed));
    lines.push(...billSection(entry, options.detailed));
  });
  lines.push("");
  return lines.join("\n");
}

export function summarizeProbe(data: ProbeData): { accounts: number; transactions: number; bills: number; failures: number } {
  let transactions = 0;
  let bills = 0;
  let failures = 0;
  for (const entry of data.accounts) {
    transactions += entry.transactions?.length ?? 0;
    bills += entry.bills?.length ?? 0;
    if (entry.transactionsError) failures++;
    if (entry.billsError) failures++;
  }
  return { accounts: data.accounts.length, transactions, bills, failures };
}
