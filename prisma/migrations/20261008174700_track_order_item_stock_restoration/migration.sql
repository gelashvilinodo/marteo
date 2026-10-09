-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "isCarriedOver" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stockRestoredAt" TIMESTAMP(3);
