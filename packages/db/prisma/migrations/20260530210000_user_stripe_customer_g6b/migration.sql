-- Phase G6.b — Stripe Customer cache for creator subscriptions.
--
-- createProductionSubscription() resolves a persistent Stripe Customer
-- (creating it on first use) and caches the ID here so subsequent
-- subscribe-and-save flows attach to the same Customer record. Keyed
-- @unique so accidental duplicates can't slip in.
--
-- Distinct from User.stripeAccountId which is the Stripe Connect
-- account used for partner payouts. Creators don't have Connect; they
-- pay iLaunchify through this Customer.

ALTER TABLE "User"
  ADD COLUMN "stripeCustomerId" STRING;

CREATE UNIQUE INDEX "User_stripeCustomerId_key"
  ON "User"("stripeCustomerId");
