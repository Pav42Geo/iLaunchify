# Creator Sales-Channel Management (spec + implementation plan)

**Status:** Proposed (research complete, Pavel review pending) · **Owner:** Cowork (spec), build split per phase · **Doc pair:** `PLATFORM_SPEC.md` §Channels, `CREATOR_ONBOARDING.md` step 3, `PRODUCTION_ORCHESTRATION.md`, schema §CHANNELS (Channel / ChannelConnection / ChannelProductLink — the V1 shell this spec fills in)

## 1. The job

Creators sell on channels they already own. **Supported roster (LOCKED 2026-07-02, 10):**
Shopify, TikTok Shop, Amazon, Walmart (the "big four", native-first) + Etsy, WooCommerce,
Wix, Squarespace, BigCommerce, eBay (the "long-tail six", committed coverage — see C5).
iLaunchify is the production side (B2B; end buyers never touch us — LOCKED).
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

### 3.5a Inventory transparency & replenishment intelligence (added 2026-07-02)

**The question:** many channels, ONE inventory — how does a creator see everything and
never run dry? Research (reorder-point science: ROP = velocity × lead time + safety
stock, recalculated daily; Amazon's Restock dashboard pattern: days-of-supply +
recommended qty + recommended date, 30–60 days sweet spot; Cin7/Katana: per-location
reorder points + low-stock alerts) maps onto us with TWO advantages no generic IMS
has: **we know the real manufacturer lead time** (per-flavor lead engine incl.
changeover, `@ilaunchify/orders`) and **we see incoming production orders in flight**
— merchants elsewhere hand-enter both.

**Model (per product × variant × storage location — per-location ROPs are best practice):**
- `velocity` — units/day from ChannelOrderLine history (blend 7-day and 30-day,
  weighted recent; recompute daily, and on every ingest).
- `leadDays` — effectiveProductLead(product) + admin processing buffer
  (OrderSettings). Later: observed variance from actual order history (per-partner
  reliability), feeding safety stock.
- `safetyStock` — V1: configurable days-of-cover × velocity (admin default,
  creator-overridable per product). V2: z × σ_demand × √leadDays (service-level).
- `reorderPoint = velocity × leadDays + safetyStock`
- `onOrder` — units in in-flight production orders for this product (we KNOW this).
- `daysOfCover = availableToSell / velocity`; `projectedStockoutDate` derived.
- `suggestedReorderQty = targetDaysOfCover × velocity − available − onOrder`,
  rounded UP to MOQ / pack-size constraints (configurator knows them).

**Alert ladder (state, not spam — one transition = one notification):**
- `HEALTHY` → `LOW` when available ≤ reorderPoint → notify + badge:
  "Reorder by ⟨date⟩ to stay in stock" (date = stockoutDate − leadDays).
- `LOW` → `CRITICAL` when daysOfCover < leadDays → "A reorder placed today still
  leaves a ⟨n⟩-day gap" + mitigation offers: expedite note to partner, or (if
  OnDemandEnablement=ENABLED) switch the listing to on-demand as a stopgap.
- `STOCKOUT` at 0 → all channel listings pushed to 0 automatically (oversell guard),
  optional auto-pause toggle.
- Every alert deep-links to a prefilled reorder checkout.

**Transparency surfaces (the ledger IS the audit trail — expose it):**
- Creator per-product inventory panel: pool by location, reserved with per-channel-
  order provenance, incoming production orders w/ ETA, per-channel last-pushed qty +
  live/paused state, full ledger timeline, projected stockout date, ROP line on a
  simple stock-over-time sparkline.
- Dashboard widget: products by urgency (CRITICAL first) with days-of-cover.
- Coordinates with the logistics /inventory surface (multi-location view) — channel
  intelligence AUGMENTS it, single pool model shared; no duplicate stock truth.
- Admin: OrderSettings knobs (processing buffer, default safety days, target
  days-of-cover default 45 per the 30–60 industry sweet spot).

### 3.5b Auto-reorder (creator opt-in, added 2026-07-02)

**Research:** the universal pattern across Amazon and the IMS field is *policy-based
auto-replenishment with an approval spine*. Amazon's Auto-Replenishment (AWD→FBA)
executes automatically off a configured inventory policy + ordering schedule + MOQ +
vendor lead times; Cin7 drops reorder-point breaches into a Reorder module that
auto-generates POs, with a org-level toggle for whether POs REQUIRE approval before
authorization; the standard flow everywhere is "PO is created → you approve → it goes
to the vendor", with full-auto as the earned upgrade. Nobody reputable defaults to
silently spending money.

