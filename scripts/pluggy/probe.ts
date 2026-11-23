/**
 * Sonda SOMENTE LEITURA da Pluggy. Nenhum acesso a banco de dados.
 *
 * Uso (da raiz do repositório, com o .env local preenchido):
 *   npx tsx --tsconfig tsconfig.json scripts/pluggy/probe.ts [--detalhado]
 *
 * Lê PLUGGY_CLIENT_ID, PLUGGY_CLIENT_SECRET e PLUGGY_ITEM_ID do .env (só essas
 * variáveis; nenhum valor é impresso) e grava um relatório em
 * personal/pluggy/probe-<data>.md, caminho que precisa estar ignorado pelo git.
 * O relatório mascara descrições e valores por padrão; --detalhado inclui amostras reais.
 * No terminal aparecem só o caminho do relatório e contagens.
 */
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { createPluggyClientFromEnv, missingPluggyEnv, PluggyApiError } from "@/lib/pluggy/client";
import { buildProbeReport, summarizeProbe, type ProbeAccountData } from "./probe-report";

const REQUIRED_VARS = ["PLUGGY_CLIENT_ID", "PLUGGY_CLIENT_SECRET", "PLUGGY_ITEM_ID"] as const;

/** Carrega do .env apenas as variáveis da Pluggy, sem imprimir nada. */
function loadPluggyEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const name = match[1];
    if (!(REQUIRED_VARS as readonly string[]).includes(name) || process.env[name]) continue;
    let value = match[2].trim();
    const quoted = /^(["'])(.*)\1$/.exec(value);
    value = quoted ? quoted[2] : value.replace(/\s+#.*$/, "").trim();
    if (value) process.env[name] = value;
  }
}

function saoPauloStamp(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return get("year") + "-" + get("month") + "-" + get("day") + "-" + get("hour") + get("minute");
}

/** Aborta se o caminho não estiver ignorado pelo git (arquivo rastreado também não conta como ignorado). */
function assertGitIgnored(relativePath: string): void {
  try {
    execFileSync("git", ["check-ignore", "-q", relativePath], { stdio: "ignore" });
  } catch {
    console.error("Abortado: " + relativePath + " não está ignorado pelo git. Adicione /personal/ ao .gitignore.");
    process.exit(1);
  }
}

function sanitizedMessage(error: unknown): string {
  if (error instanceof PluggyApiError) return error.message;
  return "erro inesperado (" + (error instanceof Error ? error.name : typeof error) + ")";
}

async function main(): Promise<void> {
  const detailed = process.argv.includes("--detalhado");
  loadPluggyEnv();
  const missing = missingPluggyEnv(REQUIRED_VARS);
  if (missing.length > 0) {
    console.error("Faltam variáveis no .env: " + missing.join(", ") + ". Nada foi consultado.");
    process.exit(1);
  }

  const generatedAt = new Date();
  const relativePath = "personal/pluggy/probe-" + saoPauloStamp(generatedAt) + ".md";
  assertGitIgnored(relativePath);

  const client = createPluggyClientFromEnv();
  const itemId = process.env.PLUGGY_ITEM_ID!.trim();
  const item = await client.getItem(itemId);
  const accounts = await client.listAccounts(itemId);

  const entries: ProbeAccountData[] = [];
  for (const account of accounts) {
    const entry: ProbeAccountData = {
      account,
      transactions: null,
      transactionsError: null,
      coverage: null,
      bills: null,
      billsError: null,
    };
    try {
      const result = await client.listTransactions(account.id);
      entry.transactions = result.transactions;
      entry.coverage = result.coverage;
    } catch (error) {
      entry.transactionsError = sanitizedMessage(error);
    }
    if (account.type === "CREDIT") {
      try {
        entry.bills = await client.listBills(account.id);
      } catch (error) {
        entry.billsError = sanitizedMessage(error);
      }
    }
    entries.push(entry);
  }

  const data = { generatedAt, item, accounts: entries };
  const absolutePath = resolve(process.cwd(), relativePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
  writeFileSync(absolutePath, buildProbeReport(data, { detailed }), { encoding: "utf8", mode: 0o600 });

  const summary = summarizeProbe(data);
  console.log("Relatório: " + relativePath + (detailed ? " (detalhado, contém dados reais)" : ""));
  console.log(
    "Contas: " + summary.accounts + " | transações: " + summary.transactions + " | faturas: " + summary.bills +
      " | leituras com falha: " + summary.failures
  );
}

main().catch((error) => {
  console.error("Sonda falhou: " + sanitizedMessage(error));
  process.exit(1);
});
