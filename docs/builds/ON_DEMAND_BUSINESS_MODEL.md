# On-Demand Business Model — iLaunchify second fulfillment track

Canonical spec for the on-demand drop-ship fulfillment track. Locks the business model, payment intermediation pattern, partner/creator/admin surfaces, and the V1.5/V2/V2.5 roadmap. Pricing details in `on-demand-pricing-economics.md`. Settings page visual spec inline at §10.

This is iLaunchify's **second fulfillment track**, parallel to the existing bulk-production track. Both run on the same platform substrate but use different order flows.

## What this is

White-label drop-ship for CPG. Partner manufactures + fulfills single units directly to the creator's end customers. Creator never owns inventory. Creator publishes branded products to their channels (Shopify, Amazon, TikTok Shop, etc.); orders flow back through iLaunchify to the partner; partner manufactures + drop-ships; tracking flows back to the channel.

The competitive frame is **Supliful (supplements) + Printify (print)** — both proven economics. iLaunchify's wedge is the orchestration thesis (V2 pooled production) + cross-vertical (supplements + shelf-stable food + cosmetics + pet) + integrated Design Studio + transparent cost breakdown.

## What this is NOT

- **Not the bulk-production track.** Bulk production stays as the primary path for creators who want inventory + reorder economics. Both tracks coexist permanently.
- **Not a separate app or vertical.** Same partners, same creators, same platform, same Stripe Connect. Different `fulfillmentMode` on the product.
- **Not a regulator step.** iLaunchify still does not certify, register, or verify against issuing bodies. The cert + claim chain pattern from `LEGAL_AUTHORITIES.md` + `ilaunchify-cert-liability-pattern.md` applies unchanged.
- **Not full V1.** V1 finish-line ships bulk-only. On-demand lands V1.5+.

## The nine locked decisions

| # | Decision | Locked answer | Why |
|---|---|---|---|
| 1 | Per-product fulfillmentMode | Per-product flag, partner-controlled | Partners offer on-demand for SKUs where they can drop-ship single units; bulk for SKUs that require batch runs. Granular |
| 2 | Channel scope | All channels (phased) | Shopify V1.5 → Amazon + Etsy V2 → TikTok Shop + WooCommerce V2.1 |
| 3 | Payment intermediation | Pattern A.5 — Hybrid | Channel pays creator's bank directly; iLaunchify invoices creator post-fulfillment via Stripe Connect Customer for partner cost + platform fee; iLaunchify pays partner via Stripe Connect Transfer |
| 4 | Pricing model | Free on-demand for creators; lower-platform-% = upgrade incentive | Industry-standard (Supliful + Printify) |
| 5 | Returns ownership | Partner-eats defect; customer-eats remorse | Industry-standard; codified in Partner Agreement Schedule X addendum |
| 6 | MOQ | Zero MOQ, true on-demand | Locked |
| 7 | Sample order exception | YES — single unit at cost | Industry-standard QA before publishing |
| 8 | Inventory out-of-stock UX | Show "Out of stock" with "Notify me when back" capture; admin Marketplace Management module override available | Loses social proof if hidden |
| 9 | Multi-channel pricing sync | Creator sets per-channel | Amazon take rate > Shopify; per-channel pricing matters |

Plus the Printify-adopted patterns from §8:

| # | Pattern | Locked answer |
|---|---|---|
| 10 | Default profit margin | 40% suggested global default; warning at 25%; hard floor at 20% |
| 11 | Order submission timing | 1-hour auto-submit default; Manual / 1h / 24h / Specific-time-daily / Daily-digest options |
| 12 | Order routing (V2) | Pavel-confirmed; checkbox + max-additional-cost ceiling + match-strictness toggle |
| 13 | Pricing transparency | Transparent breakdown (production + shipping + platform fee shown as separate lines) — iLaunchify's wedge vs Printify/Supliful |

## Architecture — how this maps to existing platform

**Already there (no change):**
- `ProductTemplate` model + Marketplace + Design Studio + Stripe Connect
- Partner verification + onboarding 5-layer + 10-state activation FSM
- Cert + claim chain (badge consent flow from C6 + C8 works the same)
- KYB document collection (C6 Schedule X applies — on-demand partners need same documents)

