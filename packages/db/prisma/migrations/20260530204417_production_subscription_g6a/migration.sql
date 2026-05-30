-- DropForeignKey
ALTER TABLE "ProductionSubscription" DROP CONSTRAINT "ProductionSubscription_brandId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionSubscription" DROP CONSTRAINT "ProductionSubscription_creatorUserId_fkey";

-- DropForeignKey
ALTER TABLE "ProductionSubscription" DROP CONSTRAINT "ProductionSubscription_productId_fkey";

-- AddForeignKey
ALTER TABLE "ProductionSubscription" ADD CONSTRAINT "ProductionSubscription_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionSubscription" ADD CONSTRAINT "ProductionSubscription_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductionSubscription" ADD CONSTRAINT "ProductionSubscription_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
