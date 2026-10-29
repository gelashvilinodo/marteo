ALTER TABLE "User" ADD COLUMN "isPlatformAdmin" BOOLEAN NOT NULL DEFAULT false;
-- A platform has at most one owner. Business roles remain independent.
CREATE UNIQUE INDEX "User_single_platform_admin" ON "User" ("isPlatformAdmin") WHERE "isPlatformAdmin" = true;
