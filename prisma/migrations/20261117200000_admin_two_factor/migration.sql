-- ადმინის ორეტაპიანი შესვლა: კოდის აპი, სარეზერვო კოდები და სანდო მოწყობილობები.
CREATE TABLE "AdminSecurity" (
    "userId" TEXT NOT NULL,
    "pendingSecret" TEXT,
    "totpSecret" TEXT,
    "totpEnabledAt" TIMESTAMP(3),
    "lastTotpStep" INTEGER NOT NULL DEFAULT 0,
    "backupCodes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminSecurity_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "AdminTrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "AdminTrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminTrustedDevice_tokenHash_key" ON "AdminTrustedDevice"("tokenHash");
CREATE INDEX "AdminTrustedDevice_userId_expiresAt_idx" ON "AdminTrustedDevice"("userId", "expiresAt");

ALTER TABLE "AdminSecurity" ADD CONSTRAINT "AdminSecurity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminTrustedDevice" ADD CONSTRAINT "AdminTrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
