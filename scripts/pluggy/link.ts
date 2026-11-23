/**
 * Vínculos da Pluggy: conta da Pluggy → origin pessoal do dono, e padrões do usuário.
 * SIMULAÇÃO por padrão: só grava com --apply. Banco: DATABASE_URL; produção só com --prod.
 *
 * Uso (da raiz do repositório):
 *   npx tsx --tsconfig tsconfig.json scripts/pluggy/link.ts [--prod]
 *       Lista as contas do item, os vencimentos das faturas do cartão, os origins
 *       pessoais do dono e os vínculos existentes.
 *
 *   ... link.ts --account <id da conta> --origin <id do origin> --sync-from AAAA-MM-DD [--apply]
 *       Conta corrente: corte por data (nada com data anterior é criado).
 *
 *   ... link.ts --account <id da conta> --origin <id do origin> --cutoff-bill-due AAAA-MM-DD
 *               [--cutoff-bill-closing AAAA-MM-DD] [--apply]
 *       Cartão: corte por fatura. Informe o vencimento da ÚLTIMA fatura já importada
 *       (por PDF/CSV); ela e as anteriores ficam fora. O syncFrom do cartão vira o dia
 *       seguinte ao fechamento dessa fatura (a importação manual passa a pular o origin a
 *       partir dele). Fechamento: --cutoff-bill-closing; senão o "dia fechamento" do origin;
 *       senão a data do último lançamento da fatura de corte.
 *
 *   Reconexão (o banco gerou contas novas): acrescente --replaces <id do vínculo antigo>.
 *   O vínculo antigo é desativado e o novo herda a linhagem.
 *
 *   ... link.ts --patterns personal/pluggy/padroes.json [--apply]
 *       Grava os padrões do usuário (Settings, chave pluggy.excludePatterns). O arquivo é
 *       uma lista de { "pattern": "...", "accountType"?: "BANK"|"CREDIT", "action": "exclude"|"transfer" }.
 *
 * Variáveis: PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET, PLUGGY_ITEM_ID, PLUGGY_OWNER_USER_ID e o
 * banco. Nenhum valor é impresso.
 */
import { readFileSync } from "fs";
import { createPluggyClientFromEnv, missingPluggyEnv, type PluggyClient } from "@/lib/pluggy/client";
import { toBusinessDate } from "@/lib/pluggy/dates";
import { lockUserForPluggy } from "@/lib/pluggy/lease";
import { compileExcludePatterns } from "@/lib/pluggy/rules";
import { businessDayKey, dayToStoredDate } from "@/lib/pluggy/store";
import { describeSyncError, EXCLUDE_PATTERNS_SETTING_KEY } from "@/lib/pluggy/sync";
import {
  argValue,
  assertPersonalPath,
  fail,
  hasFlag,
  loadEnvVars,
  openDatabase,
  parseDayArg,
  requireOwner,
  type ScriptDatabase,
} from "./cli";

const PLUGGY_VARS = ["PLUGGY_CLIENT_ID", "PLUGGY_CLIENT_SECRET", "PLUGGY_ITEM_ID"] as const;

function pluggyClient(): { client: PluggyClient; itemId: string } {
  loadEnvVars(PLUGGY_VARS);
  const missing = missingPluggyEnv(PLUGGY_VARS);
  if (missing.length > 0) fail("Faltam variáveis no .env: " + missing.join(", ") + ". Nada foi consultado.");
  return { client: createPluggyClientFromEnv(), itemId: process.env.PLUGGY_ITEM_ID!.trim() };
}

function plusDays(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d) + days * 86_400_000);
  return date.toISOString().slice(0, 10);
}

/** Último dia de fechamento (dia do mês do origin) antes do vencimento. */
function closingFromCycleDay(dueDay: string, cycleDay: number): string {
  const [y, m] = dueDay.split("-").map(Number);
  for (let back = 0; back < 3; back++) {
    const monthIndex = y * 12 + (m - 1) - back;
    const year = Math.floor(monthIndex / 12);
    const month = (monthIndex % 12) + 1;
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const day = [String(year).padStart(4, "0"), String(month).padStart(2, "0"), String(Math.min(cycleDay, last)).padStart(2, "0")].join("-");
    if (day < dueDay) return day;
  }
  return fail("Dia de fechamento do origin inválido.");
}

function dayOf(value: Date | null | undefined): string {
  return value ? businessDayKey(value) : "—";
}

