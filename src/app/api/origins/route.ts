import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId();

    const origins = await prisma.origin.findMany({
      where: {
        userId,
      },
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(origins);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching origins:", error);
    return NextResponse.json(
      { error: "Erro ao buscar origens" },
      { status: 500 }
    );
  }
}
