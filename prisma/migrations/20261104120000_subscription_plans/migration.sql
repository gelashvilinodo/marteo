ALTER TABLE "Subscription" ADD COLUMN "currentPeriodStart" TIMESTAMP(3),
    ADD COLUMN "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "User" ADD COLUMN "trialUsedAt" TIMESTAMP(3);

ALTER TABLE "Order" ADD COLUMN "imported" BOOLEAN NOT NULL DEFAULT false;

-- ვინც ბიზნესს ფლობს, საცდელი უკვე აქვს ნახმარი ან ძველ წესით დაიწყო.
UPDATE "User" u SET "trialUsedAt" = u."createdAt"
WHERE EXISTS (SELECT 1 FROM "BusinessMembership" m WHERE m."userId" = u.id AND m.role = 'OWNER');

-- მიმდინარე ფასიანი გეგმის პერიოდი იწყება გეგმის დაწყებიდან.
UPDATE "Subscription" SET "currentPeriodStart" = "startedAt" WHERE plan <> 'FREE';
