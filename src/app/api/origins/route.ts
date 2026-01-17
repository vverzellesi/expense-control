import { NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET() {
  try {
    const origins = await prisma.origin.findMany({
      orderBy: {
        name: "asc",
      },
    });

    return NextResponse.json(origins);
  } catch (error) {
    console.error("Error fetching origins:", error);
    return NextResponse.json(
      { error: "Erro ao buscar origens" },
      { status: 500 }
    );
  }
}
