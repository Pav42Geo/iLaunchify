-- 2026-06-02 V1.1 marketplace taxonomy — additive only.
-- Adds Layer 4 LifestyleTag + ProductTemplateLifestyleTag, the Niche ↔
-- Subcategory junction (NicheSubcategory), the NicheRule auto-assignment
-- engine, and the NicheAssignmentAudit log.
-- CockroachDB dialect.

-- ===== Enums =====

CREATE TYPE "LifestyleTagGroup" AS ENUM ('LIFESTYLE', 'AUDIENCE', 'TREND');

CREATE TYPE "NicheRuleConditionKind" AS ENUM (
  'LABELING_TYPE',
  'CATEGORY',
  'SUBCATEGORY',
  'CERT_ATTACHED',
  'LIFESTYLE_TAG'
);

CREATE TYPE "NicheAssignmentSource" AS ENUM ('AUTO_RULE', 'MANUFACTURER', 'ADMIN');

-- ===== LifestyleTag =====

CREATE TABLE "LifestyleTag" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "name" STRING NOT NULL,
    "group" "LifestyleTagGroup" NOT NULL,
    "description" STRING,
    "iconEmoji" STRING,
    "accentHex" STRING,
    "displayOrder" INT4 NOT NULL DEFAULT 0,
    "isActive" BOOL NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LifestyleTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "LifestyleTag_slug_key" ON "LifestyleTag"("slug");
CREATE INDEX "LifestyleTag_group_displayOrder_idx" ON "LifestyleTag"("group", "displayOrder");

-- ===== ProductTemplateLifestyleTag junction =====

CREATE TABLE "ProductTemplateLifestyleTag" (
    "productTemplateId" STRING NOT NULL,
    "lifestyleTagId" STRING NOT NULL,
    "source" "NicheAssignmentSource" NOT NULL DEFAULT 'MANUFACTURER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTemplateLifestyleTag_pkey" PRIMARY KEY ("productTemplateId", "lifestyleTagId")
);

ALTER TABLE "ProductTemplateLifestyleTag"
  ADD CONSTRAINT "ProductTemplateLifestyleTag_productTemplateId_fkey"
  FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductTemplateLifestyleTag"
  ADD CONSTRAINT "ProductTemplateLifestyleTag_lifestyleTagId_fkey"
  FOREIGN KEY ("lifestyleTagId") REFERENCES "LifestyleTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== NicheSubcategory junction (Option A — Layer 2 canonical) =====

CREATE TABLE "NicheSubcategory" (
    "nicheId" STRING NOT NULL,
    "subcategoryId" STRING NOT NULL,
    "displayOrder" INT4 NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NicheSubcategory_pkey" PRIMARY KEY ("nicheId", "subcategoryId")
);

CREATE INDEX "NicheSubcategory_nicheId_displayOrder_idx" ON "NicheSubcategory"("nicheId", "displayOrder");

ALTER TABLE "NicheSubcategory"
  ADD CONSTRAINT "NicheSubcategory_nicheId_fkey"
  FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NicheSubcategory"
  ADD CONSTRAINT "NicheSubcategory_subcategoryId_fkey"
  FOREIGN KEY ("subcategoryId") REFERENCES "Subcategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== NicheRule (deterministic auto-assignment engine) =====

CREATE TABLE "NicheRule" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "nicheId" STRING NOT NULL,
    "description" STRING NOT NULL,
    "isActive" BOOL NOT NULL DEFAULT true,
    "isLocked" BOOL NOT NULL DEFAULT false,
    "weight" INT4 NOT NULL DEFAULT 50,
    "conditions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NicheRule_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NicheRule_slug_key" ON "NicheRule"("slug");
CREATE INDEX "NicheRule_nicheId_isActive_idx" ON "NicheRule"("nicheId", "isActive");

ALTER TABLE "NicheRule"
  ADD CONSTRAINT "NicheRule_nicheId_fkey"
  FOREIGN KEY ("nicheId") REFERENCES "Niche"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ===== NicheAssignmentAudit =====

CREATE TABLE "NicheAssignmentAudit" (
    "id" STRING NOT NULL,
    "productTemplateId" STRING NOT NULL,
    "nicheId" STRING NOT NULL,
    "source" "NicheAssignmentSource" NOT NULL,
    "ruleId" STRING,
    "actorUserId" STRING,
    "applied" BOOL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NicheAssignmentAudit_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NicheAssignmentAudit_productTemplateId_createdAt_idx"
  ON "NicheAssignmentAudit"("productTemplateId", "createdAt");
