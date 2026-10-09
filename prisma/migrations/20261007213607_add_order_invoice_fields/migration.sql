/*
  Warnings:

  - A unique constraint covering the columns `[publicAccessToken]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "invoicePrintedAt" TIMESTAMP(3),
ADD COLUMN     "invoiceVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "lastPrintedInvoiceVersion" INTEGER,
ADD COLUMN     "publicAccessToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Order_publicAccessToken_key" ON "Order"("publicAccessToken");
