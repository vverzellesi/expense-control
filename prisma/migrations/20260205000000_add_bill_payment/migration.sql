-- CreateTable
CREATE TABLE "BillPayment" (
    "id" TEXT NOT NULL,
    "billMonth" INTEGER NOT NULL,
    "billYear" INTEGER NOT NULL,
    "origin" TEXT NOT NULL,
    "totalBillAmount" DOUBLE PRECISION NOT NULL,
    "amountPaid" DOUBLE PRECISION NOT NULL,
    "amountCarried" DOUBLE PRECISION NOT NULL,
    "paymentType" TEXT NOT NULL,
    "installmentId" TEXT,
    "interestRate" DOUBLE PRECISION,
    "interestAmount" DOUBLE PRECISION,
    "entryTransactionId" TEXT,
    "carryoverTransactionId" TEXT,
    "linkedTransactionId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BillPayment_installmentId_key" ON "BillPayment"("installmentId");

-- CreateIndex
CREATE INDEX "BillPayment_userId_idx" ON "BillPayment"("userId");

-- CreateIndex
CREATE INDEX "BillPayment_billMonth_billYear_origin_idx" ON "BillPayment"("billMonth", "billYear", "origin");

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_installmentId_fkey" FOREIGN KEY ("installmentId") REFERENCES "Installment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillPayment" ADD CONSTRAINT "BillPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
