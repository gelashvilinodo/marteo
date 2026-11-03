CREATE TYPE "DeliveryZone" AS ENUM ('TBILISI', 'REGION');

ALTER TABLE "Order" ADD COLUMN "deliveryZone" "DeliveryZone";
