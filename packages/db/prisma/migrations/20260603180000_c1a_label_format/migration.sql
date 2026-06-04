-- CreateEnum
CREATE TYPE "LabelFormat" AS ENUM ('FDA_VERTICAL', 'FDA_TABULAR', 'FDA_LINEAR', 'FDA_AS_PACKAGED_AS_PREPARED', 'FDA_AGGREGATE', 'FDA_INFANT', 'FDA_CHILD', 'FDA_100_GRAMS', 'FDA_SUPPLEMENT', 'FDA_DRUG_FACTS', 'AAFCO_PET_FOOD', 'AAFCO_PET_TREAT', 'CANADIAN_VERTICAL', 'CANADIAN_LINEAR', 'CANADIAN_HORIZONTAL', 'CANADIAN_AGGREGATE', 'CANADIAN_100_GRAMS', 'USDA_OLD_FDA_VERTICAL', 'USDA_OLD_FDA_TABULAR', 'USDA_OLD_FDA_LINEAR');

-- CreateEnum
CREATE TYPE "PanelOrientation" AS ENUM ('VERTICAL', 'HORIZONTAL', 'TABULAR', 'LINEAR');

-- CreateTable
CREATE TABLE "LabelFormatRule" (
    "format" "LabelFormat" NOT NULL,
    "labelingType" "LabelingType" NOT NULL,
    "cfrCitation" STRING NOT NULL,
    "minSurfaceAreaSqIn" DECIMAL(8,3) NOT NULL,
    "minLabelWidthMm" DECIMAL(8,2) NOT NULL,
    "minLabelHeightMm" DECIMAL(8,2) NOT NULL,
    "minFontSizePt" DECIMAL(5,2) NOT NULL,
    "minHeaderFontSizePt" DECIMAL(5,2) NOT NULL,
    "supportsMultiColumn" BOOL NOT NULL DEFAULT false,
    "supportsAggregate" BOOL NOT NULL DEFAULT false,
    "supportsDualColumn" BOOL NOT NULL DEFAULT false,
    "panelOrientation" "PanelOrientation" NOT NULL,
    "preferenceScore" INT4 NOT NULL DEFAULT 50,
    "notes" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LabelFormatRule_pkey" PRIMARY KEY ("format","labelingType")
);

-- CreateIndex
CREATE INDEX "LabelFormatRule_labelingType_idx" ON "LabelFormatRule"("labelingType");
