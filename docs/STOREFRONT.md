# Storefronts — iLaunchify's role

**Last updated:** 2026-05-19 (canonical correction of the prior model — see git history for the original draft).

## Headline

**iLaunchify does not host consumer storefronts.** Creators connect their existing external sales channels (Shopify, Amazon, Etsy, WooCommerce, Walmart, TikTok). iLaunchify is the production + fulfillment backend, not the storefront.

The `apps/storefront` app that previously existed in this repo was built against an incorrect mental model and has been removed.

## The right model

```
Creator
  │
  ├─ uses iLaunchify to:
  │    - browse the marketplace of manufacturer-listed product templates
  │    - customize (slot replacements, optional ingredients, packing type)
  │    - design the label, run compliance
  │    - place a PRODUCTION ORDER and pay iLaunchify
  │    - watch the order route to manufacturer + print provider
  │    - take delivery of finished goods (own warehouse OR WAREHOUSE partner)
  │
  └─ uses their own channels (Shopify / Amazon / Etsy / WooCommerce /
     Walmart / TikTok) to:
       - list the finished SKU
       - sell to end buyers
       - collect payment from buyers
       - handle consumer email, returns, support
```

The end buyer is the **creator's** customer, not iLaunchify's. The creator's revenue from end buyers stays in their channel — none of it flows through iLaunchify.

## What iLaunchify does for channels

In V1: nothing (channels are purely the creator's concern).

In V1.1+ (post-launch): "Push to channel" — once a creator's production order is delivered, they click a button in the iLaunchify creator app to push that SKU as a listing to a connected channel. This is convenience only; the creator can also list manually.

Channel availability is admin-controlled. Each channel has an on/off toggle in admin. Initial channel coverage: Shopify (V1.1), then Amazon, WooCommerce, Etsy, Walmart, TikTok as separate integrations.

## Money flow

```
Creator pays iLaunchify (production order + platform fee)
   │
   ▼
iLaunchify Stripe (holds funds; application fee withheld)
   │
   ▼
On dispatch SHIPPED → Transfer to partner Stripe Connect account
   │
   ▼
Partner gets paid for their portion of production
```

```
Consumer pays creator's channel (Shopify, Amazon, etc.)
   │
   ▼
Creator's own revenue, in the creator's connected payment account.
   │
   ▼
iLaunchify is NOT in this flow at any point.
```

Refunds, chargebacks, and disputes from end buyers are handled in the channel. iLaunchify does not observe or process consumer money events in V1.

## What this kills from earlier design drafts

The previous version of this document described:
- `apps/storefront` Next.js app at `shop.ilaunchify.com/{handle}`
- Brand-themed Hero / ProductGrid / ProductCard / About brand pages
- Consumer cart + checkout flow via Stripe Checkout
- `Cart` / `CartItem` / `ConsumerUser` Prisma models
- Per-creator handle-based public URLs
- Consumer transactional email templates (order placed, shipped, delivered)
- SEO / Open Graph / sitemap for consumer pages

All of the above is **out of scope for iLaunchify**. Those concepts belong to whatever external channel the creator chose.

## What still belongs to iLaunchify

The creator-facing surfaces that exist or are coming:
- Marketplace browsing (`apps/creator/marketplace`)
- Template customize flow with live nutrition + compliance
- Design Studio for label artwork (deferred; Fabric.js)
- Production-order placement + checkout (creator pays iLaunchify)
- Order tracking from the creator's POV: which dispatches are accepted / producing / shipped / delivered
- "Push finished SKU to channel" action (V1.1+)
- Channel connection UI per creator

The partner-facing surfaces:
- Onboarding wizard with verification
- Partner portal: dashboard / orders inbox / dispatch detail / services / payments / settings / my-application
- Partner Stripe Connect Express

The admin surfaces:
- Leads inbox, Partner CRM, Orders, Audit log, Verification queue (Phase A complete)
- Channel registry (which channels are enabled, OAuth credentials per channel) — V1.1
- Warehouse partner CRM segment — once `WAREHOUSE` ServiceType lands

## Schema implications

After the model correction (May 2026), the following models will be removed:
- `Cart`, `CartItem`, `ConsumerUser`
- `Order.consumerUserId` and `Order.consumerEmail` → renamed `Order.creatorUserId` (the creator IS the iLaunchify customer)
- `Brand.handle` — kept for "push to channel" namespacing, but no longer powers a public URL

The following models will be added:
- `Channel` (admin registry: code, displayName, enabled, oauthConfigured)
- `ChannelConnection` (per-creator OAuth token store)
- `ChannelProductLink` (iLaunchify Product ↔ external listing id)

The following `ServiceType` enum value will be added:
- `WAREHOUSE` — third-party fulfillment partners that hold creator inventory after production delivery

## See also

- Memory: `ilaunchify-business-model.md` — canonical reference for this model
- `docs/FOD_RECOVERY_PLAN.md` — sequencing the schema reshape + channel scaffolding
- `docs/PAYMENTS.md` — money flow (note: large portions still describe the deleted consumer-checkout model and will be rewritten as production-order checkout lands)
