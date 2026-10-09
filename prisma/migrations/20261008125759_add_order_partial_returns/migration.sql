-- CreateEnum
CREATE TYPE "OrderReturnStatus" AS ENUM ('PENDING', 'RECEIVED', 'CANCELED');

-- CreateEnum
CREATE TYPE "OrderReturnReason" AS ENUM ('DEFECT', 'EXCHANGE', 'OTHER');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "deleteRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OrderItemAllocation" ADD COLUMN     "returnedQuantity" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "OrderReturn" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "status" "OrderReturnStatus" NOT NULL DEFAULT 'PENDING',
    "receivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderReturnItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" "OrderReturnReason" NOT NULL,
    "condition" "InventoryCondition" NOT NULL,
    "note" TEXT,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT,
    "color" TEXT,
    "size" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderReturn_orderId_status_idx" ON "OrderReturn"("orderId", "status");

-- CreateIndex
CREATE INDEX "OrderReturnItem_returnId_idx" ON "OrderReturnItem"("returnId");

-- CreateIndex
CREATE INDEX "OrderReturnItem_orderItemId_idx" ON "OrderReturnItem"("orderItemId");

-- AddForeignKey
ALTER TABLE "OrderReturn" ADD CONSTRAINT "OrderReturn_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderReturnItem" ADD CONSTRAINT "OrderReturnItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "OrderReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
