-- AlterTable
ALTER TABLE "ProductTemplateVariant" ADD COLUMN     "packagingTypeId" STRING;

-- AddForeignKey
ALTER TABLE "ProductTemplateVariant" ADD CONSTRAINT "ProductTemplateVariant_packagingTypeId_fkey" FOREIGN KEY ("packagingTypeId") REFERENCES "PackagingType"("id") ON DELETE SET NULL ON UPDATE CASCADE;
