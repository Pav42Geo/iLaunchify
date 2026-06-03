-- CreateEnum
CREATE TYPE "PartnerDocumentStatus" AS ENUM ('PENDING_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "LabelClaimConsent" (
    "id" STRING NOT NULL,
    "userId" STRING NOT NULL,
    "productId" STRING,
    "productTemplateId" STRING,
    "designVersion" STRING,
    "partnerCertificateInstanceId" STRING,
    "certificateTypeId" STRING,
    "certName" STRING NOT NULL,
    "consentTextVersion" STRING NOT NULL,
    "ipAddress" STRING,
    "userAgent" STRING,
    "metadata" JSONB,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LabelClaimConsent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerDocument" (
    "id" STRING NOT NULL,
    "partnerId" STRING NOT NULL,
    "documentType" STRING NOT NULL,
    "fileId" STRING NOT NULL,
    "status" "PartnerDocumentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" STRING,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" STRING,
    "expiryDate" TIMESTAMP(3),
    "notes" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PartnerDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LabelClaimConsent_userId_createdAt_idx" ON "LabelClaimConsent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "LabelClaimConsent_productId_idx" ON "LabelClaimConsent"("productId");

-- CreateIndex
CREATE INDEX "LabelClaimConsent_partnerCertificateInstanceId_idx" ON "LabelClaimConsent"("partnerCertificateInstanceId");

-- CreateIndex
CREATE INDEX "PartnerDocument_partnerId_status_idx" ON "PartnerDocument"("partnerId", "status");

-- CreateIndex
CREATE INDEX "PartnerDocument_documentType_idx" ON "PartnerDocument"("documentType");

-- AddForeignKey
ALTER TABLE "PartnerDocument" ADD CONSTRAINT "PartnerDocument_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE CASCADE ON UPDATE CASCADE;
