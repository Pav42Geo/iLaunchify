---
name: ilaunchify-velocity-tiers-on-top-of-subscription
description: V1.5 on-demand pricing combines subscription tier (Maker 15% / Builder 10% / Agency 7%) with per-SKU 30-day rolling velocity tier discount. Velocity is per (creator × ProductTemplate). Bulk volume counts toward on-demand tier. Samples always at Tier 1 and don't accrue. Inspired by Supliful.
metadata:
  type: project
---

Locked 2026-06-03 after Supliful price-tier model review. The base subscription tier (Maker free + 15% / Builder $49 + 10% / Agency $199 + 7%) remains floor; on top, per-SKU velocity tier reduces the platform fee % based on rolling 30-day fulfilled-unit volume.

**Five locked rules:**

1. **Per-SKU tracking** — velocity is per (creator × ProductTemplate), NOT aggregated across the creator's portfolio. Per-Brand aggregation is V2 if Agency creators ask.
2. **Cross-pollination** — bulk order volume on the same SKU counts toward that SKU's on-demand velocity tier. A 500-unit bulk run jumps the creator to Tier 3 immediately for any subsequent on-demand orders on that SKU.
3. **Lower-of pricing** — if a bulk-quoted unit fee comes out HIGHER than the current on-demand tier fee, iLaunchify charges the lower (on-demand tier) fee. Creator-favorable safety net.
4. **Samples at Tier 1 always** — sample orders (existing at-cost + 0% platform fee rule preserved) ignore velocity tier discount AND do not accrue volume toward future velocity tier. Audit-logged `ON_DEMAND_SAMPLE_ORDER` rows are explicitly excluded from velocity calc.
5. **Admin-tuneable thresholds** — `VelocityTierThreshold` rows in DB; admin can re-seed without code release.

**V1.5 seed velocity tier table:**

| Tier | 30-day SKU volume | Maker | Builder | Agency |
|---|---|---|---|---|
| 1 | 0-50 | 15.0% | 10.0% | 7.0% |
| 2 | 51-200 | 13.0% | 8.5% | 6.0% |
| 3 | 201-500 | 11.0% | 7.0% | 5.0% |
| 4 | 501-1000 | 9.0% | 6.0% | 4.0% |
| 5 | 1000+ | 7.0% | 5.0% | 3.0% |

**Why this matters:** velocity-blind subscription pricing leaves money on the table. Creators with proven product-market-fit deserve better economics; iLaunchify should reward stickiness. Cross-pollination makes the locked `FulfillmentMode.BOTH` mode economically obvious (bulk seeds unlock cheaper on-demand). Transparent breakdown in OrderSummary + dynamic calculator on marketplace product detail page is the wedge vs Supliful's opaque pricing.

**What NOT to do:**

- Don't collapse subscription tier into velocity tier. Subscription stays as the floor + feature gate; velocity is a multiplier on top.
- Don't track velocity per-Brand in V1.5 (per-SKU only) — defer aggregate-Brand bonus to V2.5 forward-pointers.
- Don't apply velocity discount to samples. Samples remain Tier 1, at-cost.
- Don't ship without "lower-of" comparison at bulk-quote time — creator regret on bulk commits would break trust.

**Marketplace product detail page** must show dynamic price calculation with full breakdown: manufacturer + decoration surcharge + shipping + subscription tier base + velocity tier discount = effective fee. V1 ships the base calculator (subscription-tier only); V1.5 adds the velocity tier line + "your tier path" mini-widget.

**Source:** Supliful's per-SKU dynamic price tier mechanic at https://help.supliful.com/en/articles/11588477-understanding-supliful-s-product-price-tiers — borrowed per-SKU velocity + cross-pollination + lower-of; rejected single-vendor fulfillment + catalog-only formulation + opaque pricing.

Related: [[ilaunchify-on-demand-business-model]], [[ilaunchify-tier-model-update-2026-05-28]], [[ilaunchify-v15-tier-upgrade-shipped]], [[ilaunchify-operational-philosophy-v1]]
