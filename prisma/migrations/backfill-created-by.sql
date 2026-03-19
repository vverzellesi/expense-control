-- Backfill createdByUserId with userId for existing transactions
-- This ensures all existing transactions have a creator set
UPDATE "Transaction" SET "createdByUserId" = "userId" WHERE "createdByUserId" IS NULL;
