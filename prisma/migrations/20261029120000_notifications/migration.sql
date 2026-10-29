-- CreateEnum
CREATE TYPE "NotificationKind" AS ENUM ('WELCOME', 'ANNOUNCEMENT', 'LOW_STOCK', 'OUT_OF_STOCK', 'STOCK_SUMMARY', 'TRIAL_ENDING', 'RENEWAL_REMINDER', 'PAYMENT_CONFIRMED');
CREATE TYPE "NotificationPlanAudience" AS ENUM ('ALL', 'PAID', 'FREE');
CREATE TYPE "StockAlertLevel" AS ENUM ('LOW', 'OUT');

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "businessId" TEXT,
    "kind" "NotificationKind" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionLabel" TEXT,
    "actionUrl" TEXT,
    "imageUrl" TEXT,
    "campaignId" TEXT,
    "inventoryItemId" TEXT,
    "dedupeKey" TEXT,
    "deliverAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationCampaign" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionLabel" TEXT,
    "actionUrl" TEXT,
    "modes" "BusinessMode"[],
    "plan" "NotificationPlanAudience" NOT NULL DEFAULT 'ALL',
    "registeredWithinDays" INTEGER,
    "deliverAt" TIMESTAMP(3) NOT NULL,
    "canceledAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationCampaign_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationTemplate" (
    "key" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionLabel" TEXT,
    "actionUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "NotificationTemplate_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "InventoryStockAlert" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "level" "StockAlertLevel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryStockAlert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");
CREATE INDEX "Notification_userId_deliverAt_idx" ON "Notification"("userId", "deliverAt");
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");
CREATE INDEX "Notification_campaignId_idx" ON "Notification"("campaignId");
CREATE INDEX "Notification_businessId_idx" ON "Notification"("businessId");
CREATE INDEX "NotificationCampaign_deliverAt_idx" ON "NotificationCampaign"("deliverAt");
CREATE UNIQUE INDEX "InventoryStockAlert_inventoryItemId_level_key" ON "InventoryStockAlert"("inventoryItemId", "level");
CREATE INDEX "InventoryStockAlert_businessId_idx" ON "InventoryStockAlert"("businessId");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "NotificationCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationCampaign" ADD CONSTRAINT "NotificationCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryStockAlert" ADD CONSTRAINT "InventoryStockAlert_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryStockAlert" ADD CONSTRAINT "InventoryStockAlert_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Welcome text. Only users registered after this row was created receive it.
INSERT INTO "NotificationTemplate" ("key", "title", "body", "actionLabel", "actionUrl", "updatedAt") VALUES (
    'WELCOME',
    'მოგესალმებით მართეოზე! 👋',
    E'მადლობა, რომ მართეო აირჩიე. აქ ერთ სივრცეში მართავ შეკვეთებს, მარაგებს, მომხმარებლებს და ანალიტიკას.\n\nდაიწყე პირველი პროდუქტის ან შეკვეთის დამატებით. წარმატებებს გისურვებთ! 🚀',
    'დაწყება',
    '/dashboard',
    CURRENT_TIMESTAMP
);
