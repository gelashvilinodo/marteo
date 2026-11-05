CREATE TYPE "BillingInterval" AS ENUM ('MONTHLY', 'YEARLY');

ALTER TABLE "Subscription" ADD COLUMN "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY';

ALTER TABLE "BankPayment" ADD COLUMN "interval" "BillingInterval" NOT NULL DEFAULT 'MONTHLY';
