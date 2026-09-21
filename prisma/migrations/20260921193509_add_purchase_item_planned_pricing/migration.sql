-- AlterTable
ALTER TABLE "PurchaseItem" ADD COLUMN     "plannedPricingMethod" "PricingMethod",
ADD COLUMN     "plannedPricingValue" DECIMAL(12,2);
