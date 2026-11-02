CREATE TYPE "BusinessPermission" AS ENUM ('ORDERS', 'INVENTORY', 'PURCHASES', 'PRODUCTION', 'CONTENT', 'FINANCE');
CREATE TYPE "MembershipStatus" AS ENUM ('ACTIVE', 'FROZEN');
CREATE TYPE "BusinessInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELED');

ALTER TABLE "BusinessMembership"
    ADD COLUMN "permissions" "BusinessPermission"[] NOT NULL DEFAULT ARRAY[]::"BusinessPermission"[],
    ADD COLUMN "readOnly" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "status" "MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "invitedById" TEXT;

ALTER TABLE "Order" ADD COLUMN "createdById" TEXT;

CREATE TABLE "BusinessInvite" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "MembershipRole" NOT NULL,
    "permissions" "BusinessPermission"[] NOT NULL DEFAULT ARRAY[]::"BusinessPermission"[],
    "readOnly" BOOLEAN NOT NULL DEFAULT false,
    "status" "BusinessInviteStatus" NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sendCount" INTEGER NOT NULL DEFAULT 1,
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invitedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BusinessInvite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "BusinessInvite_role_check" CHECK ("role" IN ('OWNER', 'MEMBER')),
    CONSTRAINT "BusinessInvite_email_check" CHECK ("email" = lower("email"))
);

CREATE UNIQUE INDEX "BusinessInvite_tokenHash_key" ON "BusinessInvite"("tokenHash");
CREATE INDEX "BusinessInvite_businessId_status_idx" ON "BusinessInvite"("businessId", "status");
CREATE INDEX "BusinessInvite_email_idx" ON "BusinessInvite"("email");
-- ერთ მეილზე ერთ ბიზნესში ერთდროულად მხოლოდ ერთი აქტიური მოწვევა.
CREATE UNIQUE INDEX "BusinessInvite_pending_email_key" ON "BusinessInvite"("businessId", "email") WHERE "status" = 'PENDING';

ALTER TABLE "BusinessMembership" ADD CONSTRAINT "BusinessMembership_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BusinessInvite" ADD CONSTRAINT "BusinessInvite_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessInvite" ADD CONSTRAINT "BusinessInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
