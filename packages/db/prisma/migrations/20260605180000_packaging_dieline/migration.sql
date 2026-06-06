-- CreateEnum
CREATE TYPE "DielineFileFormat" AS ENUM ('AI', 'PDF', 'SVG', 'DXF');

-- CreateEnum
CREATE TYPE "DielineStatus" AS ENUM ('UPLOADED', 'PARSED', 'PARTNER_CONFIRMED', 'ADMIN_VERIFIED', 'ACTIVE', 'ARCHIVED');

-- CreateTable
CREATE TABLE "PackagingDieline" (
    "id" STRING NOT NULL,
    "partnerServiceId" STRING NOT NULL,
    "packagingTypeId" STRING NOT NULL,
    "decorationMethod" "DecorationMethod" NOT NULL,
    "partnerFileId" STRING,
    "originalFileFormat" "DielineFileFormat",
    "widthMm" DECIMAL(10,3),
    "heightMm" DECIMAL(10,3),
    "depthMm" DECIMAL(10,3),
    "bleedMm" DECIMAL(10,3) NOT NULL DEFAULT 3.0,
    "trimBox" JSONB,
    "safeAreaBox" JSONB,
    "foldLines" JSONB,
    "surfaces" JSONB,
    "normalizedSvgKey" STRING,
    "thumbnailKey" STRING,
    "parseAccuracyScore" DECIMAL(3,2),
    "adminVerifiedAt" TIMESTAMP(3),
    "adminVerifiedById" STRING,
    "status" "DielineStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partnerConfirmedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PackagingDieline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackagingDieline_partnerServiceId_packagingTypeId_decoratio_idx" ON "PackagingDieline"("partnerServiceId", "packagingTypeId", "decorationMethod");

-- CreateIndex
CREATE INDEX "PackagingDieline_status_idx" ON "PackagingDieline"("status");

-- AddForeignKey
ALTER TABLE "PartnerPackagingOffering" ADD CONSTRAINT "PartnerPackagingOffering_dielineId_fkey" FOREIGN KEY ("dielineId") REFERENCES "PackagingDieline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingDieline" ADD CONSTRAINT "PackagingDieline_partnerServiceId_fkey" FOREIGN KEY ("partnerServiceId") REFERENCES "PartnerService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingDieline" ADD CONSTRAINT "PackagingDieline_packagingTypeId_fkey" FOREIGN KEY ("packagingTypeId") REFERENCES "PackagingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PackagingDieline" ADD CONSTRAINT "PackagingDieline_partnerFileId_fkey" FOREIGN KEY ("partnerFileId") REFERENCES "PartnerFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