**`AutoReorderPolicy` (per creator × product, opt-in):**
- Trigger: alert-ladder `LOW` (default — i.e. the computed reorder point) or a custom
  minimum-units threshold.
- Quantity: `SUGGESTED` (dynamic — the §3.5a engine, MOQ/pack-rounded, onOrder-aware)
  or `FIXED` n units.
- **Mode CONFIRM (default):** trigger auto-creates a DRAFT production order +
  notification with one-click submit; reminder before the reorder-by date passes.
- **Mode FULL_AUTO (earned opt-in):** offered only after ≥1 successful CONFIRM cycle
  (mirrors the manual-confirm training wheels); submits + charges the saved method
  (rides the C2.2 auto-billing machinery + daily cap) and always notifies after the
  fact with a one-click cancel window while the order sits in PENDING_ACCEPT.
- **Guardrails (all policies):** monthly auto-spend cap; price-change guard (unit
  cost snapshot at enrollment — any change pauses the policy + notifies rather than
  charging a different price); anti-stacking is FREE — suggestedReorderQty already
  subtracts onOrder, so an in-flight auto-order suppresses the next trigger to 0;
  pause/resume anytime; policy pauses itself after any payment failure.
- **Admin:** global auto-reorder kill-switch + defaults in OrderSettings; every
  trigger/submit/pause audited.
- **Dependency:** FULL_AUTO requires C2.2's billing rail; CONFIRM mode only needs
  draft-order creation and can ship with C6.

### 3.5c Reorder & order change management (added 2026-07-02)

**Research:** supply chains formalize this as the EDI 860 (buyer change request) /
EDI 865 (seller acknowledgment) pair — buyer proposes quantity/schedule/destination
changes, seller accepts or counters, iterating to agreement; changes are rejected
once the order enters the shipping window. Printful's consumer-grade version: free
self-serve edits until fulfillment starts, address-only changes during fulfillment,
carrier-level redirect (fees, best-effort) after ship. We adopt the same shape.

**Stage-gated change matrix** (drives which controls even render — the UI never
offers a change the stage forbids):

| Change | PENDING_ACCEPT | ACCEPTED (pre-prod) | PRODUCING | READY | SHIPPED+ |
|---|---|---|---|---|---|
| Quantity | free (re-prices) | partner consent | locked → "order more" | locked | locked |
| Ship-to destination | free | free | partner consent + re-validate | partner consent + re-rate | carrier redirect (logistics, best-effort) |
| Timing / hold at partner | free | free | partner consent | offer HOLD_AT_MANUFACTURER if the partner supports it | — |
| Design / flavors | free | partner consent | locked | locked | locked |
| Cancel | free (existing auto-cancel) | per cancellation-policy | per policy (fees) | per policy | no |

**Mechanism — `OrderChangeRequest` (the 860/865 pattern on our rails):**
- In the FREE window: applies instantly, re-runs pricing + lead-time + logistics
  validation (temp class, carrier eligibility, FC routing per the logistics spec),
  shows the creator the new ETA/price BEFORE confirm. No partner friction.
- In the CONSENT window: creator files the request with an auto-computed **impact
  preview** (price delta, lead-time delta, shipping re-rate); partner gets an
  accept/decline card in their Orders surface; nothing mutates until acceptance;
  request + decision audited with snapshots. Declines carry a note.
- Every applied change re-schedules downstream truth: new ETA recalculated from the
  lead engine, inventory `onOrder` projections update, replenishment alerts recompute
  — so the reorder still "lands on time at the right place" after any edit.

**Auto-reorder made editable by construction:**
- Policy edits (destination, qty mode, caps, schedule) apply to FUTURE triggers
  immediately — the policy is data, not a contract.
- CONFIRM-mode drafts are fully editable inline before submit (the draft spine is
  exactly the free-edit window).
- FULL_AUTO orders enjoy the same PENDING_ACCEPT free window: the post-submit
  notification's cancel/edit window IS the free stage.
- **Saved destinations (address book):** creator-managed list (home, each FC,
  partner storage) with a per-product/per-policy default — changing where reorders
  land is a dropdown, not a form.

### 3.5 Cross-cutting rules

- Money boundary unchanged: consumer payment lives on the channel; iLaunchify bills the
  creator for production (on-demand per order — creator's saved payment method funds
  each production order automatically, with a spending cap + failure → `ON_HOLD`).
