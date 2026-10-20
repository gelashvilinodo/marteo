BEGIN;

CREATE TABLE "ImportPhoto" (
    "id" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,

    "sheetName" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "columnNumber" INTEGER NOT NULL,

    "sourcePath" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,

    "sha256" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,

    "storagePath" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportPhoto_pkey" PRIMARY KEY ("id"),

    CONSTRAINT "ImportPhoto_rowNumber_check"
        CHECK ("rowNumber" > 0),

    CONSTRAINT "ImportPhoto_columnNumber_check"
        CHECK ("columnNumber" > 0),

    CONSTRAINT "ImportPhoto_byteSize_check"
        CHECK ("byteSize" > 0),

    CONSTRAINT "ImportPhoto_fileId_fkey"
        FOREIGN KEY ("fileId")
        REFERENCES "ImportFile"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ImportPhoto_storagePath_key"
    ON "ImportPhoto"("storagePath");

CREATE UNIQUE INDEX "ImportPhoto_fileId_sourceKey_key"
    ON "ImportPhoto"("fileId", "sourceKey");

CREATE INDEX "ImportPhoto_fileId_sheetName_rowNumber_idx"
    ON "ImportPhoto"("fileId", "sheetName", "rowNumber");

COMMIT;