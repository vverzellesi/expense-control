import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAuthenticatedUserId, unauthorizedResponse } from "@/lib/auth-utils";
import { BillPaymentType } from "@/types";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId();
    const { id } = await params;

    const billPayment = await prisma.billPayment.findFirst({
      where: { id, userId },
      include: {
        installment: true,
      },
    });

    if (!billPayment) {
      return NextResponse.json(
        { error: "Pagamento de fatura nao encontrado" },
        { status: 404 }
      );
    }

    return NextResponse.json(billPayment);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error fetching bill payment:", error);
    return NextResponse.json(
      { error: "Erro ao buscar pagamento de fatura" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId();
    const { id } = await params;
    const body = await request.json();
    const {
      interestRate,
      amountPaid,
      paymentType,
      installments,
    } = body;

    // Verify bill payment belongs to user before updating
    const existingBillPayment = await prisma.billPayment.findFirst({
      where: { id, userId },
    });

    if (!existingBillPayment) {
      return NextResponse.json(
        { error: "Pagamento de fatura nao encontrado" },
        { status: 404 }
      );
    }

    // Build update data based on provided fields
    const updateData: Record<string, unknown> = {};

    // Update interestRate if provided
    if (interestRate !== undefined) {
      updateData.interestRate = interestRate;
      // Recalculate interest amount based on new rate
      updateData.interestAmount = interestRate
        ? (existingBillPayment.amountCarried * interestRate) / 100
        : null;
    }

    // Update amountPaid if provided (will recalculate amountCarried)
    if (amountPaid !== undefined) {
      // Validate amountPaid is less than totalBillAmount
      if (amountPaid >= existingBillPayment.totalBillAmount) {
        return NextResponse.json(
          { error: "amountPaid deve ser menor que totalBillAmount para pagamento parcial" },
          { status: 400 }
        );
      }

      updateData.amountPaid = amountPaid;
      updateData.amountCarried = existingBillPayment.totalBillAmount - amountPaid;

      // Recalculate interest amount if there's an interest rate
      const currentInterestRate = interestRate !== undefined
        ? interestRate
        : existingBillPayment.interestRate;
      if (currentInterestRate) {
        updateData.interestAmount = ((updateData.amountCarried as number) * currentInterestRate) / 100;
      }
    }

    // Update paymentType if provided
    if (paymentType !== undefined) {
      const validPaymentTypes: BillPaymentType[] = ["PARTIAL", "FINANCED"];
      if (!validPaymentTypes.includes(paymentType)) {
        return NextResponse.json(
          { error: "paymentType deve ser 'PARTIAL' ou 'FINANCED'" },
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

      updateData.paymentType = paymentType;
    }

    // If no fields to update, return error
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "Nenhum campo valido para atualizar" },
        { status: 400 }
      );
    }

    const billPayment = await prisma.billPayment.update({
      where: { id },
      data: updateData,
      include: {
        installment: true,
      },
    });

    return NextResponse.json(billPayment);
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error updating bill payment:", error);
    return NextResponse.json(
      { error: "Erro ao atualizar pagamento de fatura" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthenticatedUserId();
    const { id } = await params;

    // Verify bill payment belongs to user before deleting
    const existingBillPayment = await prisma.billPayment.findFirst({
      where: { id, userId },
      include: {
        installment: {
          include: {
            transactions: true,
          },
        },
      },
    });

    if (!existingBillPayment) {
      return NextResponse.json(
        { error: "Pagamento de fatura nao encontrado" },
        { status: 404 }
      );
    }

    // Use transaction for atomic cleanup
    await prisma.$transaction(async (tx) => {
      // Cleanup generated transactions (soft delete)
      // Entry transaction
      if (existingBillPayment.entryTransactionId) {
        await tx.transaction.update({
          where: { id: existingBillPayment.entryTransactionId },
          data: { deletedAt: new Date() },
        });
      }

      // Carryover transaction
      if (existingBillPayment.carryoverTransactionId) {
        await tx.transaction.update({
          where: { id: existingBillPayment.carryoverTransactionId },
          data: { deletedAt: new Date() },
        });
      }

      // If there's an installment, soft delete related transactions
      if (existingBillPayment.installment) {
        for (const transaction of existingBillPayment.installment.transactions) {
          await tx.transaction.update({
            where: { id: transaction.id },
            data: { deletedAt: new Date() },
          });
        }

        // Delete the installment record
        await tx.installment.delete({
          where: { id: existingBillPayment.installment.id },
        });
      }

      // Delete the bill payment
      await tx.billPayment.delete({
        where: { id },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return unauthorizedResponse();
    }
    console.error("Error deleting bill payment:", error);
    return NextResponse.json(
      { error: "Erro ao excluir pagamento de fatura" },
      { status: 500 }
    );
  }
}
