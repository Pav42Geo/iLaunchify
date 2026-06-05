-- CreateEnum
CREATE TYPE "PhraseRuleConditionKind" AS ENUM ('LABELING_TYPE', 'PRODUCT_CATEGORY', 'MARKETPLACE_CATEGORY', 'ALLERGEN_PRESENT', 'BIOENGINEERED', 'INGREDIENT_MATCH', 'PACKING_TYPE', 'NUTRIENT_SOURCE', 'PRODUCT_FACT');

-- CreateEnum
CREATE TYPE "PhraseAssignmentSource" AS ENUM ('AUTO_RULE', 'MANUFACTURER', 'ADMIN');

-- AlterTable
ALTER TABLE "ProductTemplate" ADD COLUMN     "phraseFacts" JSONB;

-- CreateTable
CREATE TABLE "PhraseRule" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "mandatoryPhraseId" STRING NOT NULL,
    "description" STRING NOT NULL,
    "isActive" BOOL NOT NULL DEFAULT true,
    "isLocked" BOOL NOT NULL DEFAULT false,
    "weight" INT4 NOT NULL DEFAULT 50,
    "conditions" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhraseRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductTemplatePhrase" (
    "productTemplateId" STRING NOT NULL,
    "mandatoryPhraseId" STRING NOT NULL,
    "requirement" "PhraseRequirement" NOT NULL DEFAULT 'MANDATORY',
    "source" "PhraseAssignmentSource" NOT NULL DEFAULT 'AUTO_RULE',
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductTemplatePhrase_pkey" PRIMARY KEY ("productTemplateId","mandatoryPhraseId")
);

-- CreateTable
CREATE TABLE "PhraseAssignmentAudit" (
    "id" STRING NOT NULL,
    "productTemplateId" STRING NOT NULL,
    "mandatoryPhraseId" STRING NOT NULL,
    "source" "PhraseAssignmentSource" NOT NULL,
    "ruleId" STRING,
    "actorUserId" STRING,
    "applied" BOOL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PhraseAssignmentAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PhraseRule_slug_key" ON "PhraseRule"("slug");

-- CreateIndex
CREATE INDEX "PhraseRule_mandatoryPhraseId_isActive_idx" ON "PhraseRule"("mandatoryPhraseId", "isActive");

-- CreateIndex
CREATE INDEX "ProductTemplatePhrase_mandatoryPhraseId_idx" ON "ProductTemplatePhrase"("mandatoryPhraseId");

-- CreateIndex
CREATE INDEX "PhraseAssignmentAudit_productTemplateId_createdAt_idx" ON "PhraseAssignmentAudit"("productTemplateId", "createdAt");

-- CreateIndex
CREATE INDEX "PhraseAssignmentAudit_mandatoryPhraseId_idx" ON "PhraseAssignmentAudit"("mandatoryPhraseId");

-- AddForeignKey
ALTER TABLE "PhraseRule" ADD CONSTRAINT "PhraseRule_mandatoryPhraseId_fkey" FOREIGN KEY ("mandatoryPhraseId") REFERENCES "MandatoryPhrase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplatePhrase" ADD CONSTRAINT "ProductTemplatePhrase_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductTemplatePhrase" ADD CONSTRAINT "ProductTemplatePhrase_mandatoryPhraseId_fkey" FOREIGN KEY ("mandatoryPhraseId") REFERENCES "MandatoryPhrase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhraseAssignmentAudit" ADD CONSTRAINT "PhraseAssignmentAudit_productTemplateId_fkey" FOREIGN KEY ("productTemplateId") REFERENCES "ProductTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhraseAssignmentAudit" ADD CONSTRAINT "PhraseAssignmentAudit_mandatoryPhraseId_fkey" FOREIGN KEY ("mandatoryPhraseId") REFERENCES "MandatoryPhrase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
