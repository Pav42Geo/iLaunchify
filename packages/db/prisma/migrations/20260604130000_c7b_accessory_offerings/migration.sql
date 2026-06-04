-- CreateEnum
CREATE TYPE "AccessoryCategory" AS ENUM ('SPOON', 'RIBBON', 'TAG', 'INSERT', 'CAP_COVER', 'TISSUE', 'WAX_SEAL', 'STICKER_PACK', 'OTHER');

-- CreateTable
CREATE TABLE "AccessoryOffering" (
    "id" STRING NOT NULL,
    "partnerServiceId" STRING NOT NULL,
    "name" STRING NOT NULL,
    "category" "AccessoryCategory" NOT NULL,
    "description" STRING NOT NULL,
    "imageFileKey" STRING NOT NULL,
    "applicablePartnerOfferingIds" STRING[],
    "pricingTiers" JSONB NOT NULL,
    "moq" INT4 NOT NULL DEFAULT 1,
    "leadTimeDays" INT4 NOT NULL,
    "isCustomizable" BOOL NOT NULL,
    "customizationFields" JSONB NOT NULL,
    "status" "OfferingStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessoryOffering_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductAccessory" (
    "productId" STRING NOT NULL,
    "accessoryOfferingId" STRING NOT NULL,
    "customizationValues" JSONB,
    "quantityPerProductUnit" INT4 NOT NULL DEFAULT 1,

    CONSTRAINT "ProductAccessory_pkey" PRIMARY KEY ("productId","accessoryOfferingId")
);

-- CreateIndex
CREATE INDEX "AccessoryOffering_partnerServiceId_idx" ON "AccessoryOffering"("partnerServiceId");

-- CreateIndex
CREATE INDEX "AccessoryOffering_status_idx" ON "AccessoryOffering"("status");

-- CreateIndex
CREATE INDEX "ProductAccessory_accessoryOfferingId_idx" ON "ProductAccessory"("accessoryOfferingId");

-- AddForeignKey
ALTER TABLE "ProductAccessory" ADD CONSTRAINT "ProductAccessory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductAccessory" ADD CONSTRAINT "ProductAccessory_accessoryOfferingId_fkey" FOREIGN KEY ("accessoryOfferingId") REFERENCES "AccessoryOffering"("id") ON DELETE CASCADE ON UPDATE CASCADE;
