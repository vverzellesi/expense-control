/**
 * Sincronização Pluggy pela linha de comando. SIMULAÇÃO por padrão: só grava com --apply.
 * Banco: DATABASE_URL; produção só com --prod (e, com --apply, confirmação digitada).
 *
 * Uso (da raiz do repositório):
 *   npx tsx --tsconfig tsconfig.json scripts/pluggy/sync.ts [--prod] [--apply]
 *
 * Roda mesmo com PLUGGY_SYNC_ENABLED desligado (é uma ação explícita). Grava em
 * personal/pluggy/sync-<data>.md um relatório legível por destino e motivo, com totais
 * por mês e a lista do que iria para revisão. No terminal saem só o caminho e contagens.
 */
import { formatCurrency } from "@/lib/utils";
import { describeSyncError, runPluggySync, type SyncReport } from "@/lib/pluggy/sync";
import { ALERT_LABELS } from "@/lib/pluggy/alerts";
import {
  abort,
  assertPersonalPath,
  confirmTyped,
  fail,
  hasFlag,
  loadEnvVars,
  missingVars,
  openDatabase,
  requireOwner,
  saoPauloStamp,
  ScriptAbort,
  writePersonalReport,
} from "./cli";

const REQUIRED_VARS = ["PLUGGY_CLIENT_ID", "PLUGGY_CLIENT_SECRET", "PLUGGY_OWNER_USER_ID"] as const;
const PROD_CONFIRMATION = "GRAVAR EM PRODUCAO";
/** A primeira gravação pode ter centenas de registros: lease mais longo que o do cron. */
const SCRIPT_LEASE_TTL_MS = 30 * 60 * 1000;

const DESTINATION_LABELS: Record<string, string> = {
  created: "criados",
  adopted: "adotados (já existiam)",
  excluded: "excluídos",
  pending: "pendentes",
  needs_review: "em revisão",
  before_cutoff: "antes do corte",
  unchanged: "já processados, sem mudança",
  updated: "já processados, atualizados pela fonte",
  restored: "provisórios que voltaram (lançamento restaurado)",
};

function money(cents: number): string {
  return formatCurrency(cents / 100);
}

function formatDay(day: string): string {
  const [y, m, d] = day.split("-");
  return d + "/" + m + "/" + y;
}

function cell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
}

function signed(record: SyncReport["decisions"][number]["record"]): number {
  if (record.type === "EXPENSE") return -record.amountCents;
  if (record.type === "INCOME") return record.amountCents;
  return record.direction === "DEBIT" ? -record.amountCents : record.amountCents;
}

