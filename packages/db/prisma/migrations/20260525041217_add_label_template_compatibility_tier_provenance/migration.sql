-- CreateEnum
CREATE TYPE "PackagingTopology" AS ENUM ('SINGLE_CONTAINER', 'MULTI_CONTAINER_BOX', 'STICK_PACK', 'SACHET', 'CASE', 'CAPSULE_JAR', 'POUCH_STAND_UP', 'POUCH_FLAT', 'TUBE', 'OTHER');

-- CreateEnum
CREATE TYPE "FlavorMode" AS ENUM ('SINGLE', 'MULTI');

-- CreateEnum
CREATE TYPE "FlavorPolicy" AS ENUM ('CREATOR_PICK', 'PARTNER_FIXED');

-- CreateEnum
CREATE TYPE "PackagingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "PackagingTypeStatus" AS ENUM ('ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "CertificateTypeStatus" AS ENUM ('ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "PartnerCertInstanceStatus" AS ENUM ('PENDING_REVIEW', 'VERIFIED', 'EXPIRED', 'REJECTED');

-- CreateEnum
CREATE TYPE "NoteAuthor" AS ENUM ('PARTNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "FlavorPresetStatus" AS ENUM ('ACTIVE', 'DRAFT', 'RETIRED');

-- CreateEnum
CREATE TYPE "IngredientSource" AS ENUM ('USDA', 'LIBRARY', 'PARTNER_PRIVATE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('SELF_ATTESTED', 'ADMIN_VERIFIED', 'LIBRARY_PROMOTED');

-- CreateEnum
CREATE TYPE "BioengineeredStatus" AS ENUM ('NONE', 'BIOENGINEERED', 'DERIVED_FROM_BIOENGINEERED', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "LabelTemplateSurface" AS ENUM ('FRONT', 'BACK', 'LID', 'FULL_WRAP', 'SLEEVE', 'NECK');

-- CreateEnum
CREATE TYPE "LabelTemplateTier" AS ENUM ('REGULAR', 'PREMIUM', 'EXCLUSIVE');

-- CreateEnum
CREATE TYPE "LabelTemplateCreator" AS ENUM ('ADMIN', 'DESIGNER', 'AI_AGENT', 'PARTNER');

-- CreateEnum
CREATE TYPE "LabelTemplateStatus" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'ACTIVE', 'DEPRECATED');

-- AlterEnum
ALTER TYPE "ProductTemplateStatus" ADD VALUE 'PENDING_REVIEW';
ALTER TYPE "ProductTemplateStatus" ADD VALUE 'NEEDS_CHANGES';
ALTER TYPE "ProductTemplateStatus" ADD VALUE 'PENDING_EDIT_REVIEW';
ALTER TYPE "ProductTemplateStatus" ADD VALUE 'PAUSED';
ALTER TYPE "ProductTemplateStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "aiSubAgent" STRING;
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "compatiblePackagingTypeIds" STRING[];
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "compatibleSurfaces" "LabelTemplateSurface"[];
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "createdBy" "LabelTemplateCreator" NOT NULL DEFAULT 'ADMIN';
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "exclusiveLicenseHolders" STRING[];
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "exclusiveSeats" INT4;
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "humanCuratorId" STRING;
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "lifecycleStatus" "LabelTemplateStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "priceCents" INT4;
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "productCategoryFit" STRING[];
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "styleTags" STRING[];
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "tier" "LabelTemplateTier" NOT NULL DEFAULT 'REGULAR';
ALTER TABLE "DesignLibraryItem" ADD COLUMN     "trendReportId" STRING;

-- AlterTable
ALTER TABLE "Ingredient" ADD COLUMN     "allergenFlags" STRING[];
ALTER TABLE "Ingredient" ADD COLUMN     "bioengineeredStatus" "BioengineeredStatus" NOT NULL DEFAULT 'NOT_APPLICABLE';
ALTER TABLE "Ingredient" ADD COLUMN     "coaFileId" STRING;
ALTER TABLE "Ingredient" ADD COLUMN     "complianceNotes" STRING;
ALTER TABLE "Ingredient" ADD COLUMN     "createdById" STRING;
ALTER TABLE "Ingredient" ADD COLUMN     "densityGPerML" FLOAT8;
ALTER TABLE "Ingredient" ADD COLUMN     "internalName" STRING;
ALTER TABLE "Ingredient" ADD COLUMN     "labelDeclarationName" STRING;
ALTER TABLE "Ingredient" ADD COLUMN     "ownerPartnerId" STRING;
ALTER TABLE "Ingredient" ADD COLUMN     "promotedFromIngredientId" STRING;
ALTER TABLE "Ingredient" ADD COLUMN     "source" "IngredientSource";
ALTER TABLE "Ingredient" ADD COLUMN     "sourceRefId" STRING;
ALTER TABLE "Ingredient" ADD COLUMN     "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'LIBRARY_PROMOTED';
ALTER TABLE "Ingredient" ADD COLUMN     "verifiedById" STRING;

-- AlterTable
ALTER TABLE "ProductTemplate" ADD COLUMN     "allergenCrossContamination" STRING;
ALTER TABLE "ProductTemplate" ADD COLUMN     "allergenManualOverrides" JSONB;
ALTER TABLE "ProductTemplate" ADD COLUMN     "customMeta" JSONB;
ALTER TABLE "ProductTemplate" ADD COLUMN     "finishedProductWeightG" INT4;
ALTER TABLE "ProductTemplate" ADD COLUMN     "ingredientGroups" JSONB;
ALTER TABLE "ProductTemplate" ADD COLUMN     "nutrientOverrides" JSONB;
ALTER TABLE "ProductTemplate" ADD COLUMN     "pendingEditPayload" JSONB;

-- CreateTable
CREATE TABLE "PackagingType" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "displayName" STRING NOT NULL,
    "imageFileId" STRING,
    "defaultTopology" "PackagingTopology" NOT NULL,
    "defaultDimensions" JSONB,
    "defaultSurfaces" JSONB,
    "status" "PackagingTypeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingSystem" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "packagingTypeId" STRING,
    "partnerName" STRING NOT NULL,
    "partnerImageFileId" STRING,
    "overrideDisplayName" STRING,
    "overrideImageFileId" STRING,
    "topology" "PackagingTopology" NOT NULL,
    "unitCount" INT4 NOT NULL DEFAULT 1,
    "flavorMode" "FlavorMode" NOT NULL DEFAULT 'SINGLE',
    "flavorPolicy" "FlavorPolicy" NOT NULL DEFAULT 'CREATOR_PICK',
    "moq" INT4 NOT NULL,
    "dimensions" JSONB,
    "maxWeightG" INT4,
    "status" "PackagingStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackagingSurface" (
    "id" STRING NOT NULL,
    "packagingSystemId" STRING NOT NULL,
    "name" STRING NOT NULL,
    "dieLineFileId" STRING,
    "printableAreaSqIn" FLOAT8,
    "bleedMm" FLOAT8 NOT NULL DEFAULT 3,
    "printDpi" INT4,
    "colorMode" STRING,
    "mandatoryZones" JSONB,
    "registrationMarks" JSONB,

    CONSTRAINT "PackagingSurface_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificateType" (
    "id" STRING NOT NULL,
    "name" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "thumbnailFileId" STRING,
    "description" STRING NOT NULL,
    "verificationNotes" STRING,
    "status" "CertificateTypeStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCertificateInstance" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "certificateTypeId" STRING NOT NULL,
    "pdfFileId" STRING NOT NULL,
    "certificateNumber" STRING,
    "issuingBody" STRING,
    "issueDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3) NOT NULL,
    "status" "PartnerCertInstanceStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" STRING,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" STRING,
    "notes" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerCertificateInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductCertificate" (
    "productTemplateId" STRING NOT NULL,
    "instanceId" STRING NOT NULL,
    "appliesToPackagingSystemIds" STRING[],

    CONSTRAINT "ProductCertificate_pkey" PRIMARY KEY ("productTemplateId","instanceId")
);

-- CreateTable
CREATE TABLE "ProductReviewItem" (
    "id" STRING NOT NULL,
    "productTemplateId" STRING NOT NULL,
    "category" STRING NOT NULL,
    "description" STRING NOT NULL,
    "resolved" BOOL NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),
    "createdById" STRING NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductNote" (
    "id" STRING NOT NULL,
    "productTemplateId" STRING NOT NULL,
    "authorId" STRING NOT NULL,
    "authorType" "NoteAuthor" NOT NULL,
    "body" STRING NOT NULL,
    "attachmentFileId" STRING,
    "editedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTemplatePackaging" (
    "productTemplateId" STRING NOT NULL,
    "packagingSystemId" STRING NOT NULL,
    "basePriceCents" INT4 NOT NULL,
    "moqOverride" INT4,
    "leadTimeDays" INT4 NOT NULL,
    "pricingTiers" JSONB NOT NULL,
    "surfaceOverrides" JSONB,

    CONSTRAINT "ProductTemplatePackaging_pkey" PRIMARY KEY ("productTemplateId","packagingSystemId")
);

-- CreateTable
CREATE TABLE "FlavorPreset" (
    "id" STRING NOT NULL,
    "productTemplateId" STRING NOT NULL,
    "name" STRING NOT NULL,
    "swatchHex" STRING,
    "swatchImageFileId" STRING,
    "slotResolution" JSONB NOT NULL,
    "extras" JSONB,
    "priceDeltaCents" INT4 NOT NULL DEFAULT 0,
    "status" "FlavorPresetStatus" NOT NULL DEFAULT 'ACTIVE',
    "sortOrder" INT4 NOT NULL DEFAULT 0,
    "nutrientOverrides" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FlavorPreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IngredientUsage" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "ingredientId" STRING NOT NULL,
    "useCount" INT4 NOT NULL DEFAULT 1,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IngredientUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BannedIngredient" (
    "id" STRING NOT NULL,
    "matchName" STRING,
    "matchPattern" STRING,
    "casNumber" STRING,
    "reason" STRING NOT NULL,
    "reference" STRING,
    "isActive" BOOL NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BannedIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControversialIngredient" (
    "id" STRING NOT NULL,
    "matchName" STRING,
    "matchPattern" STRING,
    "casNumber" STRING,
    "concern" STRING NOT NULL,
    "recommendation" STRING,
    "reference" STRING,
    "isActive" BOOL NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ControversialIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PackagingType_slug_key" ON "PackagingType"("slug");

-- CreateIndex
CREATE INDEX "PackagingSystem_partnerId_status_idx" ON "PackagingSystem"("partnerId", "status");

-- CreateIndex
CREATE INDEX "PackagingSystem_packagingTypeId_idx" ON "PackagingSystem"("packagingTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "CertificateType_slug_key" ON "CertificateType"("slug");

-- CreateIndex
CREATE INDEX "PartnerCertificateInstance_partnerId_status_idx" ON "PartnerCertificateInstance"("partnerId", "status");

-- CreateIndex
CREATE INDEX "PartnerCertificateInstance_expiryDate_idx" ON "PartnerCertificateInstance"("expiryDate");

-- CreateIndex
CREATE INDEX "ProductReviewItem_productTemplateId_resolved_idx" ON "ProductReviewItem"("productTemplateId", "resolved");

-- CreateIndex
CREATE INDEX "ProductNote_productTemplateId_createdAt_idx" ON "ProductNote"("productTemplateId", "createdAt");

-- CreateIndex
CREATE INDEX "FlavorPreset_productTemplateId_status_sortOrder_idx" ON "FlavorPreset"("productTemplateId", "status", "sortOrder");

-- CreateIndex
CREATE INDEX "IngredientUsage_partnerId_lastUsedAt_idx" ON "IngredientUsage"("partnerId", "lastUsedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "IngredientUsage_partnerId_ingredientId_key" ON "IngredientUsage"("partnerId", "ingredientId");

-- CreateIndex
CREATE INDEX "BannedIngredient_isActive_matchName_idx" ON "BannedIngredient"("isActive", "matchName");

-- CreateIndex
CREATE INDEX "BannedIngredient_casNumber_idx" ON "BannedIngredient"("casNumber");

-- CreateIndex
CREATE INDEX "ControversialIngredient_isActive_matchName_idx" ON "ControversialIngredient"("isActive", "matchName");

-- CreateIndex
CREATE INDEX "DesignLibraryItem_lifecycleStatus_tier_idx" ON "DesignLibraryItem"("lifecycleStatus", "tier");

-- CreateIndex
CREATE INDEX "Ingredient_source_sourceRefId_idx" ON "Ingredient"("source", "sourceRefId");

-- CreateIndex
CREATE INDEX "Ingredient_ownerPartnerId_idx" ON "Ingredient"("ownerPartnerId");

-- CreateIndex
CREATE INDEX "Ingredient_verificationStatus_idx" ON "Ingredient"("verificationStatus");

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_ownerPartnerId_fkey" FOREIGN KEY ("ownerPartnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ingredient" ADD CONSTRAINT "Ingredient_promotedFromIngredientId_fkey" FOREIGN KEY ("promotedFromIngredientId") REFERENCES "Ingredient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingSystem" ADD CONSTRAINT "PackagingSystem_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingSystem" ADD CONSTRAINT "PackagingSystem_packagingTypeId_fkey" FOREIGN KEY ("packagingTypeId") REFERENCES "PackagingType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingSurface" ADD CONSTRAINT "PackagingSurface_packagingSystemId_fkey" FOREIGN KEY ("packagingSystemId") REFERENCES "PackagingSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCertificateInstance" ADD CONSTRAINT "PartnerCertificateInstance_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCertificateInstance" ADD CONSTRAINT "PartnerCertificateInstance_certificateTypeId_fkey" FOREIGN KEY ("certificateTypeId") REFERENCES "CertificateType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCertificate" ADD CONSTRAINT "ProductCertificate_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductCertificate" ADD CONSTRAINT "ProductCertificate_instanceId_fkey" FOREIGN KEY ("instanceId") REFERENCES "PartnerCertificateInstance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductReviewItem" ADD CONSTRAINT "ProductReviewItem_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductNote" ADD CONSTRAINT "ProductNote_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplatePackaging" ADD CONSTRAINT "ProductTemplatePackaging_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplatePackaging" ADD CONSTRAINT "ProductTemplatePackaging_packagingSystemId_fkey" FOREIGN KEY ("packagingSystemId") REFERENCES "PackagingSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlavorPreset" ADD CONSTRAINT "FlavorPreset_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IngredientUsage" ADD CONSTRAINT "IngredientUsage_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
