-- CreateTable
CREATE TABLE "PhoneChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "authorizationHash" TEXT NOT NULL,
    "passwordFingerprint" TEXT NOT NULL,
    "previousPhone" TEXT NOT NULL,
    "newPhone" TEXT,
    "codeHash" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastSentAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhoneChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhoneChangeRequest_authorizationHash_key" ON "PhoneChangeRequest"("authorizationHash");

-- CreateIndex
CREATE INDEX "PhoneChangeRequest_userId_createdAt_idx" ON "PhoneChangeRequest"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "PhoneChangeRequest_expiresAt_idx" ON "PhoneChangeRequest"("expiresAt");

-- AddForeignKey
ALTER TABLE "PhoneChangeRequest" ADD CONSTRAINT "PhoneChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
