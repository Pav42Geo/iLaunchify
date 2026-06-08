# On-Demand Pricing & Economics — locked V1.5 numbers

Reference for the on-demand fulfillment track pricing model. Same shape as `ai-recipe-parser-economics.md` — locked numbers, cost protection levers, sensitivity analysis. Per-tier rules below are what gets seeded into `packages/plans/PlanFeature` rows.

## 🔀 Dual-system update — 2026-06-04

**This doc covers ON-DEMAND economics only.** Bulk pricing is now handled by a separate per-order quantity tier system documented in `_V1.5_BULK_PRICING.md`.

- On-demand: per-SKU 30-day rolling velocity tier (see `_V1.5_VELOCITY_PRICING.md`)
- Bulk: per-order quantity tier with platform-suggested category brackets, partner-customizable wholesale prices (see `_V1.5_BULK_PRICING.md`)

Cross-pollination preserved: bulk volume on a SKU accrues toward that SKU's on-demand velocity tier. "Lower-of" pricing applies at quote time across both modes.

Category bracket ladders for bulk are in `_V1.5_BULK_PRICING.md` §"Category bracket ladders". Six suggested tiers per category (Supplements / Beverages / Snack food / Pet products / Cosmetics / OTC pharma) auto-populate when a partner adds a product.

Maker tier has full bulk access at the higher base fee rate (15%) — bulk is the primary revenue stream per Pavel's locked thesis, and gating access contradicts that. Differentiation is base fee rate, not feature lock.

## Locked decisions

| Item | Locked answer |
|---|---|
| Creator subscription required to use on-demand | NO — Maker tier (free) can publish on-demand |
| Creator platform fee differs by tier | YES — lower fee % is the upgrade incentive |
| Partner subscription required | NO — no partner-side subscription |
| Partner per-order fee differs by tier | YES — lower fee % is the upgrade incentive (matches creator pattern) |
| Pricing transparency to creator | TRANSPARENT — break out production + shipping + platform fee as separate lines |
| Sample order pricing | At cost (partner wholesale + shipping); no platform fee on samples |
| Default profit margin suggested | 40% |
| Hard-floor margin (server refuses below) | 20% |

## Creator-side platform fee (per fulfilled order)

| Tier | Subscription | On-demand access | Platform fee | Use case |
|---|---|---|---|---|
| **Maker** | Free | YES | 15% of retail | New creators, low-volume testing |
| **Builder** | $49/mo | YES | 10% of retail | Active creators with established channels |
| **Agency** | $199/mo | YES | 7% of retail | Multi-brand operators + larger volume |

Higher tier = lower fee = upgrade incentive once volume exists. Maker can use everything; just pays more per order. Aligns with Printify / Supliful tier model.

PlanFeature seed lines to add to `packages/plans/src/seed.ts`:

```ts
{ tier: 'maker',   key: 'on-demand-enabled',          value: 'true', kind: 'boolean' },
{ tier: 'builder', key: 'on-demand-enabled',          value: 'true', kind: 'boolean' },
{ tier: 'agency',  key: 'on-demand-enabled',          value: 'true', kind: 'boolean' },
{ tier: 'maker',   key: 'on-demand-platform-fee-pct', value: '15.0', kind: 'number'  },
{ tier: 'builder', key: 'on-demand-platform-fee-pct', value: '10.0', kind: 'number'  },
{ tier: 'agency',  key: 'on-demand-platform-fee-pct', value: '7.0',  kind: 'number'  },
```

## Partner-side fee (per fulfilled order)

Tied to existing `PartnerTier` enum (VERIFIED | TRUSTED | PREMIER). No partner subscription required.

| Tier | Per-order fee | Use case |
|---|---|---|
| **Verified** (entry) | 5% of partner's wholesale | Standard verified partner |
| **Trusted** (mid-tier) | 3.5% of partner's wholesale | Volume + good SLA partners |
| **Premier** (top) | 2% of partner's wholesale | Strategic high-volume partners |

PlanFeature seed lines:

```ts
{ tier: 'verified', key: 'on-demand-partner-fee-pct', value: '5.0',  kind: 'number' },
{ tier: 'trusted',  key: 'on-demand-partner-fee-pct', value: '3.5',  kind: 'number' },
{ tier: 'premier',  key: 'on-demand-partner-fee-pct', value: '2.0',  kind: 'number' },
```

Partner tier criteria (admin sets) — fulfillment-rate + on-time-shipment + low-defect-rate + volume thresholds. Promotion is admin-triggered for V1.5; auto-promotion criteria locked in V2 per existing partner-tier roadmap.

## Worked example — typical $30 retail supplement order

End customer pays $30 on creator's Shopify store.

**Cost structure visible to creator (transparent):**

