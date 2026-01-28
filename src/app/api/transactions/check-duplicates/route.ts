import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

interface TransactionToCheck {
  description: string;
  amount: number;
  date: string;
  isInstallment?: boolean;
  currentInstallment?: number;
  totalInstallments?: number;
}

interface RelatedInstallment {
  index: number;
  relatedTransactionId: string;
  relatedDescription: string;
  relatedInstallment: number;
}

// Extract base description without installment info
// "GRANADO PHARMACIES - Parcela 2/2" -> "GRANADO PHARMACIES"
function extractBaseDescription(description: string): string {
  return description
    .replace(/\s*[-–]\s*Parcela\s*\d+\s*[\/\\]\s*\d+/i, "")
    .replace(/\s*\(\d+\s*[\/\\]\s*\d+\)\s*$/i, "")
    .replace(/\s*Parcela\s*\d+\s*[\/\\]\s*\d+/i, "")
    .replace(/\s*\d+\s*[\/\\]\s*\d+\s*$/i, "")
    .trim();
}

// Detect installment from description
function detectInstallmentFromDescription(description: string): { current: number; total: number } | null {
  const patterns = [
    /[-–]\s*Parcela\s+(\d+)\s*[\/\\]\s*(\d+)/i,
    /Parcela\s+(\d+)\s*[\/\\]\s*(\d+)/i,
    /\((\d+)\s*[\/\\]\s*(\d+)\)/,
    /(\d+)\s*[\/\\]\s*(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      const current = parseInt(match[1], 10);
      const total = parseInt(match[2], 10);
      if (current > 0 && total > 1 && current <= total && total <= 48) {
        return { current, total };
      }
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

    const body = await request.json();
    const { transactions } = body as { transactions: TransactionToCheck[] };

    if (!transactions || !Array.isArray(transactions)) {
      return NextResponse.json(
        { error: "Transacoes nao fornecidas" },
        { status: 400 }
      );
    }

    const duplicates: number[] = [];
    const relatedInstallments: RelatedInstallment[] = [];

    for (let i = 0; i < transactions.length; i++) {
      const t = transactions[i];
      // Parse date safely to avoid timezone issues with YYYY-MM-DD format
      const dateStr = !t.date.includes('T') ? t.date + 'T12:00:00' : t.date;
      const transactionDate = new Date(dateStr);

      // Check for exact duplicates (same date, description, amount)
      const existing = await prisma.transaction.findFirst({
        where: {
          userId,
          description: {
            contains: t.description.slice(0, 50),
          },
          amount: {
            gte: t.amount - 0.01,
            lte: t.amount + 0.01,
          },
          date: {
            gte: new Date(transactionDate.getTime() - 24 * 60 * 60 * 1000),
            lte: new Date(transactionDate.getTime() + 24 * 60 * 60 * 1000),
          },
          deletedAt: null,
        },
      });

      if (existing) {
        duplicates.push(i);
        continue;
      }

      // Check for related installments (sequential installments of same purchase)
      const installmentInfo = detectInstallmentFromDescription(t.description) ||
        (t.isInstallment && t.currentInstallment && t.totalInstallments
          ? { current: t.currentInstallment, total: t.totalInstallments }
          : null);

      if (installmentInfo && installmentInfo.current > 1) {
        const baseDescription = extractBaseDescription(t.description);

        // Look for the previous installment (current - 1)
        const previousInstallment = installmentInfo.current - 1;

        // Search for transactions with similar base description that are installments
        const relatedTransaction = await prisma.transaction.findFirst({
          where: {
            userId,
            isInstallment: true,
            currentInstallment: previousInstallment,
            totalInstallments: installmentInfo.total,
            amount: {
              gte: t.amount - 1, // Allow small variance
              lte: t.amount + 1,
            },
            deletedAt: null,
          },
        });

        // If not found by exact match, try by description similarity
        if (!relatedTransaction) {
          const similarTransactions = await prisma.transaction.findMany({
            where: {
              userId,
              isInstallment: true,
              totalInstallments: installmentInfo.total,
              amount: {
                gte: t.amount - 1,
                lte: t.amount + 1,
              },
              deletedAt: null,
            },
          });

          // Find one with matching base description
          for (const st of similarTransactions) {
            const stBase = extractBaseDescription(st.description);
            if (
              stBase.toLowerCase().includes(baseDescription.toLowerCase().slice(0, 20)) ||
              baseDescription.toLowerCase().includes(stBase.toLowerCase().slice(0, 20))
            ) {
              if (st.currentInstallment === previousInstallment) {
                relatedInstallments.push({
                  index: i,
                  relatedTransactionId: st.id,
                  relatedDescription: st.description,
                  relatedInstallment: st.currentInstallment || 0,
                });
                break;
              }
            }
          }
        } else {
          relatedInstallments.push({
            index: i,
            relatedTransactionId: relatedTransaction.id,
            relatedDescription: relatedTransaction.description,
            relatedInstallment: relatedTransaction.currentInstallment || 0,
          });
        }
      }
    }

    return NextResponse.json({
      duplicates,
      hasDuplicates: duplicates.length > 0,
      relatedInstallments,
      hasRelatedInstallments: relatedInstallments.length > 0,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error checking duplicates:", error);
    return NextResponse.json(
      { error: "Erro ao verificar duplicatas" },
      { status: 500 }
    );
  }
}
