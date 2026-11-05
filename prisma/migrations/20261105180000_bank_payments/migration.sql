CREATE TYPE "BankPaymentKind" AS ENUM ('CHECKOUT', 'RENEWAL');
CREATE TYPE "BankPaymentStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

ALTER TABLE "Subscription" ADD COLUMN "bankCardOrderId" TEXT,
ADD COLUMN "bankCardAmount" DECIMAL(12,2),
ADD COLUMN "bankCardMask" TEXT;

CREATE TABLE "BankPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "userId" TEXT,
    "kind" "BankPaymentKind" NOT NULL,
    "status" "BankPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "plan" "SubscriptionPlan" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "bonusDays" INTEGER NOT NULL DEFAULT 0,
    "bankOrderId" TEXT,
    "parentOrderId" TEXT,
    "bankStatus" TEXT,
    "cardMask" TEXT,
    "subscriptionPaymentId" TEXT,
    "renewsExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "BankPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankPayment_bankOrderId_key" ON "BankPayment"("bankOrderId");
CREATE UNIQUE INDEX "BankPayment_subscriptionPaymentId_key" ON "BankPayment"("subscriptionPaymentId");
CREATE INDEX "BankPayment_businessId_createdAt_idx" ON "BankPayment"("businessId", "createdAt");
CREATE INDEX "BankPayment_status_createdAt_idx" ON "BankPayment"("status", "createdAt");

ALTER TABLE "BankPayment" ADD CONSTRAINT "BankPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE SET NULL ON UPDATE CASCADE;