async function listEverything(target: ScriptDatabase, owner: string): Promise<void> {
  const { client, itemId } = pluggyClient();
  const accounts = await client.listAccounts(itemId);
  console.log("Contas do item na Pluggy (" + accounts.length + "):");
  for (const account of accounts) {
    console.log("  - " + account.type + (account.subtype ? "/" + account.subtype : "") + " " + account.currencyCode + "  conta: " + account.id);
    if (account.type === "CREDIT") {
      const bills = await client.listBills(account.id);
      const { transactions } = await client.listTransactions(account.id);
      const lastByBill = new Map<string, string>();
      for (const tx of transactions) {
        const billId = tx.creditCardMetadata?.billId;
        const day = toBusinessDate(tx.date);
        if (billId && day && (!lastByBill.has(billId) || day > lastByBill.get(billId)!)) lastByBill.set(billId, day);
      }
      const lines = bills
        .map((bill) => ({ due: toBusinessDate(bill.dueDate), last: lastByBill.get(bill.id) ?? null }))
        .filter((bill): bill is { due: string; last: string | null } => bill.due !== null)
        .sort((a, b) => (a.due < b.due ? -1 : 1));
      console.log("      faturas (vencimento / último lançamento):");
      for (const bill of lines) console.log("        " + bill.due + " / " + (bill.last ?? "—"));
    }
  }

  const origins = await target.db.origin.findMany({
    where: { userId: owner, spaceId: null },
    select: { id: true, name: true, type: true },
    orderBy: { name: "asc" },
  });
  console.log("\nOrigins pessoais do dono (" + origins.length + "):");
  for (const origin of origins) console.log("  - " + origin.name + " [" + origin.type + "]  origin: " + origin.id);

  const links = await target.db.pluggyAccountLink.findMany({
    where: { userId: owner },
    include: { origin: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });
  console.log("\nVínculos existentes (" + links.length + "):");
  for (const link of links) {
    console.log(
      "  - vínculo: " + link.id + "  conta: " + link.pluggyAccountId + "  " + link.accountType + " → " + link.origin.name +
        "  syncFrom " + dayOf(link.syncFrom) +
        (link.accountType === "CREDIT" ? "  corte por fatura: " + dayOf(link.cutoffBillDueDate) : "") +
        (link.enabled ? "" : "  (desativado)") +
        (link.replacesAccountLinkId ? "  substitui: " + link.replacesAccountLinkId : "")
    );
  }
}

async function upsertLink(target: ScriptDatabase, owner: string, apply: boolean): Promise<void> {
  const accountId = argValue("account");
  const originId = argValue("origin");
  if (!accountId || !originId) fail("Informe --account e --origin (rode sem argumentos para listar).");
  const syncFromArg = parseDayArg(argValue("sync-from"), "sync-from");
  const cutoffArg = parseDayArg(argValue("cutoff-bill-due"), "cutoff-bill-due");
  const replacesId = argValue("replaces");

  const { client, itemId } = pluggyClient();
  const account = (await client.listAccounts(itemId)).find((candidate) => candidate.id === accountId);
  if (!account) fail("Conta não encontrada no item configurado.");
  if (account.type !== "BANK" && account.type !== "CREDIT") fail("Tipo de conta não suportado: " + account.type);
  const accountType = account.type as "BANK" | "CREDIT";

  const origin = await target.db.origin.findFirst({ where: { id: originId, userId: owner, spaceId: null } });
  if (!origin) fail("Origin não encontrado entre os origins pessoais do dono.");

  let syncFromDay: string;
  let cutoffDay: string | null = null;
  let closingNote = "";
  if (accountType === "BANK") {
    if (cutoffArg || argValue("cutoff-bill-closing")) fail("Conta corrente usa corte por data: informe só --sync-from.");
    if (!syncFromArg) fail("Conta corrente: informe --sync-from AAAA-MM-DD.");
    syncFromDay = syncFromArg;
  } else {
    if (syncFromArg) fail("Cartão: o syncFrom sai do fechamento da fatura de corte; não use --sync-from.");
    if (!cutoffArg) fail("Cartão usa corte por fatura: informe --cutoff-bill-due com o vencimento da última fatura já importada.");
    const cutBill = (await client.listBills(account.id)).find((bill) => toBusinessDate(bill.dueDate) === cutoffArg);
    if (!cutBill) fail("Nenhuma fatura do cartão vence em " + cutoffArg + " (rode sem argumentos para ver os vencimentos).");
    const { transactions } = await client.listTransactions(account.id);
    const latestInBill =
      transactions
        .filter((tx) => tx.creditCardMetadata?.billId === cutBill.id)
        .map((tx) => toBusinessDate(tx.date))
        .filter((day): day is string => day !== null)
        .sort()
        .pop() ?? null;
    const closingArg = parseDayArg(argValue("cutoff-bill-closing"), "cutoff-bill-closing");
    let closing: string | null;
    if (closingArg) {
      closing = closingArg;
      closingNote = "informado";
    } else if (origin.billingCycleDay) {
      closing = closingFromCycleDay(cutoffArg, origin.billingCycleDay);
      closingNote = "pelo dia de fechamento do origin";
    } else {
      closing = latestInBill;
      closingNote = "estimado pelo último lançamento da fatura";
    }
    if (!closing) fail("Não deu para estimar o fechamento da fatura de corte: informe --cutoff-bill-closing AAAA-MM-DD.");
    if (closing >= cutoffArg) fail("O fechamento precisa ser antes do vencimento da fatura de corte.");
    if (latestInBill && latestInBill > closing) {
      fail("A fatura de corte tem lançamento depois do fechamento " + closing + ". Confira --cutoff-bill-closing ou o dia de fechamento do origin.");
    }
    cutoffDay = cutoffArg;
    closingNote = "fechamento " + closing + " (" + closingNote + ")";
    syncFromDay = plusDays(closing, 1);
  }

  const existing = await target.db.pluggyAccountLink.findUnique({ where: { pluggyAccountId: account.id } });
  if (existing && existing.userId !== owner) fail("Esta conta já está vinculada a outro usuário. Nada foi feito.");
  if (existing && existing.accountType !== accountType) fail("O vínculo existente tem outro tipo de conta. Nada foi feito.");

  let replaced: { id: string } | null = null;
  if (replacesId) {
    const old = await target.db.pluggyAccountLink.findFirst({ where: { id: replacesId, userId: owner } });
    if (!old) fail("Vínculo a substituir não encontrado entre os vínculos do dono.");
    if (old.pluggyAccountId === account.id) fail("O vínculo a substituir é desta mesma conta.");
    if (old.accountType !== accountType) fail("O vínculo a substituir tem outro tipo de conta.");
    const taken = await target.db.pluggyAccountLink.findFirst({
      where: { replacesAccountLinkId: old.id, NOT: { pluggyAccountId: account.id } },
    });
    if (taken) fail("O vínculo antigo já foi substituído por outro.");
    replaced = { id: old.id };
  }

  const recorded = existing ? await target.db.pluggyTransactionLink.count({ where: { accountLinkId: existing.id } }) : 0;
  console.log("Banco: " + target.label);
  console.log((existing ? "Atualizar" : "Criar") + " vínculo " + accountType + " → " + origin.name);
  console.log("  syncFrom: " + syncFromDay + (cutoffDay ? " | corte por fatura: vencimento " + cutoffDay + ", " + closingNote : ""));
  if (replaced) console.log("  substitui o vínculo " + replaced.id + " (que será desativado)");
  if (recorded > 0) console.log("  atenção: este vínculo já tem " + recorded + " registros processados; o corte novo vale só para decisões futuras.");
  if (!apply) {
    console.log("\nSimulação: nada foi gravado. Use --apply para gravar.");
    return;
  }

  const data = {
    userId: owner,
    itemId,
    accountType,
    originId: origin.id,
    syncFrom: dayToStoredDate(syncFromDay),
    cutoffBillDueDate: cutoffDay ? dayToStoredDate(cutoffDay) : null,
    enabled: true,
    ...(replaced ? { replacesAccountLinkId: replaced.id } : {}),
  };
  await target.db.$transaction(async (tx) => {
    await lockUserForPluggy(tx, owner);
    if (replaced) await tx.pluggyAccountLink.update({ where: { id: replaced.id }, data: { enabled: false } });
    await tx.pluggyAccountLink.upsert({
      where: { pluggyAccountId: account.id },
      create: { ...data, pluggyAccountId: account.id },
      update: data,
    });
  });
  console.log("\nGravado.");
}

async function savePatterns(target: ScriptDatabase, owner: string, apply: boolean): Promise<void> {
  const file = assertPersonalPath(argValue("patterns") ?? fail("Informe o arquivo: --patterns personal/pluggy/<arquivo>.json"));
  let patterns: unknown;
  try {
    patterns = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    fail("O arquivo de padrões não é um JSON válido.");
  }
  if (!Array.isArray(patterns)) fail("O arquivo de padrões precisa ser uma lista.");
  const compiled = compileExcludePatterns(patterns);
  if (compiled.rejected > 0) {
    fail(compiled.rejected + " padrão(ões) inválido(s) ou com regex arriscada. Nada foi gravado.");
  }
  const actions = compiled.matchers.reduce<Record<string, number>>((acc, m) => {
    acc[m.action] = (acc[m.action] ?? 0) + 1;
    return acc;
  }, {});
  console.log("Banco: " + target.label);
  console.log("Padrões válidos: " + compiled.matchers.length + " (" + Object.entries(actions).map(([a, n]) => a + ": " + n).join(", ") + ")");
  if (!apply) {
    console.log("Simulação: nada foi gravado. Use --apply para gravar.");
    return;
  }
  await target.db.settings.upsert({
    where: { key_userId: { key: EXCLUDE_PATTERNS_SETTING_KEY, userId: owner } },
    create: { key: EXCLUDE_PATTERNS_SETTING_KEY, userId: owner, value: JSON.stringify(patterns) },
    update: { value: JSON.stringify(patterns) },
  });
  console.log("Gravado.");
}

async function main(): Promise<void> {
  const apply = hasFlag("apply");
  const owner = requireOwner();
  const target = await openDatabase();
  try {
    if (argValue("patterns") !== undefined || hasFlag("patterns")) await savePatterns(target, owner, apply);
    else if (argValue("account") !== undefined || argValue("origin") !== undefined) await upsertLink(target, owner, apply);
    else await listEverything(target, owner);
  } finally {
    await target.db.$disconnect();
  }
}

main().catch((error) => {
  console.error("link.ts falhou: " + describeSyncError(error));
  process.exit(1);
});

