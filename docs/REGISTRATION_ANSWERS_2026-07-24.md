# Marketplace Developer Registrations: Drafted Answers (all five)

**Date:** 2026-07-24 · **Status:** Draft for Pavel to submit (D2 decided 2026-07-24)
**Doc pair:** `docs/SHOP_CONNECT_E2E_2026-07-24.md` §5 Track A

How to use this doc: fill the fact sheet (§0) once, run the pre-submission
checklist (§1), then work §2 to §6 top to bottom. Every narrative field is
written copy-paste ready in iLaunchify's voice; anything in `[BRACKETS]` needs
your real value. Answers only claim controls that exist or that §1 stands up
before you hit submit: reviewers at Amazon and Shopify reject boilerplate and
punish overclaiming, so keep edits factual.

---

## 0. Company fact sheet (fill once, used everywhere)

| Field | Value |
|---|---|
| Legal entity name | `[LEGAL ENTITY, e.g. iLaunchify Inc.]` |
| Trading name | iLaunchify |
| Business address | `[STREET, CITY, STATE, ZIP]` |
| Public website | `[https://ilaunchify.com]` (marketing app) |
| Creator app URL | `[https://app.ilaunchify.com]` |
| Support email | `[support@ilaunchify.com]` |
| Security/incident contact | `[security@ilaunchify.com]` (can alias to you; must be monitored) |
| Privacy policy URL | `[https://ilaunchify.com/privacy]` (must be live; Legal CMS can serve it) |
| Terms URL | `[https://ilaunchify.com/terms]` |
| Phone | `[NUMBER]` (Amazon and TikTok verify) |
| One-line descriptor | Production platform for creator-branded consumable products (food, supplements, pet, cosmetics): creators design and sell, vetted manufacturing partners produce and ship. |

Standard boilerplate description (reused, tuned per platform below):

> iLaunchify is a production and fulfillment platform for creator-branded
> consumable products. Creators design finished products (own brand, own
> packaging) on iLaunchify; when a customer orders in the creator's own store,
> iLaunchify routes the order to a vetted manufacturing partner that produces
> and ships it. This integration lets a creator connect their shop so
> iLaunchify can publish their product listings, receive their paid orders,
> and post fulfillment tracking back. End customers never interact with
> iLaunchify; consumer payment stays on the sales channel.

---

## 1. Pre-submission engineering checklist (truth backing for the claims below)

Do these BEFORE submitting Amazon and Shopify (the two that audit), in rough
order of effort:

- [ ] **Public integration pages live** on the marketing site: one page per
  channel ("Sell on Etsy with iLaunchify" etc.) describing the integration.
  Amazon explicitly reviews for a launch-ready public website; Etsy reviewers
  read it too. Thin is fine; absent is a rejection.
- [ ] **Privacy policy + terms published** at the URLs above, mentioning
  channel-data handling (order data processed to fulfill, PII retention
  limits, no sale of data).
- [ ] **Token vault built (Track B1)**: AES-256-GCM `ChannelSecret` +
  `CHANNEL_TOKEN_KEY` env. Every questionnaire below claims "credentials and
  tokens encrypted at rest"; make it true first.
- [ ] **Written incident-response one-pager** (who is notified, 24h vendor
  notification commitment, key rotation steps). Amazon DPP asks; a real
  document you can produce on audit beats prose.
- [ ] **PII retention policy knob designed** (D4 decision): Amazon buyer PII
  redacted ≤30 days post-delivery. State it as designed policy; implement
  before first production order.
- [ ] **eBay account-deletion endpoint deployed** (§6.2 spec): required
  before eBay production keys, so it gates only eBay.
- [ ] **Audit-log retention ≥90 days confirmed** (AuditLog table already
  exists; confirm no purge job under 90 days).

Already true today (claim freely): tenant isolation guards (Tier 0), full
audit logging of mutations, TLS everywhere, secrets in host env not DB, RBAC
on admin surfaces, Stripe for payments (no card data touches us), managed
CockroachDB with encryption at rest, no production data in dev.

