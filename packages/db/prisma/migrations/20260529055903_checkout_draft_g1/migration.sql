/*
  Warnings:

  - A unique constraint covering the columns `[gtin]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "GtinSource" AS ENUM ('USER_PROVIDED', 'GS1_VALIDATED', 'PLATFORM_ASSIGNED');

-- CreateEnum
CREATE TYPE "BarcodeMode" AS ENUM ('NONE', 'RETAIL_UPC', 'INTERNAL_SKU');

-- CreateEnum
CREATE TYPE "FinishCategory" AS ENUM ('SURFACE', 'FOIL_METALLIC', 'EMBOSS_TEXTURE', 'CUT', 'INK', 'SPECIAL');

-- CreateEnum
CREATE TYPE "ApplicationMode" AS ENUM ('WHOLE_DESIGN', 'TEXT_ONLY', 'IMAGE_ONLY', 'TEXT_AND_IMAGES', 'OBJECT_SELECTION', 'REGION_MASK', 'COLOR_BASED', 'UPLOADED_MASK');

-- CreateEnum
CREATE TYPE "FinishPricingMode" AS ENUM ('FLAT_PER_ORDER', 'PER_UNIT', 'PER_AREA', 'PER_OBJECT', 'PER_COLOR', 'TIERED');

-- CreateEnum
CREATE TYPE "FinishStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DISCONTINUED');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "barcodeMode" "BarcodeMode" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Product" ADD COLUMN     "gtin" STRING;
ALTER TABLE "Product" ADD COLUMN     "gtinSource" "GtinSource" NOT NULL DEFAULT 'USER_PROVIDED';
ALTER TABLE "Product" ADD COLUMN     "internalSku" STRING;

-- CreateTable
CREATE TABLE "FinishType" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "category" "FinishCategory" NOT NULL,
    "description" STRING NOT NULL,
    "applicationModes" "ApplicationMode"[],
    "exampleAssetId" STRING,
    "defaultPrinterSpec" STRING,
    "status" "BrandLibraryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinishType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerFinish" (
    "id" STRING NOT NULL,
    "partnerServiceId" STRING NOT NULL,
    "finishTypeId" STRING NOT NULL,
    "name" STRING,
    "description" STRING,
    "pricingMode" "FinishPricingMode" NOT NULL,
    "basePriceCents" INT4 NOT NULL DEFAULT 0,
    "perUnitPriceCents" INT4 NOT NULL DEFAULT 0,
    "pricePerSqInCents" INT4,
    "pricePerObjectCents" INT4,
    "pricePerColorCents" INT4,
    "pricingTiers" JSONB,
    "leadTimeDays" INT4 NOT NULL DEFAULT 0,
    "moqMin" INT4 NOT NULL DEFAULT 0,
    "availableModes" "ApplicationMode"[],
    "compatibleSubstrates" STRING[],
    "maxCoveragePct" FLOAT8,
    "sampleAssetIds" STRING[],
    "status" "FinishStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerFinish_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignFinishApplication" (
    "id" STRING NOT NULL,
    "designVersionId" STRING NOT NULL,
    "partnerFinishId" STRING NOT NULL,
    "applicationMode" "ApplicationMode" NOT NULL,
    "objectRefs" STRING[],
    "colorFilters" STRING[],
    "regionPolygons" JSONB,
    "maskAssetId" STRING,
    "creatorNotes" STRING,
    "estimatedPerUnitCents" INT4 NOT NULL DEFAULT 0,
    "estimatedSetupCents" INT4 NOT NULL DEFAULT 0,
    "coverageSqIn" FLOAT8,
    "objectCount" INT4,
    "spotColorCount" INT4,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignFinishApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckoutDraft" (
    "id" STRING NOT NULL,
    "creatorUserId" STRING NOT NULL,
    "productId" STRING NOT NULL,
    "state" JSONB NOT NULL,
    "currentStep" INT4 NOT NULL DEFAULT 1,
    "completedSteps" INT4[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CheckoutDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FinishType_slug_key" ON "FinishType"("slug");

-- CreateIndex
CREATE INDEX "PartnerFinish_partnerServiceId_status_idx" ON "PartnerFinish"("partnerServiceId", "status");

-- CreateIndex
CREATE INDEX "PartnerFinish_finishTypeId_idx" ON "PartnerFinish"("finishTypeId");

-- CreateIndex
CREATE INDEX "DesignFinishApplication_designVersionId_idx" ON "DesignFinishApplication"("designVersionId");

-- CreateIndex
CREATE INDEX "CheckoutDraft_creatorUserId_updatedAt_idx" ON "CheckoutDraft"("creatorUserId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "CheckoutDraft_creatorUserId_productId_key" ON "CheckoutDraft"("creatorUserId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_gtin_key" ON "Product"("gtin");

-- AddForeignKey
ALTER TABLE "PartnerFinish" ADD CONSTRAINT "PartnerFinish_partnerServiceId_fkey" FOREIGN KEY ("partnerServiceId") REFERENCES "PartnerService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFinish" ADD CONSTRAINT "PartnerFinish_finishTypeId_fkey" FOREIGN KEY ("finishTypeId") REFERENCES "FinishType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignFinishApplication" ADD CONSTRAINT "DesignFinishApplication_designVersionId_fkey" FOREIGN KEY ("designVersionId") REFERENCES "DesignVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignFinishApplication" ADD CONSTRAINT "DesignFinishApplication_partnerFinishId_fkey" FOREIGN KEY ("partnerFinishId") REFERENCES "PartnerFinish"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutDraft" ADD CONSTRAINT "CheckoutDraft_creatorUserId_fkey" FOREIGN KEY ("creatorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckoutDraft" ADD CONSTRAINT "CheckoutDraft_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
