import { NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";
import prisma from "@/lib/db";
import { describeSyncError, triggerSyncFromWebhook } from "@/lib/pluggy/sync";
import {
  classifyWebhookEvent,
  MAX_WEBHOOK_BODY_BYTES,
  parseWebhookSecrets,
  readBodyWithLimit,
  SIGNATURE_HEADER,
  verifyPluggySignature,
} from "./verify";

/**
 * Webhook da Pluggy (caminho configurado na Pluggy: /webhooks/pluggy).
 *
 * - Integração desligada (PLUGGY_SYNC_ENABLED diferente de "true"): 200 sem ler o corpo,
 *   para a Pluggy não acumular falhas.
 * - Assinatura conferida sobre o corpo cru, em tempo constante, com janela de 5 minutos.
 *   Inválida: 401 sem detalhe. Corpo acima do limite: 413.
 * - Resposta 200 imediata; a sincronização roda depois com waitUntil e só para eventos de
 *   item atualizado e de transações deste cliente e deste item.
 * - Nada do corpo nem dos cabeçalhos vai para log.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function respond(status: number, body: Record<string, unknown> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  try {
    if (process.env.PLUGGY_SYNC_ENABLED !== "true") return respond(200, { ok: true });

    const secrets = parseWebhookSecrets(process.env.PLUGGY_WEBHOOK_SECRET);
    if (secrets.length === 0) return respond(503, { error: "not_configured" });

    const body = await readBodyWithLimit(request, MAX_WEBHOOK_BODY_BYTES);
    if (body === null) return respond(413);

    const verdict = verifyPluggySignature({
      header: request.headers.get(SIGNATURE_HEADER),
      body,
      secrets,
      nowMs: Date.now(),
    });
    if (!verdict.ok) return respond(401);

    let payload: unknown;
    try {
      payload = JSON.parse(body.toString("utf8"));
    } catch {
      return respond(200, { ok: true });
    }

    const decision = classifyWebhookEvent(payload, {
      clientId: process.env.PLUGGY_CLIENT_ID,
      itemId: process.env.PLUGGY_ITEM_ID,
    });
    if (decision.trigger) {
      waitUntil(
        triggerSyncFromWebhook({ db: prisma }, { itemId: decision.itemId }).catch((error) => {
          console.error("Pluggy webhook: sincronização falhou (" + describeSyncError(error) + ")");
        })
      );
    }
    return respond(200, { ok: true });
  } catch (error) {
    console.error("Pluggy webhook: falha (" + describeSyncError(error) + ")");
    return respond(500);
  }
}

