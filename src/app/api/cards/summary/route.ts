import { NextRequest, NextResponse } from "next/server";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { calculateCardsSummary } from "@/lib/cards-summary";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    const currentDate = new Date();
    const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();

    if (isNaN(targetMonth) || isNaN(targetYear) || targetMonth < 1 || targetMonth > 12) {
      return NextResponse.json(
        { error: "Parametros de mes/ano invalidos" },
        { status: 400 }
      );
    }

    const result = await calculateCardsSummary(ctx, targetMonth, targetYear);

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error fetching cards summary:", error);
    return NextResponse.json(
      { error: "Erro ao buscar resumo de cartoes" },
      { status: 500 }
    );
  }
}
