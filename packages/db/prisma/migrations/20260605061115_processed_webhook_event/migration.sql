-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "id" STRING NOT NULL,
    "source" STRING NOT NULL,
    "type" STRING NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessedWebhookEvent_processedAt_idx" ON "ProcessedWebhookEvent"("processedAt");
