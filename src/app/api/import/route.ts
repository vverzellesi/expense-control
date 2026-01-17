import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactions, origin } = body;

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Transacoes invalidas" },
        { status: 400 }
      );
    }

    const created = [];

    for (const t of transactions) {
      // Determine type and amount sign
      const type = t.type || "EXPENSE";
      let amount = t.amount;

      // Ensure amount sign matches type
      if (type === "EXPENSE" && amount > 0) {
        amount = -amount;
      } else if (type === "INCOME" && amount < 0) {
        amount = Math.abs(amount);
      }

      const transaction = await prisma.transaction.create({
        data: {
          description: t.description,
          amount,
          date: new Date(t.date),
          type,
          origin: origin || t.origin || "Importacao CSV",
          categoryId: t.categoryId || null,
          isFixed: false,
          isInstallment: t.isInstallment || false,
          currentInstallment: t.currentInstallment || null,
        },
        include: {
          category: true,
        },
      });
      created.push(transaction);
    }

    return NextResponse.json(
      { message: `${created.length} transacoes importadas com sucesso`, count: created.length },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error importing transactions:", error);
    return NextResponse.json(
      { error: "Erro ao importar transacoes" },
      { status: 500 }
    );
  }
}
