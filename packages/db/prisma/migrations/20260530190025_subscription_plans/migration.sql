-- DropForeignKey
ALTER TABLE "FeeRule" DROP CONSTRAINT "FeeRule_planId_fkey";

-- DropForeignKey
ALTER TABLE "PlanFeature" DROP CONSTRAINT "PlanFeature_planId_fkey";

-- AddForeignKey
ALTER TABLE "PlanFeature" ADD CONSTRAINT "PlanFeature_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeRule" ADD CONSTRAINT "FeeRule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "SubscriptionPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;
