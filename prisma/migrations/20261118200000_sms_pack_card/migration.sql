-- SMS პაკეტის ყიდვა ბარათით.
ALTER TYPE "BankPaymentKind" ADD VALUE 'SMS_PACK';
ALTER TABLE "BankPayment" ADD COLUMN "smsCount" INTEGER;