**New on `ProductTemplate`:**
- `fulfillmentMode` enum: `BULK_PRODUCTION` (current default) | `ON_DEMAND` | `BOTH`
- `recipeLocked` boolean — true for on-demand supplements per Mode 3 Declare Panel pattern; creator cannot modify recipe
- `onDemandWholesaleCost` decimal — partner's per-unit cost to iLaunchify
- `onDemandLeadTimeDays` int — partner's commitment (1-7 days typical)
- `onDemandMaxDailyCapacity` int — partner's daily fulfillment ceiling
- `onDemandInventoryStatus` enum: `AVAILABLE` | `LOW_STOCK` | `OUT_OF_STOCK` | `PAUSED_BY_PARTNER` | `PAUSED_BY_ADMIN`

**New models:**

```prisma
model ChannelOrder {
  id                    String   @id @default(cuid())
  productTemplateId     String
  creatorUserId         String
  channelType           ChannelType  // SHOPIFY | AMAZON | ETSY | TIKTOK_SHOP | WOOCOMMERCE | etc.
  channelConnectionId   String
  channelOrderRef       String       // external order ID from channel
  endBuyerEmail         String       // for fulfillment communication only
  shippingAddress       Json
  quantity              Int
  channelRetailCents    Int          // what end-buyer paid
  partnerWholesaleCents Int          // partner's cost to iLaunchify
  shippingCostCents     Int
  platformFeeCents      Int
  creatorNetCents       Int          // what creator receives after iLaunchify invoice
  status                ChannelOrderStatus  // RECEIVED | UNDER_REVIEW | SUBMITTED | IN_PRODUCTION | SHIPPED | DELIVERED | CANCELED | RETURNED | REFUNDED
  receivedAt            DateTime     @default(now())
  submittedAt           DateTime?
  shippedAt             DateTime?
  deliveredAt           DateTime?
  trackingNumber        String?
  trackingCarrier       String?
  cancellationReason    String?
  refundReason          String?
  productTemplate       ProductTemplate @relation(...)
  creator               User            @relation(...)
  channelConnection     ChannelConnection @relation(...)
  @@index([creatorUserId, status])
  @@index([productTemplateId])
  @@index([receivedAt])
}

model OnDemandPreferences {
  id                      String   @id @default(cuid())
  creatorUserId           String   @unique
  defaultProfitMarginPct  Float    @default(40.0)
  orderSubmissionTiming   OrderSubmissionTiming  @default(AUTO_1H)  // MANUAL | AUTO_1H | AUTO_24H | AUTO_SPECIFIC_TIME | DAILY_DIGEST
  orderSubmissionSpecificTime String?   // "12:00 PM UTC" for AUTO_SPECIFIC_TIME
  trackingNotifications   TrackingNotifyMode  @default(PER_ORDER)  // PER_ORDER | DAILY_DIGEST | NONE
  enableOrderRouting      Boolean  @default(false)  // V2
  maxAdditionalCostCents  Int?     @default(200)    // V2 — $2.00 default per Printify
  routingMatchStrictness  RoutingStrictness  @default(SIMILAR_OK)  // EXACT_ONLY | SIMILAR_OK
  creator                 User     @relation(fields: [creatorUserId], references: [id])
}

model PublishedProduct {
  id                    String   @id @default(cuid())
  productTemplateId     String
  creatorUserId         String
  channelConnectionId   String
  channelExternalId     String?  // product ID on the channel after publish
  retailPriceCents      Int      // creator's set retail on this channel
  status                PublishStatus  // DRAFT | PUBLISHING | LIVE | PAUSED | DEPUBLISHED
  publishedAt           DateTime?
  lastSyncedAt          DateTime?
  productTemplate       ProductTemplate @relation(...)
  creator               User @relation(...)
  channelConnection     ChannelConnection @relation(...)
  @@unique([productTemplateId, channelConnectionId])
}
```

**Schema gating:**
- Existing `Partner.onDemandCapabilityVerified` boolean — set true once admin verifies the partner's on-demand operational sub-section in onboarding
- Per-product `fulfillmentMode = ON_DEMAND` is server-side refused if `Partner.onDemandCapabilityVerified = false`

## The order flow

