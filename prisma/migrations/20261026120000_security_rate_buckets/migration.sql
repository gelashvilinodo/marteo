CREATE TABLE "SecurityRateBucket" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SecurityRateBucket_pkey" PRIMARY KEY ("key")
);
CREATE INDEX "SecurityRateBucket_expiresAt_idx" ON "SecurityRateBucket"("expiresAt");
