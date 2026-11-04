-- წარმოებული პროდუქტის ფასის წესი (ხელით, ფიქსირებული მოგება, ფასნამატი, მარჟა), როგორც იმპორტის შესყიდვებში.
-- ძველ ჩანაწერებზე null რჩება: ფორმა ახალ პროდუქტზე ხელით ფასს აჩვენებს, არსებულზე კი ფასს არ ცვლის.
ALTER TABLE "ProductionOutput" ADD COLUMN "pricingMethod" "PricingMethod",
ADD COLUMN "pricingValue" DECIMAL(12,2);
