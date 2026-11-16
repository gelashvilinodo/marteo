-- წარმოების გვიან დამატებული ხარჯის გაყიდული ნაწილი ცალკე ხარჯად იწერება და წარმოებას უკავშირდება.
ALTER TABLE "Expense" ADD COLUMN "productionId" TEXT;
CREATE INDEX "Expense_productionId_idx" ON "Expense"("productionId");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "Production"("id") ON DELETE SET NULL ON UPDATE CASCADE;
