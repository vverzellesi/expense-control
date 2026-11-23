import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { describeSyncError, isPluggySyncConfigured, publicCounts, runPluggySync } from "@/lib/pluggy/sync";
import { isAuthorizedCronRequest } from "./authorize";

/**
 * Sincronização diária da Pluggy (Vercel Cron, ver vercel.json).
 *
 * - 503 se a integração estiver desligada ou sem configuração.
 * - Authorization: Bearer CRON_SECRET, comparado em tempo constante e exigido mesmo
 *   com sessão autenticada (a sessão nunca é consultada). Falha: 401 sem detalhe.
 * - Nenhum parâmetro de query ou corpo escolhe usuário, item ou conta: tudo vem do
 *   dono configurado e dos PluggyAccountLink dele.
 * - Resposta só com status e contagens; erro real devolve 500.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function respond(status: number, body: Record<string, unknown> = {}) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return respond(503, { status: "disabled" });
  // Autentica antes de dizer se a integração está ligada.
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), secret)) return respond(401);
  if (!isPluggySyncConfigured(process.env)) return respond(503, { status: "disabled" });

  try {
    const report = await runPluggySync({ db: prisma }, { mode: "apply", trigger: "cron" });
    if (report.status === "skipped") return respond(200, { status: "skipped", reason: report.skippedReason });
    const body = { status: report.status, counts: publicCounts(report.counts) };
    return respond(report.status === "error" ? 500 : 200, body);
  } catch (error) {
    console.error("Pluggy cron: falha (" + describeSyncError(error) + ")");
    return respond(500, { status: "error" });
  }
}