```
CREATE PHASE (no money flows)
─────────────────────────────
1. Partner publishes ProductTemplate with fulfillmentMode = ON_DEMAND or BOTH
2. Creator picks from Marketplace → Design Studio → brands the label
3. Creator clicks "Publish to channels" (instead of "Checkout")
4. Creator picks channel(s) + sets retail price (default from margin)
5. Server pushes product listing to channel via channel adapter
6. Channel returns product ID; PublishedProduct row stamps channelExternalId
7. Listing is live on creator's channel; NO production has happened

FULFILLMENT PHASE (money flows on every order)
────────────────────────────────────────────────
8. End customer orders on the channel (Shopify Buy button, Amazon checkout, etc.)
9. Channel webhook fires → iLaunchify ChannelOrder created with status=RECEIVED
10. Per creator's OnDemandPreferences.orderSubmissionTiming:
    - MANUAL: notify creator, wait for click-Submit
    - AUTO_1H: auto-transition status=SUBMITTED after 1h (default)
    - AUTO_24H: same after 24h
    - AUTO_SPECIFIC_TIME: batch-submit at chosen time daily
    - DAILY_DIGEST: notify-only; creator submits manually
11. status=SUBMITTED → Dispatch created → routes to partner
12. Partner accepts dispatch → status=IN_PRODUCTION
13. Partner manufactures + drop-ships → status=SHIPPED, tracking captured
14. Tracking auto-pushed back to channel → channel marks fulfilled
15. End customer receives → status=DELIVERED (if carrier provides confirmation)

PAYMENT FLOW (Pattern A.5 hybrid)
──────────────────────────────────
Channel pays creator's bank directly (Stripe Payments → creator's bank account)
On status=SHIPPED: iLaunchify creates Stripe Invoice on creator's stored Stripe Connect Customer:
  - Line: Partner wholesale cost ($X)
  - Line: Shipping cost ($Y)
  - Line: iLaunchify platform fee (% of retail)
  - Total auto-charged to creator's payment method
iLaunchify pays partner via Stripe Connect Transfer for (wholesale + shipping)
iLaunchify retains platform fee
```

## Where the fulfillment mode is picked — the create flow (LOCKED)

The fulfillment mode picker lives as the **first section of "How it ships"** (step 3 of 4) in the partner Create Product stepper. Memory file `ilaunchify-fulfillment-mode-terminology` carries the full pattern lock; this section summarizes.

Three radio cards in this order:

1. **Bulk production only** (Default tag) — available to every active partner
2. **Both — creators choose** (RECOMMENDED tag, selected by default for capable partners) — requires `Partner.onDemandCapabilityVerified = true`
3. **On-demand drop-ship only** (locked behind capability unlock if not verified) — requires `Partner.onDemandCapabilityVerified = true`

Each card includes: Lucide icon (ti-stack-3 / ti-rocket / ti-bolt) + label + one-sentence description + three "perks" / characteristics. Locked cards show an inline unlock CTA pointing to the partner onboarding On-Demand sub-section.

Below the cards: info pill saying "Most partners pick Both because it lets you serve both the small-volume drop-ship creator and the large bulk-order creator from the same product."

### What changes downstream by mode

| Mode picked | Step 4 "What it costs" shows | Editor cards rendered |
|---|---|---|
| `BULK_PRODUCTION` | MOQ-tier pricing matrix | All current cards + Variants & Pricing (with MOQ tiers). No On-Demand Settings card |
| `ON_DEMAND` | Wholesale-per-unit + shipping rate field | All current cards + new On-Demand Settings card. No MOQ-tier card |
| `BOTH` | Dual section: "Bulk production pricing" + "On-demand wholesale pricing" | All cards. Variants & Pricing carries "Used for bulk orders" note; On-Demand Settings carries "Used for drop-ship orders" note |

### Editor top-bar pill

After save → partner lands in editor. Mode shown as a pill in the editor top bar: `Fulfillment: Both ▼`. Click → confirmation modal explaining consequences of switching modes (e.g., switching from BOTH to ON_DEMAND hides MOQ tier configuration; existing slot data preserved but inaccessible).

Mode change writes an AuditLog row `FULFILLMENT_MODE_CHANGED` with from/to values + actor + optional reason.

### Locked terminology

NEVER use "direct sell", "production order", "wholesale", "POD", "made-to-order", or "made-to-stock" anywhere in the platform. Only the three locked labels:

- Partner-facing: **Bulk production / On-demand drop-ship / Both**
- Creator-facing: **Pre-order with bulk discount / Sell on your channels (drop-ship) / Either way**

Locked across product creation, editor, marketplace display, admin reviews. See memory file `ilaunchify-fulfillment-mode-terminology` for the full rules.

## Settings surfaces

### Creator-side: `/settings/on-demand-preferences`

Modeled on Printify's Store Settings (per the screenshots Pavel shared). Single-page with five sections:

