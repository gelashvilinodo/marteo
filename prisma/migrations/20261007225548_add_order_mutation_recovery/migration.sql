-- CreateTable
CREATE TABLE "OrderMutation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderMutation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "OrderMutation_orderId_idx" ON "OrderMutation"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "OrderMutation_orderId_requestId_key" ON "OrderMutation"("orderId", "requestId");

-- AddForeignKey
ALTER TABLE "OrderMutation" ADD CONSTRAINT "OrderMutation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
