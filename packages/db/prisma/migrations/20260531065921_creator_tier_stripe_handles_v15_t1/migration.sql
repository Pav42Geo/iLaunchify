/*
  Warnings:

  - A unique constraint covering the columns `[stripeTierSubscriptionId]` on the table `CreatorProfile` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "CreatorProfile" ADD COLUMN     "stripeTierSubscriptionId" STRING;
ALTER TABLE "CreatorProfile" ADD COLUMN     "tierCancelAtPeriodEnd" BOOL NOT NULL DEFAULT false;
ALTER TABLE "CreatorProfile" ADD COLUMN     "tierCurrentPeriodEnd" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_stripeTierSubscriptionId_key" ON "CreatorProfile"("stripeTierSubscriptionId");
