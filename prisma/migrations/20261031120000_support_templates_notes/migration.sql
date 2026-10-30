CREATE TABLE "SupportReplyTemplate" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupportReplyTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BusinessAdminNote" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "adminId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessAdminNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportReplyTemplate_sortOrder_idx" ON "SupportReplyTemplate"("sortOrder");
CREATE INDEX "BusinessAdminNote_businessId_createdAt_idx" ON "BusinessAdminNote"("businessId", "createdAt");

ALTER TABLE "BusinessAdminNote" ADD CONSTRAINT "BusinessAdminNote_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BusinessAdminNote" ADD CONSTRAINT "BusinessAdminNote_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Starter replies; the admin can edit or delete them on the templates page. {name} becomes the contact's first name.
INSERT INTO "SupportReplyTemplate" ("id", "title", "body", "sortOrder", "updatedAt") VALUES
    ('tpl_greeting', 'მისალმება', 'გამარჯობა, {name}! მადლობა, რომ მოგვწერე. ახლავე გადავხედავ და გიპასუხებ.', 1, CURRENT_TIMESTAMP),
    ('tpl_checking', 'ვამოწმებ', 'გასაგებია. ვამოწმებ და რამდენიმე წუთში მოგწერ.', 2, CURRENT_TIMESTAMP),
    ('tpl_details', 'დეტალების თხოვნა', 'დაზუსტება რომ შევძლო, მომწერე, გთხოვ: რომელ გვერდზე ხარ და რა ქმედების დროს ჩნდება პრობლემა?', 3, CURRENT_TIMESTAMP),
    ('tpl_fixed', 'მოგვარდა', 'პრობლემა მოგვარდა. გთხოვ, განაახლე გვერდი და სცადე ხელახლა. თუ ისევ შეგხვდება, აქვე მომწერე.', 4, CURRENT_TIMESTAMP),
    ('tpl_thanks', 'დამშვიდობება', 'მადლობა, {name}! თუ კიდევ რამე დაგჭირდება, ყოველთვის აქ ვართ.', 5, CURRENT_TIMESTAMP);
