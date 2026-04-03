import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, handleApiError } from "@/lib/auth-utils";

const PDF_PASSWORD_KEY = "pdfPassword";

export async function GET() {
  try {
    const ctx = await getAuthContext();

    const setting = await prisma.settings.findUnique({
      where: { key_userId: { key: PDF_PASSWORD_KEY, userId: ctx.userId } },
    });

    return NextResponse.json({
      hasSavedPassword: !!setting?.value,
    });
  } catch (error) {
    return handleApiError(error, "verificar senha de PDF");
  }
}

export async function DELETE() {
  try {
    const ctx = await getAuthContext();

    await prisma.settings.deleteMany({
      where: { key: PDF_PASSWORD_KEY, userId: ctx.userId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleApiError(error, "remover senha de PDF");
  }
}
