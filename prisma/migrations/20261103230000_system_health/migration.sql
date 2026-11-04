CREATE TABLE "SystemError" (
    "id" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "route" TEXT,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "SystemError_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SystemError_fingerprint_key" ON "SystemError"("fingerprint");
CREATE INDEX "SystemError_resolvedAt_lastAt_idx" ON "SystemError"("resolvedAt", "lastAt");

CREATE TABLE "SystemJob" (
    "name" TEXT NOT NULL,
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lastOk" BOOLEAN,
    "lastError" TEXT,
    "lastResult" INTEGER,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "failures" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "SystemJob_pkey" PRIMARY KEY ("name")
);

CREATE TABLE "SystemBanner" (
    "id" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "tone" TEXT NOT NULL DEFAULT 'INFO',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SystemBanner_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SystemBanner_tone_check" CHECK ("tone" IN ('INFO', 'WARNING'))
);
CREATE INDEX "SystemBanner_startsAt_idx" ON "SystemBanner"("startsAt");
