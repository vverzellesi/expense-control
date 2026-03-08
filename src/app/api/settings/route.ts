import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get("key");

    if (key) {
      const setting = await prisma.settings.findUnique({
        where: {
          key_userId: {
            key,
            userId: ctx.userId,
          },
        },
      });
      return NextResponse.json(setting);
    }

    const settings = await prisma.settings.findMany({
      where: {
        userId: ctx.userId,
      },
    });
    return NextResponse.json(settings);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { error: "Erro ao buscar configuracoes" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    const body = await request.json();
    const { key, value } = body;

    if (!key || value === undefined) {
      return NextResponse.json(
        { error: "Chave e valor sao obrigatorios" },
        { status: 400 }
      );
    }

    const setting = await prisma.settings.upsert({
      where: {
        key_userId: {
          key,
          userId: ctx.userId,
        },
      },
      update: { value: String(value) },
      create: { key, value: String(value), userId: ctx.userId },
    });

    return NextResponse.json(setting);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error saving setting:", error);
    return NextResponse.json(
      { error: "Erro ao salvar configuracao" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const ctx = await getAuthContext();

    const searchParams = request.nextUrl.searchParams;
    const key = searchParams.get("key");

    if (!key) {
      return NextResponse.json(
        { error: "Chave e obrigatoria" },
        { status: 400 }
      );
    }

    await prisma.settings.deleteMany({
      where: {
        key,
        userId: ctx.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error deleting setting:", error);
    return NextResponse.json(
      { error: "Erro ao excluir configuracao" },
      { status: 500 }
    );
  }
}
