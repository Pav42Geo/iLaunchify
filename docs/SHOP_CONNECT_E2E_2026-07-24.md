# Creator Shop Connect, End to End (research + build plan)

**Date:** 2026-07-24 · **Status:** Research complete, plan proposed (Pavel review)
**Doc pair:** `docs/CHANNEL_MANAGEMENT_SPEC.md` (the locked spec this fills in), schema §CHANNELS
**Trigger:** Pavel compared iLaunchify's Connect button (stub) with Printful's live Etsy/Amazon connect flows.

---

## 1. What you saw on Printful, decoded

The "Grant access" page in your screenshot is **not a Printful page. It is Etsy's OAuth
consent screen** (`etsy.com/oauth/connect?...&client_id=3fhuv...&redirect_uri=https://www.printful.com/dashboard/etsy/connect`).
The flow is the classic three-legged OAuth handshake:

1. User clicks **Connect** in the Printful dashboard.
2. Printful redirects the browser to the marketplace's own authorization page
   (Etsy in your screenshot), passing Printful's registered `client_id`, the
   permissions (scopes) it wants, and a `redirect_uri` back to itself.
3. The marketplace authenticates ITS user and shows ITS consent screen
   ("Printful would like to connect to your account" + the permission list).
4. User clicks **Grant access**. The marketplace redirects back to
   `printful.com/dashboard/etsy/connect?code=...`.
5. Printful's server exchanges that one-time code for access + refresh tokens,
   stores them, and the store shows as Connected.

So the reason "nothing similar" exists on Printful's side is that the consent
UI belongs to the marketplace, always. **What Printful owns is: a registered,
approved developer app at each marketplace, the redirect/callback plumbing, and
the pre/post-connect checklists.** That is exactly the layer we have not built
yet: our `connectChannelOauth` deliberately returns "not live yet" because we
have zero platform app registrations today.

One nuance: the direction of the handshake is dictated by each marketplace, not
chosen by Printful:

| Direction | Channels | Mechanism |
|---|---|---|
| Our dashboard → marketplace consent → back to us | Etsy, Amazon, TikTok Shop, eBay, Walmart (2026 model) | Provider-initiated OAuth redirect |
| Marketplace app store install (either side can start) | Shopify (also Wix/Squarespace/BigCommerce later) | App install + consent inside the store admin |
| Merchant's own site grants keys | WooCommerce | `/wc-auth/v1/authorize` one-click key handoff |

---

## 2. The universal end-to-end connect pattern (what Printful/Printify converged on)

Every channel, both vendors, same five stages. This is the blueprint for our
creator UX:

1. **Prerequisite gate (before the button).** The connect card states what must
   already be true and checks/links it: Etsy shop fully open (billing set, ≥1
   listing); Amazon Professional plan ($39.99/mo) + GTIN/UPC exemption; TikTok
   Shop seller approved (ID verification); eBay seller registered w/ managed
   payments. The hard channels put ALL the friction here, before OAuth.
2. **Handoff.** Full-page redirect (not a popup: pop-up blockers eating the
   consent tab is a top documented complaint) to the marketplace's consent
   screen. `state` token for CSRF, PKCE where required (Etsy).
3. **Grant + callback.** Marketplace redirects back with a short-lived code;
   server exchanges it for tokens; connection row flips CONNECTED.
4. **Post-connect setup (the part users actually struggle with).** Attach
   shipping profiles/policies on the channel, declare the production partner
   (Etsy), map existing listings by SKU (import is always SKU-matched), confirm
   billing method so orders can actually be produced. Neither vendor ever
   auto-publishes a product.
5. **Steady state.** Webhooks (+ poll fallback) pull orders in; tracking pushes
   back; token refresh keeps the connection alive; password change or
   revocation on the marketplace side silently kills tokens, so a health check
   + "Reconnect needed" state + notification is mandatory (top complaint #2:
   silent connection death).

Printful/Printify friction worth designing out from day one: silent token
expiry (we notify + badge), popup blockers (we redirect full-page), shipping
profiles overwritten on resync after manual edits (we mark ours "managed by
iLaunchify" and never touch others), billing-method surprise (we already gate
go-live on PAYMENT_METHOD_MISSING, keep that), one-shop-one-account conflicts
(our `@@unique(channelId, creatorUserId)` handles our side; we must also handle
"this Etsy shop is already connected to another iLaunchify account").

---

## 3. Per-channel dossier (what WE must register, what the CREATOR does, tokens, gotchas)

