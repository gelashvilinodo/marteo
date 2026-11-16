-- 7+ დღის დაუსრულებელი შეკვეთის პუში ერთხელ: გაგზავნის დრო.
ALTER TABLE "Order" ADD COLUMN "staleNotifiedAt" TIMESTAMP(3);
