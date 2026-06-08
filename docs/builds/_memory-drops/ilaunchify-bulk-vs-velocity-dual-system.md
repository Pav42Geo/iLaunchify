---
name: ilaunchify-bulk-vs-velocity-dual-system
description: V1.5 has TWO separate tier systems — bulk uses per-order quantity tier (single-order discount), on-demand uses per-SKU 30-day rolling velocity tier. Cross-pollination preserved: bulk units accrue toward on-demand velocity.
metadata:
  type: project
---

V1.5 splits bulk and on-demand pricing into two distinct tier mechanics because they have different cost economics:

| Mode | What drives cost down | Tier mechanic | Doc |
|---|---|---|---|
| **On-demand** | Velocity over time (orders/mo unlocks orchestration efficiency) | Per-SKU 30-day rolling units | `_V1.5_VELOCITY_PRICING.md` |
| **Bulk** | Quantity per order (bigger run amortizes setup) | Per-order quantity tier | `_V1.5_BULK_PRICING.md` |

**Cross-pollination preserved** (the load-bearing rule): bulk units on a SKU still accrue toward that SKU's on-demand velocity tier. A creator's bulk seed run unlocks better on-demand fees forever. This is what makes `FulfillmentMode.BOTH` economically obvious.

**Lower-of pricing at quote time:** the system computes both bulk_tier_price and velocity_tier_price for a SKU + qty, applies the lower. Creator never gets caught paying more on bulk than they would on on-demand at their current velocity tier.

**Why:** Pavel locked 2026-06-04. Earlier velocity model applied to both modes — that's wrong because bulk's pricing leverage is wholesale-tier amortization (manufacturer's cost curve drops), not rolling velocity. Bulk gets flat platform fee % from subscription tier (15/10/7), the discount comes from the wholesale tier ladder. On-demand keeps the rolling velocity tier discount on platform fee %.

**How to apply:**
- When discussing on-demand fee mechanics → reference velocity tier (5-tier, 30-day rolling, per-SKU)
- When discussing bulk fee mechanics → reference quantity tier (6-tier, per-order, MOQ-anchored, partner-set wholesale)
- Bulk uses flat 15/10/7 platform fee %; on-demand uses velocity-discounted %
- Cross-pollination is the V1.5 moat — don't break it when refactoring schema or pricing engine
- Both modes share the "lower-of" comparison at quote time

Schema split: `ProductFulfillmentVelocity` (on-demand) + `ProductBulkTier` + `CategoryBulkTierTemplate` + `BulkQuoteSnapshot` (bulk). All additive, both live side-by-side.

Reference: `docs/builds/_V1.5_BULK_PRICING.md`, `docs/builds/_V1.5_VELOCITY_PRICING.md`, `docs/builds/on-demand-pricing-economics.md`, [[ilaunchify-bulk-tier-philosophy]], [[ilaunchify-velocity-tiers-on-top-of-subscription]], [[ilaunchify-orchestration-thesis]].
