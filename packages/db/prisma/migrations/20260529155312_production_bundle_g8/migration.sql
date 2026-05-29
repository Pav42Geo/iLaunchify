-- CreateEnum
CREATE TYPE "BundleStatus" AS ENUM ('PENDING_GENERATION', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "OrderDispatch" ADD COLUMN     "bundleAssetId" STRING;
ALTER TABLE "OrderDispatch" ADD COLUMN     "bundleGeneratedAt" TIMESTAMP(3);
ALTER TABLE "OrderDispatch" ADD COLUMN     "bundleStatus" "BundleStatus" NOT NULL DEFAULT 'PENDING_GENERATION';
ALTER TABLE "OrderDispatch" ADD COLUMN     "finishManifestJson" JSONB;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "designVersionId" STRING;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_designVersionId_fkey" FOREIGN KEY ("designVersionId") REFERENCES "DesignVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
