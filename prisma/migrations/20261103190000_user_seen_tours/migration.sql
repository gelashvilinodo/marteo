-- ნანახი გაცნობითი ტურები (მაგ. "orders"), რომ ტური ავტომატურად მხოლოდ ერთხელ ჩაირთოს.
ALTER TABLE "User" ADD COLUMN "seenTours" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