- Consumer returns stay creator-side (LOCKED in PLATFORM_SPEC §196).
- Tokens as refs in the secret store; webhook signature verification mandatory; all
  mutations audited; tenant isolation guards on every connection-scoped action.
- Every state change through FSM helpers; raw channel payload snapshots immutable.

## 4. Implementation phases + scope checklist

### Phase C0 — Foundation (no external keys needed) — **SHIPPED 2026-07-02**
- [x] `@ilaunchify/channels` package: `ChannelAdapter` type + deterministic stub adapter
      + `resolveChannelAdapter` (stub in dev, null in prod) + FSM goldens in the suite
- [x] Schema additions §3.2 (all additive) + 10-channel seed (`pnpm db:push` on Pavel)
- [x] `ChannelOrder` FSM helper (`evaluateReadiness` encodes both LOCKED gates +
      spending cap + manual-confirm training wheels) — pure, golden-tested
- [x] Creator `/channels` hub (stub connect end-to-end, tier caps 1/3/all, audited)
- [x] Product Sell surface (upgraded /publish): mode + price w/ margin hint + push
      through the seam; variant links written; sync events logged; cast-guarded pre-push
- [x] Admin: /channels/connections — KPI strip, status chips, connections table,
      recent sync-event log; linked from the registry
- [→] Notifications: MOVED to C2 — channel-order events only exist once ingest lands;
      nothing to notify about in C0

### Phase C1 — Shopify end-to-end (first real adapter)
- [ ] Shopify public app (Dev Dashboard) + OAuth flow + token-ref storage + least scopes
- [ ] Listing push: product + variants (flavors × pack) + mockup images + price
- [ ] Webhooks: orders/paid, orders/cancelled, app/uninstalled + HMAC verify + poll fallback
- [ ] Inventory push (made-to-order / pool qty) via inventory levels
- [ ] Fulfillment/tracking pushback (partial + complete)
- [ ] Env keys → Integrations registry rows; `oauthConfigured` derived

### Phase C2 — Modes + routing (the business core)
- [x] **C2.1 (2026-07-02):** order ingest engine — adapter pull → idempotent import
      (raw payload = legal snapshot) → variant-link mapping (connection-scoped) →
      `evaluateReadiness` verdict persisted with reason → sync events + audit;
      creator channel-orders inbox (`/channels/orders`): status chips, Sync now,
      manual-confirm approve queue
- [x] **C2.3 (2026-07-02):** `OnDemandEnablement` flow — creator requests from the
      Sell surface (pinned-manufacturer resolution, branding snapshot, re-request
      after decline/suspend); partner `/on-demand` review queue (enable w/ optional
      daily capacity, decline w/ note, suspend kill-switch); enablement state
      surfaced on the Sell card; ingest gate consumes it
- [ ] **C2.2:** On-demand routing — READY + approved ChannelOrder → create-order
      pipeline (`origin: CHANNEL`), auto-billing w/ OrderSettings spending cap,
      dispatch tagging, consumer ship-to on manifest, notifications
- [~] **C2.4 (mostly shipped 2026-07-02):** pure inventory ledger math in
      `@ilaunchify/channels` (applyLedgerEntry invariants + replayLedger
      reconciliation — golden-tested); delivery-received intake (Sell-surface
      "Record delivery", V1 manual — logistics automates later); go-live gates
      ENFORCED on push (on-demand → enablement check + MADE_TO_ORDER inventory;
      bulk → available>0 + derived qty push, else PUSHED with reason);
      reservation written on READY bulk orders at ingest. REMAINING: self-ship
      fulfillment flow (mark fulfilled + tracking → pushback + SALE conversion),
      RELEASE on cancel, oversell zero-push on conflict.

### Phase C3 — TikTok Shop adapter
- [ ] Partner Center app + OAuth2 + products/orders/fulfillment mapping to the seam
- [ ] TikTok-specific listing constraints (category attributes, image rules)

### Phase C4 — Amazon (SP-API)
- [ ] SP-API app + LWA auth; JSON_LISTINGS_FEED listing push; Orders API ingest
- [ ] FBA/MCF hook: when creator stocks at Amazon, fulfillment delegates to MCF
      (joint with the logistics workstream — FC location type 'AMAZON_FBA')

