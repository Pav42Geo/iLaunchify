-- CreateEnum
CREATE TYPE "SubstrateCategory" AS ENUM ('PAPER_COATED', 'PAPER_UNCOATED', 'KRAFT_RECYCLED', 'FILM_BOPP', 'FILM_CLEAR', 'FILM_METALLIC', 'SPECIALTY');

-- CreateEnum
CREATE TYPE "SustainabilityTier" AS ENUM ('STANDARD', 'RECYCLED', 'COMPOSTABLE', 'BIODEGRADABLE');

-- CreateTable
CREATE TABLE "Substrate" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "category" "SubstrateCategory" NOT NULL,
    "description" STRING NOT NULL,
    "baseUnitCostCents" INT4 NOT NULL DEFAULT 0,
    "sustainabilityTier" "SustainabilityTier" NOT NULL DEFAULT 'STANDARD',
    "finishCompatibility" STRING[],
    "status" "BrandLibraryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Substrate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingMaterial" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "topology" "PackagingTopology" NOT NULL,
    "description" STRING NOT NULL,
    "baseUnitCostCents" INT4 NOT NULL DEFAULT 0,
    "foodSafe" BOOL NOT NULL DEFAULT true,
    "sustainabilityTier" "SustainabilityTier" NOT NULL DEFAULT 'STANDARD',
    "status" "BrandLibraryStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerServiceSubstrate" (
    "id" STRING NOT NULL,
    "partnerServiceId" STRING NOT NULL,
    "substrateId" STRING NOT NULL,
    "perUnitCostCents" INT4,
    "extraLeadTimeDays" INT4 NOT NULL DEFAULT 0,
    "moqMin" INT4,
    "status" "FinishStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerServiceSubstrate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerServicePackagingMaterial" (
    "id" STRING NOT NULL,
    "partnerServiceId" STRING NOT NULL,
    "packagingMaterialId" STRING NOT NULL,
    "perUnitCostCents" INT4,
    "extraLeadTimeDays" INT4 NOT NULL DEFAULT 0,
    "moqMin" INT4,
    "status" "FinishStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerServicePackagingMaterial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Substrate_slug_key" ON "Substrate"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PackagingMaterial_slug_key" ON "PackagingMaterial"("slug");

-- CreateIndex
CREATE INDEX "PackagingMaterial_topology_status_idx" ON "PackagingMaterial"("topology", "status");

-- CreateIndex
CREATE INDEX "PartnerServiceSubstrate_partnerServiceId_status_idx" ON "PartnerServiceSubstrate"("partnerServiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerServiceSubstrate_partnerServiceId_substrateId_key" ON "PartnerServiceSubstrate"("partnerServiceId", "substrateId");

-- CreateIndex
CREATE INDEX "PartnerServicePackagingMaterial_partnerServiceId_status_idx" ON "PartnerServicePackagingMaterial"("partnerServiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerServicePackagingMaterial_partnerServiceId_packagingM_key" ON "PartnerServicePackagingMaterial"("partnerServiceId", "packagingMaterialId");

-- AddForeignKey
ALTER TABLE "PartnerServiceSubstrate" ADD CONSTRAINT "PartnerServiceSubstrate_partnerServiceId_fkey" FOREIGN KEY ("partnerServiceId") REFERENCES "PartnerService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerServiceSubstrate" ADD CONSTRAINT "PartnerServiceSubstrate_substrateId_fkey" FOREIGN KEY ("substrateId") REFERENCES "Substrate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerServicePackagingMaterial" ADD CONSTRAINT "PartnerServicePackagingMaterial_partnerServiceId_fkey" FOREIGN KEY ("partnerServiceId") REFERENCES "PartnerService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerServicePackagingMaterial" ADD CONSTRAINT "PartnerServicePackagingMaterial_packagingMaterialId_fkey" FOREIGN KEY ("packagingMaterialId") REFERENCES "PackagingMaterial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
