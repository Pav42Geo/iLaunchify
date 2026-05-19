-- CreateEnum
CREATE TYPE "VerificationSectionType" AS ENUM ('BUSINESS', 'FACILITY', 'DOCUMENTS', 'PUBLIC_PROFILE');

-- CreateEnum
CREATE TYPE "VerificationSectionStatus" AS ENUM ('PENDING', 'VERIFIED', 'NEEDS_CHANGES', 'REJECTED');

-- CreateEnum
CREATE TYPE "PartnerFileKind" AS ENUM ('CERTIFICATE', 'BUSINESS_LICENSE', 'INSURANCE', 'FACILITY_PHOTO', 'LOGO', 'KYB_ID', 'CERT_OF_INCORPORATION', 'PRODUCT_SAMPLE', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditActorRole" AS ENUM ('ADMIN', 'CREATOR', 'PARTNER', 'SYSTEM');

-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "onboardingProgress" JSONB;

-- CreateTable
CREATE TABLE "PartnerVerificationSection" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "type" "VerificationSectionType" NOT NULL,
    "status" "VerificationSectionStatus" NOT NULL DEFAULT 'PENDING',
    "adminNotes" STRING,
    "verifiedAt" TIMESTAMP(3),
    "verifiedById" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerVerificationSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerFile" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "sectionType" "VerificationSectionType" NOT NULL,
    "sectionId" STRING,
    "kind" "PartnerFileKind" NOT NULL,
    "r2Key" STRING NOT NULL,
    "originalFilename" STRING NOT NULL,
    "contentType" STRING NOT NULL,
    "sizeBytes" INT4 NOT NULL,
    "uploadedById" STRING NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" STRING NOT NULL,
    "actorId" STRING,
    "actorRole" "AuditActorRole" NOT NULL,
    "entityType" STRING NOT NULL,
    "entityId" STRING NOT NULL,
    "action" STRING NOT NULL,
    "fromValue" STRING,
    "toValue" STRING,
    "payload" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerVerificationSection_status_idx" ON "PartnerVerificationSection"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerVerificationSection_partnerId_type_key" ON "PartnerVerificationSection"("partnerId", "type");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerFile_r2Key_key" ON "PartnerFile"("r2Key");

-- CreateIndex
CREATE INDEX "PartnerFile_partnerId_sectionType_idx" ON "PartnerFile"("partnerId", "sectionType");

-- CreateIndex
CREATE INDEX "PartnerFile_partnerId_kind_idx" ON "PartnerFile"("partnerId", "kind");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_at_idx" ON "AuditLog"("entityType", "entityId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_at_idx" ON "AuditLog"("actorId", "at");

-- CreateIndex
CREATE INDEX "AuditLog_at_idx" ON "AuditLog"("at");

-- AddForeignKey
ALTER TABLE "PartnerVerificationSection" ADD CONSTRAINT "PartnerVerificationSection_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerVerificationSection" ADD CONSTRAINT "PartnerVerificationSection_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFile" ADD CONSTRAINT "PartnerFile_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFile" ADD CONSTRAINT "PartnerFile_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "PartnerVerificationSection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerFile" ADD CONSTRAINT "PartnerFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