1. **Default profit margin** — slider + number input, default 40%, warning copy "Going below 40% can be risky and may leave little buffer for fees or unexpected costs."
2. **Order submission timing** — radio group: Manual / 1h auto / 24h auto / Specific time daily (time picker) / Daily digest. Note: "All sample, flagged-for-review, and bulk orders must be submitted manually regardless."
3. **Tracking notifications** — Per-order / Daily digest / None.
4. **Order routing** (V2 — disabled in V1.5) — Enable checkbox + max-additional-cost field + match-strictness toggle. Disabled state with "Coming in V2" badge.
5. **Channel-specific defaults** (V2 onwards) — per-channel margin override, per-channel auto-publish behavior.

### Partner-side: `/partner/products/[id]/edit` — On-demand sub-section

Per-product toggle within the existing Product Builder editor. Gated on `Partner.onDemandCapabilityVerified = true` set during onboarding.

Fields:
- "Available for on-demand drop-ship" toggle
- Wholesale cost per unit (USD)
- Lead time (1-7 days)
- Max daily fulfillment capacity
- Inventory status (Available / Low stock / Paused — partner self-pause)
- Packaging variants available on-demand
- Special handling notes (e.g., "ships with ice pack from Apr-Oct")

Plus the existing onboarding sub-section for on-demand capability verification (Layer 3 extension).

### Partner-side: `/partner/on-demand/orders`

Streaming order queue, separate from bulk dispatch queue. FIFO, with per-order:
- Channel + creator + product + quantity + ship-to
- Countdown timer (acceptance SLA window)
- Accept / Decline buttons
- Status pill

Plus `/partner/on-demand/inventory` for inventory level management + capacity throttling.

### Admin-side: `/admin/on-demand/*` section

Four sub-pages under existing admin sidebar:
- `/admin/on-demand/products` — all on-demand products, filter by partner/status/category
- `/admin/on-demand/orders` — order stream platform-wide with SLA tracking, late-fulfillment flags
- `/admin/on-demand/partners` — capability + capacity + fulfillment-rate dashboard per on-demand partner
- `/admin/on-demand/channels` — channel integration health, webhook delivery stats, last-sync timestamps

Plus the **Marketplace Management module** Pavel mentioned (separate larger task) gets a toggle: "Force-hide out-of-stock products" — admin-only override that hides instead of showing "Out of stock" on the marketplace.

## Roadmap

### V1.5 — Minimal viable on-demand (post-V1 launch, ~3 weeks)

**Scope:** ship to 1-2 beta supplement partners + 3-5 beta creators on Shopify only. Test the loop end-to-end.

