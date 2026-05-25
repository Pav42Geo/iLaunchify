-- CreateEnum
CREATE TYPE "MarketStatus" AS ENUM ('ACTIVE', 'COMING_SOON', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "RegionKind" AS ENUM ('COUNTRY', 'SUBNATIONAL_GROUP', 'STATE_PROVINCE', 'METRO');

-- CreateEnum
CREATE TYPE "PartnerMarketStatus" AS ENUM ('ACTIVE', 'LAPSED', 'REVOKED');

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "operatingRegionId" STRING;

-- AlterTable
ALTER TABLE "Market" ADD COLUMN     "allergenPolicy" JSONB;
ALTER TABLE "Market" ADD COLUMN     "barcodeRules" JSONB;
ALTER TABLE "Market" ADD COLUMN     "defaultLanguageId" STRING;
ALTER TABLE "Market" ADD COLUMN     "region" STRING;
ALTER TABLE "Market" ADD COLUMN     "status" "MarketStatus" NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Market" ADD COLUMN     "typography" JSONB;

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "primaryRegionId" STRING;

-- CreateTable
CREATE TABLE "Language" (
    "id" STRING NOT NULL,
    "code" STRING NOT NULL,
    "name" STRING NOT NULL,
    "region" STRING,
    "isActive" BOOL NOT NULL DEFAULT true,

    CONSTRAINT "Language_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketLanguage" (
    "id" STRING NOT NULL,
    "marketId" STRING NOT NULL,
    "languageId" STRING NOT NULL,
    "isDefault" BOOL NOT NULL DEFAULT false,
    "isRequired" BOOL NOT NULL DEFAULT false,
    "displayOrder" INT4 NOT NULL DEFAULT 0,

    CONSTRAINT "MarketLanguage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketConfig" (
    "id" STRING NOT NULL,
    "marketId" STRING NOT NULL,
    "key" STRING NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "MarketConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Region" (
    "id" STRING NOT NULL,
    "code" STRING NOT NULL,
    "name" STRING NOT NULL,
    "marketId" STRING NOT NULL,
    "parentRegionId" STRING,
    "kind" "RegionKind" NOT NULL,
    "centroidLatLng" JSONB,
    "shippingZone" STRING,
    "isActive" BOOL NOT NULL DEFAULT true,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerMarketCert" (
    "partnerId" STRING NOT NULL,
    "marketId" STRING NOT NULL,
    "certifiedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "certificationRef" STRING,
    "status" "PartnerMarketStatus" NOT NULL DEFAULT 'ACTIVE',

    CONSTRAINT "PartnerMarketCert_pkey" PRIMARY KEY ("partnerId","marketId")
);

-- CreateTable
CREATE TABLE "BrandTargetMarket" (
    "brandId" STRING NOT NULL,
    "marketId" STRING NOT NULL,
    "isPrimary" BOOL NOT NULL DEFAULT false,

    CONSTRAINT "BrandTargetMarket_pkey" PRIMARY KEY ("brandId","marketId")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketLanguage_marketId_languageId_key" ON "MarketLanguage"("marketId", "languageId");

-- CreateIndex
CREATE UNIQUE INDEX "MarketConfig_marketId_key_key" ON "MarketConfig"("marketId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Region_code_key" ON "Region"("code");

-- CreateIndex
CREATE INDEX "Region_marketId_kind_idx" ON "Region"("marketId", "kind");

-- CreateIndex
CREATE INDEX "PartnerMarketCert_marketId_status_idx" ON "PartnerMarketCert"("marketId", "status");

-- CreateIndex
CREATE INDEX "BrandTargetMarket_marketId_idx" ON "BrandTargetMarket"("marketId");

-- AddForeignKey
ALTER TABLE "Market" ADD CONSTRAINT "Market_defaultLanguageId_fkey" FOREIGN KEY ("defaultLanguageId") REFERENCES "Language"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_primaryRegionId_fkey" FOREIGN KEY ("primaryRegionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_operatingRegionId_fkey" FOREIGN KEY ("operatingRegionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketLanguage" ADD CONSTRAINT "MarketLanguage_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketLanguage" ADD CONSTRAINT "MarketLanguage_languageId_fkey" FOREIGN KEY ("languageId") REFERENCES "Language"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketConfig" ADD CONSTRAINT "MarketConfig_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_parentRegionId_fkey" FOREIGN KEY ("parentRegionId") REFERENCES "Region"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerMarketCert" ADD CONSTRAINT "PartnerMarketCert_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerMarketCert" ADD CONSTRAINT "PartnerMarketCert_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandTargetMarket" ADD CONSTRAINT "BrandTargetMarket_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandTargetMarket" ADD CONSTRAINT "BrandTargetMarket_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
