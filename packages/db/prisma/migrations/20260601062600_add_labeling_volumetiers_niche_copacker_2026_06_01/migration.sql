-- V1 product-plan additions 2026-06-01 (per Pavel's locked spec gaps).
--   1. LabelingType enum + ProductTemplate.labelingType (default FOOD)
--   2. ProductTemplatePricingTier model (volume-tier pricing)
--   3. Niche + ProductTemplateNiche models (audience taxonomy)
--   4. ProductTemplatePackaging.coPackerServiceId FK → PartnerService.id
--
-- All additive — no existing fields touched.

-- CreateEnum
CREATE TYPE "LabelingType" AS ENUM ('FOOD', 'DIETARY_SUPPLEMENT', 'PET_PRODUCT', 'OTC', 'COSMETIC');

-- AlterTable
ALTER TABLE "ProductTemplate" ADD COLUMN "labelingType" "LabelingType" NOT NULL DEFAULT 'FOOD';

-- AlterTable
ALTER TABLE "ProductTemplatePackaging" ADD COLUMN "coPackerServiceId" STRING;

-- CreateTable
CREATE TABLE "ProductTemplatePricingTier" (
    "id" STRING NOT NULL,
    "productTemplateId" STRING NOT NULL,
    "sortOrder" INT4 NOT NULL DEFAULT 0,
    "minQty" INT4 NOT NULL,
    "maxQty" INT4,
    "perUnitCostCents" INT4 NOT NULL,
    "perUnitFloorCents" INT4 NOT NULL,
    "leadTimeDays" INT4,
    "notes" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTemplatePricingTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Niche" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING,
    "displayOrder" INT4 NOT NULL DEFAULT 0,
    "isActive" BOOL NOT NULL DEFAULT true,
    "iconEmoji" STRING,
    "accentHex" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Niche_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTemplateNiche" (
    "productTemplateId" STRING NOT NULL,
    "nicheId" STRING NOT NULL,
    "isPrimary" BOOL NOT NULL DEFAULT false,

    CONSTRAINT "ProductTemplateNiche_pkey" PRIMARY KEY ("productTemplateId","nicheId")
);

-- CreateIndex
CREATE INDEX "ProductTemplatePackaging_coPackerServiceId_idx" ON "ProductTemplatePackaging"("coPackerServiceId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTemplatePricingTier_productTemplateId_sortOrder_key" ON "ProductTemplatePricingTier"("productTemplateId", "sortOrder");

-- CreateIndex
CREATE INDEX "ProductTemplatePricingTier_productTemplateId_idx" ON "ProductTemplatePricingTier"("productTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "Niche_slug_key" ON "Niche"("slug");

-- CreateIndex
CREATE INDEX "Niche_isActive_displayOrder_idx" ON "Niche"("isActive", "displayOrder");

-- CreateIndex
CREATE INDEX "ProductTemplateNiche_nicheId_idx" ON "ProductTemplateNiche"("nicheId");

-- AddForeignKey
ALTER TABLE "ProductTemplatePackaging" ADD CONSTRAINT "ProductTemplatePackaging_coPackerServiceId_fkey" FOREIGN KEY ("coPackerServiceId") REFERENCES "PartnerService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplatePricingTier" ADD CONSTRAINT "ProductTemplatePricingTier_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplateNiche" ADD CONSTRAINT "ProductTemplateNiche_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplateNiche" ADD CONSTRAINT "ProductTemplateNiche_nicheId_fkey" FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE CASCADE ON UPDATE CASCADE;
