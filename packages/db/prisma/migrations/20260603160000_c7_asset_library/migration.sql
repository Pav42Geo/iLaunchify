-- CreateEnum
CREATE TYPE "AssetCatalogStatus" AS ENUM ('ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "CertAssetVariantKind" AS ENUM ('COLOR', 'BLACK_WHITE', 'OUTLINE', 'CONTEXTUAL');

-- CreateEnum
CREATE TYPE "PackagingSymbolFamily" AS ENUM ('RESIN_CODE', 'RECYCLING_MARK', 'COMPOSTABILITY', 'DISPOSAL', 'OTHER');

-- CreateEnum
CREATE TYPE "LabelingSymbolFamily" AS ENUM ('ATTRIBUTION', 'STORAGE', 'ALLERGEN', 'DISCLOSURE', 'WARNING', 'OTHER');

-- CreateEnum
CREATE TYPE "SymbolRequirement" AS ENUM ('REQUIRED', 'RECOMMENDED', 'OPTIONAL');

-- CreateTable
CREATE TABLE "CertificateAssetVariant" (
    "id" STRING NOT NULL,
    "certificateTypeId" STRING NOT NULL,
    "kind" "CertAssetVariantKind" NOT NULL,
    "label" STRING NOT NULL,
    "svgFileId" STRING,
    "pngFileId" STRING,
    "minWidthMm" FLOAT8,
    "maxWidthMm" FLOAT8,
    "approvedColorSpec" STRING,
    "requiredCoText" STRING,
    "clearSpaceFactor" FLOAT8,
    "brandGuidelinesUrl" STRING,
    "notes" STRING,
    "sortOrder" INT4 NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateAssetVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingSymbol" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING,
    "family" "PackagingSymbolFamily" NOT NULL,
    "applicableSubstrates" STRING[],
    "applicableMaterials" STRING[],
    "applicableMarkets" STRING[],
    "requirement" "SymbolRequirement" NOT NULL DEFAULT 'OPTIONAL',
    "requiredWhen" STRING,
    "status" "AssetCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingSymbol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingSymbolVariant" (
    "id" STRING NOT NULL,
    "packagingSymbolId" STRING NOT NULL,
    "label" STRING NOT NULL,
    "svgFileId" STRING,
    "pngFileId" STRING,
    "minWidthMm" FLOAT8,
    "maxWidthMm" FLOAT8,
    "approvedColorSpec" STRING,
    "clearSpaceFactor" FLOAT8,
    "brandGuidelinesUrl" STRING,
    "notes" STRING,
    "sortOrder" INT4 NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingSymbolVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelingSymbol" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING,
    "family" "LabelingSymbolFamily" NOT NULL,
    "applicableCategorySlugs" STRING[],
    "applicableMarkets" STRING[],
    "requirement" "SymbolRequirement" NOT NULL DEFAULT 'OPTIONAL',
    "requiredWhen" STRING,
    "requiredCoText" STRING,
    "status" "AssetCatalogStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelingSymbol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LabelingSymbolVariant" (
    "id" STRING NOT NULL,
    "labelingSymbolId" STRING NOT NULL,
    "label" STRING NOT NULL,
    "svgFileId" STRING,
    "pngFileId" STRING,
    "minWidthMm" FLOAT8,
    "maxWidthMm" FLOAT8,
    "approvedColorSpec" STRING,
    "clearSpaceFactor" FLOAT8,
    "brandGuidelinesUrl" STRING,
    "notes" STRING,
    "sortOrder" INT4 NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelingSymbolVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CertificateAssetVariant_certificateTypeId_idx" ON "CertificateAssetVariant"("certificateTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingSymbol_slug_key" ON "PackagingSymbol"("slug");

-- CreateIndex
CREATE INDEX "PackagingSymbol_family_idx" ON "PackagingSymbol"("family");

-- CreateIndex
CREATE INDEX "PackagingSymbol_status_idx" ON "PackagingSymbol"("status");

-- CreateIndex
CREATE INDEX "PackagingSymbolVariant_packagingSymbolId_idx" ON "PackagingSymbolVariant"("packagingSymbolId");

-- CreateIndex
CREATE UNIQUE INDEX "LabelingSymbol_slug_key" ON "LabelingSymbol"("slug");

-- CreateIndex
CREATE INDEX "LabelingSymbol_family_idx" ON "LabelingSymbol"("family");

-- CreateIndex
CREATE INDEX "LabelingSymbol_status_idx" ON "LabelingSymbol"("status");

-- CreateIndex
CREATE INDEX "LabelingSymbolVariant_labelingSymbolId_idx" ON "LabelingSymbolVariant"("labelingSymbolId");

-- AddForeignKey
ALTER TABLE "CertificateAssetVariant" ADD CONSTRAINT "CertificateAssetVariant_certificateTypeId_fkey" FOREIGN KEY ("certificateTypeId") REFERENCES "CertificateType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingSymbolVariant" ADD CONSTRAINT "PackagingSymbolVariant_packagingSymbolId_fkey" FOREIGN KEY ("packagingSymbolId") REFERENCES "PackagingSymbol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LabelingSymbolVariant" ADD CONSTRAINT "LabelingSymbolVariant_labelingSymbolId_fkey" FOREIGN KEY ("labelingSymbolId") REFERENCES "LabelingSymbol"("id") ON DELETE CASCADE ON UPDATE CASCADE;
