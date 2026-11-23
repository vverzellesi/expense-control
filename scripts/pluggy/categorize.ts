/**
 * Categorização por IA dos lançamentos de cartão da Pluggy que as regras não resolveram.
 * SIMULAÇÃO por padrão: não chama o provedor e não grava nada.
 *
 * Uso (da raiz do repositório, com o .env local preenchido):
 *   npx tsx --tsconfig tsconfig.json scripts/pluggy/categorize.ts [--apply] [--prod]
 *
 *   --apply  chama a Anthropic e grava categoryId + categorySource = "ai"
 *   --prod   usa DATABASE_URL_PROD em vez de DATABASE_URL
 *
 * Lê do .env só DATABASE_URL, DATABASE_URL_PROD, PLUGGY_OWNER_USER_ID,
 * ANTHROPIC_API_KEY, AI_CATEGORIZER_MODEL e AI_CATEGORIZER_MAX_CALLS_PER_RUN,
 * sem imprimir nenhum valor. Na simulação, o que seria enviado ao provedor
 * (descrições reais) vai para personal/pluggy/categorize-<data>.json, caminho
 * que precisa estar ignorado pelo git. No terminal aparecem só contagens.
 */
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { PrismaClient } from "@prisma/client";
import { categorizeUncategorized, categorizerConfigFromEnv } from "@/lib/ai-categorizer";

const ENV_VARS = [
  "DATABASE_URL",
  "DATABASE_URL_PROD",
  "PLUGGY_OWNER_USER_ID",
  "ANTHROPIC_API_KEY",
  "AI_CATEGORIZER_MODEL",
  "AI_CATEGORIZER_MAX_CALLS_PER_RUN",
] as const;

/** Carrega do .env apenas as variáveis acima, sem imprimir nada. */
function loadEnv(): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const name = match[1];
    if (!(ENV_VARS as readonly string[]).includes(name) || process.env[name]) continue;
    let value = match[2].trim();
    const quoted = /^(["'])(.*?)\1(?:\s+#.*)?$/.exec(value);
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

/** Aborta se o caminho não estiver ignorado pelo git. */
function assertGitIgnored(relativePath: string): void {
  try {
    execFileSync("git", ["check-ignore", "-q", relativePath], { stdio: "ignore" });
  } catch {
    console.error("Abortado: " + relativePath + " não está ignorado pelo git.");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const prod = process.argv.includes("--prod");
  loadEnv();

  const urlVar = prod ? "DATABASE_URL_PROD" : "DATABASE_URL";
  const datasourceUrl = process.env[urlVar]?.trim();
  const ownerUserId = process.env.PLUGGY_OWNER_USER_ID?.trim();
  const missing = [!datasourceUrl && urlVar, !ownerUserId && "PLUGGY_OWNER_USER_ID"].filter(Boolean);
  if (missing.length > 0) {
    console.error("Faltam variáveis no .env: " + missing.join(", ") + ". Nada foi feito.");
    process.exit(1);
  }

  const relativePath = "personal/pluggy/categorize-" + saoPauloStamp(new Date()) + ".json";
  if (!apply) assertGitIgnored(relativePath);

  const config = categorizerConfigFromEnv();
  const db = new PrismaClient({ datasourceUrl });
  try {
    const result = await categorizeUncategorized(db, {
      ownerUserId: ownerUserId!,
      mode: apply ? "apply" : "simulate",
      ...config,
    });

    console.log(
      "Banco: " + (prod ? "produção" : "local") + " | modo: " + (apply ? "gravação" : "simulação") +
        " | estado: " + result.state + (result.error ? " (" + result.error + ")" : "") + " | modelo: " + result.model
    );
    console.log(
      Object.entries(result.counts)
        .map(([name, n]) => name + "=" + n)
        .join(" ")
    );

    if (!apply) {
      const absolutePath = resolve(process.cwd(), relativePath);
      mkdirSync(dirname(absolutePath), { recursive: true });
      const report = { generatedAt: new Date().toISOString(), counts: result.counts, batches: result.preview ?? [] };
      writeFileSync(absolutePath, JSON.stringify(report, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
      console.log("Relatório do que seria enviado (contém descrições reais): " + relativePath);
    }
    if (result.state === "erro") process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error("Categorização falhou: " + (error instanceof Error ? error.name : typeof error));
  process.exit(1);
});