- Schema: ProductTemplate.fulfillmentMode + recipeLocked + cost fields + OnDemandPreferences + PublishedProduct + ChannelOrder models
- Mode 3 (Declare panel) + recipeLocked behavior — partner declares fixed formulation
- Supplement Ingredient Library (new IngredientSource value + NIH DSLD seed)
- Partner on-demand toggle in Product Builder + onboarding capability sub-section
- Creator "Publish to channels" button (single-channel: Shopify only)
- `/settings/on-demand-preferences` creator page (Printify-pattern layout)
- Shopify product publish via Shopify Admin API (REST or GraphQL — pick whichever has lower rate limits for V1.5)
- Manual channel order processing for V1.5 (no webhook automation yet) — partner sees Shopify order email + manually creates iLaunchify dispatch
- Per-fulfilled-order Stripe Connect Invoice + Transfer flow
- Basic /admin/on-demand/* surfaces (read-only)
- Returns workflow (manual admin handling)

### V2 — Real on-demand at scale (~6 weeks)

- Real Shopify Order webhook integration (no manual processing)
- Auto-submit per creator timing preferences
- Per-order routing engine — Printify-pattern with cost ceiling + match strictness
- Real-time partner inventory signaling to channel (Shopify "in stock" / "out of stock" sync)
- Amazon Seller Central + Etsy integration
- /admin/on-demand/* full v2 surfaces with actions
- Returns workflow automation
- Pooled inventory partner offering (the orchestration moat lands here)
- Multi-channel pricing sync — per-channel override capability

### V2.5 — Channels at full breadth (~3 weeks)

- TikTok Shop + WooCommerce
- Inventory pause vs hide admin toggle (Marketplace Management module overlap)
- Volume reward / multi-channel discount (Pavel deferred this decision)

### V3 — Distribution platform (~6 weeks)

- Walmart Marketplace + BigCommerce + Wix
- Pricing optimization (creator sees suggested retail by category)
- Buyer-side analytics (channel-permitted)
- Pooled inventory + buffer inventory model (full V2 moat realization)

## Regulatory + legal inheritance

Everything from the existing legal framework applies unchanged:
- Creator-as-brand-of-record liability allocation per Creator Agreement §3 + LEGAL_AUTHORITIES §1
- Partner cGMP + FFR + COI per KYB collection memo applies — on-demand partners need same docs
- Cert claim chain + consent-at-claim per CERT_LIABILITY_PATTERN memo
- Compliance UX pattern per COMPLIANCE_UX_PRINCIPLES (quiet by default + outcome-framed)
- Document handling per GDPR layer (P10 foundation + C5 full)

What's **new** for on-demand specifically:
- **Per-order COA forward-pointer** for supplement on-demand (forward to V2.5)
- **State-level supplement business registration warning** — creator-side onboarding flag on first on-demand publish to NY / CA / FL
- **End-customer data privacy** — channel sees customer; iLaunchify + partner see only shipping address. Partner Agreement Schedule X gets a sub-clause: partners cannot use end-customer data for any purpose other than fulfilling the specific order.

## Returns workflow

Per the locked decision: partner-eats defects, customer-eats remorse.

**Defect / quality flow:**
1. End customer reports issue via creator's channel
2. Creator submits Return Request via iLaunchify creator app with photos + order ID
3. iLaunchify admin reviews within 1 business day
4. If approved: partner ships replacement + creator's invoice reversed; partner eats cost
5. AuditLog row + RMA generated
6. If repeated defects from same partner → admin flagged, partner verification re-review triggered

**Buyer's remorse flow:**
1. End customer requests return via channel
2. Creator's channel return policy applies — creator absorbs cost
3. iLaunchify does NOT issue refund or restock
4. No iLaunchify involvement beyond optional dispute audit

**Safety / allergic reaction flow:**
1. End customer reports adverse event
2. Creator escalates via iLaunchify
3. Admin + creator + partner + legal counsel review
4. Case-by-case; potential supplement adverse event reporting per 21 U.S.C. §379aa-1
5. AuditLog row + escalated incident tracking

Schedule X addendum to Partner Agreement codifies this.

## Notifications (Pavel: "include where needed, don't overdo it")

The minimum set:

**Creator:**
- Channel order received (only when submission timing is MANUAL)
- Order shipped (with tracking)
- Order delivered
- Out-of-stock product they have published (notify within 1h)
- Cert revocation affecting their published products
- Low margin warning (only when retail < cost + platform fee, blocks publish)

**Partner:**
- New dispatch received (countdown for SLA)
- Late dispatch warning (at 80% of SLA window)
- Low inventory alert (at threshold)
- Returns RMA generated
- Monthly fulfillment summary

**Admin:**
- Partner missed SLA repeatedly
- Channel webhook failure burst
- Returns above weekly threshold
- Pooled inventory threshold breach (V2)

That's it. Don't add: per-order status updates to creator beyond shipped/delivered; daily activity emails by default (creator opt-in only); marketing prompts.

## What I might have missed — flag for Pavel

1. **Stripe Connect Express vs Custom** — creator-side billing for the post-fulfillment invoice flow requires creator's Stripe Connect Customer to be set up. Stripe Connect Express works; doesn't need creator to do separate setup beyond what bulk-production already requires.
2. **Cross-track pricing** — when a product has `fulfillmentMode = BOTH`, what stops a creator from doing bulk production at lower cost to undercut their own channel listings? Mostly self-policing; one watchout: don't show creator both wholesale-cost (bulk) and per-order-cost (on-demand) side-by-side without context.
3. **Channel listing duplicates** — if creator publishes the same ProductTemplate to multiple channels, that's intentional. If creator publishes twice to the same channel — server refuse (unique constraint on `[productTemplateId, channelConnectionId]`).
4. **Tax** — channel handles end-buyer sales tax. iLaunchify's per-fulfilled-order platform fee is B2B revenue; standard B2B SaaS tax treatment.
5. **Maker tier on-demand visibility** — Maker can publish on-demand but pays the highest platform-fee % (15%). Reconfirmed industry pattern: don't lock features by tier; lock margin by tier.

## See also

- `docs/builds/on-demand-pricing-economics.md` — locked pricing model
- `.claude/memory/ilaunchify-on-demand-business-model.md` — design lock
- `.claude/memory/ilaunchify-cert-liability-pattern.md` — applies unchanged
- `.claude/memory/ilaunchify-kyb-document-collection.md` — applies to on-demand partners
- `docs/design/COMPLIANCE_UX_PRINCIPLES.md` — applies unchanged to on-demand surfaces
