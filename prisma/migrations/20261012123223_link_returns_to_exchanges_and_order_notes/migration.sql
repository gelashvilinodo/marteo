-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "OrderReturn" ADD COLUMN     "exchangeId" TEXT;

-- CreateIndex
CREATE INDEX "OrderReturn_exchangeId_idx" ON "OrderReturn"("exchangeId");

-- AddForeignKey
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "OrderExchange"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
