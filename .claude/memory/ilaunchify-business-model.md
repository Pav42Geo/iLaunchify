---
name: ilaunchify-business-model
description: "The actual V1 business model of iLaunchify — B2B production marketplace, NOT a consumer storefront. Confirmed by Pavel 2026-05-19 after I built the wrong storefront direction."
metadata: 
  node_type: memory
  type: project
  originSessionId: f1d70585-c159-4eab-861c-0f3599bfdeaf
---

iLaunchify is a **B2B production marketplace + manufacturing fulfillment platform**. It is NOT a consumer storefront, NOT a payment processor for end buyers, and NOT involved in any consumer-side transactions.

## Three party types

1. **Admin** (Pavel + team) — runs the platform
2. **Creator** — iLaunchify's customer. Picks templates, customizes, places **production orders**. Pays iLaunchify.
3. **Partner** — three sub-types via `PartnerService.type`:
   - MANUFACTURING / COPACKING — produces the goods
   - LABEL_PRINTING — prints labels
   - WAREHOUSE (planned, not yet in schema) — optional 3PL that holds the creator's inventory after production

There is **no consumer in iLaunchify**. End buyers exist, but they buy on the creator's external channel (Shopify, Amazon, Etsy, etc.), not on iLaunchify.

## The flow

```
Creator picks template → customizes → places PRODUCTION ORDER → pays iLaunchify
    ↓
iLaunchify routes to manufacturer + print provider
    ↓
Partners produce + dispatch
    ↓
Goods shipped to one of:
   - Creator's own warehouse/address
   - A WAREHOUSE partner (3PL holding inventory) — optional
    ↓
Order DELIVERED → iLaunchify is done with this order
    ↓
Separately, asynchronously, on creator's schedule:
   Creator pushes finished SKU to their external channel listings (Shopify etc.)
   Consumers buy on those channels — creator's revenue
   Fulfillment from creator's warehouse OR warehouse partner
   iLaunchify is NOT in this loop.
```

## Money flow

Only one money flow exists in iLaunchify:

```
Creator → iLaunchify Stripe (pays for the production batch + platform fee)
    ↓
iLaunchify holds funds (application fee withheld)
    ↓
On dispatch SHIPPED, Transfer queued to partner Stripe Connect account
    ↓
Partner gets paid for their portion
```

**Consumer money never touches iLaunchify.** Refunds/returns to consumers happen entirely on the channel side. The consumer relationship belongs to the creator.

## Channels (Shopify / Amazon / Etsy / Walmart / WooCommerce / TikTok)

Connected channels are for the creator's convenience: push a finished iLaunchify SKU to their channel listings. In V1:
- iLaunchify pushes product listings TO channels (when creator clicks "Push")
- iLaunchify does NOT receive consumer orders from channels
- iLaunchify does NOT process consumer payments from channels
- iLaunchify does NOT handle consumer-side refunds (creator handles via channel)

Channel availability is admin-controlled — each channel has an on/off toggle in admin.

## What the iLaunchify `Order` model represents

`Order` = **a creator's production order**. Not a consumer purchase. Fields should be named accordingly: `creatorUserId` not `consumerUserId`. The shape includes:
- Which template + variant + quantity
- Where to ship the finished goods (creator address OR a selected WAREHOUSE partner service)
- Money: subtotal, fees, total
- Routing: which manufacturer + print partner got assigned

## What was WRONG (deleted)

I initially built `apps/storefront` as a consumer-facing brand-themed storefront with cart, checkout, ConsumerUser, Cart, CartItem models. This was incorrect for V1 — those concepts belong to Shopify, not iLaunchify. Delete the storefront app and drop those models when reshaping.

## How to apply this

When designing any feature, ask: "Does iLaunchify own this, or does the creator's external channel?"
- Consumer purchase, payment, email, support, returns → channel
- Production order, partner routing, partner payouts, compliance, label design, marketplace → iLaunchify

When in doubt, the boundary is "delivery to creator/warehouse." Before delivery = iLaunchify. After delivery = creator's external channel.

Links: [[ilaunchify-three-party-types]] (TODO if useful later)
