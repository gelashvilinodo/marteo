BEGIN;

CREATE TYPE "ImportJobStatus" AS ENUM (
    'DRAFT', 'REVIEW', 'READY', 'RUNNING',
    'PARTIAL', 'COMPLETED', 'FAILED', 'CANCELED'
);

CREATE TYPE "ImportRecordType" AS ENUM (
    'CUSTOMER', 'PRODUCT', 'INVENTORY', 'PURCHASE',
    'ORDER', 'PAYMENT', 'RETURN',
    'FINANCIAL_SUMMARY', 'UNCLASSIFIED'
);

CREATE TYPE "ImportRecordStatus" AS ENUM (
    'PENDING', 'NEEDS_REVIEW', 'INVALID',
    'READY', 'SKIPPED', 'IMPORTED', 'FAILED'
);

CREATE TABLE "ImportJob" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,

    "status" "ImportJobStatus" NOT NULL DEFAULT 'DRAFT',
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "confirmedRevision" INTEGER,

    "settings" JSONB,
    "previewSummary" JSONB,
    "resultSummary" JSONB,

    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportFile" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,

    "originalName" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storagePath" TEXT,

    "structure" JSONB,
    "mapping" JSONB,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportFile_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImportRecord" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "recordKey" TEXT NOT NULL,

    "type" "ImportRecordType" NOT NULL DEFAULT 'UNCLASSIFIED',
    "status" "ImportRecordStatus" NOT NULL DEFAULT 'PENDING',

    "provenance" JSONB NOT NULL,
    "rawData" JSONB NOT NULL,
    "normalizedData" JSONB,
    "proposedLinks" JSONB,
    "issues" JSONB,
    "result" JSONB,

    "revision" INTEGER NOT NULL DEFAULT 1,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRecord_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImportJob_businessId_status_createdAt_idx"
ON "ImportJob" ("businessId", "status", "createdAt");

CREATE INDEX "ImportJob_expiresAt_idx"
ON "ImportJob" ("expiresAt");

CREATE UNIQUE INDEX "ImportJob_businessId_clientRequestId_key"
ON "ImportJob" ("businessId", "clientRequestId");

CREATE INDEX "ImportFile_jobId_idx"
ON "ImportFile" ("jobId");

CREATE UNIQUE INDEX "ImportFile_jobId_sha256_key"
ON "ImportFile" ("jobId", "sha256");

CREATE INDEX "ImportRecord_jobId_status_type_idx"
ON "ImportRecord" ("jobId", "status", "type");

CREATE UNIQUE INDEX "ImportRecord_jobId_recordKey_key"
ON "ImportRecord" ("jobId", "recordKey");

ALTER TABLE "ImportJob"
ADD CONSTRAINT "ImportJob_businessId_fkey"
FOREIGN KEY ("businessId") REFERENCES "Business" ("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportFile"
ADD CONSTRAINT "ImportFile_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ImportJob" ("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImportRecord"
ADD CONSTRAINT "ImportRecord_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "ImportJob" ("id")
ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;