import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const categoryId = searchParams.get("categoryId");
    const origin = searchParams.get("origin");
    const type = searchParams.get("type");
    const isFixed = searchParams.get("isFixed");
    const isInstallment = searchParams.get("isInstallment");
    const search = searchParams.get("search");
    const tag = searchParams.get("tag");
    const includeDeleted = searchParams.get("includeDeleted");

    const where: Record<string, unknown> = {
      userId,
    };

    // By default, exclude soft-deleted transactions
    if (includeDeleted !== "true") {
      where.deletedAt = null;
    }

    // Custom date range filter takes priority
    if (startDate && endDate) {
      where.date = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    } else if (month && year) {
      const monthStart = new Date(parseInt(year), parseInt(month) - 1, 1);
      const monthEnd = new Date(parseInt(year), parseInt(month), 0);
      where.date = {
        gte: monthStart,
        lte: monthEnd,
      };
    } else if (year) {
      const yearStart = new Date(parseInt(year), 0, 1);
      const yearEnd = new Date(parseInt(year), 11, 31);
      where.date = {
        gte: yearStart,
        lte: yearEnd,
      };
    }

    // Global text search
    if (search && search.trim()) {
      where.description = {
        contains: search.trim(),
      };
    }

    if (categoryId) {
      where.categoryId = categoryId;
    }

    if (origin) {
      where.origin = origin;
    }

    if (type) {
      where.type = type;
    }

    if (isFixed === "true") {
      where.isFixed = true;
    }

    if (isInstallment === "true") {
      where.isInstallment = true;
    }

    // Filter standalone installments (not linked to an Installment group)
    const standalone = searchParams.get("standalone");
    if (standalone === "true") {
      where.installmentId = null;
    }

    // Filter by tag (searches within JSON array string)
    if (tag && tag.trim()) {
      where.tags = {
        contains: tag.trim(),
      };
    }

    const transactions = await prisma.transaction.findMany({
      where,
      include: {
        category: true,
        installment: true,
      },
      orderBy: {
        date: "desc",
      },
    });

    return NextResponse.json(transactions);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching transactions:", error);
    return NextResponse.json(
      { error: "Erro ao buscar transacoes" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const body = await request.json();
    const {
      description,
      amount,
      date,
      type,
      origin,
      categoryId,
      isFixed,
      isInstallment,
      totalInstallments,
      installmentAmount,
      tags,
    } = body;

    // Process tags - accept array or string, store as JSON string
    const processedTags = tags
      ? Array.isArray(tags)
        ? JSON.stringify(tags)
        : tags
      : null;

    if (isInstallment && totalInstallments > 1) {
      // Create installment group and transactions
      const installment = await prisma.installment.create({
        data: {
          description,
          totalAmount: Math.abs(amount) * totalInstallments,
          totalInstallments,
          installmentAmount: installmentAmount || Math.abs(amount),
          startDate: new Date(date + "T12:00:00"),
          origin,
          userId,
        },
      });

      const transactions = [];
      const startDate = new Date(date + "T12:00:00");

      for (let i = 0; i < totalInstallments; i++) {
        const transactionDate = new Date(startDate);
        transactionDate.setMonth(transactionDate.getMonth() + i);

        const transaction = await prisma.transaction.create({
          data: {
            description: `${description} (${i + 1}/${totalInstallments})`,
            amount: type === "EXPENSE" ? -Math.abs(installmentAmount || amount) : Math.abs(installmentAmount || amount),
            date: transactionDate,
            type,
            origin,
            categoryId: categoryId || null,
            isFixed: false,
            isInstallment: true,
            installmentId: installment.id,
            currentInstallment: i + 1,
            tags: processedTags,
            userId,
          },
          include: {
            category: true,
            installment: true,
          },
        });
        transactions.push(transaction);
      }

      return NextResponse.json(transactions[0], { status: 201 });
    } else {
      const transaction = await prisma.transaction.create({
        data: {
          description,
          amount: type === "EXPENSE" ? -Math.abs(amount) : Math.abs(amount),
          date: new Date(date + "T12:00:00"),
          type,
          origin,
          categoryId: categoryId || null,
          isFixed: isFixed || false,
          isInstallment: false,
          tags: processedTags,
          userId,
        },
        include: {
          category: true,
        },
      });

      return NextResponse.json(transaction, { status: 201 });
    }
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error creating transaction:", error);
    return NextResponse.json(
      { error: "Erro ao criar transacao" },
      { status: 500 }
    );
  }
}
