-- CreateEnum
CREATE TYPE "PackagingTier" AS ENUM ('PRIMARY', 'SECONDARY', 'TERTIARY');

-- CreateEnum
CREATE TYPE "ComponentRole" AS ENUM ('CONTAINER', 'CARTON', 'CLOSURE', 'SEAL', 'INSERT', 'LABEL', 'SHIPPER');

-- CreateEnum
CREATE TYPE "DecorationMethod" AS ENUM ('DIRECT_PRINT', 'PRESSURE_SENSITIVE_LABEL', 'SHRINK_SLEEVE', 'IN_MOLD_LABEL', 'HEAT_TRANSFER', 'FOIL_STAMP', 'EMBOSS', 'DEBOSS', 'SPOT_UV', 'NONE');

-- CreateEnum
CREATE TYPE "OfferingStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "PackagingComponent" (
    "id" STRING NOT NULL,
    "productId" STRING NOT NULL,
    "tier" "PackagingTier" NOT NULL,
    "role" "ComponentRole" NOT NULL,
    "packagingTypeId" STRING NOT NULL,
    "partnerOfferingId" STRING,
    "selectedVariantId" STRING,
    "dielineId" STRING,
    "decorationMethod" "DecorationMethod" NOT NULL DEFAULT 'NONE',
    "designVersionId" STRING,
    "unitsPerParent" INT4 NOT NULL DEFAULT 1,
    "parentComponentId" STRING,
    "flavorPresetId" STRING,
    "displayOrder" INT4 NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingComponentVariant" (
    "id" STRING NOT NULL,
    "packagingTypeId" STRING NOT NULL,
    "componentRole" "ComponentRole" NOT NULL,
    "partnerOfferingId" STRING NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING,
    "isCustomizable" BOOL NOT NULL,
    "isDefaultIncluded" BOOL NOT NULL DEFAULT false,
    "baseSurchargePerUnit" DECIMAL(10,4) NOT NULL,
    "leadTimeDeltaDays" INT4 NOT NULL DEFAULT 0,
    "dielineId" STRING,
    "isFdaTamperEvident" BOOL NOT NULL DEFAULT false,
    "status" "OfferingStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackagingComponentVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackagingComponent_productId_idx" ON "PackagingComponent"("productId");

-- CreateIndex
CREATE INDEX "PackagingComponent_parentComponentId_idx" ON "PackagingComponent"("parentComponentId");

-- CreateIndex
CREATE INDEX "PackagingComponentVariant_packagingTypeId_idx" ON "PackagingComponentVariant"("packagingTypeId");

-- AddForeignKey
ALTER TABLE "PackagingComponent" ADD CONSTRAINT "PackagingComponent_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingComponent" ADD CONSTRAINT "PackagingComponent_packagingTypeId_fkey" FOREIGN KEY ("packagingTypeId") REFERENCES "PackagingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingComponent" ADD CONSTRAINT "PackagingComponent_selectedVariantId_fkey" FOREIGN KEY ("selectedVariantId") REFERENCES "PackagingComponentVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingComponent" ADD CONSTRAINT "PackagingComponent_parentComponentId_fkey" FOREIGN KEY ("parentComponentId") REFERENCES "PackagingComponent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
