-- Integração Pluggy (Open Finance): migração aditiva.
-- Só adiciona uma coluna anulável em "Transaction" e tabelas novas; nenhuma coluna existente muda.

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "categorySource" TEXT;

-- CreateTable
CREATE TABLE "PluggyAccountLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "pluggyAccountId" TEXT NOT NULL,
    "accountType" TEXT NOT NULL,
    "originId" TEXT NOT NULL,
    "syncFrom" TIMESTAMP(3) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastSuccessfulSyncAt" TIMESTAMP(3),
    "replacesAccountLinkId" TEXT,
    "cutoffBillDueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluggyAccountLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluggyTransactionLink" (
    "id" TEXT NOT NULL,
    "accountLinkId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "providerId" TEXT,
    "transactionId" TEXT,
    "disposition" TEXT NOT NULL,
    "reasonCode" TEXT,
    "sourceStatus" TEXT NOT NULL,
    "sourceDate" TIMESTAMP(3) NOT NULL,
    "ledgerDate" TIMESTAMP(3) NOT NULL,
    "purchaseDate" TIMESTAMP(3),
    "sourceAmountCents" INTEGER NOT NULL,
    "currencyCode" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "sourceDescription" TEXT NOT NULL,
    "billId" TEXT,
    "creditKind" TEXT,
    "installmentNumber" INTEGER,
    "totalInstallments" INTEGER,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "systemDeletedAt" TIMESTAMP(3),

    CONSTRAINT "PluggyTransactionLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluggySyncRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "counts" JSONB,
    "checks" JSONB,
    "error" TEXT,

    CONSTRAINT "PluggySyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PluggySyncLease" (
    "userId" TEXT NOT NULL,
    "ownerToken" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PluggySyncLease_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE UNIQUE INDEX "PluggyAccountLink_pluggyAccountId_key" ON "PluggyAccountLink"("pluggyAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "PluggyAccountLink_replacesAccountLinkId_key" ON "PluggyAccountLink"("replacesAccountLinkId");

-- CreateIndex
CREATE INDEX "PluggyAccountLink_userId_idx" ON "PluggyAccountLink"("userId");

-- CreateIndex
CREATE INDEX "PluggyTransactionLink_accountLinkId_providerId_idx" ON "PluggyTransactionLink"("accountLinkId", "providerId");

-- CreateIndex
CREATE INDEX "PluggyTransactionLink_transactionId_idx" ON "PluggyTransactionLink"("transactionId");

-- CreateIndex
CREATE INDEX "PluggyTransactionLink_accountLinkId_disposition_idx" ON "PluggyTransactionLink"("accountLinkId", "disposition");

-- CreateIndex
CREATE UNIQUE INDEX "PluggyTransactionLink_accountLinkId_externalId_key" ON "PluggyTransactionLink"("accountLinkId", "externalId");

-- CreateIndex
CREATE INDEX "PluggySyncRun_userId_startedAt_idx" ON "PluggySyncRun"("userId", "startedAt");

-- AddForeignKey
ALTER TABLE "PluggyAccountLink" ADD CONSTRAINT "PluggyAccountLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluggyAccountLink" ADD CONSTRAINT "PluggyAccountLink_originId_fkey" FOREIGN KEY ("originId") REFERENCES "Origin"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluggyAccountLink" ADD CONSTRAINT "PluggyAccountLink_replacesAccountLinkId_fkey" FOREIGN KEY ("replacesAccountLinkId") REFERENCES "PluggyAccountLink"("id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluggyTransactionLink" ADD CONSTRAINT "PluggyTransactionLink_accountLinkId_fkey" FOREIGN KEY ("accountLinkId") REFERENCES "PluggyAccountLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluggyTransactionLink" ADD CONSTRAINT "PluggyTransactionLink_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluggySyncRun" ADD CONSTRAINT "PluggySyncRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PluggySyncLease" ADD CONSTRAINT "PluggySyncLease_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

