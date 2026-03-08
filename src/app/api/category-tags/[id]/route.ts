import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthContext, unauthorizedResponse, forbiddenResponse } from "@/lib/auth-utils";
import { invalidateTagsCache } from "@/lib/categorizer";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    const { id } = await params;
    const body = await request.json();
    const { name, keywords } = body;

    if (!name && !keywords) {
      return NextResponse.json(
        { error: "Informe name ou keywords para atualizar" },
        { status: 400 }
      );
    }

    // Verify tag belongs to user
    const existing = await prisma.categoryTag.findFirst({
      where: { id, ...ctx.ownerFilter },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Tag não encontrada" },
        { status: 404 }
      );
    }

    const data: { name?: string; keywords?: string } = {};
    if (name) data.name = name;
    if (keywords) data.keywords = keywords.toLowerCase();

    const tag = await prisma.categoryTag.update({
      where: { id },
      data,
      include: { category: true },
    });

    invalidateTagsCache();

    return NextResponse.json(tag);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error updating category tag:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar tag de categoria" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getAuthContext();
    const { id } = await params;

    // Verify tag belongs to user
    const existing = await prisma.categoryTag.findFirst({
      where: { id, ...ctx.ownerFilter },
    });

    if (!existing) {
      return NextResponse.json(
        { error: "Tag não encontrada" },
        { status: 404 }
      );
    }

    await prisma.categoryTag.delete({
      where: { id },
    });

    invalidateTagsCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    if (error instanceof Error && error.message === "Forbidden") {
      return forbiddenResponse();
    }
    console.error("Error deleting category tag:", error);
    return NextResponse.json(
      { error: "Erro ao excluir tag de categoria" },
      { status: 500 }
    );
  }
}
