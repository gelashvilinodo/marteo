-- საკურიეროს გასწორების შეხსენება წაიშალა; მისი ცხრილი და სვეტი აღარ გამოიყენება.
DROP TABLE "CourierSettlement";

ALTER TABLE "Business"
DROP COLUMN "courierReminderStartDate";
