-- CreateEnum
CREATE TYPE "CommChannel" AS ENUM ('EMAIL', 'IN_APP', 'PHONE');

-- CreateEnum
CREATE TYPE "RevisionPolicy" AS ENUM ('PLATFORM_DEFAULT', 'CUSTOM_NEGOTIATED');

-- CreateEnum
CREATE TYPE "ProductionConfirmationMode" AS ENUM ('SLOW_CONFIRM', 'FAST_CONFIRM');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('ACH', 'WIRE', 'STRIPE_CONNECT');

-- CreateEnum
CREATE TYPE "PricingModel" AS ENUM ('FIXED', 'QUOTE_BASED', 'VOLUME_TIERED');

-- CreateEnum
CREATE TYPE "InvoiceCycle" AS ENUM ('PER_ORDER', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "InventorySyncMode" AS ENUM ('NONE', 'MANUAL', 'CSV_BATCH', 'WEBHOOK', 'API');

-- CreateEnum
CREATE TYPE "LayerStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "PhotographyStyle" AS ENUM ('LIFESTYLE', 'PRODUCT', 'LAB', 'INGREDIENT', 'EDITORIAL', 'NONE');

-- CreateEnum
CREATE TYPE "IllustrationStyle" AS ENUM ('LINE_ART', 'FLAT', 'HAND_DRAWN', 'GEOMETRIC', 'NONE');

-- CreateEnum
CREATE TYPE "FontSource" AS ENUM ('GOOGLE_FONTS', 'ADOBE', 'PRIVATE_LICENSED');

-- CreateEnum
CREATE TYPE "BrandLibraryStatus" AS ENUM ('DRAFT', 'ACTIVE', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "OnboardingStepStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "PartnerStatus" ADD VALUE 'LEAD';
ALTER TYPE "PartnerStatus" ADD VALUE 'IDENTITY_PENDING_REVIEW';
ALTER TYPE "PartnerStatus" ADD VALUE 'IDENTITY_VERIFIED';
ALTER TYPE "PartnerStatus" ADD VALUE 'OPS_PENDING_REVIEW';
ALTER TYPE "PartnerStatus" ADD VALUE 'OPERATIONALLY_CONFIGURED';
ALTER TYPE "PartnerStatus" ADD VALUE 'INTEGRATION_ENHANCED';
ALTER TYPE "PartnerStatus" ADD VALUE 'PAUSED';
ALTER TYPE "PartnerStatus" ADD VALUE 'TERMINATED';

-- AlterEnum
ALTER TYPE "VerificationSectionType" ADD VALUE 'OPERATIONAL_STANDARDS';

-- AlterTable
ALTER TABLE "Brand" ADD COLUMN     "bannedWords" STRING[];
ALTER TABLE "Brand" ADD COLUMN     "brandBookExportedAt" TIMESTAMP(3);
ALTER TABLE "Brand" ADD COLUMN     "brandHealthScore" INT4 NOT NULL DEFAULT 0;
ALTER TABLE "Brand" ADD COLUMN     "brandKeywords" STRING[];
ALTER TABLE "Brand" ADD COLUMN     "brandStylePresetId" STRING;
ALTER TABLE "Brand" ADD COLUMN     "brandVoiceTags" STRING[];
ALTER TABLE "Brand" ADD COLUMN     "colorPaletteId" STRING;
ALTER TABLE "Brand" ADD COLUMN     "colorSystem" JSONB;
ALTER TABLE "Brand" ADD COLUMN     "customColorsJson" JSONB;
ALTER TABLE "Brand" ADD COLUMN     "customPaletteOverride" BOOL NOT NULL DEFAULT false;
ALTER TABLE "Brand" ADD COLUMN     "directionNotes" STRING;
ALTER TABLE "Brand" ADD COLUMN     "faviconAssetId" STRING;
ALTER TABLE "Brand" ADD COLUMN     "heroImageAssetIds" STRING[];
ALTER TABLE "Brand" ADD COLUMN     "illustrationStyle" "IllustrationStyle";
ALTER TABLE "Brand" ADD COLUMN     "logoHorizontalAssetId" STRING;
ALTER TABLE "Brand" ADD COLUMN     "logoIconAssetId" STRING;
ALTER TABLE "Brand" ADD COLUMN     "logoInverseAssetId" STRING;
ALTER TABLE "Brand" ADD COLUMN     "logoMinClearSpaceUnits" FLOAT8 NOT NULL DEFAULT 0.5;
ALTER TABLE "Brand" ADD COLUMN     "logoMonogramAssetId" STRING;
ALTER TABLE "Brand" ADD COLUMN     "logoVerticalAssetId" STRING;
ALTER TABLE "Brand" ADD COLUMN     "onboardingCompletedAt" TIMESTAMP(3);
ALTER TABLE "Brand" ADD COLUMN     "packagingDirectionNotes" STRING;
ALTER TABLE "Brand" ADD COLUMN     "patternAssetIds" STRING[];
ALTER TABLE "Brand" ADD COLUMN     "personaDescription" STRING;
ALTER TABLE "Brand" ADD COLUMN     "photographyStyle" "PhotographyStyle";
ALTER TABLE "Brand" ADD COLUMN     "secondaryTaglines" STRING[];
ALTER TABLE "Brand" ADD COLUMN     "typeScaleRatio" FLOAT8 NOT NULL DEFAULT 1.250;
ALTER TABLE "Brand" ADD COLUMN     "typographyAccentId" STRING;
ALTER TABLE "Brand" ADD COLUMN     "typographyPairId" STRING;
ALTER TABLE "Brand" ADD COLUMN     "writingToneWords" STRING[];

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "statusChangeReason" STRING;
ALTER TABLE "Partner" ADD COLUMN     "statusChangedAt" TIMESTAMP(3);
ALTER TABLE "Partner" ADD COLUMN     "statusChangedById" STRING;

-- CreateTable
CREATE TABLE "PartnerOperationalCapability" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "productTypes" STRING[],
    "packagingFormats" STRING[],
    "productionSpecs" STRING[],
    "moqUnitsMin" INT4 NOT NULL,
    "moqUnitsTypical" INT4 NOT NULL,
    "leadTimeDaysMin" INT4 NOT NULL,
    "leadTimeDaysMax" INT4 NOT NULL,
    "monthlyCapacityUnits" INT4,
    "specialties" STRING[],
    "notes" STRING,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerOperationalCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerOperationalStandards" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "responseTimeHours" INT4 NOT NULL DEFAULT 24,
    "preferredCommChannel" "CommChannel" NOT NULL DEFAULT 'IN_APP',
    "escalationContact" JSONB NOT NULL,
    "revisionPolicy" "RevisionPolicy" NOT NULL DEFAULT 'PLATFORM_DEFAULT',
    "customRevisionTerms" STRING,
    "productionConfirmationMode" "ProductionConfirmationMode" NOT NULL DEFAULT 'SLOW_CONFIRM',
    "acceptedDefaults" BOOL NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerOperationalStandards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformMandatedStandards" (
    "id" STRING NOT NULL,
    "version" STRING NOT NULL,
    "acceptedArtworkFormats" STRING[] DEFAULT ARRAY['AI', 'PDF', 'SVG', 'PSD']::STRING[],
    "versioningRule" STRING NOT NULL DEFAULT 'every_change_new_version',
    "disputeResolutionWindowDays" INT4 NOT NULL DEFAULT 14,
    "escalationPath" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformMandatedStandards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTerms" (
    "id" STRING NOT NULL,
    "version" STRING NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING NOT NULL,
    "status" "ContractStatus" NOT NULL,
    "failureResponsibility" JSONB NOT NULL,
    "paymentTerms" JSONB NOT NULL,
    "pricingModelOptions" "PricingModel"[],
    "invoiceCycleOptions" "InvoiceCycle"[],
    "disputePolicy" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "pdfFileId" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTerms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCommercialTerms" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "contractTermsId" STRING NOT NULL,
    "contractOverrideId" STRING,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'STRIPE_CONNECT',
    "payoutTimingDays" INT4 NOT NULL DEFAULT 7,
    "pricingModel" "PricingModel" NOT NULL DEFAULT 'FIXED',
    "invoiceCycle" "InvoiceCycle" NOT NULL DEFAULT 'PER_ORDER',
    "signedAt" TIMESTAMP(3) NOT NULL,
    "signedById" STRING NOT NULL,
    "stripeConnectAccountId" STRING,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerCommercialTerms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerIntegrationCapability" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "hasDashboardOnly" BOOL NOT NULL DEFAULT true,
    "canUseCSVImport" BOOL NOT NULL DEFAULT false,
    "canUseCSVExport" BOOL NOT NULL DEFAULT false,
    "hasWebhookEndpoint" BOOL NOT NULL DEFAULT false,
    "webhookUrl" STRING,
    "webhookSigningSecret" STRING,
    "hasAPIIntegration" BOOL NOT NULL DEFAULT false,
    "apiKeyId" STRING,
    "inventorySyncMode" "InventorySyncMode" NOT NULL DEFAULT 'NONE',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerIntegrationCapability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerOnboardingProgress" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "layer1Identity" "LayerStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "layer2Capability" "LayerStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "layer3Standards" "LayerStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "layer4Commercial" "LayerStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "layer5Integration" "LayerStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "layer1ChangeRequests" JSONB,
    "layer2ChangeRequests" JSONB,
    "layer3ChangeRequests" JSONB,
    "layer4ChangeRequests" JSONB,
    "layer5ChangeRequests" JSONB,
    "lastActivityAt" TIMESTAMP(3),

    CONSTRAINT "PartnerOnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandStylePreset" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING NOT NULL,
    "styleTags" STRING[],
    "recommendedColorPaletteId" STRING,
    "recommendedTypographyPairId" STRING,
    "sampleLabelAssetId" STRING,
    "sampleTagline" STRING,
    "status" "BrandLibraryStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandStylePreset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColorPalette" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING,
    "styleTags" STRING[],
    "colorSystem" JSONB NOT NULL,
    "contrastReport" JSONB NOT NULL,
    "isCurated" BOOL NOT NULL DEFAULT true,
    "status" "BrandLibraryStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ColorPalette_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TypographyPair" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING,
    "styleTags" STRING[],
    "headingFontId" STRING NOT NULL,
    "bodyFontId" STRING NOT NULL,
    "recommendedRatio" FLOAT8 NOT NULL DEFAULT 1.250,
    "status" "BrandLibraryStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TypographyPair_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TypographyFont" (
    "id" STRING NOT NULL,
    "family" STRING NOT NULL,
    "weight" STRING NOT NULL,
    "style" STRING NOT NULL,
    "source" "FontSource" NOT NULL DEFAULT 'GOOGLE_FONTS',
    "webfontUrl" STRING,
    "printFileAssetId" STRING,
    "unicodeRanges" STRING[],
    "licenseTerms" STRING NOT NULL,
    "status" "BrandLibraryStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TypographyFont_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreatorOnboardingProgress" (
    "id" STRING NOT NULL,
    "brandId" STRING NOT NULL,
    "step1TellUsAboutYou" "OnboardingStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "step2PaymentSetup" "OnboardingStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "step3ConnectChannel" "OnboardingStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "step4BrandIdentity" "OnboardingStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "step5FirstProduct" "OnboardingStepStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "lastActivityAt" TIMESTAMP(3),

    CONSTRAINT "CreatorOnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOperationalCapability_partnerId_key" ON "PartnerOperationalCapability"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOperationalStandards_partnerId_key" ON "PartnerOperationalStandards"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformMandatedStandards_version_key" ON "PlatformMandatedStandards"("version");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTerms_version_key" ON "ContractTerms"("version");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerCommercialTerms_partnerId_key" ON "PartnerCommercialTerms"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerIntegrationCapability_partnerId_key" ON "PartnerIntegrationCapability"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerOnboardingProgress_partnerId_key" ON "PartnerOnboardingProgress"("partnerId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandStylePreset_slug_key" ON "BrandStylePreset"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "ColorPalette_slug_key" ON "ColorPalette"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TypographyPair_slug_key" ON "TypographyPair"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "TypographyFont_family_weight_style_key" ON "TypographyFont"("family", "weight", "style");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorOnboardingProgress_brandId_key" ON "CreatorOnboardingProgress"("brandId");

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_brandStylePresetId_fkey" FOREIGN KEY ("brandStylePresetId") REFERENCES "BrandStylePreset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_colorPaletteId_fkey" FOREIGN KEY ("colorPaletteId") REFERENCES "ColorPalette"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_typographyPairId_fkey" FOREIGN KEY ("typographyPairId") REFERENCES "TypographyPair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_typographyAccentId_fkey" FOREIGN KEY ("typographyAccentId") REFERENCES "TypographyFont"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOperationalCapability" ADD CONSTRAINT "PartnerOperationalCapability_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOperationalStandards" ADD CONSTRAINT "PartnerOperationalStandards_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommercialTerms" ADD CONSTRAINT "PartnerCommercialTerms_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommercialTerms" ADD CONSTRAINT "PartnerCommercialTerms_contractTermsId_fkey" FOREIGN KEY ("contractTermsId") REFERENCES "ContractTerms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCommercialTerms" ADD CONSTRAINT "PartnerCommercialTerms_contractOverrideId_fkey" FOREIGN KEY ("contractOverrideId") REFERENCES "ContractTerms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerIntegrationCapability" ADD CONSTRAINT "PartnerIntegrationCapability_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerOnboardingProgress" ADD CONSTRAINT "PartnerOnboardingProgress_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandStylePreset" ADD CONSTRAINT "BrandStylePreset_recommendedColorPaletteId_fkey" FOREIGN KEY ("recommendedColorPaletteId") REFERENCES "ColorPalette"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandStylePreset" ADD CONSTRAINT "BrandStylePreset_recommendedTypographyPairId_fkey" FOREIGN KEY ("recommendedTypographyPairId") REFERENCES "TypographyPair"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypographyPair" ADD CONSTRAINT "TypographyPair_headingFontId_fkey" FOREIGN KEY ("headingFontId") REFERENCES "TypographyFont"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TypographyPair" ADD CONSTRAINT "TypographyPair_bodyFontId_fkey" FOREIGN KEY ("bodyFontId") REFERENCES "TypographyFont"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorOnboardingProgress" ADD CONSTRAINT "CreatorOnboardingProgress_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
