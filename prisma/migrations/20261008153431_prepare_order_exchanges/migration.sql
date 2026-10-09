-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fulfillmentCycle" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "fulfillmentCycle" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "OrderReturn" ADD COLUMN     "fulfillmentCycle" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OrderExchange" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "previousCycle" INTEGER NOT NULL,
    "nextCycle" INTEGER NOT NULL,
    "previousSnapshot" JSONB NOT NULL,
    "previousTotal" DECIMAL(12,2) NOT NULL,
    "newTotal" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderExchange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderExchange_orderId_createdAt_idx" ON "OrderExchange"("orderId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderExchange_orderId_nextCycle_key" ON "OrderExchange"("orderId", "nextCycle");

-- AddForeignKey
ALTER TABLE "OrderExchange" ADD CONSTRAINT "OrderExchange_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
