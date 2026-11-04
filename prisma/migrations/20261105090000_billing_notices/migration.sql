ALTER TYPE "NotificationKind" ADD VALUE 'PAYMENT_FAILED';
ALTER TYPE "NotificationKind" ADD VALUE 'PLAN_CHANGED';
ALTER TYPE "NotificationKind" ADD VALUE 'LIMIT_WARNING';
ALTER TYPE "NotificationKind" ADD VALUE 'SMS_LOW';

ALTER TABLE "Notification" ADD COLUMN "channelsSentAt" TIMESTAMP(3);

-- უკვე შექმნილ შეტყობინებებზე მეილი და პუში აღარ უნდა გაიგზავნოს.
UPDATE "Notification" SET "channelsSentAt" = "createdAt";
