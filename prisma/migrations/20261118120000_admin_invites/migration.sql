-- რამდენიმე ადმინი: ერთი ადმინის შეზღუდვა იხსნება, ახალი ადმინი მხოლოდ ელფოსტით მოწვევით ემატება.
DROP INDEX IF EXISTS "User_single_platform_admin";

CREATE TABLE "AdminInvite" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "invitedById" TEXT,
    "acceptedById" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdminInvite_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminInvite_tokenHash_key" ON "AdminInvite"("tokenHash");
CREATE INDEX "AdminInvite_status_expiresAt_idx" ON "AdminInvite"("status", "expiresAt");
CREATE INDEX "AdminInvite_email_idx" ON "AdminInvite"("email");
CREATE INDEX "AdminInvite_acceptedById_idx" ON "AdminInvite"("acceptedById");

ALTER TABLE "AdminInvite" ADD CONSTRAINT "AdminInvite_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AdminInvite" ADD CONSTRAINT "AdminInvite_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
