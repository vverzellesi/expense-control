import { detectInstallment } from "@/lib/categorizer";
import { toBusinessDate } from "@/lib/pluggy/dates";
import { mapPluggyTransaction } from "@/lib/pluggy/mapper";
import type {
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

/** Forma da descrição: letras viram "a", dígitos viram "9". */
export function descriptionShape(description: string): string {
  return description
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[A-Za-z]/g, "a")
    .replace(/\d/g, "9")
    .slice(0, 60);
}

function dateShape(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "só data";
  const time = /T(\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/.exec(value);
  if (!time) return "outro formato";
  return "T" + time[1] + (time[2] ?? " (sem fuso)");
}

function daysBetween(fromMs: number, isoDate: string): number | null {
  const at = Date.parse(isoDate);
  if (Number.isNaN(at)) return null;
  return Math.round((at - fromMs) / 86_400_000);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function keysOf(objects: Array<Record<string, unknown> | null | undefined>): string {
  const keys = new Set<string>();
  for (const object of objects) if (object) Object.keys(object).forEach((key) => keys.add(key));
  return keys.size ? Array.from(keys).sort().join(", ") : "nenhum";
}

function accountType(account: PluggyAccount): "BANK" | "CREDIT" | null {
  return account.type === "BANK" || account.type === "CREDIT" ? account.type : null;
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

function transactionSection(data: ProbeAccountData, detailed: boolean): string[] {
  const lines: string[] = [];
  const type = accountType(data.account);
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
  const dateShapes: Counter = new Map();
  const currencies: Counter = new Map();
  const mappedTypes: Counter = new Map();
  const dispositions: Counter = new Map();
  const creditKinds: Counter = new Map();
  const providerIds = new Set<string>();
  let withProviderId = 0;
  let withMetadata = 0;
  let withBillId = 0;
  let withPurchaseDate = 0;
  let withMetaInstallment = 0;
  let withDescInstallment = 0;
  let installmentAgree = 0;
  let installmentDisagree = 0;
  let withAmountInAccountCurrency = 0;
  let withCreatedAt = 0;
  let mappingErrors = 0;
  const installmentShapes: string[] = [];

  for (const tx of txs) {
    bump(byStatus, tx.status);
    bump(byDirection, tx.type);
    const day = toBusinessDate(tx.date);
    bump(byMonth, day ? day.slice(0, 7) : "data inválida");
    bump(sign, tx.type + " / " + (tx.amount > 0 ? "positivo" : tx.amount < 0 ? "negativo" : "zero"));
    bump(dateShapes, dateShape(tx.date));
    bump(currencies, tx.currencyCode);
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
    const detected = detectInstallment(tx.description);
    if (metaInstallment) withMetaInstallment++;
    if (detected.isInstallment) withDescInstallment++;
    if (metaInstallment && detected.isInstallment) {
      const same =
        detected.currentInstallment === meta!.installmentNumber &&
        detected.totalInstallments === meta!.totalInstallments;
      if (same) installmentAgree++;
      else installmentDisagree++;
    }
    if ((metaInstallment || detected.isInstallment) && installmentShapes.length < SHAPE_LIMIT) {
      const metaText = metaInstallment ? meta!.installmentNumber + "/" + meta!.totalInstallments : "sem metadado";
      installmentShapes.push(
        "metadado " + metaText + "; descrição " + (detected.isInstallment ? "com" : "sem") + " marcador; forma: " +
          descriptionShape(tx.description)
      );
    }
    if (type) {
      try {
        const mapped = mapPluggyTransaction(tx, { type, currencyCode: data.account.currencyCode });
        bump(mappedTypes, mapped.type);
        bump(dispositions, mapped.preDisposition ? mapped.preDisposition.disposition + " / " + mapped.preDisposition.reasonCode : "sem destino prévio");
        bump(creditKinds, mapped.creditKind ?? "null");
      } catch {
        mappingErrors++;
      }
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
  lines.push(...counterTable("Formato da data", dateShapes, false));
  lines.push(...counterTable("Moeda da transação", currencies));
  lines.push(...counterTable("Mês (São Paulo)", byMonth));
  lines.push("", "Parcelas:");
  lines.push("- com número/total no metadado: " + withMetaInstallment);
  lines.push("- com marcador na descrição: " + withDescInstallment);
  lines.push("- metadado e descrição concordam: " + installmentAgree + "; discordam: " + installmentDisagree);
  for (const shape of installmentShapes) lines.push("  - " + shape);
  if (type) {
    lines.push("", "Prévia do mapeamento (sem padrões do usuário):");
    lines.push(...counterTable("Tipo mapeado", mappedTypes));
    lines.push(...counterTable("Destino prévio", dispositions, false));
    lines.push(...counterTable("creditKind", creditKinds));
    lines.push("- registros que o mapeamento recusou: " + mappingErrors);
  }

  if (detailed && txs.length) {
    lines.push("", "Amostras reais (detalhado):", "", "| Data | Status | Tipo | Valor | Moeda | Descrição | Parcela |", "|---|---|---|---|---|---|---|");
    for (const tx of txs.slice(0, SAMPLE_LIMIT)) {
      const meta = tx.creditCardMetadata;
      const installment = meta?.installmentNumber ? meta.installmentNumber + "/" + (meta.totalInstallments ?? "?") : "";
      lines.push(
        "| " + [tx.date, tx.status, tx.type, String(tx.amount), tx.currencyCode, tx.description.replace(/\|/g, "/"), installment].join(" | ") + " |"
      );
    }
  }
  return lines;
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
  lines.push("- formato de dueDate: " + Array.from(new Set(bills.map((bill) => dateShape(bill.dueDate)))).join(", "));
  lines.push("- moedas: " + Array.from(new Set(bills.map((bill) => bill.totalAmountCurrencyCode ?? "não informada"))).join(", "));
  lines.push("- totalAmount inteiro: " + bills.filter((bill) => Number.isInteger(bill.totalAmount)).length + " de " + bills.length);

  // Unidade de totalAmount: compara com a soma das transações ligadas pelo billId.
  const sums = new Map<string, number>();
  for (const tx of data.transactions ?? []) {
    const billId = tx.creditCardMetadata?.billId;
    if (!billId) continue;
    const signed = tx.type === "DEBIT" ? Math.abs(tx.amount) : -Math.abs(tx.amount);
    sums.set(billId, (sums.get(billId) ?? 0) + signed);
  }
  const ratios: number[] = [];
  for (const bill of bills) {
    const sum = sums.get(bill.id);
    if (sum && Math.abs(sum) > 0.009) ratios.push(bill.totalAmount / sum);
  }
  const ratioMedian = median(ratios);
  lines.push("- faturas com transações ligadas por billId: " + ratios.length);
  if (ratioMedian !== null) {
    lines.push("- razão totalAmount / soma das transações (mediana): " + ratioMedian.toFixed(3));
    lines.push("  - perto de 1 (reais): " + ratios.filter((r) => r > 0.95 && r < 1.05).length + "; perto de 100 (centavos): " + ratios.filter((r) => r > 95 && r < 105).length);
  }
  if (detailed) {
    lines.push("", "| Vencimento | totalAmount | Moeda |", "|---|---|---|");
    for (const bill of bills.slice(0, SAMPLE_LIMIT)) {
      lines.push("| " + bill.dueDate + " | " + bill.totalAmount + " | " + (bill.totalAmountCurrencyCode ?? "") + " |");
    }
  }
  return lines;
}

export function buildProbeReport(data: ProbeData, options: { detailed: boolean }): string {
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
    lines.push(...transactionSection(entry, options.detailed));
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
