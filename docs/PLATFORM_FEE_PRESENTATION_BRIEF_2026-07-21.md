# Should the administrative fee be a visible line item? (Brief, 2026-07-21)

Question (Pavel): other platforms don't seem to show a platform fee as a separate
cost line. Should we incorporate ours into the service price instead of showing
"Platform fee $690.00" at checkout?

## How comparable platforms present it

| Platform | Model | Does the BUYER see a fee line? |
|---|---|---|
| **Printify / Printful** (POD, our closest pitch analogue) | Monetize inside the catalog price (cost-plus). Premium subscription = up to 20% LOWER product prices, not a lower "fee" | **No.** Buyer sees product cost + shipping. The subscription benefit is presented as cheaper unit prices |
| **Faire** (closest B2B marketplace analogue) | 15% commission charged to the BRAND (supply side) on new-customer orders | **No.** The retailer (buyer) sees zero fees on the order |
| **Etsy / Amazon / eBay** | Commissions charged to sellers | **No** buyer-side fee line |
| **Upwork** | Client Marketplace Fee 5% (Business Plus 10%) | **Yes.** Separate line item at checkout, plus a contract initiation fee |
| **Fiverr** | Buyer service fee ~5.5% + $2.50 | **Yes.** Added at checkout |

Pattern: **goods marketplaces bake the take into the price; services/labor
marketplaces itemize it.** Nobody in the physical-goods world shows a
double-digit percentage fee line to the person paying for the goods.

Regulatory direction: California SB 478 (July 2024) and the FTC's pricing rules
push advertised prices to be all-in for consumers. **B2B transactions are
exempt**, so our current line item is legal. But the norm is moving toward
all-in, and the exemption would not save us if creators are ever consumers in
some flow.

## Why this matters for us specifically

- On the proven money path the fee line is LARGE in absolute terms ($690.00 on
  the $5,742.40 order). A creator sees the partner's price and then watches a
  five-hundred-dollar "fee" appear. That framing invites resentment and
  disintermediation attempts (the anti-circumvention problem), and prices our
  take as a tax instead of as the service.
- Printify, the model we pitch against (N=1 strategy memo), presents its take
  invisibly and sells its subscription as "20% cheaper products." Our tier
  ladder (15/12/8) maps 1:1 onto that framing: "Builder prices are about 3%
  lower on every run."
- The counter-argument for itemizing: B2B buyers do their COGS math and often
  want clean itemization for accounting. That need is real but is satisfied by
  the invoice/receipt and order detail, not by the checkout summary.

## Options

**A. Status quo: explicit fee line at checkout** (Upwork style). Transparent,
zero work, tier savings legible. Cost: the psychological tax framing above.

**B. All-in pricing** (Printify/Faire style). Every creator-facing price (PDP,
configurator, estimate, checkout) displays the partner subtotal grossed up by
the creator's tier fee; no fee line anywhere; tiers are marketed as lower
prices. Consequences:
  - PDP prices become tier-dependent (guests and Makers see the 15% price,
    Builder sees lower). That is exactly Printify Premium's mechanic and is a
    selling surface, not a bug.
  - Partners still set and keep their price (fee-base rule untouched); the
    fee math, snapshotting, and `computeOrderPricing` change NOT AT ALL. This
    is a presentation-layer change, which PP-0 (one pricer) makes tractable:
    every surface already calls the same pricer, so the gross-up lives in one
    display helper, not six surfaces.
  - Accounting itemization moves to the order detail + invoice (fee shown
    there, clearly, after purchase), and the Terms keep disclosing the rate.

**C. Hybrid: all-in line items + visible breakdown on demand.** Checkout shows
all-in unit prices and a total with no fee line; an expandable "price detail"
(and the invoice) shows partner subtotal + administrative fee for those who
want it. Transparency preserved, tax-framing removed.

## Recommendation

**C, moving toward B in spirit.** Present all-in prices everywhere the creator
is deciding (PDP, configurator, checkout summary), keep the honest breakdown
one click away and on the invoice, and reposition tier marketing from "lower
fee" to "lower prices on every run." This matches the physical-goods norm
(Printify, Faire, Etsy, Amazon), keeps our B2B itemization duty satisfied, and
converts the fee from a perceived tax into service pricing.

