# Creator Sales-Channel Management (spec + implementation plan)

**Status:** Proposed (research complete, Pavel review pending) · **Owner:** Cowork (spec), build split per phase · **Doc pair:** `PLATFORM_SPEC.md` §Channels, `CREATOR_ONBOARDING.md` step 3, `PRODUCTION_ORCHESTRATION.md`, schema §CHANNELS (Channel / ChannelConnection / ChannelProductLink — the V1 shell this spec fills in)

## 1. The job

Creators sell on channels they already own (Shopify, TikTok Shop, Amazon, Walmart, Etsy,
WooCommerce). iLaunchify is the production side (B2B; end buyers never touch us — LOCKED).
Channel management is the bridge: **push finished products out** (listings, images, prices,
inventory) and **pull consumer orders in**, route them to partners, and push fulfillment
truth (tracking) back. Two commercial modes drive everything:

- **ON-DEMAND** — no stock. A consumer order on the channel triggers a production order
  to the pinned manufacturer (print/pack/ship per order). GATE: the manufacturer must
  have pre-confirmed they accept on-demand orders for THIS product with THIS branding.
- **BULK (stocked)** — a produced batch must be DELIVERED (creator address / fulfillment
  center / manufacturer storage) and received before the listing may go live; channel
  inventory = available-to-sell from that stock; sales decrement it.

## 2. Research summary (what the industry converged on)

- **Printful/Printify pattern (our on-demand blueprint):** store connect via OAuth app →
  "synced products" (platform product ↔ channel listing/variant mapping) → ONLY paid,
  unfulfilled orders with ≥1 synced product auto-import → optional manual-confirm holds
  orders as drafts → fulfillment + tracking sync back (partial + complete) → stock-sync
  marks variants in/out of stock. The critical concept is the **variant-level link**
  (external variant id ↔ platform variant), not product-level.
- **Multichannel IMS pattern (our bulk blueprint):** Sellbrite/Linnworks/Veeqo keep ONE
  inventory pool with per-channel allocation rules and bidirectional sync to prevent
  overselling; orders route by rules (warehouse, carrier, priority). We need the same
  available-to-sell ledger, scoped per product × variant × storage location.
- **Build vs unified API (Rutter/API2Cart):** unified APIs give breadth (60+ carts) fast
  but add a vendor in the money/order path, generic data models, and per-connection cost.
  Native gives control + first-class webhooks. Industry consensus: native for your TOP
  channels, aggregator for long-tail. → We define ONE adapter seam and back it natively
  for Shopify/TikTok/Amazon/Walmart; a unified-API adapter can serve long-tail later
  without touching callers (same philosophy as `@ilaunchify/imagegen`).
- **Channel API surfaces (2026):** Shopify = Admin GraphQL API, public app via Dev
  Dashboard + OAuth, webhooks (orders/create, orders/paid, inventory_levels/update,
  fulfillment events), least-scope review. TikTok Shop = Partner Center app, OAuth2,
  products/orders/fulfillment/returns APIs + webhooks. Amazon = SP-API (JSON_LISTINGS_FEED
  ≤25k SKUs, Orders API, Feeds async; MCF/Fulfillment-Outbound for FBA-stocked goods —
  hooks into the logistics workstream). Walmart = Marketplace API, OAuth2 15-min tokens,
  items/inventory/orders/price groups.

## 3. Architecture

### 3.1 `@ilaunchify/channels` — the adapter seam (new package)

```ts
interface ChannelAdapter {
  code: 'shopify' | 'tiktok' | 'amazon' | 'walmart' | ...
  // Connect
  buildAuthUrl(state): string
  exchangeCode(code): TokenSet            // stored as refs (secret store), never raw
  refresh(tokens): TokenSet
  // Catalog →
  pushListing(conn, listing): ExternalListing        // product + variants + images + price
  updateListing / archiveListing
  setInventory(conn, externalVariantId, qty | 'MADE_TO_ORDER')
  // Orders ←
  registerWebhooks(conn) / verifyWebhook(headers, body)
  pullOrders(conn, since)                             // poll fallback — webhooks miss
  ackOrder(conn, externalOrderId)
  // Fulfillment →
  pushFulfillment(conn, externalOrderId, tracking[])  // partial + complete
  cancelExternalOrder?, refund boundary = NOT ours (creator handles channel-side)
}
```

