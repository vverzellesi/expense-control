import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

interface TransactionToCheck {
  description: string;
  amount: number;
  date: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { transactions } = body as { transactions: TransactionToCheck[] };

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Transacoes nao fornecidas" },
        { status: 400 }
      );
    }

    const duplicates: number[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      const transactionDate = new Date(t.date);

      // Check for transactions on the same date with same description and amount
      const existing = await prisma.transaction.findFirst({
        where: {
          description: {
            contains: t.description.slice(0, 50), // Check first 50 chars for similarity
          },
          amount: {
            gte: t.amount - 0.01,
            lte: t.amount + 0.01,
          },
          date: {
            gte: new Date(transactionDate.getTime() - 24 * 60 * 60 * 1000), // 1 day before
            lte: new Date(transactionDate.getTime() + 24 * 60 * 60 * 1000), // 1 day after
          },
        },
      });

      if (existing) {
        duplicates.push(i);
      }
    }

    return NextResponse.json({
      duplicates,
      hasDuplicates: duplicates.length > 0,
    });
  } catch (error) {
    console.error("Error checking duplicates:", error);
    return NextResponse.json(
      { error: "Erro ao verificar duplicatas" },
      { status: 500 }
    );
  }
}
