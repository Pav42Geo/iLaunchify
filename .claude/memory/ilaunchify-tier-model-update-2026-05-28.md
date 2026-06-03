---
name: ilaunchify-tier-model-update-2026-05-28
description: "2026-05-28 creator-tier updates — Maker gets unlimited products (was 1), Master tier renamed to Agency. Brand-profile count is the real upgrade lever, not product count."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

Two locked changes to the creator subscription tier model on 2026-05-28:

**1. Maker tier — active products: 1 → Unlimited**

Why: iLaunchify's revenue comes from production-order fees (15% / 12% / 9%), not from product creation. Limiting Maker to 1 product was artificial friction that hurt engagement without preventing any real abuse vector. A creator with five SKU drafts on Maker is more likely to convert to Builder than a creator who hit a 1-product cap and bounced.

The real upgrade lever is **brand profiles** (1 / 3 / Unlimited) — each brand has its own identity, channels, payouts, and team, which is genuine complexity worth gating.

How to apply: when building product creation flows in apps/creator, do NOT gate by tier on `Brand.products.count`. Gate by `Brand.products.count vs maxProductsPerBrand` if the SubscriptionPlan row has that field, but for V1 the default is unlimited across all tiers. Brand-creation flow IS still tier-gated (1 / 3 / Unlimited per [[ilaunchify-subscription-tiers]]).

**2. Tier #3 renamed: Master → Agency**

Why: better aligns with the iLaunchify creator personas (Pavel listed influencer agencies, brand creators, fitness/culinary influencers in our user research). "Master" was generic SaaS-tier-speak; "Agency" describes who actually uses the tier — multi-brand operators running launches as a service.

How to apply: TierKey type in `packages/ui/src/components/pricing-tier-data.ts` is now `'maker' | 'builder' | 'agency'`. All display strings reference "Agency". PLATFORM_SPEC.md changelog entry dated 2026-05-28 documents the swap. Any new code touching subscription/tier logic uses `'agency'`, not `'master'`.

Notes for the schema migration: the `SubscriptionPlan.code` row for the top creator tier should be renamed from `creator_master` → `creator_agency`. The DB migration can be a simple UPDATE on the seed row when next prisma migrate runs.