function buildSyncReport(report: SyncReport, label: string): string {
  const lines: string[] = [];
  const title = report.mode === "apply" ? "gravação" : "simulação";
  lines.push("# Sincronização Pluggy — " + title, "");
  lines.push("- Banco: " + label);
  lines.push("- Início: " + report.startedAt.toISOString());
  lines.push("- Status: " + report.status + (report.skippedReason ? " (" + report.skippedReason + ")" : ""));
  if (report.error) lines.push("- Erro: " + report.error);
  lines.push("");

  const c = report.counts;
  lines.push("## Destinos", "", "| destino | quantidade |", "|---|---:|");
  for (const [key, n] of Object.entries(c.destinations)) lines.push("| " + (DESTINATION_LABELS[key] ?? key) + " | " + n + " |");
  lines.push("| fora da janela de leitura | " + c.outsideWindow + " |", "| **total lido** | **" + c.read + "** |", "");

  const reasons = Object.entries(c.reasons).sort((a, b) => b[1] - a[1]);
  if (reasons.length > 0) {
    lines.push("## Motivos", "", "| motivo | quantidade |", "|---|---:|");
    for (const [reason, n] of reasons) lines.push("| " + reason + " | " + n + " |");
    lines.push("");
  }

  lines.push("## Outras contagens", "");
  lines.push("- novos em revisão: " + c.newNeedsReview);
  lines.push("- divergências (fonte mudou e o lançamento local foi editado): " + c.divergences);
  lines.push("- projeções de parcelas criadas: " + c.projectionsCreated + " | grupos criados: " + c.groupsCreated);
  lines.push("- valor de projeção corrigido pela fonte: " + c.projectionAmountCorrected);
  lines.push("- criados antes e agora excluídos pela fonte: " + c.reclassifiedExcluded);
  lines.push("- de fatura que a Pluggy não listou (unknown_bill): " + c.unknownBill);
  lines.push("- fora da janela e de fatura que a Pluggy não listou (histórico antigo): " + c.outsideWindowUnknownBill);
  const ai = report.checks.ai;
  if (ai) {
    lines.push(
      "- categorização por IA: " + ai.state + (ai.error ? " (" + ai.error + ")" : "") + " | elegíveis: " + ai.counts.selected +
        " | categorizados: " + ai.counts.categorized + " | abstenções: " + ai.counts.abstained + " | chamadas: " + ai.counts.calls
    );
  }
  lines.push("- estornos lançados como receita: " + c.refundsAsIncome);
  lines.push("- provisórios que sumiram: " + c.provisionalVanished + " (lançamentos removidos: " + c.provisionalTransactionsDeleted + ")");
  lines.push("- já importados que sumiram da fonte: " + c.missingUpstream);
  lines.push("");

  const alerts = Object.entries(report.checks.alerts);
  if (alerts.length > 0) {
    lines.push("## Alertas", "");
    for (const [code, n] of alerts) lines.push("- " + (ALERT_LABELS[code] ?? code) + " (" + code + "): " + n);
    lines.push("");
  }

  lines.push("## Contas", "", "| origin | tipo | status | lidos | cobertura | faturas ok/+/−/n.a. | erro |", "|---|---|---|---:|---|---|---|");
  for (const account of report.accounts) {
    const b = account.check.bills;
    lines.push(
      "| " + cell(account.originName) + " | " + account.check.accountType + " | " + account.check.status + " | " +
        account.check.read + " | " + (account.check.coverage ?? "—") + " | " +
        (b ? b.balanced + "/" + b.residuePositive + "/" + b.residueNegative + "/" + b.notEvaluable : "—") + " | " +
        (account.check.error ?? "") + " |"
    );
  }
  lines.push("");

  for (const account of report.accounts) {
    const b = account.check.bills;
    if (!b || b.list.length === 0) continue;
    lines.push("### Faturas — " + cell(account.originName), "", "| vencimento | total | débitos | créditos | resíduo | resultado |", "|---|---:|---:|---:|---:|---|");
    for (const bill of b.list) {
      lines.push(
        "| " + formatDay(bill.dueDate) + " | " + money(bill.totalCents) + " | " + money(bill.debitsCents) + " | " +
          money(bill.creditsCents) + " | " + (bill.residueCents === null ? "—" : money(bill.residueCents)) + " | " +
          bill.result + (bill.reason ? " (" + bill.reason + ")" : "") + " |"
      );
    }
    lines.push("");
  }

  // Totais por mês do que entra no razão nesta execução.
  const months = new Map<string, { created: number; adopted: number; expense: number; income: number; transfer: number }>();
  for (const d of report.decisions) {
    if (d.result.outcome !== "created" && d.result.outcome !== "adopted") continue;
    const key = d.record.ledgerDate.slice(0, 7) + " · " + d.originName;
    const m = months.get(key) ?? { created: 0, adopted: 0, expense: 0, income: 0, transfer: 0 };
    if (d.result.outcome === "created") {
      m.created++;
      const cents = signed(d.record);
      if (d.record.type === "EXPENSE") m.expense += cents;
      else if (d.record.type === "INCOME") m.income += cents;
      else m.transfer += cents;
    } else m.adopted++;
    months.set(key, m);
  }
  if (months.size > 0) {
    lines.push("## Totais por mês (criados nesta execução)", "", "| mês · origin | criados | adotados | despesas | receitas | transferências |", "|---|---:|---:|---:|---:|---:|");
    for (const key of Array.from(months.keys()).sort()) {
      const m = months.get(key)!;
      lines.push("| " + cell(key) + " | " + m.created + " | " + m.adopted + " | " + money(m.expense) + " | " + money(m.income) + " | " + money(m.transfer) + " |");
    }
    lines.push("");
  }

  const review = report.decisions.filter((d) => d.result.outcome === "needs_review");
  lines.push("## Em revisão (" + review.length + ")", "");
  if (review.length > 0) {
    lines.push("| data | origin | valor | descrição | motivo |", "|---|---|---:|---|---|");
    for (const d of review.sort((a, b) => (a.record.ledgerDate < b.record.ledgerDate ? -1 : 1))) {
      const installment = d.record.installmentNumber ? " (" + d.record.installmentNumber + "/" + d.record.totalInstallments + ")" : "";
      lines.push(
        "| " + formatDay(d.record.ledgerDate) + " | " + cell(d.originName) + " | " + money(signed(d.record)) + " | " +
          cell(d.record.description + installment) + " | " + (d.result.reasonCode ?? "—") + " |"
      );
    }
    lines.push("");
  }
  return lines.join("\n");
}

async function main(): Promise<void> {
  const apply = hasFlag("apply");
  loadEnvVars([...REQUIRED_VARS, "TELEGRAM_BOT_TOKEN"]);
  const missing = missingVars(REQUIRED_VARS);
  if (missing.length > 0) fail("Faltam variáveis no .env: " + missing.join(", ") + ". Nada foi consultado.");
  const owner = requireOwner();

  const relativePath = "personal/pluggy/sync-" + saoPauloStamp(new Date()) + (apply ? "-gravacao" : "-simulacao") + ".md";
  assertPersonalPath(relativePath);

  const target = await openDatabase();
  try {
    if (apply && target.prod) {
      const ok = await confirmTyped('Gravar em produção. Para confirmar, digite "' + PROD_CONFIRMATION + '": ', PROD_CONFIRMATION);
      if (!ok) abort("Confirmação não conferiu. Nada foi feito.");
    }
    const report = await runPluggySync(
      { db: target.db, env: { ...process.env, PLUGGY_OWNER_USER_ID: owner } },
      { mode: apply ? "apply" : "simulate", trigger: "manual", ignoreEnabledFlag: true, leaseTtlMs: SCRIPT_LEASE_TTL_MS }
    );
    writePersonalReport(relativePath, buildSyncReport(report, target.label));
    const c = report.counts;
    console.log("Banco: " + target.label + " | modo: " + (apply ? "gravação" : "simulação"));
    console.log("Status: " + report.status + (report.skippedReason ? " (" + report.skippedReason + ")" : ""));
    console.log(
      "Lidos: " + c.read + " | criados: " + c.destinations.created + " | adotados: " + c.destinations.adopted +
        " | excluídos: " + c.destinations.excluded + " | em revisão: " + c.destinations.needs_review +
        " | antes do corte: " + c.destinations.before_cutoff + " | sem mudança: " + c.destinations.unchanged +
        " | atualizados: " + c.destinations.updated + " | fora da janela: " + c.outsideWindow
    );
    console.log("Relatório: " + relativePath);
  } finally {
    await target.db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof ScriptAbort ? error.message : "sync.ts falhou: " + describeSyncError(error));
  process.exit(1);
});

