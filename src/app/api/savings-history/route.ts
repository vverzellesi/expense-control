import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// GET - List savings history
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = searchParams.get("limit");

    const history = await prisma.savingsHistory.findMany({
      orderBy: [
        { year: "desc" },
        { month: "desc" },
      ],
      take: limit ? parseInt(limit) : 12,
    });

    return NextResponse.json(history);
  } catch (error) {
    console.error("Error fetching savings history:", error);
    return NextResponse.json(
      { error: "Erro ao buscar historico de economia" },
      { status: 500 }
    );
  }
}

// POST - Record/update savings for a month
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { month, year, goal, actual } = body;

    if (!month || !year || goal === undefined || actual === undefined) {
      return NextResponse.json(
        { error: "Campos month, year, goal e actual sao obrigatorios" },
        { status: 400 }
      );
    }

    const percentage = goal > 0 ? (actual / goal) * 100 : 0;
    const isAchieved = actual >= goal;

    const record = await prisma.savingsHistory.upsert({
      where: {
        month_year: {
          month,
          year,
        },
      },
      update: {
        goal,
        actual,
        isAchieved,
        percentage,
      },
      create: {
        month,
        year,
        goal,
        actual,
        isAchieved,
        percentage,
      },
    });

    return NextResponse.json(record);
  } catch (error) {
    console.error("Error saving savings history:", error);
    return NextResponse.json(
      { error: "Erro ao salvar historico de economia" },
      { status: 500 }
    );
  }
}
