CREATE TYPE "BusinessConsentKind" AS ENUM ('REMOVE_MEMBER', 'DELETE_BUSINESS');
CREATE TYPE "BusinessConsentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELED');

CREATE TABLE "BusinessConsentRequest" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "BusinessConsentKind" NOT NULL,
    "status" "BusinessConsentStatus" NOT NULL DEFAULT 'PENDING',
    "targetUserId" TEXT,
    "targetName" TEXT,
    "requestedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessConsentRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessConsentVote" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "approve" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessConsentVote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BusinessConsentRequest_businessId_status_idx" ON "BusinessConsentRequest"("businessId", "status");
CREATE UNIQUE INDEX "BusinessConsentVote_requestId_userId_key" ON "BusinessConsentVote"("requestId", "userId");
-- ერთსა და იმავე საკითხზე ერთდროულად მხოლოდ ერთი ღია მოთხოვნა.
CREATE UNIQUE INDEX "BusinessConsentRequest_pending_key" ON "BusinessConsentRequest"("businessId", "kind", COALESCE("targetUserId", '')) WHERE "status" = 'PENDING';

ALTER TABLE "BusinessConsentRequest" ADD CONSTRAINT "BusinessConsentRequest_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessConsentRequest" ADD CONSTRAINT "BusinessConsentRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessConsentVote" ADD CONSTRAINT "BusinessConsentVote_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "BusinessConsentRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessConsentVote" ADD CONSTRAINT "BusinessConsentVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
