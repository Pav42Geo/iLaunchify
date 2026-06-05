-- CreateEnum
CREATE TYPE "FulfillmentMode" AS ENUM ('BULK_PRODUCTION', 'ON_DEMAND', 'BOTH');

-- AlterTable
ALTER TABLE "FinishType" ADD COLUMN     "decorationMethod" "DecorationMethod";

-- CreateTable
CREATE TABLE "PartnerPackagingOffering" (
    "id" STRING NOT NULL,
    "partnerServiceId" STRING NOT NULL,
    "packagingTypeId" STRING NOT NULL,
    "decorationMethod" "DecorationMethod" NOT NULL,
    "dielineId" STRING,
    "moq" INT4 NOT NULL DEFAULT 1,
    "leadTimeDays" INT4 NOT NULL DEFAULT 14,
    "pricingTiers" JSONB NOT NULL DEFAULT '[]',
    "fulfillmentMode" "FulfillmentMode" NOT NULL DEFAULT 'BOTH',
    "status" "OfferingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerPackagingOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccentDecoration" (
    "id" STRING NOT NULL,
    "packagingComponentId" STRING NOT NULL,
    "decorationMethod" "DecorationMethod" NOT NULL,
    "surchargePerUnit" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "partnerFinishId" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccentDecoration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingDecorationCompatibility" (
    "containerCategory" "ContainerCategory" NOT NULL,
    "decorationMethod" "DecorationMethod" NOT NULL,
    "notes" STRING,
    "isActive" BOOL NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingDecorationCompatibility_pkey" PRIMARY KEY ("containerCategory","decorationMethod")
);

-- CreateIndex
CREATE INDEX "PartnerPackagingOffering_packagingTypeId_status_idx" ON "PartnerPackagingOffering"("packagingTypeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerPackagingOffering_partnerServiceId_packagingTypeId_d_key" ON "PartnerPackagingOffering"("partnerServiceId", "packagingTypeId", "decorationMethod");

-- CreateIndex
CREATE INDEX "AccentDecoration_packagingComponentId_idx" ON "AccentDecoration"("packagingComponentId");

-- AddForeignKey
ALTER TABLE "PartnerPackagingOffering" ADD CONSTRAINT "PartnerPackagingOffering_partnerServiceId_fkey" FOREIGN KEY ("partnerServiceId") REFERENCES "PartnerService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPackagingOffering" ADD CONSTRAINT "PartnerPackagingOffering_packagingTypeId_fkey" FOREIGN KEY ("packagingTypeId") REFERENCES "PackagingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccentDecoration" ADD CONSTRAINT "AccentDecoration_packagingComponentId_fkey" FOREIGN KEY ("packagingComponentId") REFERENCES "PackagingComponent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingComponent" ADD CONSTRAINT "PackagingComponent_partnerOfferingId_fkey" FOREIGN KEY ("partnerOfferingId") REFERENCES "PartnerPackagingOffering"("id") ON DELETE SET NULL ON UPDATE CASCADE;
