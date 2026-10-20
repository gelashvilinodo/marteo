ALTER TABLE "Business"
ADD COLUMN "courierReminderStartDate" DATE;

CREATE TABLE "CourierSettlement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CourierSettlement_pkey"
        PRIMARY KEY ("id"),

    CONSTRAINT "CourierSettlement_nonzero_amount"
        CHECK ("amount" <> 0),

    CONSTRAINT "CourierSettlement_businessId_fkey"
        FOREIGN KEY ("businessId")
        REFERENCES "Business"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE UNIQUE INDEX
"CourierSettlement_businessId_clientRequestId_key"
ON "CourierSettlement"("businessId", "clientRequestId");

CREATE INDEX
"CourierSettlement_businessId_createdAt_idx"
ON "CourierSettlement"("businessId", "createdAt");