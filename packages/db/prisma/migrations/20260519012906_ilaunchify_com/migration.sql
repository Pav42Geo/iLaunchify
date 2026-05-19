-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'CREATOR', 'PARTNER');

-- CreateEnum
CREATE TYPE "StripeAccountStatus" AS ENUM ('NONE', 'PENDING', 'RESTRICTED', 'ACTIVE', 'REJECTED', 'DEAUTHORIZED');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('DRAFT', 'INVITED', 'IN_PROGRESS', 'UNDER_REVIEW', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('MANUFACTURING', 'COPACKING', 'LABEL_PRINTING');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED');

-- CreateEnum
CREATE TYPE "DisclosureLevel" AS ENUM ('FULL', 'CITY_STATE', 'ANONYMOUS');

-- CreateEnum
CREATE TYPE "BrandArchetype" AS ENUM ('HERO', 'SAGE', 'CAREGIVER', 'EXPLORER', 'CREATOR', 'JESTER', 'EVERYMAN', 'INNOCENT', 'LOVER', 'MAGICIAN', 'OUTLAW', 'RULER');

-- CreateEnum
CREATE TYPE "ProductCategory" AS ENUM ('FOOD', 'BEVERAGE_FUNCTIONAL', 'SUPPLEMENT');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'COMPLIANT', 'PUBLISHED', 'PAUSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "RecipeStatus" AS ENUM ('DRAFT', 'CALCULATED', 'COMPLIANCE_CHECKED', 'APPROVED');

-- CreateEnum
CREATE TYPE "ComplianceCheckOutcome" AS ENUM ('PASSED', 'PASSED_WITH_WARNINGS', 'FAILED');

-- CreateEnum
CREATE TYPE "ViolationSeverity" AS ENUM ('BLOCKING', 'WARNING');

-- CreateEnum
CREATE TYPE "RulePackStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'DEPRECATED');

-- CreateEnum
CREATE TYPE "DesignStatus" AS ENUM ('DRAFT', 'COMPLIANT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "DieCutCategory" AS ENUM ('BOTTLE_WRAP', 'TUB_LID', 'POUCH_FRONT', 'BOX_PANEL', 'STICKER', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DesignLibrarySource" AS ENUM ('CURATED', 'AI_AUTHORED', 'PARTNER_SUBMITTED');

-- CreateEnum
CREATE TYPE "AssetType" AS ENUM ('LOGO', 'PRODUCT_IMAGE', 'HERO_IMAGE', 'CLIPART', 'ICON', 'FONT', 'TEMPLATE_THUMBNAIL', 'LABEL_PDF', 'COMPLIANCE_DOC', 'OTHER');

-- CreateEnum
CREATE TYPE "AssetSource" AS ENUM ('USER_UPLOAD', 'TEMPLATE_RENDER', 'AI_GENERATED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING_PAYMENT', 'PAID', 'ROUTING', 'IN_FULFILLMENT', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED', 'ON_HOLD', 'DISPUTED');

-- CreateEnum
CREATE TYPE "DispatchType" AS ENUM ('PRODUCT', 'LABEL');

-- CreateEnum
CREATE TYPE "DispatchStatus" AS ENUM ('PENDING_ACCEPT', 'ACCEPTED', 'PRODUCING', 'READY', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'DECLINED', 'TIMED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DispatchDeclineReason" AS ENUM ('AT_CAPACITY', 'CANNOT_FULFILL_SPEC', 'PRICING_DISPUTE', 'OTHER');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED', 'REFUNDED', 'PARTIALLY_REFUNDED');

-- CreateEnum
CREATE TYPE "TransferDestination" AS ENUM ('CREATOR', 'MANUFACTURER', 'PRINT_PROVIDER');

-- CreateEnum
CREATE TYPE "TransferReason" AS ENUM ('PRODUCT_COST', 'LABEL_COST', 'CREATOR_PAYOUT', 'CREATOR_BONUS', 'REFUND_CLAWBACK');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'READY', 'EXECUTING', 'COMPLETED', 'FAILED', 'REVERSED');

-- CreateEnum
CREATE TYPE "RefundReason" AS ENUM ('DEFECTIVE', 'WRONG_ITEM', 'NOT_AS_DESCRIBED', 'DAMAGED_IN_TRANSIT', 'CHANGED_MIND', 'COMPLIANCE_FAILURE', 'OTHER');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "DisputeStatus" AS ENUM ('NEEDS_RESPONSE', 'UNDER_REVIEW', 'CHARGE_REFUNDED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "ClawbackStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'EXECUTED', 'WAIVED');

-- CreateEnum
CREATE TYPE "CartStatus" AS ENUM ('ACTIVE', 'CHECKING_OUT', 'CONVERTED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "SocialPlatform" AS ENUM ('INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'PINTEREST', 'X', 'FACEBOOK');

-- CreateEnum
CREATE TYPE "ProductIngredientSource" AS ENUM ('TEMPLATE_BASE', 'TEMPLATE_REPLACEMENT', 'TEMPLATE_OPTIONAL');

-- CreateEnum
CREATE TYPE "ProductTemplateStatus" AS ENUM ('DRAFT', 'UNDER_REVIEW', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PackingType" AS ENUM ('SINGLE_FLAVOR_SINGLE_PACK', 'SINGLE_FLAVOR_MULTIPACK', 'MULTI_FLAVOR_MIXED_PACK', 'MULTI_FLAVOR_COMPARTMENT_PACK', 'MULTI_FLAVOR_INDIVIDUAL_IN_OUTER', 'CUSTOMIZABLE_PICK_N', 'SAMPLER_MINI', 'SUBSCRIPTION_ROTATING', 'GIFT_PREMIUM', 'VALUE_BULK_SINGLE', 'VALUE_BULK_VARIETY', 'SEASONAL_LIMITED', 'PAIRING_FUNCTIONAL', 'RETAIL_COUNTER_DISPLAY', 'REFILL_ECO');

-- CreateEnum
CREATE TYPE "FlavorArrangement" AS ENUM ('SINGLE', 'MIXED', 'SEPARATED');

-- CreateTable
CREATE TABLE "Market" (
    "id" STRING NOT NULL,
    "code" STRING NOT NULL,
    "name" STRING NOT NULL,
    "jurisdictionAct" STRING NOT NULL,
    "currency" STRING NOT NULL DEFAULT 'USD',
    "isActive" BOOL NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Market_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformFeeConfig" (
    "id" STRING NOT NULL,
    "baseRateBp" INT4 NOT NULL,
    "floorCents" INT4 NOT NULL DEFAULT 100,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "notes" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformFeeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" STRING NOT NULL,
    "email" STRING NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" STRING,
    "image" STRING,
    "role" "UserRole" NOT NULL,
    "stripeAccountId" STRING,
    "stripeAccountStatus" "StripeAccountStatus" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" STRING NOT NULL,
    "userId" STRING NOT NULL,
    "type" STRING NOT NULL,
    "provider" STRING NOT NULL,
    "providerAccountId" STRING NOT NULL,
    "refresh_token" STRING,
    "access_token" STRING,
    "expires_at" INT4,
    "token_type" STRING,
    "scope" STRING,
    "id_token" STRING,
    "session_state" STRING,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" STRING NOT NULL,
    "sessionToken" STRING NOT NULL,
    "userId" STRING NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" STRING NOT NULL,
    "token" STRING NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "CreatorProfile" (
    "id" STRING NOT NULL,
    "userId" STRING NOT NULL,
    "handle" STRING NOT NULL,
    "displayName" STRING NOT NULL,
    "bio" STRING,
    "audienceSizeBand" STRING,
    "feeRateOverrideBp" INT4,
    "feeRateOverrideReason" STRING,
    "returnsWindowDays" INT4 NOT NULL DEFAULT 14,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreatorProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" STRING NOT NULL,
    "userId" STRING NOT NULL,
    "companyName" STRING NOT NULL,
    "legalName" STRING NOT NULL,
    "status" "PartnerStatus" NOT NULL DEFAULT 'DRAFT',
    "leadSource" STRING,
    "leadNotes" STRING,
    "websiteUrl" STRING,
    "contactPhone" STRING,
    "addressLine1" STRING,
    "addressLine2" STRING,
    "city" STRING,
    "state" STRING,
    "postalCode" STRING,
    "country" STRING NOT NULL DEFAULT 'US',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerService" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "type" "ServiceType" NOT NULL,
    "status" "ServiceStatus" NOT NULL DEFAULT 'DRAFT',
    "capabilities" JSONB NOT NULL,
    "disclosureLevel" "DisclosureLevel" NOT NULL DEFAULT 'ANONYMOUS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerClawback" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "refundId" STRING,
    "disputeId" STRING,
    "amountCents" INT4 NOT NULL,
    "reason" STRING NOT NULL,
    "status" "ClawbackStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "PartnerClawback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Brand" (
    "id" STRING NOT NULL,
    "creatorProfileId" STRING NOT NULL,
    "name" STRING NOT NULL,
    "handle" STRING NOT NULL,
    "positioning" STRING,
    "colorPrimary" STRING,
    "colorSecondary" STRING,
    "colorAccent" STRING,
    "fontDisplay" STRING,
    "fontBody" STRING,
    "logoAssetId" STRING,
    "heroAssetId" STRING,
    "voiceArchetype" "BrandArchetype",
    "voiceFormality" INT4,
    "voicePlayfulness" INT4,
    "voiceWarmth" INT4,
    "voiceNotes" STRING,
    "audienceAgeMin" INT4,
    "audienceAgeMax" INT4,
    "audienceInterests" JSONB,
    "audienceValues" JSONB,
    "tagline" STRING,
    "aboutText" STRING,
    "isActive" BOOL NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialAccount" (
    "id" STRING NOT NULL,
    "brandId" STRING NOT NULL,
    "platform" "SocialPlatform" NOT NULL,
    "externalUserId" STRING NOT NULL,
    "handle" STRING NOT NULL,
    "accessTokenRef" STRING NOT NULL,
    "refreshTokenRef" STRING,
    "scope" STRING NOT NULL,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SocialAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ingredient" (
    "id" STRING NOT NULL,
    "usdaFdcId" STRING,
    "name" STRING NOT NULL,
    "nutritionPer100g" JSONB NOT NULL,
    "category" STRING,
    "isOrganic" BOOL NOT NULL DEFAULT false,
    "allergens" STRING[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Ingredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recipe" (
    "id" STRING NOT NULL,
    "productId" STRING NOT NULL,
    "status" "RecipeStatus" NOT NULL DEFAULT 'DRAFT',
    "servingsPerContainer" DECIMAL(65,30) NOT NULL,
    "servingSizeG" DECIMAL(65,30) NOT NULL,
    "servingSizeDesc" STRING,
    "nutritionProfile" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecipeIngredient" (
    "id" STRING NOT NULL,
    "recipeId" STRING NOT NULL,
    "ingredientId" STRING NOT NULL,
    "weightG" DECIMAL(65,30) NOT NULL,
    "position" INT4 NOT NULL,
    "source" "ProductIngredientSource",
    "filledSlotId" STRING,

    CONSTRAINT "RecipeIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" STRING NOT NULL,
    "brandId" STRING NOT NULL,
    "marketId" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING,
    "category" "ProductCategory" NOT NULL,
    "status" "ProductStatus" NOT NULL DEFAULT 'DRAFT',
    "priceCents" INT4 NOT NULL DEFAULT 0,
    "featured" BOOL NOT NULL DEFAULT false,
    "displayOrder" INT4 NOT NULL DEFAULT 0,
    "inventoryAvailable" INT4,
    "disclosureLevelOverride" "DisclosureLevel",
    "primaryImageAssetId" STRING,
    "productTemplateId" STRING,
    "variantId" STRING,
    "publishedToStorefront" BOOL NOT NULL DEFAULT false,
    "inventoryOrderQty" INT4,
    "templateId" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulePack" (
    "id" STRING NOT NULL,
    "externalId" STRING NOT NULL,
    "marketId" STRING NOT NULL,
    "productCategory" "ProductCategory" NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING,
    "isActive" BOOL NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RulePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RulePackVersion" (
    "id" STRING NOT NULL,
    "rulePackId" STRING NOT NULL,
    "version" STRING NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "fileRef" STRING NOT NULL,
    "status" "RulePackStatus" NOT NULL DEFAULT 'PUBLISHED',
    "changesSummary" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RulePackVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceCheck" (
    "id" STRING NOT NULL,
    "recipeId" STRING NOT NULL,
    "rulePackVersionId" STRING NOT NULL,
    "inputsHash" STRING NOT NULL,
    "outcome" "ComplianceCheckOutcome" NOT NULL,
    "violations" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "disclosures" JSONB NOT NULL,
    "panelData" JSONB NOT NULL,
    "triggeredByUserId" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComplianceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" STRING NOT NULL,
    "brandId" STRING NOT NULL,
    "name" STRING NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "dieCutTemplateId" STRING NOT NULL,
    "origLibraryItemId" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateVersion" (
    "id" STRING NOT NULL,
    "templateId" STRING NOT NULL,
    "version" INT4 NOT NULL,
    "designJson" JSONB NOT NULL,
    "source" "AssetSource" NOT NULL DEFAULT 'USER_UPLOAD',
    "generationMeta" JSONB,
    "lastComplianceCheckId" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Design" (
    "id" STRING NOT NULL,
    "productId" STRING NOT NULL,
    "brandId" STRING NOT NULL,
    "templateVersionId" STRING,
    "status" "DesignStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Design_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DesignVersion" (
    "id" STRING NOT NULL,
    "designId" STRING NOT NULL,
    "version" INT4 NOT NULL,
    "designJson" JSONB NOT NULL,
    "source" "AssetSource" NOT NULL DEFAULT 'USER_UPLOAD',
    "generationMeta" JSONB,
    "exportedPdfAssetId" STRING,
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DesignVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DieCutTemplate" (
    "id" STRING NOT NULL,
    "name" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "category" "DieCutCategory" NOT NULL,
    "widthMm" FLOAT8 NOT NULL,
    "heightMm" FLOAT8 NOT NULL,
    "outlineSvg" STRING NOT NULL,
    "bleedMm" FLOAT8 NOT NULL DEFAULT 3.0,
    "safeAreaMm" FLOAT8 NOT NULL DEFAULT 3.0,
    "isStandard" BOOL NOT NULL DEFAULT true,
    "isActive" BOOL NOT NULL DEFAULT true,
    "model3dKey" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DieCutTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerServiceDieCut" (
    "partnerServiceId" STRING NOT NULL,
    "dieCutTemplateId" STRING NOT NULL,
    "surchargeCents" INT4,
    "leadTimeDays" INT4,
    "notes" STRING,

    CONSTRAINT "PartnerServiceDieCut_pkey" PRIMARY KEY ("partnerServiceId","dieCutTemplateId")
);

-- CreateTable
CREATE TABLE "DesignLibraryItem" (
    "id" STRING NOT NULL,
    "name" STRING NOT NULL,
    "description" STRING,
    "category" "DieCutCategory" NOT NULL,
    "dieCutTemplateId" STRING NOT NULL,
    "previewAssetId" STRING NOT NULL,
    "templateSpec" JSONB NOT NULL,
    "tags" STRING[],
    "source" "DesignLibrarySource" NOT NULL DEFAULT 'CURATED',
    "generationMeta" JSONB,
    "isActive" BOOL NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DesignLibraryItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" STRING NOT NULL,
    "ownerType" STRING NOT NULL,
    "ownerId" STRING,
    "type" "AssetType" NOT NULL,
    "source" "AssetSource" NOT NULL DEFAULT 'USER_UPLOAD',
    "generationMeta" JSONB,
    "storageKey" STRING NOT NULL,
    "publicUrl" STRING,
    "mimeType" STRING NOT NULL,
    "sizeBytes" INT4 NOT NULL,
    "widthPx" INT4,
    "heightPx" INT4,
    "isPublic" BOOL NOT NULL DEFAULT false,
    "uploadedByUserId" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" STRING NOT NULL,
    "brandId" STRING NOT NULL,
    "consumerUserId" STRING,
    "consumerEmail" STRING NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "subtotalCents" INT4 NOT NULL,
    "shippingCents" INT4 NOT NULL DEFAULT 0,
    "taxCents" INT4 NOT NULL DEFAULT 0,
    "totalCents" INT4 NOT NULL,
    "manufacturerServiceId" STRING,
    "printProviderServiceId" STRING,
    "paidAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "internalNotes" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" STRING NOT NULL,
    "orderId" STRING NOT NULL,
    "productId" STRING NOT NULL,
    "quantity" INT4 NOT NULL,
    "unitPriceCents" INT4 NOT NULL,
    "totalCents" INT4 NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderDispatch" (
    "id" STRING NOT NULL,
    "orderId" STRING NOT NULL,
    "type" "DispatchType" NOT NULL,
    "partnerServiceId" STRING NOT NULL,
    "status" "DispatchStatus" NOT NULL DEFAULT 'PENDING_ACCEPT',
    "acceptDeadlineAt" TIMESTAMP(3) NOT NULL,
    "declinedAt" TIMESTAMP(3),
    "declineReason" "DispatchDeclineReason",
    "declineNotes" STRING,
    "rerouteCount" INT4 NOT NULL DEFAULT 0,
    "shippedAt" TIMESTAMP(3),
    "trackingCarrier" STRING,
    "trackingNumber" STRING,
    "deliveredAt" TIMESTAMP(3),
    "costCents" INT4 NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Charge" (
    "id" STRING NOT NULL,
    "orderId" STRING NOT NULL,
    "stripeChargeId" STRING NOT NULL,
    "stripePaymentIntentId" STRING NOT NULL,
    "amountCents" INT4 NOT NULL,
    "currency" STRING NOT NULL DEFAULT 'usd',
    "applicationFeeCents" INT4 NOT NULL,
    "status" "ChargeStatus" NOT NULL,
    "statementDescriptor" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" STRING NOT NULL,
    "chargeId" STRING NOT NULL,
    "destinationStripeId" STRING NOT NULL,
    "destinationUserId" STRING NOT NULL,
    "destinationType" "TransferDestination" NOT NULL,
    "amountCents" INT4 NOT NULL,
    "reason" "TransferReason" NOT NULL,
    "stripeTransferId" STRING,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledFor" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "failureReason" STRING,
    "reversedByRefundId" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" STRING NOT NULL,
    "chargeId" STRING NOT NULL,
    "orderId" STRING NOT NULL,
    "stripeRefundId" STRING NOT NULL,
    "amountCents" INT4 NOT NULL,
    "reason" "RefundReason" NOT NULL,
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "initiatedByUserId" STRING NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dispute" (
    "id" STRING NOT NULL,
    "chargeId" STRING NOT NULL,
    "stripeDisputeId" STRING NOT NULL,
    "amountCents" INT4 NOT NULL,
    "reason" STRING NOT NULL,
    "status" "DisputeStatus" NOT NULL DEFAULT 'NEEDS_RESPONSE',
    "evidenceDueBy" TIMESTAMP(3) NOT NULL,
    "evidenceSubmittedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "outcome" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dispute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cart" (
    "id" STRING NOT NULL,
    "sessionToken" STRING,
    "consumerUserId" STRING,
    "brandId" STRING NOT NULL,
    "status" "CartStatus" NOT NULL DEFAULT 'ACTIVE',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CartItem" (
    "id" STRING NOT NULL,
    "cartId" STRING NOT NULL,
    "productId" STRING NOT NULL,
    "quantity" INT4 NOT NULL,
    "priceAtAddCents" INT4 NOT NULL,

    CONSTRAINT "CartItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConsumerUser" (
    "id" STRING NOT NULL,
    "email" STRING NOT NULL,
    "name" STRING,
    "emailVerifiedAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsumerUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" STRING NOT NULL,
    "externalId" STRING NOT NULL,
    "name" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "description" STRING,
    "mainCategory" STRING NOT NULL,
    "icon" STRING,
    "color" STRING,
    "displayOrder" INT4 NOT NULL DEFAULT 0,
    "isActive" BOOL NOT NULL DEFAULT true,
    "regulatoryRequirements" JSONB,
    "designRestrictions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subcategory" (
    "id" STRING NOT NULL,
    "externalId" STRING NOT NULL,
    "categoryId" STRING NOT NULL,
    "name" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "description" STRING,
    "displayOrder" INT4 NOT NULL DEFAULT 0,
    "isActive" BOOL NOT NULL DEFAULT true,
    "packagingOptions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subcategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTemplate" (
    "id" STRING NOT NULL,
    "subcategoryId" STRING NOT NULL,
    "manufacturerServiceId" STRING,
    "status" "ProductTemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "name" STRING NOT NULL,
    "description" STRING,
    "slug" STRING NOT NULL,
    "priceFloorCents" INT4 NOT NULL DEFAULT 0,
    "unitCostCents" INT4 NOT NULL DEFAULT 0,
    "imageAssetId" STRING,
    "baseNutritionSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateIngredientSlot" (
    "id" STRING NOT NULL,
    "productTemplateId" STRING NOT NULL,
    "baseIngredientId" STRING NOT NULL,
    "weightG" DECIMAL(65,30) NOT NULL,
    "displayOrder" INT4 NOT NULL DEFAULT 0,
    "allowReplacement" BOOL NOT NULL DEFAULT true,
    "label" STRING,
    "description" STRING,

    CONSTRAINT "TemplateIngredientSlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateIngredientReplacement" (
    "id" STRING NOT NULL,
    "slotId" STRING NOT NULL,
    "ingredientId" STRING NOT NULL,
    "weightGOverride" DECIMAL(65,30),
    "displayOrder" INT4 NOT NULL DEFAULT 0,
    "calloutText" STRING,

    CONSTRAINT "TemplateIngredientReplacement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateOptionalIngredient" (
    "id" STRING NOT NULL,
    "productTemplateId" STRING NOT NULL,
    "ingredientId" STRING NOT NULL,
    "weightG" DECIMAL(65,30) NOT NULL,
    "displayOrder" INT4 NOT NULL DEFAULT 0,
    "calloutText" STRING,

    CONSTRAINT "TemplateOptionalIngredient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTemplateVariant" (
    "id" STRING NOT NULL,
    "productTemplateId" STRING NOT NULL,
    "flavor" STRING,
    "containerFormat" STRING NOT NULL,
    "containerSizeG" DECIMAL(65,30),
    "servingsPerContainer" INT4 NOT NULL,
    "servingSizeG" DECIMAL(65,30) NOT NULL,
    "servingSizeDesc" STRING,
    "packingType" "PackingType" NOT NULL DEFAULT 'SINGLE_FLAVOR_SINGLE_PACK',
    "flavorArrangement" "FlavorArrangement" NOT NULL DEFAULT 'SINGLE',
    "innerPacksPerOuter" INT4 NOT NULL DEFAULT 1,
    "outerPacksPerCase" INT4 NOT NULL DEFAULT 1,
    "customerPicksCount" INT4,
    "subscriptionInterval" STRING,
    "assortmentFlavors" JSONB,
    "packingConfig" JSONB,
    "moqMin" INT4 NOT NULL DEFAULT 500,
    "moqMax" INT4 NOT NULL DEFAULT 5000,
    "leadTimeDays" INT4 NOT NULL DEFAULT 28,
    "unitCostCentsOverride" INT4,
    "dieCutTemplateId" STRING,
    "isActive" BOOL NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTemplateVariant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Market_code_key" ON "Market"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_stripeAccountId_key" ON "User"("stripeAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_userId_key" ON "CreatorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CreatorProfile_handle_key" ON "CreatorProfile"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_userId_key" ON "Partner"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerService_partnerId_type_key" ON "PartnerService"("partnerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Brand_handle_key" ON "Brand"("handle");

-- CreateIndex
CREATE UNIQUE INDEX "SocialAccount_brandId_platform_key" ON "SocialAccount"("brandId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "Ingredient_usdaFdcId_key" ON "Ingredient"("usdaFdcId");

-- CreateIndex
CREATE INDEX "Ingredient_name_idx" ON "Ingredient"("name");

-- CreateIndex
CREATE INDEX "Ingredient_usdaFdcId_idx" ON "Ingredient"("usdaFdcId");

-- CreateIndex
CREATE UNIQUE INDEX "Recipe_productId_key" ON "Recipe"("productId");

-- CreateIndex
CREATE UNIQUE INDEX "RecipeIngredient_recipeId_ingredientId_key" ON "RecipeIngredient"("recipeId", "ingredientId");

-- CreateIndex
CREATE INDEX "Product_brandId_status_idx" ON "Product"("brandId", "status");

-- CreateIndex
CREATE INDEX "Product_productTemplateId_idx" ON "Product"("productTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_brandId_slug_key" ON "Product"("brandId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "RulePack_externalId_key" ON "RulePack"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "RulePack_marketId_productCategory_key" ON "RulePack"("marketId", "productCategory");

-- CreateIndex
CREATE UNIQUE INDEX "RulePackVersion_rulePackId_version_key" ON "RulePackVersion"("rulePackId", "version");

-- CreateIndex
CREATE INDEX "ComplianceCheck_recipeId_idx" ON "ComplianceCheck"("recipeId");

-- CreateIndex
CREATE INDEX "ComplianceCheck_rulePackVersionId_idx" ON "ComplianceCheck"("rulePackVersionId");

-- CreateIndex
CREATE INDEX "ComplianceCheck_inputsHash_idx" ON "ComplianceCheck"("inputsHash");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateVersion_templateId_version_key" ON "TemplateVersion"("templateId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DesignVersion_designId_version_key" ON "DesignVersion"("designId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "DieCutTemplate_slug_key" ON "DieCutTemplate"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_storageKey_key" ON "Asset"("storageKey");

-- CreateIndex
CREATE INDEX "Asset_ownerType_ownerId_idx" ON "Asset"("ownerType", "ownerId");

-- CreateIndex
CREATE INDEX "Asset_type_idx" ON "Asset"("type");

-- CreateIndex
CREATE INDEX "Order_brandId_status_idx" ON "Order"("brandId", "status");

-- CreateIndex
CREATE INDEX "Order_consumerEmail_idx" ON "Order"("consumerEmail");

-- CreateIndex
CREATE INDEX "OrderDispatch_orderId_idx" ON "OrderDispatch"("orderId");

-- CreateIndex
CREATE INDEX "OrderDispatch_partnerServiceId_status_idx" ON "OrderDispatch"("partnerServiceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_orderId_key" ON "Charge"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Charge_stripeChargeId_key" ON "Charge"("stripeChargeId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_stripeTransferId_key" ON "Transfer"("stripeTransferId");

-- CreateIndex
CREATE INDEX "Transfer_status_scheduledFor_idx" ON "Transfer"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "Transfer_chargeId_idx" ON "Transfer"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_stripeRefundId_key" ON "Refund"("stripeRefundId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_chargeId_key" ON "Dispute"("chargeId");

-- CreateIndex
CREATE UNIQUE INDEX "Dispute_stripeDisputeId_key" ON "Dispute"("stripeDisputeId");

-- CreateIndex
CREATE UNIQUE INDEX "Cart_sessionToken_key" ON "Cart"("sessionToken");

-- CreateIndex
CREATE INDEX "Cart_sessionToken_idx" ON "Cart"("sessionToken");

-- CreateIndex
CREATE INDEX "Cart_status_expiresAt_idx" ON "Cart"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "CartItem_cartId_productId_key" ON "CartItem"("cartId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ConsumerUser_email_key" ON "ConsumerUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Category_externalId_key" ON "Category"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_externalId_key" ON "Subcategory"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Subcategory_slug_key" ON "Subcategory"("slug");

-- CreateIndex
CREATE INDEX "Subcategory_categoryId_idx" ON "Subcategory"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductTemplate_slug_key" ON "ProductTemplate"("slug");

-- CreateIndex
CREATE INDEX "ProductTemplate_subcategoryId_status_idx" ON "ProductTemplate"("subcategoryId", "status");

-- CreateIndex
CREATE INDEX "TemplateIngredientSlot_productTemplateId_idx" ON "TemplateIngredientSlot"("productTemplateId");

-- CreateIndex
CREATE INDEX "TemplateIngredientReplacement_slotId_idx" ON "TemplateIngredientReplacement"("slotId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateIngredientReplacement_slotId_ingredientId_key" ON "TemplateIngredientReplacement"("slotId", "ingredientId");

-- CreateIndex
CREATE INDEX "TemplateOptionalIngredient_productTemplateId_idx" ON "TemplateOptionalIngredient"("productTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "TemplateOptionalIngredient_productTemplateId_ingredientId_key" ON "TemplateOptionalIngredient"("productTemplateId", "ingredientId");

-- CreateIndex
CREATE INDEX "ProductTemplateVariant_productTemplateId_isActive_idx" ON "ProductTemplateVariant"("productTemplateId", "isActive");

-- CreateIndex
CREATE INDEX "ProductTemplateVariant_packingType_idx" ON "ProductTemplateVariant"("packingType");

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreatorProfile" ADD CONSTRAINT "CreatorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerService" ADD CONSTRAINT "PartnerService_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerClawback" ADD CONSTRAINT "PartnerClawback_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerClawback" ADD CONSTRAINT "PartnerClawback_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerClawback" ADD CONSTRAINT "PartnerClawback_disputeId_fkey" FOREIGN KEY ("disputeId") REFERENCES "Dispute"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Brand" ADD CONSTRAINT "Brand_creatorProfileId_fkey" FOREIGN KEY ("creatorProfileId") REFERENCES "CreatorProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recipe" ADD CONSTRAINT "Recipe_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecipeIngredient" ADD CONSTRAINT "RecipeIngredient_filledSlotId_fkey" FOREIGN KEY ("filledSlotId") REFERENCES "TemplateIngredientSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductTemplateVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RulePack" ADD CONSTRAINT "RulePack_marketId_fkey" FOREIGN KEY ("marketId") REFERENCES "Market"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RulePackVersion" ADD CONSTRAINT "RulePackVersion_rulePackId_fkey" FOREIGN KEY ("rulePackId") REFERENCES "RulePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "Recipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_rulePackVersionId_fkey" FOREIGN KEY ("rulePackVersionId") REFERENCES "RulePackVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceCheck" ADD CONSTRAINT "ComplianceCheck_triggeredByUserId_fkey" FOREIGN KEY ("triggeredByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_dieCutTemplateId_fkey" FOREIGN KEY ("dieCutTemplateId") REFERENCES "DieCutTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_origLibraryItemId_fkey" FOREIGN KEY ("origLibraryItemId") REFERENCES "DesignLibraryItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateVersion" ADD CONSTRAINT "TemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "TemplateVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignVersion" ADD CONSTRAINT "DesignVersion_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerServiceDieCut" ADD CONSTRAINT "PartnerServiceDieCut_partnerServiceId_fkey" FOREIGN KEY ("partnerServiceId") REFERENCES "PartnerService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerServiceDieCut" ADD CONSTRAINT "PartnerServiceDieCut_dieCutTemplateId_fkey" FOREIGN KEY ("dieCutTemplateId") REFERENCES "DieCutTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DesignLibraryItem" ADD CONSTRAINT "DesignLibraryItem_dieCutTemplateId_fkey" FOREIGN KEY ("dieCutTemplateId") REFERENCES "DieCutTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDispatch" ADD CONSTRAINT "OrderDispatch_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderDispatch" ADD CONSTRAINT "OrderDispatch_partnerServiceId_fkey" FOREIGN KEY ("partnerServiceId") REFERENCES "PartnerService"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Charge" ADD CONSTRAINT "Charge_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_destinationUserId_fkey" FOREIGN KEY ("destinationUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_reversedByRefundId_fkey" FOREIGN KEY ("reversedByRefundId") REFERENCES "Refund"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_initiatedByUserId_fkey" FOREIGN KEY ("initiatedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dispute" ADD CONSTRAINT "Dispute_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "Charge"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_consumerUserId_fkey" FOREIGN KEY ("consumerUserId") REFERENCES "ConsumerUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cart" ADD CONSTRAINT "Cart_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CartItem" ADD CONSTRAINT "CartItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subcategory" ADD CONSTRAINT "Subcategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplate" ADD CONSTRAINT "ProductTemplate_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplate" ADD CONSTRAINT "ProductTemplate_manufacturerServiceId_fkey" FOREIGN KEY ("manufacturerServiceId") REFERENCES "PartnerService"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateIngredientSlot" ADD CONSTRAINT "TemplateIngredientSlot_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateIngredientSlot" ADD CONSTRAINT "TemplateIngredientSlot_baseIngredientId_fkey" FOREIGN KEY ("baseIngredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateIngredientReplacement" ADD CONSTRAINT "TemplateIngredientReplacement_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "TemplateIngredientSlot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateIngredientReplacement" ADD CONSTRAINT "TemplateIngredientReplacement_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateOptionalIngredient" ADD CONSTRAINT "TemplateOptionalIngredient_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateOptionalIngredient" ADD CONSTRAINT "TemplateOptionalIngredient_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "Ingredient"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplateVariant" ADD CONSTRAINT "ProductTemplateVariant_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplateVariant" ADD CONSTRAINT "ProductTemplateVariant_dieCutTemplateId_fkey" FOREIGN KEY ("dieCutTemplateId") REFERENCES "DieCutTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