Deterministic **stub adapter** (like imagegen's) so every flow runs keyless in dev.
All network calls timeout-capped + logged (`SyncEvent`) — lesson from the fal freeze.

### 3.2 Schema (additive; extends the existing V1 shell)

- `ChannelConnection` +`webhookSecretRef`, +`settings Json` (auto-import on/off,
  manual-confirm holds, price rounding rule, location mapping).
- `ChannelProductLink` +`mode ('ON_DEMAND'|'BULK')`, +`price Decimal`, +`currency`,
  +`publishState (DRAFT|PUSHED|LIVE|PAUSED|ERROR)`, +`lastError`.
- **`ChannelVariantLink`** (new) — externalVariantId ↔ productId × flavorPresetId ×
  packOption; per-variant price + SKU/GTIN echo. The atom of sync.
- **`ChannelOrder`** (new) — externalOrderId, connectionId, rawPayload Json (legal
  snapshot — operational-trust rule), buyer ship-to (PII-scoped), financial summary,
  FSM: `IMPORTED → MAPPED → READY → ROUTED → IN_FULFILLMENT → FULFILLED → CLOSED`
  (+ `ON_HOLD`, `NEEDS_ATTENTION`, `CANCELLED`). +`ChannelOrderLine` (qty, external
  line id, variantLinkId, unit price).
- **`OnDemandEnablement`** (new) — creator×product×manufacturerService agreement FSM:
  `REQUESTED → PARTNER_REVIEW → ENABLED | DECLINED | SUSPENDED`; snapshot of approved
  branding (design version id, die-line, unit price). Partner-facing; audited.
- **`InventoryPool` + `InventoryLedger`** (new) — bulk available-to-sell per
  productId × flavorPresetId × storageLocation (creator / FC / partner-storage — the
  same location model the logistics workstream will use). Ledger entries:
  `DELIVERY_RECEIVED, CHANNEL_SALE, RELEASE (cancel), ADJUSTMENT, RESERVATION`.
  Channel inventory pushes derive from pool minus reservations — never hand-set.
- **`ChannelSyncEvent`** (new) — every push/pull/webhook with direction, payload digest,
  outcome, retry count. Powers admin observability + incident debugging.

### 3.3 Order flow per mode

**ON-DEMAND**: webhook `orders/paid` → verify → `ChannelOrder(IMPORTED)` → line mapping
via `ChannelVariantLink` (`MAPPED`; unmapped → `NEEDS_ATTENTION` inbox) → gate check:
`OnDemandEnablement=ENABLED` for every line's product (else `ON_HOLD` + notify) →
`READY` → **existing** `create-order` pipeline creates the production order tagged
`origin: CHANNEL` (routing stays OWNER-PINNED; dispatch-planner + accept-reminders
unchanged — the manufacturer still confirms each dispatch) → `ROUTED` → partner ships
(per logistics spec: to consumer for on-demand) → tracking → `pushFulfillment` →
`FULFILLED`. Manual-confirm setting holds orders at `READY` for creator approval
(Printful's draft pattern).

**BULK**: listing `publishState=LIVE` allowed ONLY when pool qty > 0 for every variant
(go-live gate = first delivery confirmed received). Webhook → `ChannelOrder` → map →
reserve from `InventoryPool` (`RESERVATION`; insufficient → `NEEDS_ATTENTION` +
inventory sync pushes 0 to prevent repeat oversell) → fulfillment leg depends on stock
location: creator self-ships (V1 — mark-fulfilled UI + tracking input), FC/partner-
storage ships (logistics workstream owns execution; this spec only emits the
fulfillment task) → tracking → pushback → `SALE` ledger entry on completion.

**Inventory sync**: ON_DEMAND listings push "in stock / made-to-order" (capped by an
optional partner capacity setting); BULK pushes `pool − reservations` on every ledger
write, debounced. Bidirectional guard: we are the source of truth; channel-side manual
edits get overwritten (logged).

### 3.4 Surfaces

- **Creator** — `/channels` hub (connect via OAuth, per-connection health + settings,
  tier-capped 1/3/6 per PLATFORM_SPEC); product page "Sell" tab (choose channel(s),
  mode, price with margin hint vs unit cost, push/pause, per-variant mapping review);
  channel-orders inbox inside `/orders` (filter chips: needs-attention / on-hold /
  in-fulfillment), manual-confirm queue, self-ship flow for bulk-at-home.
- **Partner** — On-Demand Requests queue (review branding snapshot + die-line + price →
  enable/decline, terms note); on-demand dispatches arrive through the EXISTING
  dispatches surface (tagged Channel · On-Demand, with consumer ship-to on the
  manifest); optional capacity cap per product.
- **Admin** — Channels registry (exists; wire `oauthConfigured` from env like the
  Integrations registry); connections list (health, last sync, error states);
  ChannelSyncEvent log (admin-v2 surface pattern); ChannelOrder oversight list;
  OnDemandEnablement oversight; per-channel kill switch (disable ingest on incident).

### 3.5 Cross-cutting rules

- Money boundary unchanged: consumer payment lives on the channel; iLaunchify bills the
  creator for production (on-demand per order — creator's saved payment method funds
  each production order automatically, with a spending cap + failure → `ON_HOLD`).
- Consumer returns stay creator-side (LOCKED in PLATFORM_SPEC §196).
- Tokens as refs in the secret store; webhook signature verification mandatory; all
  mutations audited; tenant isolation guards on every connection-scoped action.
- Every state change through FSM helpers; raw channel payload snapshots immutable.

## 4. Implementation phases + scope checklist

### Phase C0 — Foundation (no external keys needed)
- [ ] `@ilaunchify/channels` package: `ChannelAdapter` type + deterministic stub adapter
- [ ] Schema additions §3.2 (all additive) + `pnpm db:push` + seed 6 Channel rows check
- [ ] `ChannelOrder` FSM helper + audit wiring (packages/orders or channels)
- [ ] Creator `/channels` hub page (connect buttons stub-wired, health cards)
- [ ] Product "Sell" tab shell: mode select, price input, push (stub), variant map view
- [ ] Admin: connections list + ChannelSyncEvent log (admin-v2 pattern)
- [ ] Notifications: channel-order events into `@ilaunchify/notifications`

### Phase C1 — Shopify end-to-end (first real adapter)
- [ ] Shopify public app (Dev Dashboard) + OAuth flow + token-ref storage + least scopes
- [ ] Listing push: product + variants (flavors × pack) + mockup images + price
- [ ] Webhooks: orders/paid, orders/cancelled, app/uninstalled + HMAC verify + poll fallback
- [ ] Inventory push (made-to-order / pool qty) via inventory levels
- [ ] Fulfillment/tracking pushback (partial + complete)
- [ ] Env keys → Integrations registry rows; `oauthConfigured` derived

### Phase C2 — Modes + routing (the business core)
- [ ] `OnDemandEnablement` FSM + partner review queue UI + creator request flow
- [ ] On-demand: ChannelOrder → create-order pipeline (`origin: CHANNEL`), auto-billing
      w/ spending cap, dispatch tagging, consumer ship-to on manifest
- [ ] Bulk: InventoryPool + ledger + delivery-received intake (creator confirm UI) +
      go-live gate + reservation on sale + oversell guard (push 0)
- [ ] Creator channel-orders inbox (needs-attention / on-hold / manual-confirm)
- [ ] Bulk self-ship flow (mark fulfilled + tracking input → pushback)

### Phase C3 — TikTok Shop adapter
- [ ] Partner Center app + OAuth2 + products/orders/fulfillment mapping to the seam
- [ ] TikTok-specific listing constraints (category attributes, image rules)

### Phase C4 — Amazon (SP-API)
- [ ] SP-API app + LWA auth; JSON_LISTINGS_FEED listing push; Orders API ingest
- [ ] FBA/MCF hook: when creator stocks at Amazon, fulfillment delegates to MCF
      (joint with the logistics workstream — FC location type 'AMAZON_FBA')

### Phase C5 — Walmart + long-tail
- [ ] Walmart Marketplace adapter (15-min token handling)
- [ ] Evaluate unified-API adapter (API2Cart/Rutter) for Etsy/Woo/Wix long-tail behind
      the same seam; decide per cost + creator demand

### Cross-cutting (runs through every phase)
- [ ] Rate-limit + retry + timeout policy per adapter (SyncEvent-logged)
- [ ] Security review: token store, webhook endpoints, tenant guards (Tier 0 rules)
- [ ] Tier gating: connection caps 1/3/6; on-demand mode Builder+? (Pavel decision)
- [ ] Vitest goldens: FSMs, variant mapping, ledger math, oversell guard (pure funcs)
- [ ] Runbook: token expiry, webhook outage → poll recovery, kill-switch procedure

## 5. Decisions (LOCKED — Pavel 2026-07-02)

1. **On-demand auto-billing: per consumer order.** Each imported channel order charges
   the creator's saved payment method for the production cost automatically. Guard
   rails: a daily spending cap (default from the admin `OrderSettings` singleton,
   creator may lower it; orders past the cap hold at `ON_HOLD` + notify) and payment
   failure → `ON_HOLD`, never silent drop.
2. **On-demand mode is open to Maker** — no tier gate on the mode itself (channel
   CONNECTION counts stay tier-capped 1/3/6 per PLATFORM_SPEC).
3. **Creator sets channel price freely.** The Sell tab shows a margin hint against
   unit production cost (and warns below cost) but never blocks.
4. **Long-tail unified-API vendor: DEFERRED to C5.** Big four are native. At C5,
   evaluate API2Cart/Rutter-class vendors against real creator demand for Etsy/Woo/
   Wix/eBay, weighing vendor-in-the-order-path risk (outage coupling, third-party data
   transit, generic data model) vs per-channel build cost. The adapter seam makes the
   choice reversible.
5. **Manual-confirm ON for each connection's first 10 channel orders** (training
   wheels): orders hold at `READY` for creator approval; after 10 successfully
   fulfilled, the connection offers one-click switch to full-auto (still creator-
   toggleable both ways in settings).

## 6. Out of scope (here)

Consumer storefront (LOCKED out), channel-side returns handling, logistics execution
(separate workstream — this spec only emits fulfillment tasks + location types), ads/
marketing APIs, analytics dashboards beyond order lists (V2).
