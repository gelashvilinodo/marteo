-- წაშლილი ანგარიშების ჰეშები: ხელახალ რეგისტრაციას ახალი საცდელი პერიოდი არ ეძლევა.
CREATE TABLE "DeletedAccount" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT NOT NULL,
    "phoneHash" TEXT,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DeletedAccount_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "DeletedAccount_emailHash_idx" ON "DeletedAccount"("emailHash");
CREATE INDEX "DeletedAccount_phoneHash_idx" ON "DeletedAccount"("phoneHash");
CREATE INDEX "DeletedAccount_deletedAt_idx" ON "DeletedAccount"("deletedAt");
