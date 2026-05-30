-- REBUILD R15.a — Partner tier + admin-editable subscription plans
--
-- Three additive pieces:
--   1. PartnerTier enum + Partner.tier (default VERIFIED) + change tracking
--      + per-partner commission override mirroring CreatorProfile.
--   2. tierChangedAt + tierChangedById on CreatorProfile for symmetry.
--   3. The §Tier 1 admin-editable trio — SubscriptionPlan, PlanFeature,
--      FeeRule + PlanAudience enum. Plans + fee rates become DB-driven
--      so admin can edit without a deploy. Tier remains the canonical
--      column on profile rows; plans describe what each tier means.

-- 1. Partner tier enum
CREATE TYPE "PartnerTier" AS ENUM ('VERIFIED', 'TRUSTED', 'PREMIER');

-- 2. Partner additions
ALTER TABLE "Partner"
  ADD COLUMN "tier"                  "PartnerTier" NOT NULL DEFAULT 'VERIFIED',
  ADD COLUMN "tierChangedAt"         TIMESTAMP(3),
  ADD COLUMN "tierChangedById"       STRING,
  ADD COLUMN "feeRateOverrideBp"     INT4,
  ADD COLUMN "feeRateOverrideReason" STRING;

-- 3. CreatorProfile change-tracking parity
ALTER TABLE "CreatorProfile"
  ADD COLUMN "tierChangedAt"   TIMESTAMP(3),
  ADD COLUMN "tierChangedById" STRING;

-- 4. PlanAudience enum
CREATE TYPE "PlanAudience" AS ENUM ('CREATOR', 'PARTNER');

-- 5. SubscriptionPlan — admin-editable per-tier plan row
CREATE TABLE "SubscriptionPlan" (
  "id"                STRING        NOT NULL,
  "code"              STRING        NOT NULL,
  "audience"          "PlanAudience" NOT NULL,
  "tierName"          STRING        NOT NULL,
  "tierOrder"         INT4          NOT NULL,
  "monthlyPriceCents" INT4          NOT NULL DEFAULT 0,
  "annualPriceCents"  INT4          NOT NULL DEFAULT 0,
  "active"            BOOL          NOT NULL DEFAULT true,
  "description"       STRING,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "SubscriptionPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubscriptionPlan_code_key" ON "SubscriptionPlan"("code");
CREATE INDEX "SubscriptionPlan_audience_tierOrder_idx" ON "SubscriptionPlan"("audience", "tierOrder");

-- 6. PlanFeature — per-plan feature row (tagged union: int | string | bool)
CREATE TABLE "PlanFeature" (
  "id"          STRING       NOT NULL,
  "planId"      STRING       NOT NULL,
  "code"        STRING       NOT NULL,
  "intValue"    INT4,
  "stringValue" STRING,
  "boolValue"   BOOL,
  "label"       STRING       NOT NULL,
  "description" STRING,

  CONSTRAINT "PlanFeature_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PlanFeature_planId_fkey" FOREIGN KEY ("planId")
    REFERENCES "SubscriptionPlan"("id") ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE UNIQUE INDEX "PlanFeature_planId_code_key" ON "PlanFeature"("planId", "code");
CREATE INDEX "PlanFeature_code_idx" ON "PlanFeature"("code");

-- 7. FeeRule — pluggable fee-rate row keyed by (planId, triggerEvent)
CREATE TABLE "FeeRule" (
  "id"           STRING        NOT NULL,
  "planId"       STRING,
  "triggerEvent" STRING        NOT NULL,
  "ratePercent"  DECIMAL(5,2),
  "flatCents"    INT4,
  "minCents"     INT4,
  "maxCents"     INT4,
  "active"       BOOL          NOT NULL DEFAULT true,
  "notes"        STRING,
  "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)  NOT NULL,

  CONSTRAINT "FeeRule_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "FeeRule_planId_fkey" FOREIGN KEY ("planId")
    REFERENCES "SubscriptionPlan"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX "FeeRule_planId_triggerEvent_idx" ON "FeeRule"("planId", "triggerEvent");
CREATE INDEX "FeeRule_triggerEvent_idx" ON "FeeRule"("triggerEvent");
