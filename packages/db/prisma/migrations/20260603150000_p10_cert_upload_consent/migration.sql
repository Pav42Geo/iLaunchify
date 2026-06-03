-- AlterTable
ALTER TABLE "PartnerCertificateInstance" ADD COLUMN     "consentAcceptedAt" TIMESTAMP(3);
ALTER TABLE "PartnerCertificateInstance" ADD COLUMN     "consentVersion" STRING;