---

## 2. Shopify (Dev Dashboard, dev.shopify.com)

### 2.1 App creation values

| Field | Value |
|---|---|
| App name | **iLaunchify** (fallback if taken: "iLaunchify Production") |
| App URL | `[https://app.ilaunchify.com]` |
| Distribution | **Public** (IRREVERSIBLE choice; do not pick Custom) |
| Redirect URLs | `[https://app.ilaunchify.com]/api/channels/oauth/shopify/callback` |
| Webhook endpoints | `[https://app.ilaunchify.com]/api/webhooks/channels/shopify` |
| Emergency developer contact | your email + phone |

Scopes for `shopify.app.toml` (least-scope; add later only with re-consent):

```
read_products, write_products,
read_orders, write_orders,
read_inventory, write_inventory,
read_locations,
read_merchant_managed_fulfillment_orders, write_merchant_managed_fulfillment_orders,
read_assigned_fulfillment_orders, write_assigned_fulfillment_orders,
read_fulfillments, write_fulfillments
```

(No `read_all_orders`: we only need orders from install-time forward, and the
60-day default window avoids an extra approval. No customer scopes beyond what
orders carry.)

GDPR webhooks (mandatory, register in TOML): `customers/data_request`,
`customers/redact`, `shop/redact` → all at the webhook endpoint above, HMAC
verified, 401 on bad HMAC.

### 2.2 Protected Customer Data, Level 2 request (per-field justification)

App-level "why do you process customer data":

> iLaunchify produces and ships physical products for merchants on demand.
> When a merchant's customer places a paid order, iLaunchify manufactures the
> item and ships it directly to that customer. We process order and customer
> data solely to produce, pack, ship, and confirm fulfillment of the
> merchant's orders. We do not use customer data for marketing, analytics
> resale, enrichment, or any purpose beyond fulfilling the specific order, and
> we honor merchant and customer consent decisions and redaction requests via
> the mandatory compliance webhooks.

Per-field justifications (Level 2 fields):

- **Name:** "Printed on the shipping label and customs/packing documentation
  so the carrier can deliver the order to the right person."
- **Address:** "The ship-to destination for the physical order; required to
  rate, purchase, and print the shipping label and route production to the
  nearest facility."
- **Phone:** "Passed to the shipping carrier where the service level requires
  a contact number for delivery (e.g. residential delivery notifications).
  Not used for any other contact."
- **Email:** "Used only where the carrier or channel requires a contact point
  for delivery exceptions on the order. Never used for marketing."

If the form allows dropping a field: we can operate without customer email
(orders still fulfillable); keep name, address, phone as required, mark email
optional-but-requested or drop it to smooth review. Your call at submission.

Data-protection attestations (all true once §1 is done): encryption in
transit (TLS 1.2+) and at rest; tokens/credentials in an encrypted vault;
test and production environments separated with no production customer data
in test; access limited to role-authorized staff with audit logging of
access-relevant mutations; retention limited to fulfillment needs with
customer PII redacted on `customers/redact` and `shop/redact` (48h
post-uninstall) webhooks; documented incident-response process with prompt
merchant/Shopify notification; encrypted backups (managed database provider);
data-loss prevention via least-privilege DB access and no PII in logs.

### 2.3 D5 note (still open)

Building and reviewing the app does not force a public listing on day one;
draft/unlisted operation is possible during development, but broad merchant
installability as a public app ultimately runs through App Store review. Plan
the listing assets (icon, screenshots, demo screencast with test store
credentials, accurate pricing = free app) for whenever you call D5.

---

## 3. Etsy (developers.etsy.com)

### 3.1 App registration form

| Field | Value |
|---|---|
| App name | **iLaunchify** (must NOT contain "Etsy" per trademark policy) |
| Describe your application | (block below) |
| Callback URLs | `[https://app.ilaunchify.com]/api/channels/oauth/etsy/callback` |
| Website | `[https://ilaunchify.com]` |
| Who will use this app | Etsy sellers who design products on iLaunchify and sell them in their own Etsy shops |
| Is your application commercial? | Start as Personal for build/testing, then request Commercial Access (§3.2) |