Guardrails if adopted:
- The invariant "fee shown == fee charged" becomes "all-in shown == all-in
  charged" and must be re-verified on a live order (the PP-0 lesson: run the
  thing).
- `Order.platformFeeBps/Cents` snapshots stay exactly as they are; only
  display composition changes.
- The legal Membership Terms and partner-facing docs keep naming the rate
  explicitly (counsel review before changing any legal copy).
- Decide the rounding rule for grossed-up unit prices once, in the pricer
  display helper, never per surface.

## Decision + build log

**DECIDED (Pavel 2026-07-21): Option C.** Phase 1 BUILT same day:

- `composeAllInLines` in `@ilaunchify/plans` (`all-in-display.ts`, exported on
  the client-safe `/math` subpath) — largest-remainder fee distribution, sums
  to subtotal + fee by construction, invariant-tested (`all-in-display.test.ts`).
  This is THE one rounding rule; no surface may re-derive it.
- Checkout OrderSummary + SampleCheckout: fee folded into goods lines, no fee
  row; expandable "Prices include our service. See detail" shows partner
  subtotal + administrative fee. Totals unchanged (they always included the fee).
- Itemized surfaces KEEP their breakdown, renamed to "Administrative fee":
  order detail, spec sheet, configurator.
- /subscriptions plans page: all fee percentages now LIVE from FeeRule
  (resolveCreatorFeeBps), hardcoded 15/12/8 strings removed; hero repositioned
  to "lower prices on production."

Phase 2 BUILT (2026-07-21): marketing money is now live. Findings + changes:

- `apps/marketing/lib/pricing.ts` + `ProductDetailConfigurator` were ALREADY
  dynamic and all-in (resolveCreatorFeeBps + computeOrderPricing; the PDP
  headline was fee-inclusive since PP-0c). No change needed.
- `/pricing`: hero copy, comparison-table fee row, FAQ answer, and
  PricingCards now render LIVE FeeRule rates and LIVE SubscriptionPlan prices
  (`__FEE_*__` token substitution + a `pricing` prop). This also fixed real
  price drift: the cards advertised $79/$249 while the app charges the
  DB-seeded prices.
- `/contact-sales`: Agency perks fee line tokenized + substituted.

- `UpgradeOverlay`: DONE by Code (2026-07-21, via
  HANDOFF-TO-CODE-upgrade-overlay-live-pricing, deleted on completion). No
  literal prices or rates remain in the overlay.

**RULING — finishes drawer upcharges (2026-07-21, answers Code's note):**
`buildFinishPricingSummary` renders partner finish upcharges raw
("+$0.08/unit"). Finishes are inside the fee base, so per Option C the
CREATOR-facing rendering must be all-in; the PARTNER-facing rendering must
stay raw (a partner sets and keeps that price; a fee-inflated number would
misstate their own list). So: do NOT change the shared formatter — add an
audience-aware wrapper on the creator/Studio side that grosses the delta up
at the viewer's tier rate (guests/Maker = maker bps) using the shared fee
math. Per-unit deltas use plain bps (FeeRule flat/min/max bounds apply at
ORDER level, not to an informational delta); exact money still comes from
computeOrderPricing at checkout. Divergence by audience is the point, made
explicit by the wrapper, never silent. Owner: Code (Studio canvas hot zone).

Still open:
- Finishes-drawer all-in wrapper per the ruling above (Code's zone).
- Legal Membership Terms wording (counsel).
- Re-verify all-in shown == charged on the next live test order.

## Sources

- [Printify free vs premium (product prices, not fees)](https://printify.com/blog/printify-free-vs-premium/)
- [Printify pricing guide 2026](https://www.ecommerceceo.com/printify-pricing/)
- [Faire: how it works (retailers shop with no fees)](https://www.faire.com/how-faire-works)
- [Faire fees explained (brand-side commission)](https://www.brahmin-solutions.com/blog/what-is-faire-wholesale)
- [Upwork client marketplace fee (separate line at checkout)](https://support.upwork.com/hc/en-us/articles/4660220468499-What-is-the-Client-Marketplace-Fee)
- [Upwork client pricing](https://www.upwork.com/pricing/client)
- [California SB 478 hidden fees (AG page)](https://oag.ca.gov/hiddenfees)
- [SB 478 scope: commercial transactions excluded](https://natlawreview.com/article/californias-new-price-transparency-law-may-reshape-pricing-practices-broad-range)
