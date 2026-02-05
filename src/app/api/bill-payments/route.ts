import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";
import { BillPaymentType } from "@/types";

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const searchParams = request.nextUrl.searchParams;
    const month = searchParams.get("month");
    const year = searchParams.get("year");
    const origin = searchParams.get("origin");

    const where: Record<string, unknown> = {
      userId,
    };

    if (month) {
      where.billMonth = parseInt(month, 10);
    }

    if (year) {
      where.billYear = parseInt(year, 10);
    }

    if (origin) {
      where.origin = origin;
    }

    const billPayments = await prisma.billPayment.findMany({
      where,
      include: {
        installment: true,
      },
      orderBy: [
        { billYear: "desc" },
        { billMonth: "desc" },
      ],
    });

    return NextResponse.json(billPayments);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching bill payments:", error);
    return NextResponse.json(
      { error: "Erro ao buscar pagamentos de fatura" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();
    const body = await request.json();
    const {
      billMonth,
      billYear,
      origin,
      totalBillAmount,
      paymentType,
      amountPaid,
      installments,
      interestRate,
    } = body;

    // Validate required fields
    if (
      billMonth === undefined ||
      billYear === undefined ||
      !origin ||
      totalBillAmount === undefined ||
      !paymentType ||
      amountPaid === undefined
    ) {
      return NextResponse.json(
        {
          error:
            "Campos obrigatorios: billMonth, billYear, origin, totalBillAmount, paymentType, amountPaid",
        },
        { status: 400 }
      );
    }

    // Validate billMonth is between 1-12
    if (billMonth < 1 || billMonth > 12) {
      return NextResponse.json(
        { error: "billMonth deve estar entre 1 e 12" },
        { status: 400 }
      );
    }

    // Validate paymentType
    const validPaymentTypes: BillPaymentType[] = ["PARTIAL", "FINANCED"];
    if (!validPaymentTypes.includes(paymentType)) {
      return NextResponse.json(
        { error: "paymentType deve ser 'PARTIAL' ou 'FINANCED'" },
        { status: 400 }
      );
    }

    // Validate amountPaid is less than totalBillAmount
    if (amountPaid >= totalBillAmount) {
      return NextResponse.json(
        { error: "amountPaid deve ser menor que totalBillAmount para pagamento parcial" },
        { status: 400 }
      );
    }

    // Validate installments for FINANCED type
    if (paymentType === "FINANCED" && (!installments || installments < 2)) {
      return NextResponse.json(
        { error: "Para parcelamento, o numero de parcelas deve ser pelo menos 2" },
        { status: 400 }
      );
    }

    // Check for duplicate bill payment
    const existingPayment = await prisma.billPayment.findFirst({
      where: {
        userId,
        billMonth,
        billYear,
        origin,
      },
    });

    if (existingPayment) {
      return NextResponse.json(
        {
          error: `Ja existe um pagamento registrado para a fatura de ${billMonth}/${billYear} - ${origin}`,
        },
        { status: 409 }
      );
    }

    // Calculate amountCarried (remaining balance after payment)
    const amountCarried = totalBillAmount - amountPaid;

    // Calculate interest amount if rate is provided
    const interestAmount = interestRate
      ? (amountCarried * interestRate) / 100
      : null;

    const billPayment = await prisma.billPayment.create({
      data: {
        billMonth,
        billYear,
        origin,
        totalBillAmount,
        amountPaid,
        amountCarried,
        paymentType,
        interestRate: interestRate || null,
        interestAmount,
        userId,
      },
      include: {
        installment: true,
      },
    });

    return NextResponse.json(billPayment, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error creating bill payment:", error);
    return NextResponse.json(
      { error: "Erro ao criar pagamento de fatura" },
      { status: 500 }
    );
  }
}