Description field:

> iLaunchify is a production platform for creator-branded consumable products
> (food, supplements, pet treats, cosmetics). Etsy sellers design their own
> branded products on iLaunchify; our vetted manufacturing partners produce
> and ship each order. This app lets a seller connect their Etsy shop to:
> (1) create draft listings (with images, variations, and prices) from
> products they designed on iLaunchify, so they can review and publish;
> (2) receive their paid orders so production can start; and (3) post
> tracking when their order ships. iLaunchify is declared as the seller's
> production partner on listings, in line with Etsy's transparency policy for
> made-to-order goods. We request only the scopes this requires: listings_r,
> listings_w, listings_d, transactions_r, transactions_w, shops_r, shops_w,
> address_r.

(Attribution line for our UI, required by ToS, goes in the channel hub
footer: "The term 'Etsy' is a trademark of Etsy, Inc. This application uses
the Etsy API but is not endorsed or certified by Etsy, Inc.")

### 3.2 Commercial Access request (filed after the personal app works)

> **What does your app do?** iLaunchify connects an Etsy seller's shop to our
> production platform. Sellers design original, creator-branded consumable
> products (their own brand, their own packaging design) in iLaunchify's
> design studio. The integration pushes those products to their Etsy shop as
> draft listings, imports their paid orders, and returns fulfillment
> tracking. Production is made-to-order by iLaunchify's vetted manufacturing
> partners, and iLaunchify is disclosed as the production partner on the
> seller's listings, consistent with Etsy's Working with Production Partners
> policy and the "Designed by" creativity standard.
>
> **Why commercial access?** The app serves many independent Etsy sellers
> (each authorizing via OAuth), not only our own shop. We are a commercial
> service: sellers pay iLaunchify for production, never for API access
> itself. Consumer payments remain entirely on Etsy.
>
> **Data handling.** We request the minimum scopes for listing management,
> order import, and shipment tracking. Buyer data (name, ship-to address) is
> used solely to produce and ship the specific order, is encrypted at rest,
> is never used for marketing or resold, and is retained only as long as
> fulfillment and legal record-keeping require. We comply with the Etsy API
> Terms of Use, including caching limits and the required attribution notice.
> We do not request buyer_email.

(If the form separately asks expected call volume: "Low hundreds of sellers
in year one; listing pushes are seller-initiated; order import is webhook-
driven with light polling fallback. Default rate limits are sufficient to
start.")

---

## 4. Amazon SP-API (Solution Provider Portal)

Register the **developer profile first** (this is the review that takes
weeks), then create the app. All narrative answers: keep under 500 words,
never paste Amazon's own policy language back at them.

### 4.1 Profile basics

- Organization: fact-sheet values. Public developer, public app.
- Regions: North America (US to start).
- **Roles requested (minimum set, per D2 research):**
  - Product Listing
  - Inventory and Order Tracking
  - **Direct-to-Consumer Shipping (restricted, PII)**
  - (NOT: Tax Invoicing, Tax Remittance, Pricing, Finance, Professional
    Services. Do not add "just in case": it is the top rejection cause.)

### 4.2 Use-case narrative (the "what does your application do" field)

> iLaunchify is a production and fulfillment platform for creator-branded
> consumable products. Amazon sellers design their own branded products
> (food, supplement, pet, and cosmetic goods with their own packaging) on
> iLaunchify; when their Amazon customer places an order, iLaunchify's vetted
> manufacturing partner produces the item and ships it directly to the buyer.
>
> The application (a) creates and updates the seller's product listings via
> the Listings Items API and JSON_LISTINGS_FEED, using the Product Type
> Definitions API for schemas and the Listings Restrictions API to surface
> eligibility and GTIN-exemption requirements to the seller; (b) imports the
> seller's unshipped orders via the Orders API and ORDER_CHANGE notifications
> so production can start immediately; (c) retrieves the buyer's name and
> ship-to address via Restricted Data Tokens strictly to generate the
> shipping label and carrier manifest for that order; and (d) confirms
> shipment with tracking via the Orders API once the order ships.
>
> Sellers authorize the application through the standard OAuth authorization
> workflow from our dashboard. We act only on explicit seller authorization,
> per seller, per marketplace.

### 4.3 Restricted role justification (Direct-to-Consumer Shipping)

> We physically produce and ship each order to the buyer with our own
> carrier accounts, so we require the buyer's name and ship-to address to
> purchase and print the shipping label and to give the producing facility a
> shipping manifest. This is the only PII we access. We do not request buyer
> email for outreach, we do not use PII for analytics or marketing, and we do
> not share PII with any party except the carrier and the producing facility
> fulfilling that specific order. PII is retrieved via Restricted Data Tokens
> at fulfillment time, encrypted at rest, and deleted from our systems no
> later than 30 days after delivery confirmation, after which our order
> records retain only non-PII commercial data (items, quantities, dates,
> totals) for financial record-keeping.

### 4.4 Security questionnaire (answer bank; adapt to the exact prompts)

- **Where is data stored and how is it protected?** "Data is stored in a
  managed CockroachDB cloud cluster with encryption at rest and TLS in
  transit. Amazon tokens and API credentials are stored in a dedicated
  application-encrypted vault (AES-256-GCM) whose key lives only in the
  runtime environment's secret store, never in the database or source code.
  Buyer PII is stored encrypted and access-scoped to the fulfillment
  workflow."
- **Access control:** "Role-based access control on all administrative
  surfaces; per-tenant isolation guards on every data access path; least-
  privilege database credentials; all sensitive mutations written to an
  append-only audit log retained a minimum of 90 days."
- **Credential management:** "No credentials in source code; environment-
  level secret storage; key rotation procedure documented; automated CI
  checks lint for hardcoded secrets."
- **Incident response:** "Documented incident-response plan: designated
  security contact, containment and key-rotation steps, and notification to
  affected parties and to Amazon within 24 hours of confirming an incident
  involving Amazon data."
- **Vulnerability management:** "Dependency and vulnerability scanning in CI
  on every change; periodic full scans at least every 180 days; annual
  penetration test scheduled prior to production PII handling." (Book the pen
  test before submitting if possible; if not, phrase as scheduled with date.)
- **Data retention/deletion:** "Buyer PII retained only for fulfillment:
  automatically redacted no later than 30 days after delivery confirmation.
  Non-PII commercial records retained for financial compliance. Deletion
  covers primary storage, logs (PII is never written to logs), and expiring
  encrypted backups."
- **Subprocessors:** name them plainly: cloud host `[HOST]`, CockroachDB
  Cloud, Cloudflare R2 (assets, no PII), Stripe (payments, no Amazon data),
  Resend (transactional email, no buyer PII), Sentry (errors, PII-scrubbed).

### 4.5 App registration values (after profile approval)

- OAuth Login URI: `[https://app.ilaunchify.com]/api/channels/oauth/amazon/login`
- OAuth Redirect URI: `[https://app.ilaunchify.com]/api/channels/oauth/amazon/callback`
- Notifications: SQS/EventBridge destination created at build time (C4).
- Test in Draft mode with `version=beta` consent URLs before approval
  completes; Appstore listing (optional, 3-4 weeks) decided later.

---

## 5. TikTok Shop (US Partner Center)

⚠ Register on the **US portal** (US-registered entity required); the business
region choice is permanent.

| Field | Value |
|---|---|
| Partner type | Ecosystem/service partner, app developer |
| Company | fact-sheet values (entity must be US-registered) |
| App name | iLaunchify |
| App type | **Public** |
| Redirect URL | `[https://app.ilaunchify.com]/api/channels/oauth/tiktok/callback` |
| Webhook URL | `[https://app.ilaunchify.com]/api/webhooks/channels/tiktok` |

Scopes to request upfront (scope additions later mean re-review): Product
(read/write), Order (read), Fulfillment/Logistics (read/write), Shop
Authorized Info. Skip Finance and Returns for V1 (returns stay seller-side
per our money boundary; add later if needed).

App description:

> iLaunchify lets TikTok Shop sellers sell their own branded consumable
> products (food, supplements, pet treats, cosmetics) made on demand.
> Sellers design products on iLaunchify; our vetted manufacturing partners
> produce and ship each order. The app publishes the seller's product
> listings with category attributes and compliant images, receives paid
> orders for production, updates stock availability, and returns
> shipping/tracking information through the Fulfillment APIs. Consumer
> payment and the customer relationship remain entirely on TikTok Shop.

Reviewer expectations worth pre-empting: sandbox test evidence before
launch review, and a working webhook endpoint. Build order in C3 already
covers both.

---

## 6. eBay (developer.ebay.com)

### 6.1 Developer program signup

Free, instant sandbox keys. Application form:

> **Application title:** iLaunchify
> **What will your application do?** iLaunchify is a production platform for
> creator-branded consumable products. eBay sellers connect their account so
> iLaunchify can create and manage their listings (Inventory API), ensure
> required business policies exist (Account API), import their paid orders
> (Fulfillment API), and upload tracking when orders ship. Production is
> made-to-order; consumer payment stays on eBay.

OAuth settings: redirect URI (RuName) →
`[https://app.ilaunchify.com]/api/channels/oauth/ebay/callback`; scopes:
`sell.inventory`, `sell.account`, `sell.fulfillment`,
`commerce.notification.subscription`.

### 6.2 Account-deletion endpoint (BUILD BEFORE requesting production keys)

Spec for the tiny endpoint that gates production access:

- Route: `[https://app.ilaunchify.com]/api/webhooks/channels/ebay/account-deletion`
- GET with `challenge_code` param → respond
  `{"challengeResponse": sha256hex(challengeCode + verificationToken + endpointURL)}`
- POST (actual deletion notices) → verify signature, delete/anonymize any
  stored data for that eBay user, ack 200 within seconds (queue the work).
- Verification token: 32-80 chars, store in env (`EBAY_DELETION_TOKEN`),
  register in the Integrations registry (presence-only).
- Alert email: security contact from the fact sheet.
- Monitor: failures for 24h mark the endpoint down and start a 30-day clock.

Since we DO persist eBay data (listings, orders), we cannot use the opt-out
path; the endpoint is mandatory. It is ~an afternoon of work against the
existing webhook route pattern and can deploy before any adapter exists.

### 6.3 Later (not at signup)

Application growth check only when we need restricted APIs or higher limits;
defaults (Inventory 2M/day, Fulfillment 100k/day) are far beyond our V1
volumes.

---

## 7. Submission order and tracking

| # | Platform | Submit | Blocked by | Expected wait |
|---|---|---|---|---|
| 1 | eBay dev program | now | nothing (sandbox) | instant; prod keys after §6.2 endpoint |
| 2 | Etsy app (Personal) | now | callback URL decided | days to ~2 weeks |
| 3 | Shopify app (create, Public) | now | §1 pages for later review steps | app creation instant; L2 + review when filed |
| 4 | TikTok Partner Center + app | this week | US entity docs ready | ~1 week |
| 5 | Amazon developer profile | after §1 checklist | public site, privacy policy, pen-test scheduling | 2 wks + 4-8 wks PII review |
| 6 | Etsy Commercial Access | after Etsy adapter works | working personal app | weeks |

Track status in the admin Integrations registry (one row per platform app,
presence-only env keys: `SHOPIFY_APP_CLIENT_ID`, `ETSY_KEYSTRING`,
`AMZ_SPAPI_CLIENT_ID` (exists), `TIKTOK_APP_KEY`, `EBAY_CLIENT_ID`).
