import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const categoryId = searchParams.get("categoryId");

    const where: Record<string, unknown> = {};

    if (month && year) {
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0);
      where.date = {
        gte: startDate,
        lte: endDate,
      };
    } else if (year) {
      const startDate = new Date(parseInt(year), 0, 1);
      const endDate = new Date(parseInt(year), 11, 31);
      where.date = {
        gte: startDate,
        lte: endDate,
      };
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: true,
      },
      orderBy: {
        date: "desc",
      },
    });

    // Generate CSV content
    const headers = ["Data", "Descricao", "Valor", "Tipo", "Categoria", "Origem", "Fixa", "Parcelada"];
    const rows = transactions.map((t) => [
      new Date(t.date).toLocaleDateString("pt-BR"),
      `"${t.description.replace(/"/g, '""')}"`,
      t.amount.toFixed(2).replace(".", ","),
      t.type === "INCOME" ? "Receita" : "Despesa",
      t.category?.name || "Sem categoria",
      t.origin,
      t.isFixed ? "Sim" : "Nao",
      t.isInstallment ? "Sim" : "Nao",
    ]);

    const csv = [headers.join(";"), ...rows.map((r) => r.join(";"))].join("\n");

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=transacoes_${new Date().toISOString().split("T")[0]}.csv`,
      },
    });
  } catch (error) {
    console.error("Error exporting transactions:", error);
    return NextResponse.json(
      { error: "Erro ao exportar transacoes" },
      { status: 500 }
    );
  }
}
