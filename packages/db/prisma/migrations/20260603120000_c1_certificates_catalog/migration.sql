-- CreateEnum
CREATE TYPE "CertificateTypeRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DocumentAccessReason" AS ENUM ('VERIFICATION', 'SUPPORT', 'AUDIT', 'PARTNER_DOWNLOAD', 'LEGAL_HOLD', 'ADMIN_REVIEW');

-- CreateEnum
CREATE TYPE "CertScope" AS ENUM ('UNIVERSAL', 'PRODUCT_LEVEL', 'LABELING_SPECIFIC', 'CATEGORY_SPECIFIC', 'FACILITY_LEVEL', 'COMPANY_LEVEL');

-- AlterTable
ALTER TABLE "CertificateType" ADD COLUMN     "alternativeOfId" STRING;
ALTER TABLE "CertificateType" ADD COLUMN     "applicabilityNotes" STRING;
ALTER TABLE "CertificateType" ADD COLUMN     "applicableCategorySlugs" STRING[];
ALTER TABLE "CertificateType" ADD COLUMN     "applicableLabelingTypes" STRING[];
ALTER TABLE "CertificateType" ADD COLUMN     "applicableMarketSlugs" STRING[];
ALTER TABLE "CertificateType" ADD COLUMN     "claimCategories" STRING[];
ALTER TABLE "CertificateType" ADD COLUMN     "issuingBodyUrl" STRING;
ALTER TABLE "CertificateType" ADD COLUMN     "scope" "CertScope";

-- CreateTable
CREATE TABLE "CertificateTypeRequest" (
    "id" STRING NOT NULL,
    "createdByPartnerId" STRING NOT NULL,
    "name" STRING NOT NULL,
    "issuingBody" STRING,
    "description" STRING,
    "applicableLabelingTypes" STRING[],
    "applicableCategorySlugs" STRING[],
    "applicableMarketSlugs" STRING[],
    "status" "CertificateTypeRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" STRING,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificateTypeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAccessLog" (
    "id" STRING NOT NULL,
    "actorUserId" STRING NOT NULL,
    "fileId" STRING NOT NULL,
    "accessReason" "DocumentAccessReason" NOT NULL,
    "productTemplateId" STRING,
    "accessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAccessLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CertificateTypeRequest_status_idx" ON "CertificateTypeRequest"("status");

-- CreateIndex
CREATE INDEX "CertificateTypeRequest_createdByPartnerId_idx" ON "CertificateTypeRequest"("createdByPartnerId");

-- CreateIndex
CREATE INDEX "DocumentAccessLog_fileId_accessedAt_idx" ON "DocumentAccessLog"("fileId", "accessedAt");

-- CreateIndex
CREATE INDEX "DocumentAccessLog_actorUserId_accessedAt_idx" ON "DocumentAccessLog"("actorUserId", "accessedAt");

-- CreateIndex
CREATE INDEX "CertificateType_scope_idx" ON "CertificateType"("scope");

-- CreateIndex
CREATE INDEX "CertificateType_alternativeOfId_idx" ON "CertificateType"("alternativeOfId");

-- AddForeignKey
ALTER TABLE "CertificateType" ADD CONSTRAINT "CertificateType_alternativeOfId_fkey" FOREIGN KEY ("alternativeOfId") REFERENCES "CertificateType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificateTypeRequest" ADD CONSTRAINT "CertificateTypeRequest_createdByPartnerId_fkey" FOREIGN KEY ("createdByPartnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
