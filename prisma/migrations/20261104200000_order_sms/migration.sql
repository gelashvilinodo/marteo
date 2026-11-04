ALTER TABLE "Business" ADD COLUMN "smsEnabled" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "smsBalance" INTEGER NOT NULL DEFAULT 0;

CREATE TYPE "SmsSource" AS ENUM ('PLAN', 'PACK');
CREATE TYPE "SmsStatus" AS ENUM ('SENDING', 'SENT', 'FAILED', 'DRY_RUN');

CREATE TABLE "SmsMessage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT,
    "fulfillmentCycle" INTEGER NOT NULL DEFAULT 0,
    "phone" TEXT NOT NULL,
    "source" "SmsSource" NOT NULL,
    "status" "SmsStatus" NOT NULL DEFAULT 'SENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SmsMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SmsMessage_orderId_fulfillmentCycle_key" ON "SmsMessage"("orderId", "fulfillmentCycle");
CREATE INDEX "SmsMessage_businessId_createdAt_idx" ON "SmsMessage"("businessId", "createdAt");
ALTER TABLE "SmsMessage" ADD CONSTRAINT "SmsMessage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "SmsPackPurchase" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsPackPurchase_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SmsPackPurchase_businessId_createdAt_idx" ON "SmsPackPurchase"("businessId", "createdAt");
ALTER TABLE "SmsPackPurchase" ADD CONSTRAINT "SmsPackPurchase_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