### 3.1 Shopify (C1, first native adapter, per locked spec)

- **Our registration:** app in the new **Dev Dashboard** (dev.shopify.com),
  distribution = **Public** (custom apps are single-store; a multi-tenant SaaS
  requires a reviewed public App Store app: this is why Printful is an App
  Store app). Choice is irreversible per app. New public apps must use the
  **GraphQL Admin API exclusively** (REST is legacy since Apr 2025).
- **Review gates:** App Store functional review; **Protected Customer Data
  Level 2** approval (name/address/phone/email: we need it to route consumer
  ship-to onto manifests) with per-field justification + security posture
  (encryption at rest/in transit, access logging, incident response: matches
  our locked Tier 0 rules); **mandatory GDPR webhooks** (`customers/data_request`,
  `customers/redact`, `shop/redact`) with HMAC verify + 401 on bad HMAC.
- **Install flow:** "managed installation" (scopes declared in `shopify.app.toml`,
  Shopify renders consent, no manual OAuth dance) for embedded contexts, token
  exchange for session→access tokens; we keep an **offline access token** per
  shop (lives until uninstall). Handle BOTH directions: connect from our hub
  AND install initiated from the Shopify App Store (then link/log in to the
  iLaunchify account, Printful path B).
- **Scopes:** read/write_products, read/write_orders, read/write_inventory,
  read_locations, fulfillment-order scopes (FulfillmentOrder model is
  mandatory; we register as a fulfillment service).
- **Webhooks:** orders/create, orders/updated (or paid), app/uninstalled +
  fulfillment topics. Quarterly API versioning (12-month support window).
- **Creator prereqs:** any active Shopify store. Lightest channel of all.

### 3.2 Etsy (recommend pulling the CONNECT forward from C5, see §6)