```
Retail price (creator's choice)              $30.00
─────────────────────────────────────────────────────
Partner wholesale cost                        $8.00
Shipping (carrier)                            $4.50
iLaunchify platform fee (Builder, 10%)        $3.00
─────────────────────────────────────────────────────
Total cost to fulfill                        $15.50
                                            ─────────
Your profit                                  $14.50
                                              (48%)
```

**iLaunchify's revenue per order:**

- Platform fee from creator: $3.00 (10% of retail, Builder tier)
- Platform fee from partner (Verified, 5% of $8 wholesale): $0.40
- **Total platform take per order: $3.40 (11.3% of retail)**

If creator upgrades to Agency: platform fee drops to 7% ($2.10), still $0.40 from partner. iLaunchify earns $2.50 per order instead of $3.40 — but the upgrade means creator is volume-validated → likely more orders → net up.

If partner reaches Premier: partner fee drops from 5% to 2% ($0.16 vs $0.40 on $8 wholesale). iLaunchify earns less per order from premier partners — but Premier partners get more order flow → net up.

## Sample order pricing

Single unit ordered by creator for QA before publishing. Industry standard is at-cost.

```
Partner wholesale cost                        $8.00
Shipping (carrier)                            $4.50
iLaunchify platform fee on samples            $0.00  ← waived
─────────────────────────────────────────────────────
Total creator pays for sample                $12.50
```

Audit: `RECIPE_PARSE_RUN` style — log every sample as `ON_DEMAND_SAMPLE_ORDER` so we can spot abuse (creator ordering 100 "samples" instead of buying retail).

Cap: ~10 samples per product per month per creator. Hard refuse beyond.

## Returns cost allocation

| Return reason | Who pays |
|---|---|
| Defective product | Partner (replaces + eats cost) |
| Wrong product shipped | Partner (reships + eats cost) |
| Damaged in transit | Partner files carrier insurance claim; partner eats short-term, recovers via claim |
| Buyer's remorse | End customer (per creator's channel return policy); iLaunchify and partner not involved |
| Allergic reaction | Case-by-case; escalates to admin + legal counsel; partner indemnification per Partner Agreement |

For defective returns: iLaunchify reverses creator's invoice + processes partner-side debit. Net effect: creator made $0 profit on the order, partner ate the wholesale cost.

## Cost protection levers (mandatory before V1.5 ships)

### 1. Rate limit on channel-order processing

Per partner: max 100 fulfilled orders per hour (prevents channel webhook bursts from overloading partner capacity). Excess queued with priority by receipt order. Configurable per partner.

### 2. Daily fulfillment cap per partner

Per `Partner.onDemandMaxDailyCapacity`. Exceeded orders queued for next day. Partner can adjust capacity at any time.

### 3. Margin floor enforcement

Server refuses to publish a product when creator's set retail < (partner cost + shipping + platform fee + 20% margin floor). Hard refuse, not warning. Returns clear error: "Set retail at least $X.XX to maintain 20% margin floor."

### 4. Stripe Invoice retry policy

If creator's stored payment method fails on post-fulfillment invoice — 3 retries over 5 days. Beyond that, creator's on-demand access auto-paused until invoice clears. Existing published products stay live but no new orders accepted.

### 5. Partner SLA enforcement

If partner exceeds lead time on >5% of orders in 30 days → flagged for admin review. >10% → tier demotion conversation. >20% → on-demand capability suspended pending re-verification.

### 6. Channel webhook failure detection

Track webhook delivery success rate per channel. If <95% over 24h window → admin alert + investigation. Use existing Sentry pattern from P6.

### 7. Returns rate ceiling

If a partner exceeds 5% returns rate over 30 days → admin review. >10% → suspension of new orders pending root-cause analysis.

## Sensitivity analysis

What happens if assumptions shift:

**Stripe Connect fee increase from 0.25% + $0.25 to 0.5% + $0.50:**

Per order ($30 retail), Stripe takes ~$0.40 on the creator invoice. New cost: ~$0.65. iLaunchify net per order drops from $3.40 to $3.15. Still profitable at any reasonable volume.

**Channel platform changes their take rate:**

Doesn't affect iLaunchify directly — channels charge creators separately. Creator might respond by raising retail; iLaunchify revenue increases proportionally (% of retail).

**Partner wholesale costs increase 20%:**

Doesn't affect iLaunchify directly — partners set wholesale; creators see updated cost; creator either absorbs into margin or raises retail. iLaunchify's % fee scales with retail.

**Volume explodes (100x baseline):**

Stripe Connect fee structure is volume-tier discounted. iLaunchify negotiates better Stripe rates. Per-order economics improve at scale. No structural problem.

## Pricing transparency UI

In the Creator's product editor, always show the breakdown:

