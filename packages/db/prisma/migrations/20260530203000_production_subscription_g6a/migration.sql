-- Phase G6.a — Production Subscriptions
--
-- Schema substrate for the Subscribe & save offer at checkout Step 3.
-- A creator who accepts the offer gets a ProductionSubscription that
-- owns the recurring cadence: Stripe fires invoice.payment_succeeded
-- every cycle and our webhook spawns a new Order from the locked
-- manifestSnapshot. The first day-1 Order still flows through normal
-- placeOrderFromCheckoutDraft — the subscription only governs cycle 2+.
--
-- manifestSnapshot is JSONB because the production picks shape (qty /
-- substrate / packaging / finishes / shipTo) is wizard-typed and we
-- want to read-back-write-forward-compatibility.
--
-- Order gains nullable productionSubscriptionId + subscriptionCycleNumber
-- so spawned orders trace back to their parent without re-counting.

-- 1. Enums
CREATE TYPE "SubscriptionCadence" AS ENUM ('MONTHLY', 'QUARTERLY');

CREATE TYPE "ProductionSubscriptionStatus" AS ENUM (
  'ACTIVE',
  'PAUSED',
  'CANCELLED',
  'COMPLETED'
);

-- 2. ProductionSubscription table
CREATE TABLE "ProductionSubscription" (
  "id"                       STRING NOT NULL,
  "creatorUserId"            STRING NOT NULL,
  "brandId"                  STRING NOT NULL,
  "productId"                STRING NOT NULL,
  "designVersionId"          STRING,
  "cadence"                  "SubscriptionCadence" NOT NULL,
  "totalRuns"                INT4,
  "runsCompleted"            INT4 NOT NULL DEFAULT 0,
  "nextRunAt"                TIMESTAMP(3),
  "discountBp"               INT4 NOT NULL DEFAULT 0,
  "stripeSubscriptionId"     STRING NOT NULL,
  "stripePriceId"            STRING NOT NULL,
  "status"                   "ProductionSubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
  "cancelledAt"              TIMESTAMP(3),
  "cancelledReason"          STRING,
  "manifestSnapshot"         JSONB NOT NULL,
  "subtotalCentsAtCreation"  INT4 NOT NULL,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ProductionSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductionSubscription_stripeSubscriptionId_key"
  ON "ProductionSubscription"("stripeSubscriptionId");

CREATE INDEX "ProductionSubscription_creatorUserId_status_idx"
  ON "ProductionSubscription"("creatorUserId", "status");

CREATE INDEX "ProductionSubscription_nextRunAt_idx"
  ON "ProductionSubscription"("nextRunAt");

-- 3. FK relations
ALTER TABLE "ProductionSubscription"
  ADD CONSTRAINT "ProductionSubscription_creatorUserId_fkey"
  FOREIGN KEY ("creatorUserId") REFERENCES "User"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "ProductionSubscription"
  ADD CONSTRAINT "ProductionSubscription_brandId_fkey"
  FOREIGN KEY ("brandId") REFERENCES "Brand"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

ALTER TABLE "ProductionSubscription"
  ADD CONSTRAINT "ProductionSubscription_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE NO ACTION ON UPDATE CASCADE;

-- 4. Order linkback for spawned cycle orders
ALTER TABLE "Order"
  ADD COLUMN "productionSubscriptionId" STRING,
  ADD COLUMN "subscriptionCycleNumber"  INT4;

ALTER TABLE "Order"
  ADD CONSTRAINT "Order_productionSubscriptionId_fkey"
  FOREIGN KEY ("productionSubscriptionId") REFERENCES "ProductionSubscription"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