- **Our registration:** free. Path: register app → **Personal app** approval
  (days to ~2 weeks) → **Commercial Access** upgrade (manual review; requires
  working personal app, API ToS compliance, app name must not lean on the Etsy
  trademark, attribution line "This application uses the Etsy API but is not
  endorsed or certified by Etsy, Inc."). `buyer_email` access is a separate
  request.
- **OAuth:** Authorization Code + **mandatory PKCE (S256)** at
  `https://www.etsy.com/oauth/connect`; token endpoint
  `api.etsy.com/v3/public/oauth/token`. **Access 1 h, refresh 90 days**
  (rotating): if we go 90 days without refreshing, the creator must reconnect.
  Scopes for us: `listings_r/w/d, transactions_r/w, shops_r/w, address_r`.
- **API:** createDraftListing (requires who_made/when_made/taxonomy +
  shipping_profile_id + readiness state; accepts `production_partner_ids`),
  image upload, updateListingInventory (SKU + variations), getShopReceipts
  (orders), createReceiptShipment (tracking; auto-emails the buyer).
  **Webhooks are now GA** (order.paid/canceled/shipped/delivered, Svix-style
  HMAC): order ingest is event-driven, listings still poll.
- **Policy (the big one for us):** Etsy **production partner disclosure**. A
  creator selling made-to-order goods produced by a third party MUST declare
  that partner (Shop Manager → Settings → Production partners) and label
  listings "Designed by". Partners can only be CREATED by the seller in Shop
  Manager; the API can read them (`getShopProductionPartners`) and attach them
  to listings. This maps 1:1 onto our pinned manufacturer, but disclosure
  granularity is a Pavel decision (§7, D3): "produced by a partner" vs naming
  the actual manufacturer, which intersects our partner-anonymity thesis
  (orchestration: we HIDE the partner graph). Etsy's June 2025 creativity
  standards enforcement is real (listing deactivations), so our connect
  checklist must walk the creator through this, Printful-style.
- **Creator prereqs:** Etsy shop fully OPEN (onboarding finished, billing on
  file, ≥1 listing exists) or the OAuth screen never appears, just an
  "incomplete setup" dead end. Our prereq gate should say exactly this.
- **Fees the creator sees:** $0.20 per published listing, per-sale fees. Push
  as Drafts, let the creator publish (Printful does the same: drafts, so the
  $0.20 is a conscious choice).

### 3.3 Amazon SP-API (C4; registration is the long pole, start the paperwork NOW)

- **Our registration:** Solution Provider Portal, **public developer + public
  app**. Developer profile questionnaire (use cases, data, security controls;
  original, specific answers: boilerplate = rejection). Request the MINIMUM
  roles: Product Listing, Inventory & Order Tracking, and **Direct-to-Consumer
  Shipping** (restricted PII role: buyer name/address for manifests). Skip Tax
  roles (requesting roles you don't strictly need is the #1 rejection cause).
- **Compliance we sign up for (Data Protection Policy):** encrypt PII at rest
  + in transit, **delete PII ≤30 days after delivery**, 90-day log retention,
  24-hour incident notification, vulnerability scans every 180 days, annual
  pen test, annual DPP audit for PII apps. ⚠ Conflicts with our "raw channel
  payload = immutable legal snapshot" rule: for Amazon orders we must REDACT
  buyer PII from stored payloads post-delivery (keep the commercial facts,
  strip name/address/email). Design this into the ingest layer now so it's a
  policy knob, not a migration.
- **Timeline reality:** role approval "up to 10 business days" officially;
  PII (restricted) review typically adds 4-8 weeks, community reports of
  months. Appstore listing (optional but unlisted apps face authorization
  caps): 3-4 more weeks. **This is why the registration starts now even though
  the adapter is C4.**
- **Seller authorization:** our Connect button →
  `sellercentral.amazon.com/apps/authorize/consent?application_id=...&state=...`
  (+`version=beta` while our app is Draft: we can test end to end BEFORE
  approval) → consent → redirect with `spapi_oauth_code` (5-minute expiry) →
  LWA token exchange → long-lived refresh token per seller. **Re-authorize
  every 365 days** (build the renewal nudge). Also support the Appstore-
  initiated direction (Amazon calls our login URI).
- **API:** Catalog Items (match ASIN), Listings Restrictions (eligibility +
  GTIN-exemption checks with approval links we can surface), Listings Items /
  JSON_LISTINGS_FEED (create), Orders + **Restricted Data Tokens** for buyer
  address, confirmShipment (tracking), Notifications ORDER_CHANGE via
  SQS/EventBridge (+ poll fallback), Fulfillment Outbound if stock sits in FBA
  (our AMAZON_FBA location hook).
- **Creator prereqs (heaviest):** Professional plan $39.99/mo; GTIN/UPC per
  product OR GTIN exemption per brand+category (our prereq card should link
  the exemption flow and gate publish on it, Printify-style "I have requested
  GTIN exemption" checkbox); listing review 24-72 h on Amazon's side.

### 3.4 TikTok Shop (C3)

- **Our registration:** **US Partner Center** (separate US portal, region
  choice permanent), app + upfront scope application (product, order,
  logistics...), review ~2-3 business days, sandbox first.
- **OAuth:** authorize URL on services.tiktokshop.com → code → token at
  `auth.tiktok-shops.com/api/v2/token/get`; honor the `*_expire_in` fields
  (access ~days-scale, refresh long-lived); then fetch `shop_id` +
  `shop_cipher`; every call HMAC-signed with the app secret. Webhooks per app
  (orders, product status), signature-verified.
- **Creator prereqs:** approved TikTok Shop seller (ID verification, US
  residential address + SSN last-4/ITIN; name mismatches = verification
  failure). **Warehouse gotcha:** Printful has sellers enter Printful's fixed
  warehouse address in Seller Center. We are multi-partner: for on-demand the
  ship-from is the pinned manufacturer's facility. Our post-connect checklist
  must hand the creator the right facility address (we know it) + a shipping
  template that mirrors the real rates. Listing rules: category attributes,
  image rules (600×600 min, no watermarks), AI-image disclosure label (2026).

### 3.5 eBay (long-tail six)

- **Our registration:** free dev program; **production keys are gated on the
  marketplace account-deletion notification endpoint** (challenge-response,
  HTTPS, ack within 24 h or endpoint marked down): build this tiny endpoint
  the day we register. "Application growth check" later for higher limits.
- **OAuth:** classic code grant, access 2 h, **refresh ~18 months**, no
  rotation; re-consent on expiry; subscribe to the authorization-revocation
  topic. **Order events are NOT in the REST notification API**: poll
  `getOrders` (lastmodifieddate) as primary.
- **API:** Inventory API (SKU-keyed items → offers → publishOffer), Account
  API (creator must be opted into **business policies**; we create fulfillment
  /payment/return policies for them, clearly labeled ours), Fulfillment API
  (orders + createShippingFulfillment). Gotchas: inventory location must exist
  before first publish; leaf category + required aspects per category; new-
  seller limits (10 variants/$500) and the well-documented new-account
  suspension wave right after bulk-publishing POD listings (our checklist
  should warn, Printify does).

### 3.6 Walmart (C5)

- **Time-sensitive fact:** Walmart's legacy "delegated access API keys" model
  **retires 2026-07-30 (no new keys) and dies 2026-10-01**. The current model
  is what we'd build anyway: approved Solution Provider + app in the Walmart
  App Store inside Seller Center → seller clicks Connect → OAuth code →
  `marketplace.walmartapis.com/v3/token`. Access token 15 min, refresh 1 year,
  `WM_CONSUMER.CHANNEL.TYPE` id issued at onboarding. Items/Inventory/Orders/
  Pricing APIs. Seller prereq: Walmart Marketplace approval (weeks,
  case-by-case). Note: Printful and Printify have both WITHDRAWN their Walmart
  integrations (2023/2025); the lane is open but that's a signal about
  effort-to-return on this channel. No urgency beyond registering as a
  solution provider under the new model when C5 starts.

### 3.7 WooCommerce (long-tail six, the different one)

- **No registration, no review, no fees.** We redirect the merchant to
  `https://their-store.com/wc-auth/v1/authorize?app_name=iLaunchify&scope=read_write&user_id=<ourRef>&return_url=...&callback_url=...`;
  they approve in wp-admin; WooCommerce POSTs consumer key+secret to our
  callback. Keys never expire.
- **Reliability is the product problem:** webhooks ride WP pseudo-cron (lag on
  quiet stores) and **auto-disable after 5 failures, silently**: poll-first
  design, webhooks as accelerant; probe `/wp-json/wc/v3` at connect; handle
  security plugins stripping auth headers; require HTTPS. Most failure-prone
  channel for Printful/Printify by far (hosting variance), so expect the
  highest support load per store.

---

## 4. What we already have vs what's missing

Already built (C0/C2, verified in-repo today):

- `Channel` registry (+`oauthConfigured`, kill-switch ladder, admin console),
  `ChannelConnection` with `accessTokenRef/refreshTokenRef/webhookSecretRef/
  scopes/settings` columns, `@@unique(channelId, creatorUserId)`.
- `ChannelAdapter` seam with `buildAuthUrl/exchangeCode/refresh` signatures +
  deterministic stub; publish/order FSMs; ingest engine; variant links;
  enablement gate; C2.2 auto-billing (money path PROVEN); inventory ledger;
  creator hub + Sell surface + inbox; manual paste-the-seller-id fallback.
- Payment-method go-live gate (PAYMENT_METHOD_MISSING) = Printful's "billing
  method before fulfillment" lesson, already enforced.

Missing (the actual gap Pavel spotted):

1. **Platform app registrations** at each marketplace (business work, §5 Track A).
2. **OAuth plumbing:** `/api/channels/oauth/[channel]/start` + `/callback`
   routes, `state` issuance/validation (+ PKCE verifier storage for Etsy),
   inbound-install path for Shopify, account-linking screen.
3. **Token vault.** Schema stores REFS but no secret store exists (verified:
   no encryption helper anywhere in packages). Proposal: `ChannelSecret` table
   holding AES-256-GCM ciphertext, key from env (`CHANNEL_TOKEN_KEY`, 32-byte,
   registered in the Integrations registry as presence-only), helper in
   `@ilaunchify/security` (`sealSecret/openSecret`), refs =
   `chansec_<cuid>`. Satisfies Amazon DPP + Shopify L2 "encrypt at rest"
   without adopting an external secrets manager yet (consistent with the
   env-backed integrations decision of 2026-06-22).
4. **Token lifecycle:** refresh cron (Etsy hourly-refresh cadence, eBay 2 h,
   Walmart 15 min on-demand refresh, Amazon LWA per-call cache), health check
   → `TOKEN_EXPIRED` + notification + Reconnect button, revocation webhooks
   (eBay topic, Shopify app/uninstalled), Amazon 365-day re-auth nudge.
5. **Webhook receivers:** `/api/webhooks/channels/[channel]` with per-channel
   signature verification (Shopify HMAC, Etsy Svix-style, TikTok app-secret
   HMAC, eBay ECDSA + the account-deletion challenge endpoint), all feeding
   the EXISTING ingest engine; poll fallback already exists (Sync now + cron).
6. **Connect UX upgrade (§6):** prereq gates, post-connect checklists,
   PII/compliance redaction knob for Amazon payloads.

---

## 5. Build plan

### Track A: registrations (paperwork, start immediately, runs parallel to code)

| Order | Marketplace | Cost | Realistic lead time | First action |
|---|---|---|---|---|
| A1 | Shopify | free | days (app) + review weeks when listing | Create app in Dev Dashboard, Public distribution, request Protected Data L2 |
| A2 | Etsy | free | days-weeks personal, +weeks commercial | Register app, get keystring, build against personal access, file Commercial upgrade |
| A3 | Amazon | free | 2 wks + 4-8 wks PII review (worst: months) | Solution Provider Portal profile, minimal roles incl. Direct-to-Consumer Shipping, DPP-aligned answers |
| A4 | TikTok | free | ~1 wk | US Partner Center account, app + scopes |
| A5 | eBay | free | days (+ deletion endpoint before prod keys) | Join dev program, stand up deletion-notification endpoint |
| A6 | Walmart | free | at C5 start | Register as Solution Provider under the OAuth model (delegated keys die 2026-10-01) |

Prerequisite for ALL of A: a public marketing page describing the integration
(Amazon and Etsy both review "a launch-ready public website"). The beta
marketing site work can double for this.

### Track B: channel-agnostic rails (one build, every adapter rides it)

- B1 Token vault (§4.3) + `ChannelOAuthState` table (state, PKCE verifier,
  creatorUserId, channelId, 10-min TTL, single-use).
- B2 OAuth start/callback routes wired through the adapter seam
  (`buildAuthUrl/exchangeCode` finally get real implementations); success →
  connection CONNECTED + `registerWebhooks(conn)` + redirect to
  `/channels?connected=<code>`; failure → friendly error + retry.
- B3 Refresh/health cron (`/api/cron/channel-tokens`): refresh due tokens,
  flip TOKEN_EXPIRED + notify once per transition (rides dispatchNotification),
  Amazon 365-day and eBay 18-month re-auth reminders.
- B4 Webhook receiver route family + signature verifiers per adapter, events →
  existing ingest engine; SyncEvent-logged; kill-switch ladder respected.
- B5 Connect UX: prereq-gated cards (per-channel checklist w/ live checks
  where possible), full-page redirect, post-connect checklist drawer
  (§6), "Reconnect" state, disconnect keeps history (rows, links, orders
  survive; tokens destroyed).
- B6 Compliance knobs: per-channel PII retention policy on ingest (Amazon:
  redact buyer PII from rawPayload N days post-delivery; others: keep), GDPR
  redact handlers for Shopify.

### Track C: adapters, in order

1. **C1 Shopify** (per locked spec): managed install + offline token, GraphQL
   product/variant/media push, inventory levels, fulfillment-order flow,
   orders webhooks. Everything else in the platform already exists; this is
   the first real end-to-end store.
2. **C1.5 Etsy connect (NEW, pulled forward from C5, recommendation):** Pavel
   is literally testing against Etsy; it is THE creator marketplace for our
   audience, registration is free, no seller gatekeeping, webhooks are GA now,
   and the production-partner mechanic showcases our whole thesis. Scope:
   OAuth + listing push (drafts) + receipts ingest + tracking + partner
   disclosure checklist. The C5 native-vs-unified decision stays intact for
   the OTHER five long-tail channels; Etsy graduates to native early.
3. **C3 TikTok**, **C4 Amazon** (adapter lands whenever Track A3 approval
   arrives; build against Draft-mode `version=beta` + sandbox meanwhile),
   **C5 Walmart + remaining long tail** unchanged.

### Effort shape (rough)

Track B is the real build (vault + routes + cron + receivers + UX ≈ the size
of C2.1). Each native adapter after that is a bounded mapping exercise against
the seam (Shopify the biggest because of fulfillment orders + review process;
Etsy the smallest). The long poles are all EXTERNAL review queues, which is
why Track A starts now.

---

## 6. The creator's end-to-end journey (target UX, Printful-parity+)

Using Etsy as the worked example (same skeleton per channel):

1. `/channels` hub → Etsy card shows **Before you connect**: "Your Etsy shop
   must be fully open (billing set up, at least one listing published)" +
   "Etsy will ask you to grant iLaunchify access" + tier-cap status. Connect
   button enabled only when our platform app is live (`oauthConfigured`).
2. Click **Connect** → full-page redirect to Etsy's consent screen (the exact
   page from Pavel's screenshot, with iLaunchify in place of Printful) →
   **Grant access** → back to `/channels?connected=etsy`, card flips
   CONNECTED with the shop name.
3. **Post-connect checklist** (drawer on the card, progress-tracked):
   - ☐ Add your production partner in Etsy Shop Manager (guided copy per
     D3 decision below; we detect completion via `getShopProductionPartners`).
   - ☐ Review the shipping profile we created (marked "managed by iLaunchify").
   - ☐ Payment method on file (existing gate, shown green if already true).
   - ☐ Optional: import existing Etsy listings (SKU match preview → link).
4. **Publish** from the existing Sell surface → listing lands on Etsy as a
   DRAFT with images, variants, price, partner attached → creator publishes on
   Etsy (their $0.20, their click) → link goes LIVE.
5. **Order lands** (webhook) → existing ingest → enablement gate → C2.2 router
   auto-charges + dispatches the pinned manufacturer → partner ships to the
   consumer → tracking flows back via `createReceiptShipment` → Etsy emails
   the buyer. Creator watches it all in the existing inbox; manual-confirm for
   the first 10 orders per the locked decision.
6. **Steady state:** token silently refreshed; if Etsy revokes (password
   change), card flips "Reconnect needed" + one notification; Disconnect
   button destroys tokens but keeps history.

Per-channel deltas: Shopify has no step-3 partner task (checklist =
locations + payment method); Amazon inserts the GTIN-exemption wizard before
first publish; TikTok inserts warehouse-address + shipping-template setup with
the pinned manufacturer's facility address prefilled; eBay auto-creates
business policies + warns about new-seller limits.

---

## 7. Decisions (D1-D4 DECIDED by Pavel, 2026-07-24)

- **D1: Etsy pulled forward: YES.** C1.5 (Etsy native connect right after
  Shopify) is approved. The C5 native-vs-unified decision still applies to the
  remaining five long-tail channels only.
- **D2: Registrations: START ALL FIVE NOW** (Shopify, Etsy, Amazon, TikTok,
  eBay; Walmart waits for C5). Cowork drafts every questionnaire answer;
  Pavel submits from his accounts.
- **D3: Etsy production-partner wording: iLAUNCHIFY IS THE DECLARED PARTNER**
  (Printful's own model). The actual manufacturer graph stays hidden,
  consistent with the orchestration thesis.
- **D4: Amazon PII redaction: APPROVED.** Amazon orders only: strip buyer
  name/address/email from stored payloads 30 days after delivery; all
  commercial facts stay. Built as a per-channel retention-policy knob on
  ingest (carve-out to the immutable-snapshot rule).
- **D5 (still open): Shopify App Store listing timing.** Build + review takes
  weeks and makes us publicly visible in their app store. List at beta, or run
  unlisted as long as policy allows while we polish?

## 8. Source appendix (primary docs)

Shopify: shopify.dev/docs/apps/build/authentication-authorization ·
/docs/apps/launch/distribution · /docs/apps/launch/protected-customer-data ·
/docs/apps/build/compliance/privacy-law-compliance ·
/docs/apps/build/orders-fulfillment · /docs/api/usage/versioning
Etsy: developers.etsy.com/documentation/essentials/authentication ·
/essentials/webhooks · /tutorials/listings · /tutorials/fulfillment ·
etsy.com/legal/api · help.etsy.com "Working with Production Partners on Etsy"
Amazon: developer-docs.amazon.com/sp-api/docs/sp-api-registration-overview ·
/website-authorization-workflow · /roles-in-the-selling-partner-api ·
/tokens-api · /security-compliance-overview · /usage-plans-and-rate-limits ·
/renew-authorizations · /listings-items-api · /notifications-api
TikTok: partner.tiktokshop.com/docv2/page/authorization-overview-202407 ·
/access-scope · /tts-webhooks-overview
eBay: developer.ebay.com/api-docs/static/oauth-tokens.html ·
/marketplace-account-deletion · /api-docs/sell/inventory/overview.html ·
/api-docs/sell/fulfillment/overview.html · /develop/apis/api-call-limits
Walmart: developer.walmart.com/us-marketplace/docs/authentication-authorization ·
/docs/delegated-access-authorization (retirement dates)
WooCommerce: developer.woocommerce.com/docs/apis/rest-api/authentication
Printful/Printify user flows: help.printful.com + help.printify.com connect
articles per channel (full URL list in the research transcript).
