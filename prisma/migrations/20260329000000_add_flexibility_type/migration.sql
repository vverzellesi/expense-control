-- CreateEnum
CREATE TYPE "FlexibilityType" AS ENUM ('ESSENTIAL', 'NEGOTIABLE', 'VARIABLE');

-- AlterTable
ALTER TABLE "Category" ADD COLUMN "flexibilityType" "FlexibilityType";
