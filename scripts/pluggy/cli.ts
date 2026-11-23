/**
 * Utilidades comuns dos scripts scripts/pluggy/{link,sync,review,revoke}.ts.
 *
 * - Lê do .env só as variáveis pedidas, sem imprimir nenhum valor.
 * - Banco alvo: DATABASE_URL; produção só com a flag explícita --prod (DATABASE_URL_PROD).
 * - Relatórios com dados reais só em personal/pluggy/, conferido com git check-ignore.
 */
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { dirname, relative, resolve } from "path";
import { createInterface } from "readline";
import { PrismaClient } from "@prisma/client";

export const argv = process.argv.slice(2);

export function hasFlag(name: string): boolean {
  return argv.includes("--" + name);
}

export function argValue(name: string): string | undefined {
  const index = argv.indexOf("--" + name);
  if (index < 0) return undefined;
  const value = argv[index + 1];
  return value && !value.startsWith("--") ? value : undefined;
}

export function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/** Interrupção com mensagem própria (sem dados), usada onde é preciso desfazer antes de sair. */
export class ScriptAbort extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScriptAbort";
  }
}

export function abort(message: string): never {
  throw new ScriptAbort(message);
}

/** Carrega do .env apenas as variáveis listadas, sem sobrescrever o ambiente e sem imprimir nada. */
export function loadEnvVars(names: readonly string[]): void {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = /^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;
    const name = match[1];
    if (!names.includes(name) || process.env[name]) continue;
    let value = match[2].trim();
    const quoted = /^(["'])(.*?)\1(?:\s+#.*)?$/.exec(value);
    value = quoted ? quoted[2] : value.replace(/\s+#.*$/, "").trim();
    if (value) process.env[name] = value;
  }
}

export function missingVars(names: readonly string[]): string[] {
  return names.filter((name) => !process.env[name] || process.env[name]!.trim() === "");
}

export interface ScriptDatabase {
  db: PrismaClient;
  /** Descrição do alvo para o terminal; nunca a URL. */
  label: string;
  prod: boolean;
}

/**
 * Banco de DATABASE_URL, ou de DATABASE_URL_PROD com --prod. Neon usa o mesmo
 * cliente do app (@/lib/db, adapter serverless); outro host usa o Prisma direto.
 */
export async function openDatabase(): Promise<ScriptDatabase> {
  const prod = hasFlag("prod");
  const variable = prod ? "DATABASE_URL_PROD" : "DATABASE_URL";
  loadEnvVars([variable]);
  const url = process.env[variable]?.trim();
  if (!url) fail("Falta " + variable + " no ambiente ou no .env. Nada foi feito.");
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    fail(variable + " não é uma URL válida. Nada foi feito.");
  }
  process.env.DATABASE_URL = url;
  const label = prod ? "produção (DATABASE_URL_PROD)" : "DATABASE_URL";
  if (host.endsWith(".neon.tech")) {
    const { prisma } = await import("@/lib/db");
    return { db: prisma, label, prod };
  }
  return { db: new PrismaClient({ datasourceUrl: url }), label, prod };
}

export function requireOwner(): string {
  loadEnvVars(["PLUGGY_OWNER_USER_ID"]);
  const owner = process.env.PLUGGY_OWNER_USER_ID?.trim();
  if (!owner) fail("Falta PLUGGY_OWNER_USER_ID no ambiente ou no .env. Nada foi feito.");
  return owner;
}

export function saoPauloStamp(date: Date): string {
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

/** Aborta se o caminho não estiver dentro de personal/ e ignorado pelo git. */
export function assertPersonalPath(path: string): string {
  const absolute = resolve(process.cwd(), path);
  const rel = relative(process.cwd(), absolute);
  if (rel.startsWith("..") || !(rel === "personal" || rel.startsWith("personal/"))) {
    fail("Abortado: o arquivo precisa estar em personal/.");
  }
  try {
    execFileSync("git", ["check-ignore", "-q", rel], { stdio: "ignore" });
  } catch {
    fail("Abortado: " + rel + " não está ignorado pelo git.");
  }
  return absolute;
}

/** Grava um relatório em personal/pluggy/ (só depois de conferir o git check-ignore). */
export function writePersonalReport(relativePath: string, content: string): void {
  const absolute = assertPersonalPath(relativePath);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, content, { encoding: "utf8", mode: 0o600 });
}

/** Pede que a pessoa digite exatamente o texto esperado. */
export async function confirmTyped(prompt: string, expected: string): Promise<boolean> {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolveAnswer) => rl.question(prompt, resolveAnswer));
  rl.close();
  return answer.trim() === expected;
}

export function parseDayArg(value: string | undefined, name: string): string | undefined {
  if (value === undefined) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const valid =
    match &&
    (() => {
      const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
      return date.getUTCDate() === Number(match[3]) && date.getUTCMonth() === Number(match[2]) - 1;
    })();
  if (!valid) fail("--" + name + " precisa ser uma data YYYY-MM-DD válida.");
  return value;
}

