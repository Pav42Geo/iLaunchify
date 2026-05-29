-- CreateEnum
CREATE TYPE "AggregateApprovalStatus" AS ENUM ('AWAITING_PARTNERS', 'PARTIALLY_ACCEPTED', 'CHANGES_REQUESTED', 'FULLY_ACCEPTED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "DispatchStatus" ADD VALUE 'CHANGES_REQUESTED';
ALTER TYPE "DispatchStatus" ADD VALUE 'WITHDRAWN';

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "aggregateApprovalStatus" "AggregateApprovalStatus" NOT NULL DEFAULT 'AWAITING_PARTNERS';

-- AlterTable
ALTER TABLE "OrderDispatch" ADD COLUMN     "acceptedManifestVersion" INT4;
ALTER TABLE "OrderDispatch" ADD COLUMN     "changeRequest" JSONB;
ALTER TABLE "OrderDispatch" ADD COLUMN     "manifestVersion" INT4 NOT NULL DEFAULT 1;
ALTER TABLE "OrderDispatch" ADD COLUMN     "withdrawReason" STRING;
ALTER TABLE "OrderDispatch" ADD COLUMN     "withdrawnAt" TIMESTAMP(3);
