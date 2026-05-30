-- REBUILD R14.b — Creator subscription tier
--
-- Adds the SubscriptionTier enum (MAKER / BUILDER / AGENCY) and a
-- CreatorProfile.subscriptionTier column defaulting to MAKER so every
-- existing creator stays on the free tier. CockroachDB supports CREATE
-- TYPE … AS ENUM and ALTER TABLE … ADD COLUMN with a DEFAULT in a single
-- transactional migration.

CREATE TYPE "SubscriptionTier" AS ENUM ('MAKER', 'BUILDER', 'AGENCY');

ALTER TABLE "CreatorProfile"
  ADD COLUMN "subscriptionTier" "SubscriptionTier" NOT NULL DEFAULT 'MAKER';
