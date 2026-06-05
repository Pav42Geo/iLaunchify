-- CreateEnum
CREATE TYPE "MandatoryPhraseCategory" AS ENUM ('ALLERGEN', 'DISCLAIMER', 'WARNING', 'IDENTITY', 'DIRECTIONS', 'OTHER');

-- CreateTable
CREATE TABLE "MandatoryPhrase" (
    "id" STRING NOT NULL,
    "slug" STRING NOT NULL,
    "title" STRING NOT NULL,
    "body" STRING NOT NULL,
    "category" "MandatoryPhraseCategory" NOT NULL,
    "labelingTypes" STRING[],
    "cfrCitation" STRING,
    "appliesWhen" STRING,
    "isActive" BOOL NOT NULL DEFAULT true,
    "displayOrder" INT4 NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MandatoryPhrase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MandatoryPhrase_slug_key" ON "MandatoryPhrase"("slug");

-- CreateIndex
CREATE INDEX "MandatoryPhrase_isActive_displayOrder_idx" ON "MandatoryPhrase"("isActive", "displayOrder");
