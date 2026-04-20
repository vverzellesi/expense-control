import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorizedResponse } from "@/lib/auth-utils";
import { getUsage, currentYearMonth } from "@/lib/rate-limit/ai-quota";

export const runtime = "nodejs";

export async function GET(_request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const usage = await getUsage(ctx.userId);
    return NextResponse.json({ ...usage, yearMonth: currentYearMonth() });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("/api/ai-usage error:", error);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
