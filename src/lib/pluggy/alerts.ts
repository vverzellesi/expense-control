import type { PrismaClient } from "@prisma/client";
import { sendMessage } from "@/lib/telegram/client";

/**
 * Alerta da sincronização Pluggy para o Telegram do dono.
 *
 * Só sai quando o run termina em warning ou error, ou quando há itens novos em
 * needs_review. A mensagem leva apenas o status, contagens e tipos de alerta:
 * nunca valores, descrições, nomes, datas ou ids. Falha no envio é engolida e
 * não muda o resultado do run.
 */

export type AlertRunStatus = "ok" | "warning" | "error";

export interface AlertSummary {
  status: AlertRunStatus;
  /** Registros que entraram em needs_review nesta execução. */
  newNeedsReview: number;
  /** Tipo de alerta → quantidade (códigos de ALERT_LABELS). */
  alerts: Record<string, number>;
}

/** Rótulos dos códigos de alerta. Código desconhecido vira "outro alerta". */
export const ALERT_LABELS: Record<string, string> = {
  item_not_updated: "conexão com status diferente de atualizado",
  item_stale: "conexão sem atualização há mais de 48 horas",
  item_read_failed: "falha ao ler a conexão",
  consent_expiring: "autorização vence em menos de 30 dias",
  consent_expired: "autorização vencida",
  accounts_read_failed: "falha ao listar as contas da conexão",
  account_not_found: "conta vinculada não encontrada na conexão",
  account_read_failed: "falha ao ler uma conta (conta ignorada nesta execução)",
  bills_read_failed: "falha ao ler as faturas (cartão ignorado nesta execução)",
  account_dependency_failed: "conta ignorada porque outra conta da conexão falhou",
  account_processing_failed: "falha ao gravar uma conta",
  mapping_failed: "registro fora do formato esperado (conta ignorada)",
  coverage_truncated: "histórico devolvido começa depois do corte",
  empty_read: "leitura vazia com lançamentos já vinculados (nada foi removido)",
  missing_upstream: "lançamentos já importados que sumiram da fonte",
  bill_residue_negative: "fatura com resíduo negativo",
  unknown_bill: "lançamentos de fatura que a Pluggy não listou",
  user_patterns_invalid: "padrões de exclusão inválidos (ignorados)",
  user_patterns_rejected: "padrões de exclusão recusados",
  invariant_violation: "contagem de destinos não fecha",
  lease_lost: "execução perdeu a exclusividade e parou",
  config: "configuração incompleta",
  unexpected: "erro inesperado",
};

const STATUS_LABELS: Record<AlertRunStatus, string> = {
  ok: "concluída",
  warning: "concluída com avisos",
  error: "terminou com erro",
};

export function shouldAlert(summary: AlertSummary): boolean {
  return summary.status !== "ok" || summary.newNeedsReview > 0;
}

function safeCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

/** Texto do alerta, ou null quando não há o que avisar. */
export function buildAlertMessage(summary: AlertSummary): string | null {
  if (!shouldAlert(summary)) return null;
  const lines = ["My Pocket · Open Finance", "Sincronização " + STATUS_LABELS[summary.status] + "."];
  const review = safeCount(summary.newNeedsReview);
  if (review > 0) lines.push("Novos itens para revisar: " + review);

  const grouped = new Map<string, number>();
  for (const [code, count] of Object.entries(summary.alerts)) {
    const n = safeCount(count);
    if (n === 0) continue;
    const label = ALERT_LABELS[code] ?? "outro alerta";
    grouped.set(label, (grouped.get(label) ?? 0) + n);
  }
  if (grouped.size > 0) {
    lines.push("Alertas:");
    for (const label of Array.from(grouped.keys()).sort()) lines.push("• " + label + ": " + grouped.get(label));
  }
  lines.push("Detalhes no script de revisão.");
  return lines.join("\n");
}

export type SendFn = (chatId: string, text: string) => Promise<unknown>;

export interface SendAlertResult {
  sent: boolean;
  reason: "not_needed" | "telegram_not_configured" | "owner_not_linked" | "send_failed" | null;
}

/**
 * Envia o alerta ao chat vinculado ao dono (TelegramLink). Nunca lança.
 */
export async function sendSyncAlert(
  db: Pick<PrismaClient, "telegramLink">,
  ownerUserId: string,
  summary: AlertSummary,
  deps: { send?: SendFn; env?: Record<string, string | undefined> } = {}
): Promise<SendAlertResult> {
  const text = buildAlertMessage(summary);
  if (!text) return { sent: false, reason: "not_needed" };
  const env = deps.env ?? process.env;
  if (!deps.send && !env.TELEGRAM_BOT_TOKEN) return { sent: false, reason: "telegram_not_configured" };
  try {
    const link = await db.telegramLink.findUnique({ where: { userId: ownerUserId }, select: { chatId: true } });
    if (!link) return { sent: false, reason: "owner_not_linked" };
    const send: SendFn = deps.send ?? ((chatId, body) => sendMessage(chatId, body));
    const response = (await send(link.chatId, text)) as { ok?: boolean } | undefined;
    if (response && typeof response === "object" && response.ok === false) return { sent: false, reason: "send_failed" };
    return { sent: true, reason: null };
  } catch {
    return { sent: false, reason: "send_failed" };
  }
}

