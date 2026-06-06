-- CreateEnum
CREATE TYPE "FileFormat" AS ENUM ('PDF_X1A', 'PDF_X4', 'TIFF', 'EPS_AI');

-- CreateEnum
CREATE TYPE "ColorSpace" AS ENUM ('CMYK', 'RGB', 'CMYK_OGV', 'GRAYSCALE');

-- CreateEnum
CREATE TYPE "FontPolicy" AS ENUM ('EMBED', 'OUTLINE_TO_PATHS', 'EITHER');

-- CreateEnum
CREATE TYPE "DielineDelivery" AS ENUM ('SEPARATE_FILE', 'LAYERED_IN_PDF', 'BOTH');

-- CreateEnum
CREATE TYPE "ManifestFormat" AS ENUM ('JSON_STANDARD', 'CUSTOM_XML', 'NONE');

-- CreateEnum
CREATE TYPE "PmsBook" AS ENUM ('COATED', 'UNCOATED', 'MATTE', 'NEON', 'METALLIC', 'PASTEL');

-- CreateTable
CREATE TABLE "PartnerPrintOutputSpec" (
    "id" STRING NOT NULL,
    "partnerServiceId" STRING NOT NULL,
    "preferredFileFormat" "FileFormat" NOT NULL DEFAULT 'PDF_X4',
    "colorSpace" "ColorSpace" NOT NULL DEFAULT 'CMYK',
    "iccProfile" STRING,
    "tacLimitPct" INT4 NOT NULL DEFAULT 300,
    "spotColorsAccepted" BOOL NOT NULL DEFAULT true,
    "spotColorLibrary" "PmsBook" NOT NULL DEFAULT 'COATED',
    "specialChannelNaming" JSONB NOT NULL DEFAULT '{}',
    "minDpi" INT4 NOT NULL DEFAULT 300,
    "bleedMm" DECIMAL(5,2) NOT NULL DEFAULT 3.0,
    "fontPolicy" "FontPolicy" NOT NULL DEFAULT 'EMBED',
    "dielineDeliveryFormat" "DielineDelivery" NOT NULL DEFAULT 'SEPARATE_FILE',
    "dielineLayerName" STRING,
    "defaultSubstrateId" STRING,
    "manifestFormat" "ManifestFormat" NOT NULL DEFAULT 'JSON_STANDARD',
    "exportInstructions" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerPrintOutputSpec_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartnerPrintOutputSpec_partnerServiceId_key" ON "PartnerPrintOutputSpec"("partnerServiceId");

-- AddForeignKey
ALTER TABLE "PartnerPrintOutputSpec" ADD CONSTRAINT "PartnerPrintOutputSpec_partnerServiceId_fkey" FOREIGN KEY ("partnerServiceId") REFERENCES "PartnerService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPrintOutputSpec" ADD CONSTRAINT "PartnerPrintOutputSpec_defaultSubstrateId_fkey" FOREIGN KEY ("defaultSubstrateId") REFERENCES "Substrate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
