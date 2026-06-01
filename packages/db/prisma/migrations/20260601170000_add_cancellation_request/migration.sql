-- CreateEnum
CREATE TYPE "CancellationRequestStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'DENIED');

-- CreateTable
CREATE TABLE "CancellationRequest" (
    "id" STRING NOT NULL,
    "orderId" STRING NOT NULL,
    "dispatchId" STRING,
    "requestedById" STRING NOT NULL,
    "reason" STRING NOT NULL,
    "status" "CancellationRequestStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" STRING,
    "reviewedAt" TIMESTAMP(3),
    "reviewNotes" STRING,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CancellationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CancellationRequest_status_createdAt_idx" ON "CancellationRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "CancellationRequest_orderId_idx" ON "CancellationRequest"("orderId");

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CancellationRequest" ADD CONSTRAINT "CancellationRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
