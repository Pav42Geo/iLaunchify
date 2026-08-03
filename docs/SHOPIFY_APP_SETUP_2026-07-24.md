# Shopify App Setup: Dev Dashboard Click-Through + shopify.app.toml

**Date:** 2026-07-24 · **Owner:** Pavel (accounts) + Cowork (config)
**Doc pair:** `docs/SHOP_CONNECT_E2E_2026-07-24.md` (Track A1), `docs/REGISTRATION_ANSWERS_2026-07-24.md` §2
**Goal:** a working Shopify app whose two keys light up the C1 adapter
(`SHOPIFY_APP_CLIENT_ID` + `SHOPIFY_APP_CLIENT_SECRET` in `.env.local`).

Strategy: create a **dev app now** (localhost URLs, connect against a
development store, zero review) and a **separate production app later** when
domains are final. Two apps is the standard pattern; it keeps prod credentials
out of laptops and lets us test breaking changes safely. Nothing about D5
(App Store listing timing) is decided by this: the dev app is never listed.

---

## Part 1: One-time accounts (~10 minutes)

1. Go to **dev.shopify.com** and sign in with your Shopify account (create one
   if needed; use a company email you keep, this becomes the app's owner).
2. Create your **organization** when prompted (name: iLaunchify). This is the
   Dev Dashboard home that replaced the old Partner Dashboard.
3. Install the Shopify CLI on the Mac (used only to push app config):

   ```bash
   npm install -g @shopify/cli@latest
   shopify version
   ```

4. Create a **development store** for testing (Dev Dashboard → Dev stores →
   Create dev store → "Create a store to test and build"). Name it something
   like `ilaunchify-dev`. Note the domain: `ilaunchify-dev.myshopify.com`.
   This store is free, can never charge real money, and is where the Connect
   button will point during testing.

## Part 2: Create the app (~5 minutes)

1. Dev Dashboard → **Apps** → **Create app**.
2. If asked how to start, choose the option to **create an app manually /
   start with config** (NOT a template scaffold: our app already exists, it is
   the iLaunchify creator app; we only need credentials + settings).
3. App name: **iLaunchify** (this is what merchants see on the consent screen,
   exactly like "Printful: Power your passion" in your screenshot).
4. ⚠ **Distribution: when asked, pick PUBLIC distribution.** This choice is
   IRREVERSIBLE per app. Custom distribution locks the app to a single store
   forever; public is what a multi-merchant platform needs. (The dev app can
   stay unlisted indefinitely; public ≠ listed in the App Store.)
5. Open the app's **Settings / Credentials** page and copy two values:
   - **Client ID** → `SHOPIFY_APP_CLIENT_ID`
   - **Client secret** → `SHOPIFY_APP_CLIENT_SECRET`
6. Paste both into `.env.local` at the repo root (no quotes, no `#`, we
   learned that lesson) and restart the dev server. From this moment
   `resolveChannelAdapter('shopify')` returns the REAL adapter.

## Part 3: App configuration via shopify.app.toml

The config lives in the repo so it is versioned and reviewable, then gets
pushed with the CLI. Recommended location: a new `integrations/shopify/`
directory (the app is not CLI-scaffolded, so the TOML gets its own home).

`integrations/shopify/shopify.app.toml`:

```toml
# iLaunchify Shopify app (DEV). Phase C1, docs/SHOP_CONNECT_E2E_2026-07-24.md.
# Pushed with `shopify app deploy` from this directory. The PRODUCTION app is
# a separate app + separate TOML with real domains (create at go-live).

name = "iLaunchify"
handle = "ilaunchify"
# From the app's Credentials page (Part 2 step 5). NOT the secret: the secret
# never enters the repo, it lives only in .env.local / the host env.
client_id = "PASTE_CLIENT_ID_HERE"

# Standalone integration: creators start from OUR dashboard, not an embedded
# admin iframe. Managed installation is for embedded apps; we keep the classic
# authorization-code grant (use_legacy_install_flow below) that the B2 rails
# implement.
application_url = "http://localhost:3000/channels"
embedded = false

[access_scopes]
# EXACTLY the least-scope set the adapter requests (SHOPIFY_SCOPES in
# packages/channels/src/adapters/shopify.ts). Keep the two in lockstep: a
# scope mismatch surfaces as a consent-screen error.
scopes = "write_products,read_orders,read_inventory,write_inventory,read_locations,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders"
# Classic authorization-code OAuth (the /admin/oauth/authorize redirect our
# callback route completes). Without this flag Shopify assumes managed
# installation and never sends the code to our redirect URL.
use_legacy_install_flow = true

[auth]
redirect_urls = [
  # Dev. Localhost is allowed for development apps.
  "http://localhost:3000/api/channels/oauth/shopify/callback",
  # Tunnel origin for webhook testing (Part 5): add yours when you have it,
  # e.g. "https://ilaunchify.trycloudflare.com/api/channels/oauth/shopify/callback",
]

[webhooks]
api_version = "2026-07"

# Mandatory privacy/compliance topics (GDPR webhooks). Required for any
# public app; they point at the B4 receiver. NOTE the follow-up below: the
# receiver verifies + acknowledges these today, but the redact/data_request
# HANDLING (delete or export the buyer data we hold) is a small C1 follow-up
# before App Store review (D5). Not needed for dev-store testing.
[[webhooks.subscriptions]]
compliance_topics = [ "customers/data_request", "customers/redact", "shop/redact" ]
uri = "/api/webhooks/channels/shopify"

# Order/app webhooks are NOT declared here on purpose: the adapter registers
# ORDERS_PAID / ORDERS_CANCELLED / APP_UNINSTALLED per store at connect time
# (registerWebhooks, C1) so subscriptions follow each connection's lifecycle.
```

Push it:

```bash
cd integrations/shopify
shopify app config link   # one-time: binds this TOML to the app you created
shopify app deploy        # pushes the configuration
```

(`config link` asks you to pick the org + app; after that, `deploy` is the
only command you repeat when the TOML changes.)

## Part 4: First live round trip (dev store)

1. `.env.local` has both keys; dev server restarted; B1-B4 push sequence done.
2. Creator app → `/channels` → Shopify card → **Connect**.
3. Prompt: enter `ilaunchify-dev` (the dev store). You land on the store's
   consent screen listing exactly the scopes above → **Install**.
4. Back on `/channels`: "Shopify connected (ilaunchify-dev.myshopify.com)",
   card CONNECTED, tokens sealed in ChannelSecret, webhooks registered.
5. Push a product from the Sell surface → it appears in the dev store admin
   (Products) with variants + made-to-order inventory policy.
6. Place a test order in the dev store (dev stores allow test checkout with
   the Bogus Gateway) → "Sync now" in the channel-orders inbox pulls it →
   the C2 pipeline takes over (readiness → enablement gate → router).

## Part 5: Webhooks in dev (optional, poll works without)

Shopify can only deliver webhooks to a public https origin. Two options:

- **Skip it.** The poll path (Sync now + hourly cron) exercises everything;
  webhooks just make it instant. Fine for the first e2e.
- **Tunnel.** `cloudflared tunnel --url http://localhost:3000` (or ngrok),
  then add the tunnel origin to `redirect_urls` in the TOML, redeploy, set
  `NEXT_PUBLIC_APP_URL` to the tunnel origin, restart, and RECONNECT the
  store (re-running registerWebhooks so subscriptions point at the tunnel).

## Part 6: Production app (later, at go-live)

Repeat Part 2 with a second app named "iLaunchify" (prod), a separate
`shopify.app.prod.toml` with real domains
(`https://app.ilaunchify.com/...`), and the prod keys set in the hosting
env (never `.env.local`). App Store listing assets + Protected Customer Data
Level 2 request (buyer name/address/phone for labels) happen on THIS app when
D5 says list: see `docs/REGISTRATION_ANSWERS_2026-07-24.md` §2.2 for the
prepared per-field justifications.

## Follow-ups tracked

- Compliance-topic HANDLING in the receiver (redact/export), before D5 review.
- Protected Customer Data L2 request on the prod app (buyer PII fields).
- `oauthConfigured` flag on the Channel registry row flips when keys land
  (admin can verify on the Developer & API page: 'Shopify (sales channel)'
  row shows configured once both env vars are present).
