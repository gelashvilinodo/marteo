-- ელფოსტის გაგზავნის ჟურნალი (შიგთავსის გარეშე).
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "providerId" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailLog_recipient_createdAt_idx" ON "EmailLog"("recipient", "createdAt");
CREATE INDEX "EmailLog_createdAt_idx" ON "EmailLog"("createdAt");