```
This product, when sold at $30 retail:

  Partner wholesale                $8.00
  Shipping (est.)                   $4.50
  iLaunchify platform fee (10%)    $3.00
  ─────────────────────────────────────
  Your cost to fulfill            $15.50

  Your profit per order           $14.50  (48% margin)
```

When creator changes retail, all numbers update live. When creator changes channel, shipping estimate updates per channel's standard.

This transparency is the WEDGE vs Printify / Supliful (both opaque — they just show "your cost: $X"). iLaunchify wins on creator trust by showing the math.

## Telemetry to watch post-launch

| KPI | Threshold | Action |
|---|---|---|
| Median time-to-first-on-demand-order per creator | <14 days from publish | Healthy |
| Per-creator monthly fulfilled-order count | trending up | Healthy |
| Partner SLA compliance rate | >95% | Healthy |
| Returns rate platform-wide | <2% | Healthy |
| Creator margin distribution | median ≥35% | Healthy |
| Channel webhook success rate | >95% | Investigate if below |
| iLaunchify per-order net | $2-5 | Healthy at Builder average |
| Maker → Builder conversion rate (driven by per-order fee delta) | ≥10% monthly | Validates pricing model |

A new `/admin/on-demand/dashboard` surfaces these in V1.5+.

## V1.5 addendum — Velocity-tier discount on top of subscription tier

**Locked 2026-06-03** after Supliful price-tier model review. Full spec at `docs/builds/_V1.5_VELOCITY_PRICING.md`.

The base subscription-tier fees above (Maker 15% / Builder 10% / Agency 7%) remain as the **Tier 1 floor**. On top, a per-SKU velocity discount applies based on rolling 30-day fulfilled-unit volume per (creator × ProductTemplate):

| Velocity tier | 30-day SKU volume | Maker | Builder | Agency |
|---|---|---|---|---|
| Tier 1 | 0-50 units | 15.0% | 10.0% | 7.0% |
| Tier 2 | 51-200 units | 13.0% | 8.5% | 6.0% |
| Tier 3 | 201-500 units | 11.0% | 7.0% | 5.0% |
| Tier 4 | 501-1000 units | 9.0% | 6.0% | 4.0% |
| Tier 5 | 1000+ units | 7.0% | 5.0% | 3.0% |

Five locked rules:

1. **Per-SKU tracking** — velocity is per (creator × ProductTemplate), not aggregated across the creator's portfolio
2. **Cross-pollination** — bulk order volume on the same SKU counts toward that SKU's on-demand velocity tier
3. **Lower-of pricing** — if bulk-quoted unit fee > current on-demand tier fee, the lower (on-demand tier) fee applies
4. **Samples at Tier 1 always** — sample orders ignore velocity tier discount AND do not accrue volume toward future tier (audit-logged `ON_DEMAND_SAMPLE_ORDER` rows excluded from velocity calc)
5. **Admin-tuneable** — VelocityTierThreshold values stored in DB; admin can re-seed at any time

## Sample order pricing — updated 2026-06-03

The existing sample rule above (at-cost partner wholesale + shipping, 0% platform fee, ~10/mo cap) is preserved. Two velocity-tier-specific additions:

- **Sample charged at partner's Tier 1 base wholesale always** — never volume-discounted, regardless of creator's velocity tier on that SKU
- **Sample units do NOT accrue toward 30-day velocity tier** — audit-logged as `ON_DEMAND_SAMPLE_ORDER`; velocity calc explicitly excludes this audit type

## V2.5 forward-pointers

When fulfilled-order volume gets big enough, consider:

1. **Volume rewards** — creator gets 1% rebate on monthly fulfilled orders above 1000 (superseded by velocity tier in V1.5 — V2.5 may add a portfolio-wide aggregate bonus on top)
2. **Premium subscription** — $399/mo Plus tier with 5% platform fee + priority routing + dedicated CSM
3. **Per-channel pricing** — different platform fee % for Amazon (where seller fees are higher) vs Shopify
4. **Partner-side velocity tier** — partners with high fulfillment volume get velocity discount on their per-order fee (Verified 5% / Trusted 3.5% / Premier 2% becomes velocity-aware)

All deferred to V2.5+. Don't ship in V1.5.

## See also

- `docs/builds/_V1.5_VELOCITY_PRICING.md` — full V1.5 velocity-tier spec
- `docs/builds/ON_DEMAND_BUSINESS_MODEL.md` — full architectural spec
- `docs/builds/ai-recipe-parser-economics.md` — same shape, different feature
- `.claude/memory/ilaunchify-on-demand-business-model.md` — design lock
- `.claude/memory/ilaunchify-velocity-tiers-on-top-of-subscription.md` — V1.5 velocity-tier lock (NEW — drop from `docs/builds/_memory-drops/`)
- [Supliful price-tier help article](https://help.supliful.com/en/articles/11588477-understanding-supliful-s-product-price-tiers) — source inspiration
