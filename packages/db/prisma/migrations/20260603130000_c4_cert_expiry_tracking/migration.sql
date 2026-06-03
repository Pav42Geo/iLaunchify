-- AlterTable
ALTER TABLE "PartnerCertificateInstance" ADD COLUMN     "notifiedAt30d" TIMESTAMP(3);
ALTER TABLE "PartnerCertificateInstance" ADD COLUMN     "notifiedAt60d" TIMESTAMP(3);
ALTER TABLE "PartnerCertificateInstance" ADD COLUMN     "notifiedAt7d" TIMESTAMP(3);
ALTER TABLE "PartnerCertificateInstance" ADD COLUMN     "replacedById" STRING;

-- AlterTable
ALTER TABLE "ProductTemplate" ADD COLUMN     "certRefreshNeededAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "PartnerCertificateInstance_replacedById_idx" ON "PartnerCertificateInstance"("replacedById");

-- AddForeignKey
ALTER TABLE "PartnerCertificateInstance" ADD CONSTRAINT "PartnerCertificateInstance_replacedById_fkey" FOREIGN KEY ("replacedById") REFERENCES "PartnerCertificateInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
