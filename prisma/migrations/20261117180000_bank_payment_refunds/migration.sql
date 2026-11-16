-- ადმინის მიერ ბანკის გადახდის თანხის დაბრუნება.
ALTER TABLE "BankPayment" ADD COLUMN IF NOT EXISTS "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "BankPayment" ADD COLUMN IF NOT EXISTS "refundedAt" TIMESTAMP(3);
