/*
  Warnings:

  - The `plan` column on the `Subscription` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'START', 'BUSINESS', 'PRO');

-- AlterTable
ALTER TABLE "Subscription" DROP COLUMN "plan",
ADD COLUMN     "plan" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
