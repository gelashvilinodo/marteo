CREATE TYPE "AiUsageKind" AS ENUM ('CHAT', 'PURCHASE_DRAFT', 'TITLE');

CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "businessName" TEXT NOT NULL,
    "userId" TEXT,
    "kind" "AiUsageKind" NOT NULL,
    "model" TEXT NOT NULL,
    "counted" BOOLEAN NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AiUsage_businessId_createdAt_idx" ON "AiUsage"("businessId", "createdAt");
CREATE INDEX "AiUsage_createdAt_idx" ON "AiUsage"("createdAt");

ALTER TABLE "AiUsage" ADD CONSTRAINT "AiUsage_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Business" ADD COLUMN "aiDisabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "aiMonthlyLimit" INTEGER;
