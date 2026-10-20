-- CreateTable
CREATE TABLE "PasswordChangeRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "sessionTokenHash" TEXT NOT NULL,
    "passwordFingerprint" TEXT NOT NULL,
    "newPasswordHash" TEXT,
    "logoutOtherSessions" BOOLEAN NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PasswordChangeRequest_userId_createdAt_idx" ON "PasswordChangeRequest"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordChangeRequest_userId_clientRequestId_key" ON "PasswordChangeRequest"("userId", "clientRequestId");

-- AddForeignKey
ALTER TABLE "PasswordChangeRequest" ADD CONSTRAINT "PasswordChangeRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
