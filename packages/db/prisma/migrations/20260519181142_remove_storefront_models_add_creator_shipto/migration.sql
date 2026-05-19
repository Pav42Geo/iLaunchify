/*
  Warnings:

  - You are about to drop the column `consumerEmail` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `consumerUserId` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the `Cart` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `CartItem` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ConsumerUser` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `creatorUserId` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shipToAddressLine1` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shipToCity` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shipToContactName` to the `Order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `shipToPostalCode` to the `Order` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "OrderShipToType" AS ENUM ('CREATOR_ADDRESS', 'WAREHOUSE_PARTNER');

-- AlterEnum
ALTER TYPE "DispatchStatus" ADD VALUE 'QUALITY_CHECK';
ALTER TYPE "DispatchStatus" ADD VALUE 'FAILED_QC';

-- AlterEnum
ALTER TYPE "ServiceType" ADD VALUE 'WAREHOUSE';

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_brandId_fkey";

-- DropForeignKey
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_consumerUserId_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_cartId_fkey";

-- DropForeignKey
ALTER TABLE "CartItem" DROP CONSTRAINT "CartItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_consumerUserId_fkey";

-- DropIndex
DROP INDEX "Order_consumerEmail_idx";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "consumerEmail";
ALTER TABLE "Order" DROP COLUMN "consumerUserId";
ALTER TABLE "Order" ADD COLUMN     "creatorUserId" STRING NOT NULL;
ALTER TABLE "Order" ADD COLUMN     "shipToAddressLine1" STRING NOT NULL;
ALTER TABLE "Order" ADD COLUMN     "shipToAddressLine2" STRING;
ALTER TABLE "Order" ADD COLUMN     "shipToCity" STRING NOT NULL;
ALTER TABLE "Order" ADD COLUMN     "shipToContactName" STRING NOT NULL;
ALTER TABLE "Order" ADD COLUMN     "shipToContactPhone" STRING;
ALTER TABLE "Order" ADD COLUMN     "shipToCountry" STRING NOT NULL DEFAULT 'US';
ALTER TABLE "Order" ADD COLUMN     "shipToPartnerServiceId" STRING;
ALTER TABLE "Order" ADD COLUMN     "shipToPostalCode" STRING NOT NULL;
ALTER TABLE "Order" ADD COLUMN     "shipToState" STRING;
ALTER TABLE "Order" ADD COLUMN     "shipToType" "OrderShipToType" NOT NULL DEFAULT 'CREATOR_ADDRESS';

-- AlterTable
ALTER TABLE "OrderDispatch" ADD COLUMN     "acceptedAt" TIMESTAMP(3);
ALTER TABLE "OrderDispatch" ADD COLUMN     "inTransitAt" TIMESTAMP(3);
ALTER TABLE "OrderDispatch" ADD COLUMN     "productionStartedAt" TIMESTAMP(3);
ALTER TABLE "OrderDispatch" ADD COLUMN     "qualityCheckFailedAt" TIMESTAMP(3);
ALTER TABLE "OrderDispatch" ADD COLUMN     "qualityCheckFailureNotes" STRING;
ALTER TABLE "OrderDispatch" ADD COLUMN     "qualityCheckStartedAt" TIMESTAMP(3);
ALTER TABLE "OrderDispatch" ADD COLUMN     "readyAt" TIMESTAMP(3);

-- DropTable
DROP TABLE "Cart";

-- DropTable
DROP TABLE "CartItem";

-- DropTable
DROP TABLE "ConsumerUser";

-- DropEnum
DROP TYPE "CartStatus";

-- CreateIndex
CREATE INDEX "Order_creatorUserId_status_idx" ON "Order"("creatorUserId", "status");

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_shipToPartnerServiceId_fkey" FOREIGN KEY ("shipToPartnerServiceId") REFERENCES "PartnerService"("id") ON DELETE SET NULL ON UPDATE CASCADE;
