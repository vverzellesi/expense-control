import type { PrismaClient } from "@prisma/client";

/**
 * Tentativas sem resultado (abstenção ou confiança não alta) da categorização
 * assistida, guardadas em Settings para não reenviar o mesmo lançamento à
 * rotina todos os dias. JSON pequeno: id da transação → dia da tentativa
 * (YYYY-MM-DD). Entradas com mais de 30 dias são limpas a cada gravação.
 */

export const ATTEMPTS_SETTING_KEY = "pluggy.categorizeAttempts";
export const ATTEMPT_RETRY_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type Attempts = Record<string, string>;
export type AttemptsDb = Pick<PrismaClient, "settings">;

function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function cutoffDay(now: Date): string {
  return dayOf(new Date(now.getTime() - ATTEMPT_RETRY_DAYS * DAY_MS));
}

/** Valor inválido ou ausente vira lista vazia (no pior caso, reenvia). */
export function parseAttempts(raw: string | null | undefined): Attempts {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: Attempts = {};
  for (const [id, day] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof day === "string" && DAY_RE.test(day)) out[id] = day;
  }
  return out;
}

/** Ids tentados dentro da janela de 30 dias (não voltam para a exportação). */
export function recentAttemptIds(attempts: Attempts, now: Date): Set<string> {
  const cutoff = cutoffDay(now);
  return new Set(Object.keys(attempts).filter((id) => attempts[id] > cutoff));
}

/** Acrescenta as tentativas de hoje (sem renovar as que ainda estão na janela) e remove as que saíram dela. */
export function mergeAttempts(attempts: Attempts, ids: Iterable<string>, now: Date): Attempts {
  const cutoff = cutoffDay(now);
  const out: Attempts = {};
  for (const [id, day] of Object.entries(attempts)) if (day > cutoff) out[id] = day;
  const today = dayOf(now);
  for (const id of Array.from(ids)) if (!out[id]) out[id] = today;
  return out;
}

export async function readAttempts(db: AttemptsDb, ownerUserId: string): Promise<Attempts> {
  const row = await db.settings.findFirst({
    where: { key: ATTEMPTS_SETTING_KEY, userId: ownerUserId },
    select: { value: true },
  });
  return parseAttempts(row?.value);
}

export async function recordAttempts(db: AttemptsDb, ownerUserId: string, ids: string[], now: Date): Promise<void> {
  const value = JSON.stringify(mergeAttempts(await readAttempts(db, ownerUserId), ids, now));
  await db.settings.upsert({
    where: { key_userId: { key: ATTEMPTS_SETTING_KEY, userId: ownerUserId } },
    update: { value },
    create: { key: ATTEMPTS_SETTING_KEY, value, userId: ownerUserId },
  });
}
