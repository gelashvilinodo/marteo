-- ინვოისის პარამეტრები ბიზნესის პარამეტრებიდან.
ALTER TABLE "Business"
    ADD COLUMN "invoicePaper" TEXT NOT NULL DEFAULT 'a4',
    ADD COLUMN "invoicePhoneMode" TEXT NOT NULL DEFAULT 'ACCOUNT',
    ADD COLUMN "invoicePhone" TEXT;

ALTER TABLE "Business"
    ADD CONSTRAINT "Business_invoicePaper_check" CHECK ("invoicePaper" IN ('a4', '80mm', '58mm', '100x150')),
    ADD CONSTRAINT "Business_invoicePhoneMode_check" CHECK ("invoicePhoneMode" IN ('ACCOUNT', 'CUSTOM', 'OFF'));

-- ვისაც ბიზნესის ტელეფონი უკვე აქვს, ინვოისზე იგივე ნომერი დარჩეს.
UPDATE "Business"
SET "invoicePhoneMode" = 'CUSTOM', "invoicePhone" = "phone"
WHERE "phone" IS NOT NULL AND btrim("phone") <> '';
