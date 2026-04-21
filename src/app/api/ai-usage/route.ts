import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorizedResponse } from "@/lib/auth-utils";
import { getUsage, currentYearMonth } from "@/lib/rate-limit/ai-quota";

export const runtime = "nodejs";

/**
 * Retorna `enabled: false` quando:
 * - GEMINI_API_KEY não está configurada (AI desabilitada no servidor)
 * - AI_MONTHLY_QUOTA=0 (feature flag off)
 *
 * Nesses casos, a UI deve esconder o badge de quota (não faz sentido
 * mostrar "0/0 usos" ou "cota esgotada").
 */
function isAiEnabled(): boolean {
  if (!process.env.GEMINI_API_KEY) return false;
  const rawQuota = process.env.AI_MONTHLY_QUOTA;
  if (rawQuota !== undefined && rawQuota !== null) {
    const parsed = Number(rawQuota);
    if (Number.isFinite(parsed) && parsed <= 0) return false;
  }
  return true;
}

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    if (!isAiEnabled()) {
      return NextResponse.json({ enabled: false });
    }

    const usage = await getUsage(ctx.userId);
    return NextResponse.json({
      enabled: true,
      ...usage,
      yearMonth: currentYearMonth(),
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("/api/ai-usage error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