### Phase C5 — Walmart + the long-tail six (COMMITTED coverage)
- [ ] Walmart Marketplace adapter (15-min token handling)
- [ ] **Long-tail six — Etsy, WooCommerce, Wix, Squarespace, BigCommerce, eBay** are
      committed roster (Pavel 2026-07-02). Decide the HOW at C5 start: native adapters
      vs ONE unified-API-backed adapter (API2Cart/Rutter-class) behind the same seam —
      with six channels committed, the vendor option's economics improve materially;
      the seam keeps the choice reversible per channel.
- [ ] Seed the 4 missing Channel registry rows (wix, squarespace, bigcommerce, ebay —
      schema seed currently lists 6 codes) + logos; enabled=false until adapter lands
- [ ] Per-channel nuances to handle whichever path wins:
      - **Etsy** — production-partner DISCLOSURE rules (Etsy requires declaring the
        manufacturer for maker-designed goods; surface the pinned manufacturer as the
        creator's production partner in listing metadata + creator guidance)
      - **WooCommerce** — self-hosted: per-store REST keys (no central app store),
        version drift across stores, webhook reliability varies → poll fallback matters
      - **Wix / Squarespace** — app-market OAuth apps; Squarespace API surface is the
        narrowest (inventory/orders yes, rich listing management limited)
      - **BigCommerce** — per-store API accounts, solid webhooks
      - **eBay** — Sell API suite (OAuth2), listing policies (fulfillment/payment/
        return policy objects) must exist before listing push
- [ ] PLATFORM_SPEC tier-cap table update: Agency "All 6" → "All supported channels"

### Phase C6 — Inventory intelligence & transparency (§3.5a)
- [ ] Pure replenishment math in `@ilaunchify/channels` (velocity blend, ROP,
      safety stock, suggested qty w/ MOQ rounding, alert-state machine) — golden-tested
- [ ] Velocity + onOrder aggregation (ChannelOrderLine history + in-flight orders)
- [ ] Daily recompute job + recompute-on-ingest; alert transitions → notifications
      (email + in-app), one notification per state transition
- [ ] Creator per-product inventory panel (pool by location, reserved provenance,
      incoming w/ ETA, per-channel pushed qty, ledger timeline, stockout projection)
- [ ] Dashboard urgency widget (CRITICAL-first, days-of-cover)
- [ ] Prefilled reorder deep-link (suggested qty → checkout); CRITICAL mitigations
      (expedite note; on-demand stopgap switch when enablement exists)
- [ ] Admin OrderSettings knobs: processing buffer, safety days default, target
      days-of-cover (default 45); creator per-product overrides
- [ ] Coordinate with logistics /inventory surface (shared pool, no duplicate truth)
- [ ] `AutoReorderPolicy` schema (additive) + policy evaluation in the daily
      recompute (trigger → CONFIRM draft order + notify; anti-stacking via onOrder)
- [ ] Policy management UI on the inventory panel (enroll, mode, qty, caps,
      pause/resume) + price-change guard snapshot
- [ ] FULL_AUTO mode behind the C2.2 billing rail (earned opt-in, cancel window,
      pause-on-payment-failure) + admin kill-switch/defaults in OrderSettings
- [ ] §3.5c change management: `OrderChangeRequest` schema (additive) + stage-gate
      matrix helper (pure, golden-tested) + free-window instant apply w/ re-validation
- [ ] Consent-window flow: impact preview (price/lead/shipping deltas), partner
      accept/decline card in the Orders surface, snapshot + audit
- [ ] Saved destinations address book + per-product/policy default destination
- [ ] Downstream recompute on applied changes (ETA, onOrder, replenishment alerts)

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
4. **Long-tail six COMMITTED (amended 2026-07-02):** Etsy, WooCommerce, Wix,
   Squarespace, BigCommerce, eBay are in-roster — coverage is a WHEN/HOW question,
   not a whether. Big four stay native. The native-vs-unified-API implementation
   choice for the six is made at C5 start, weighing vendor-in-the-order-path risk
   (outage coupling, third-party data transit, generic data model) vs six native
   builds' cost. The adapter seam makes it reversible per channel.
5. **Manual-confirm ON for each connection's first 10 channel orders** (training
   wheels): orders hold at `READY` for creator approval; after 10 successfully
   fulfilled, the connection offers one-click switch to full-auto (still creator-
   toggleable both ways in settings).

## 6. Out of scope (here)

Consumer storefront (LOCKED out), channel-side returns handling, logistics execution
(separate workstream — this spec only emits fulfillment tasks + location types), ads/
marketing APIs, analytics dashboards beyond order lists (V2).
