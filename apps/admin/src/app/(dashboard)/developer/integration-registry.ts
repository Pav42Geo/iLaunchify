// Integration registry — the catalog of every external API / service the
// platform talks to, plus an env-backed STATUS resolver.
//
// SECURITY MODEL (docs/INTEGRATIONS.md): this surface NEVER reads, displays, or
// stores secret VALUES. It only reports whether each backing env var is set in
// the running environment, and surfaces the vendor docs/dashboard so an admin
// can rotate the key at the source. Secret values live in the host's env /
// secrets store, never in our database. The resolver runs server-side only.

export type EnvVarKind = 'secret' | 'config' | 'public'

export interface EnvVarSpec {
  name: string
  kind: EnvVarKind
  required: boolean
  note?: string
}

export type IntegrationCategory =
  | 'Payments'
  | 'Authentication'
  | 'Storage & Hosting'
  | 'Email'
  | 'AI'
  | 'Data APIs'
  | 'Logistics'
  | 'Sales Channels'
  | 'Monitoring'
  | 'Platform Core'
  | 'Internal Services'

export interface IntegrationDef {
  key: string
  name: string
  vendor: string
  category: IntegrationCategory
  description: string
  /** Vendor docs. */
  docsUrl?: string
  /** Vendor console where the key is rotated. */
  dashboardUrl?: string
  envVars: EnvVarSpec[]
  /** Suggested rotation cadence in days (UI reminder only). */
  rotationDays?: number
  /** 'live' = wired into the app today; 'planned' = anticipated slot. */
  lifecycle: 'live' | 'planned'
  /** True when `testIntegration(key)` has a read-only probe for it. */
  testable?: boolean
  /**
   * LogisticsSetting gate that ALSO has to be ON for this rail to run
   * (env configured is only half the switch). Renders a gate pill linking
   * to admin → Logistics → Gates.
   */
  gateKey?: string
  /** In-app surfaces this integration powers — rendered as deep links. */
  appLinks?: Array<{ label: string; href: string }>
}

// ── Catalog ──────────────────────────────────────────────────────────────────
// Derived from a full `process.env` sweep of the codebase (2026-06-22) plus the
// anticipated integrations. Add a row here when you wire a new service.

export const INTEGRATIONS: IntegrationDef[] = [
  // Payments
  {
    key: 'stripe',
    name: 'Stripe',
    vendor: 'Stripe',
    category: 'Payments',
    description: 'Charges, Connect payouts, refunds, subscriptions. The platform money path.',
    docsUrl: 'https://docs.stripe.com/keys',
    dashboardUrl: 'https://dashboard.stripe.com/apikeys',
    rotationDays: 180,
    lifecycle: 'live',
    testable: true,
    envVars: [
      { name: 'STRIPE_SECRET_KEY', kind: 'secret', required: true },
      { name: 'STRIPE_WEBHOOK_SECRET', kind: 'secret', required: true, note: 'Signs incoming webhooks' },
      { name: 'STRIPE_REFUNDS_ENABLED', kind: 'config', required: false, note: 'Master switch — keep off until test-mode verified' },
    ],
  },
  // Authentication
  {
    key: 'google-oauth',
    name: 'Google OAuth',
    vendor: 'Google Cloud',
    category: 'Authentication',
    description: 'Google sign-in provider (Auth.js).',
    docsUrl: 'https://developers.google.com/identity/protocols/oauth2',
    dashboardUrl: 'https://console.cloud.google.com/apis/credentials',
    rotationDays: 365,
    lifecycle: 'live',
    envVars: [
      { name: 'AUTH_GOOGLE_ID', kind: 'config', required: false, note: 'Public client id' },
      { name: 'AUTH_GOOGLE_SECRET', kind: 'secret', required: false },
    ],
  },
  {
    key: 'authjs',
    name: 'Auth.js (session signing)',
    vendor: 'Self / NextAuth',
    category: 'Authentication',
    description: 'Signs session tokens. Rotating invalidates all sessions.',
    docsUrl: 'https://authjs.dev/getting-started/deployment#auth_secret',
    rotationDays: 365,
    lifecycle: 'live',
    envVars: [{ name: 'AUTH_SECRET', kind: 'secret', required: true }],
  },
  // Email
  {
    key: 'resend',
    name: 'Resend',
    vendor: 'Resend',
    category: 'Email',
    description:
      'Transactional email — magic-link sign-in, all Notification Center sends, admin invites. The webhook secret feeds the Deliverability surface (delivered/bounce/complaint/open) and the auto-suppression list.',
    docsUrl: 'https://resend.com/docs',
    dashboardUrl: 'https://resend.com/api-keys',
    rotationDays: 180,
    lifecycle: 'live',
    testable: true,
    envVars: [
      { name: 'AUTH_RESEND_KEY', kind: 'secret', required: false, note: 'Emails silently skip (rows kept, emailSentAt null) until set' },
      { name: 'AUTH_EMAIL_FROM', kind: 'config', required: false, note: 'Verified sender address ("Name <addr>" or bare)' },
      { name: 'RESEND_WEBHOOK_SECRET', kind: 'secret', required: false, note: 'whsec_… — signs inbound delivery webhooks (Resend dashboard → Webhooks → endpoint /api/webhooks/resend on the creator app)' },
    ],
    appLinks: [
      { label: 'Templates', href: '/notifications-center/templates' },
      { label: 'Deliverability', href: '/notifications-center/deliverability' },
    ],
  },
  // Notification Center platform secrets (docs/EMAIL_NOTIFICATION_CENTER.md,
  // 2026-07-05) — self-issued, not vendor keys, so they get their own row.
  {
    key: 'notification-center',
    name: 'Notification Center',
    vendor: 'Self',
    category: 'Email',
    description:
      'Signs the one-click unsubscribe tokens in every opt-outable email footer (HMAC over userId + category; powers the List-Unsubscribe header Gmail/Yahoo require). Emails omit the unsubscribe link until the secret is set. Rotating it invalidates links in already-sent emails — old footers will show "link expired" until users get a newer email.',
    lifecycle: 'live',
    rotationDays: 365,
    envVars: [
      { name: 'NOTIFICATION_UNSUBSCRIBE_SECRET', kind: 'secret', required: false, note: 'Any long random string (e.g. `openssl rand -hex 32`)' },
      { name: 'FEEDBACK_TOKEN_SECRET', kind: 'secret', required: false, note: 'Signs one-click feedback tokens (vote-in-the-link). Emails omit the feedback block until set. Rotating expires links in sent emails.' },
      { name: 'NEXT_PUBLIC_MARKETING_URL', kind: 'public', required: false, note: 'Host serving /unsubscribe, /unsubscribe/one-click + /feedback (defaults to localhost:3010 in dev)' },
    ],
    appLinks: [
      { label: 'Branding (footer copy)', href: '/notifications-center/branding' },
      { label: 'Notification log', href: '/notifications-center/log' },
    ],
  },
  // Storage & Hosting
  {
    key: 'r2',
    name: 'Cloudflare R2',
    vendor: 'Cloudflare',
    category: 'Storage & Hosting',
    description: 'Object storage for uploads, die-lines, mockups, label/asset files.',
    docsUrl: 'https://developers.cloudflare.com/r2/api/s3/tokens/',
    dashboardUrl: 'https://dash.cloudflare.com/?to=/:account/r2/api-tokens',
    rotationDays: 180,
    lifecycle: 'live',
    testable: true,
    envVars: [
      { name: 'R2_ACCOUNT_ID', kind: 'config', required: true },
      { name: 'R2_ACCESS_KEY_ID', kind: 'secret', required: true },
      { name: 'R2_SECRET_ACCESS_KEY', kind: 'secret', required: true },
      { name: 'R2_BUCKET', kind: 'config', required: true },
      { name: 'R2_PUBLIC_BASE_URL', kind: 'public', required: false, note: 'Public read base (or R2_PUBLIC_URL)' },
    ],
  },
  // Data APIs
  {
    key: 'usda-fdc',
    name: 'USDA FoodData Central',
    vendor: 'USDA',
    category: 'Data APIs',
    description: 'Ingredient nutrition lookup (FDC) for the recipe builder.',
    docsUrl: 'https://fdc.nal.usda.gov/api-guide.html',
    dashboardUrl: 'https://fdc.nal.usda.gov/api-key-signup.html',
    lifecycle: 'live',
    testable: true,
    envVars: [{ name: 'USDA_FDC_API_KEY', kind: 'secret', required: false }],
  },
  // AI
  {
    key: 'anthropic',
    name: 'Anthropic',
    vendor: 'Anthropic',
    category: 'AI',
    description: 'AI features (recipe parsing, assistive copy).',
    docsUrl: 'https://docs.anthropic.com',
    dashboardUrl: 'https://console.anthropic.com/settings/keys',
    rotationDays: 180,
    lifecycle: 'live',
    testable: true,
    envVars: [{ name: 'ANTHROPIC_API_KEY', kind: 'secret', required: false }],
  },
  {
    key: 'fal',
    name: 'fal.ai',
    vendor: 'fal.ai',
    category: 'AI',
    description:
      'AI Packaging Generator — FLUX.1 raster panels, ControlNet structure-lock (die-line + reserved zones), and finalize upscale. Falls back to the deterministic stub when unset.',
    docsUrl: 'https://docs.fal.ai',
    dashboardUrl: 'https://fal.ai/dashboard/keys',
    rotationDays: 180,
    lifecycle: 'live',
    envVars: [{ name: 'FAL_KEY', kind: 'secret', required: false, note: 'Raster generation + upscale; generator uses the stub until set' }],
  },
  {
    key: 'recraft',
    name: 'Recraft',
    vendor: 'Recraft',
    category: 'AI',
    description:
      'AI Packaging Generator — vector type / accent art (SVG) for crisp in-frame typography. Falls back to the deterministic stub when unset.',
    docsUrl: 'https://www.recraft.ai/docs',
    dashboardUrl: 'https://www.recraft.ai/profile/api',
    rotationDays: 180,
    lifecycle: 'live',
    envVars: [{ name: 'RECRAFT_API_KEY', kind: 'secret', required: false, note: 'Vector type art; generator uses the stub until set' }],
  },
  // Monitoring
  {
    key: 'sentry',
    name: 'Sentry',
    vendor: 'Sentry',
    category: 'Monitoring',
    description: 'Error + performance monitoring across all apps.',
    docsUrl: 'https://docs.sentry.io',
    dashboardUrl: 'https://sentry.io',
    lifecycle: 'live',
    envVars: [{ name: 'SENTRY_DSN', kind: 'config', required: false, note: 'DSN is semi-public' }],
  },
  // Internal services
  {
    key: 'compliance-service',
    name: 'Compliance Service',
    vendor: 'Internal (Python)',
    category: 'Internal Services',
    description: 'FDA rule-pack + label validation service (bearer-token authenticated both ways).',
    rotationDays: 180,
    lifecycle: 'live',
    testable: true,
    envVars: [
      { name: 'COMPLIANCE_SERVICE_URL', kind: 'config', required: false },
      { name: 'COMPLIANCE_SERVICE_TOKEN', kind: 'secret', required: false },
    ],
  },
  // Platform core
  {
    key: 'cockroachdb',
    name: 'CockroachDB',
    vendor: 'Cockroach Labs',
    category: 'Platform Core',
    description: 'Primary database (Prisma reads DATABASE_URL directly).',
    docsUrl: 'https://www.cockroachlabs.com/docs/',
    dashboardUrl: 'https://cockroachlabs.cloud/clusters',
    rotationDays: 365,
    lifecycle: 'live',
    envVars: [{ name: 'DATABASE_URL', kind: 'secret', required: true }],
  },
  {
    key: 'cron',
    name: 'Cron / scheduled jobs',
    vendor: 'Self',
    category: 'Platform Core',
    description: 'Shared secret that authenticates scheduled-task HTTP triggers.',
    rotationDays: 365,
    lifecycle: 'live',
    envVars: [{ name: 'CRON_SECRET', kind: 'secret', required: false }],
  },
  {
    key: 'ops-alerts',
    name: 'Ops alert email',
    vendor: 'Self',
    category: 'Platform Core',
    description: 'Recipient for the weekly API-key rotation digest (cron). Needs Resend configured.',
    lifecycle: 'live',
    envVars: [{ name: 'OPS_ALERT_EMAIL', kind: 'config', required: false, note: 'Where rotation-due digests are sent' }],
  },
  // ── Planned / anticipated (slots, not yet wired) ──
  {
    key: 'mux',
    name: 'Mux',
    vendor: 'Mux',
    category: 'Data APIs',
    description: 'Academy video hosting + playback (planned — see ACADEMY_SPEC).',
    docsUrl: 'https://docs.mux.com',
    dashboardUrl: 'https://dashboard.mux.com/settings/access-tokens',
    lifecycle: 'planned',
    envVars: [
      { name: 'MUX_TOKEN_ID', kind: 'config', required: false },
      { name: 'MUX_TOKEN_SECRET', kind: 'secret', required: false },
    ],
  },
  {
    key: 'pacdora',
    name: 'Pacdora',
    vendor: 'Pacdora',
    category: 'Data APIs',
    description: '3D packaging mockups / dieline rendering (build-vs-buy under review).',
    docsUrl: 'https://www.pacdora.com',
    lifecycle: 'planned',
    envVars: [{ name: 'PACDORA_API_KEY', kind: 'secret', required: false }],
  },
  {
    key: 'tax',
    name: 'Sales tax',
    vendor: 'Stripe Tax / TaxJar',
    category: 'Payments',
    description: 'Sales-tax calculation at checkout (planned).',
    lifecycle: 'planned',
    envVars: [{ name: 'TAXJAR_API_KEY', kind: 'secret', required: false, note: 'Or use Stripe Tax (no extra key)' }],
  },
  // ── Logistics (docs/LOGISTICS_AND_FULFILLMENT.md, built 2026-07-02).
  // Env presence here is only half the switch — each rail ALSO needs its
  // LogisticsSetting gate flipped in admin → Logistics → Gates. Per-partner /
  // per-creator credentials (EasyPost Forge child keys, SP-API refresh tokens)
  // live in the secret store referenced by CarrierAccount.externalRef /
  // ChannelConnection.accessTokenRef — never in env, never shown here.
  {
    key: 'easypost',
    name: 'EasyPost (parcel rail)',
    vendor: 'EasyPost',
    category: 'Logistics',
    description:
      'Platform parcel rates, label purchase, Forge child accounts per partner, tracking webhooks. Gate: carrier:easypost.',
    docsUrl: 'https://docs.easypost.com',
    dashboardUrl: 'https://app.easypost.com/account/api-keys',
    rotationDays: 180,
    lifecycle: 'live',
    testable: true,
    gateKey: 'carrier:easypost',
    appLinks: [
      { label: 'Carrier rules', href: '/logistics/carriers' },
      { label: 'Shipments', href: '/logistics/shipments' },
    ],
    envVars: [
      { name: 'EASYPOST_API_KEY', kind: 'secret', required: true },
      {
        name: 'EASYPOST_WEBHOOK_SECRET',
        kind: 'secret',
        required: true,
        note: 'Signs tracker webhooks → apps/partner /api/webhooks/easypost; register that URL in the EasyPost dashboard',
      },
    ],
  },
  {
    key: 'shipengine-ltl',
    name: 'ShipEngine (dry LTL)',
    vendor: 'ShipEngine',
    category: 'Logistics',
    description: 'Dry LTL quotes + auto-BOL (Phase L2, flagged). Gate: carrier:shipengine_ltl.',
    docsUrl: 'https://www.shipengine.com/docs/ltl/',
    lifecycle: 'planned',
    gateKey: 'carrier:shipengine_ltl',
    appLinks: [{ label: 'Carrier rules', href: '/logistics/carriers' }],
    envVars: [{ name: 'SHIPENGINE_API_KEY', kind: 'secret', required: false }],
  },
  {
    key: 'loadsmart',
    name: 'Loadsmart (reefer freight)',
    vendor: 'Loadsmart',
    category: 'Logistics',
    description: 'Refrigerated LTL/FTL broker — async quote rail (V2, with cold-chain gates). Gate: carrier:broker_reefer.',
    docsUrl: 'https://loadsmart.com',
    lifecycle: 'planned',
    gateKey: 'carrier:broker_reefer',
    appLinks: [{ label: 'Shipments', href: '/logistics/shipments' }],
    envVars: [{ name: 'LOADSMART_API_KEY', kind: 'secret', required: false }],
  },
  {
    key: 'amazon-spapi',
    name: 'Amazon SP-API (FBA inbound)',
    vendor: 'Amazon',
    category: 'Logistics',
    description:
      'Creator OAuth + inbound plans + FBA box labels + MCF. Blocked on our developer-application approval; checkout/plan scaffolding already live. Gate: channel_inbound:AMAZON_FBA. SAME app credentials also power the C4 selling-side adapter (listings + orders).',
    docsUrl: 'https://developer-docs.amazon.com/sp-api/',
    dashboardUrl: 'https://sellercentral.amazon.com/sellingpartner/developerconsole',
    lifecycle: 'planned',
    gateKey: 'channel_inbound:AMAZON_FBA',
    appLinks: [{ label: 'Channel plans', href: '/logistics/channel-plans' }],
    envVars: [
      { name: 'AMZ_SPAPI_CLIENT_ID', kind: 'config', required: false, note: 'LWA app client id — its presence lights up the creator Connect button' },
      { name: 'AMZ_SPAPI_CLIENT_SECRET', kind: 'secret', required: false },
      { name: 'AMZ_SPAPI_REFRESH_ENDPOINT_REGION', kind: 'config', required: false, note: 'Default us-east-1' },
    ],
  },
  {
    key: 'walmart-wfs',
    name: 'Walmart Marketplace (WFS)',
    vendor: 'Walmart',
    category: 'Logistics',
    description: 'WFS inbound plans + box labels (Phase L4). GTIN-only labeling. Gate: channel_inbound:WALMART_WFS. SAME credentials also power the C5 selling-side adapter (items/inventory/orders; 15-min token refresh).',
    docsUrl: 'https://developer.walmart.com',
    lifecycle: 'planned',
    gateKey: 'channel_inbound:WALMART_WFS',
    appLinks: [{ label: 'Channel plans', href: '/logistics/channel-plans' }],
    envVars: [
      { name: 'WALMART_CLIENT_ID', kind: 'config', required: false },
      { name: 'WALMART_CLIENT_SECRET', kind: 'secret', required: false },
    ],
  },
  {
    key: 'tiktok-shop',
    name: 'TikTok Shop (FBT)',
    vendor: 'TikTok',
    category: 'Logistics',
    description: 'FBT inbound requests + carton labels (Phase L4; FBT near-mandatory since 2026-02-25). Gate: channel_inbound:TIKTOK_FBT. SAME app key/secret also power the C3 selling-side adapter (Seller API: products/orders/fulfillment).',
    docsUrl: 'https://partner.tiktokshop.com',
    lifecycle: 'planned',
    gateKey: 'channel_inbound:TIKTOK_FBT',
    appLinks: [{ label: 'Channel plans', href: '/logistics/channel-plans' }],
    envVars: [
      { name: 'TIKTOK_SHOP_APP_KEY', kind: 'config', required: false },
      { name: 'TIKTOK_SHOP_APP_SECRET', kind: 'secret', required: false },
    ],
  },
  // ---------------------------------------------------------------------------
  // Sales Channels (docs/CHANNEL_MANAGEMENT_SPEC.md) — selling-side adapter keys.
  // Presence of a channel's platform keys is what flips Channel.oauthConfigured
  // (creator Connect buttons leave the dev stub). TikTok / Amazon / Walmart
  // selling reuses the SAME app credentials as their Logistics inbound rows above
  // (one app per vendor) — no duplicate env vars.
  // ---------------------------------------------------------------------------
  {
    key: 'shopify',
    name: 'Shopify (sales channel)',
    vendor: 'Shopify',
    category: 'Sales Channels',
    description:
      'C1 — the FIRST real channel adapter: OAuth connect, listing push, order webhooks + poll, inventory + fulfillment sync. Create the public app in the Shopify Dev Dashboard (dev.shopify.com), least scopes: read_orders, write_products, write_merchant_managed_fulfillment_orders, read_inventory/write_inventory.',
    docsUrl: 'https://shopify.dev/docs/api/admin-graphql',
    dashboardUrl: 'https://dev.shopify.com',
    // C1 adapter SHIPPED 2026-07-24 (packages/channels/src/adapters/shopify.ts);
    // key presence activates it in resolveChannelAdapter.
    lifecycle: 'live',
    appLinks: [
      { label: 'Channels registry', href: '/channels' },
      { label: 'Connections & sync', href: '/channels/connections' },
    ],
    envVars: [
      { name: 'SHOPIFY_APP_CLIENT_ID', kind: 'config', required: false, note: 'Public app client id — presence lights up the creator Connect button' },
      { name: 'SHOPIFY_APP_CLIENT_SECRET', kind: 'secret', required: false, note: 'Also signs webhook HMAC verification' },
      { name: 'SHOPIFY_APP_URL', kind: 'public', required: false, note: 'OAuth redirect base (defaults to NEXT_PUBLIC_CREATOR_URL)' },
    ],
  },
  {
    key: 'etsy',
    name: 'Etsy (sales channel)',
    vendor: 'Etsy',
    category: 'Sales Channels',
    description:
      'C5 long-tail. Open API v3, OAuth 2.0. NOTE: Etsy requires production-partner disclosure on maker listings — the adapter surfaces the pinned manufacturer in listing metadata.',
    docsUrl: 'https://developers.etsy.com/documentation/',
    lifecycle: 'planned',
    appLinks: [{ label: 'Channels registry', href: '/channels' }],
    envVars: [
      { name: 'ETSY_APP_KEYSTRING', kind: 'config', required: false },
      { name: 'ETSY_APP_SHARED_SECRET', kind: 'secret', required: false },
    ],
  },
  {
    key: 'ebay',
    name: 'eBay (sales channel)',
    vendor: 'eBay',
    category: 'Sales Channels',
    description:
      'C5 long-tail. Sell API suite, OAuth 2.0. Listing push requires fulfillment/payment/return policy objects to exist on the seller account first.',
    docsUrl: 'https://developer.ebay.com/develop/apis',
    lifecycle: 'planned',
    appLinks: [{ label: 'Channels registry', href: '/channels' }],
    envVars: [
      { name: 'EBAY_CLIENT_ID', kind: 'config', required: false },
      { name: 'EBAY_CLIENT_SECRET', kind: 'secret', required: false },
      { name: 'EBAY_RU_NAME', kind: 'config', required: false, note: 'eBay OAuth redirect-url name' },
    ],
  },
  {
    key: 'wix',
    name: 'Wix Stores (sales channel)',
    vendor: 'Wix',
    category: 'Sales Channels',
    description: 'C5 long-tail. Wix app-market OAuth app (Stores + Orders APIs).',
    docsUrl: 'https://dev.wix.com/docs',
    lifecycle: 'planned',
    appLinks: [{ label: 'Channels registry', href: '/channels' }],
    envVars: [
      { name: 'WIX_APP_ID', kind: 'config', required: false },
      { name: 'WIX_APP_SECRET', kind: 'secret', required: false },
    ],
  },
  {
    key: 'squarespace',
    name: 'Squarespace Commerce (sales channel)',
    vendor: 'Squarespace',
    category: 'Sales Channels',
    description:
      'C5 long-tail. Narrowest API surface of the roster (orders + inventory solid; rich listing management limited) — expect a reduced adapter.',
    docsUrl: 'https://developers.squarespace.com/commerce-apis/overview',
    lifecycle: 'planned',
    appLinks: [{ label: 'Channels registry', href: '/channels' }],
    envVars: [
      { name: 'SQUARESPACE_CLIENT_ID', kind: 'config', required: false },
      { name: 'SQUARESPACE_CLIENT_SECRET', kind: 'secret', required: false },
    ],
  },
  {
    key: 'woocommerce',
    name: 'WooCommerce (sales channel)',
    vendor: 'Automattic',
    category: 'Sales Channels',
    description:
      'C5 long-tail. SELF-HOSTED: no platform-level app — creators enter per-store REST consumer key/secret at connect time (stored as connection secrets, not env). Version drift across stores; poll fallback matters. No env vars by design.',
    docsUrl: 'https://woocommerce.github.io/woocommerce-rest-api-docs/',
    lifecycle: 'planned',
    appLinks: [{ label: 'Channels registry', href: '/channels' }],
    envVars: [],
  },
  {
    key: 'bigcommerce',
    name: 'BigCommerce (sales channel)',
    vendor: 'BigCommerce',
    category: 'Sales Channels',
    description:
      'C5 long-tail. Per-store API accounts entered at connect time (connection secrets) OR a platform app — decided with the C5 native-vs-unified call. Solid webhooks.',
    docsUrl: 'https://developer.bigcommerce.com/docs',
    lifecycle: 'planned',
    appLinks: [{ label: 'Channels registry', href: '/channels' }],
    envVars: [
      { name: 'BIGCOMMERCE_APP_CLIENT_ID', kind: 'config', required: false, note: 'Only if the platform-app path wins at C5' },
      { name: 'BIGCOMMERCE_APP_CLIENT_SECRET', kind: 'secret', required: false },
    ],
  },
  {
    key: 'channel-vault',
    name: 'Channel token vault',
    vendor: 'iLaunchify (internal)',
    category: 'Sales Channels',
    description:
      'AES-256-GCM key sealing creator marketplace OAuth tokens at rest (ChannelSecret rows; Track B1, docs/SHOP_CONNECT_E2E_2026-07-24.md). The key never touches the DB. Rotation = re-seal under a new key, then swap the env var (keyVersion column tracks it).',
    lifecycle: 'live',
    rotationDays: 365,
    appLinks: [{ label: 'Channels registry', href: '/channels' }],
    envVars: [
      {
        name: 'CHANNEL_TOKEN_KEY',
        kind: 'secret',
        required: false,
        note: '32 bytes: 64 hex chars (openssl rand -hex 32) or base64. Required before any real channel OAuth connect (Track B2).',
      },
    ],
  },
  {
    key: 'shipbob',
    name: 'ShipBob (anchor 3PL)',
    vendor: 'ShipBob',
    category: 'Logistics',
    description:
      'FulfillmentConnector: WROs w/ lot+expiry, inventory webhooks (Phase L4, blocked on master agreement — decision L2). Gate: connector:shipbob.',
    docsUrl: 'https://developer.shipbob.com',
    lifecycle: 'planned',
    gateKey: 'connector:shipbob',
    appLinks: [{ label: 'Fulfillment centers', href: '/logistics/fulfillment-centers' }],
    envVars: [
      { name: 'SHIPBOB_CLIENT_ID', kind: 'config', required: false },
      { name: 'SHIPBOB_CLIENT_SECRET', kind: 'secret', required: false },
    ],
  },
  {
    key: 'gtin',
    name: 'GTIN / UPC provider',
    vendor: 'GS1',
    category: 'Data APIs',
    description: 'Managed barcode/GTIN issuance (deferred to V2).',
    lifecycle: 'planned',
    envVars: [{ name: 'GS1_API_KEY', kind: 'secret', required: false }],
  },
]

// ── Status resolver (server-only; never returns values) ──────────────────────

export interface EnvVarStatus extends EnvVarSpec {
  present: boolean
}

export interface IntegrationStatus {
  def: IntegrationDef
  /** All required vars present → configured; some present → partial; none → missing. */
  state: 'configured' | 'partial' | 'missing'
  vars: EnvVarStatus[]
  /** Stripe-style test/live detection from a non-secret key prefix, when knowable. */
  environment: 'test' | 'live' | null
}

function isPresent(name: string): boolean {
  const v = process.env[name]
  return v !== undefined && v !== ''
}

/** Detect test/live from a key PREFIX only (sk_test_ / sk_live_). Never returns
 *  the value — only the non-secret environment classification. */
function detectEnvironment(def: IntegrationDef): 'test' | 'live' | null {
  if (def.key === 'stripe') {
    const k = process.env.STRIPE_SECRET_KEY ?? ''
    if (k.startsWith('sk_live_') || k.startsWith('rk_live_')) return 'live'
    if (k.startsWith('sk_test_') || k.startsWith('rk_test_')) return 'test'
  }
  return null
}

export function resolveIntegrationStatuses(): IntegrationStatus[] {
  return INTEGRATIONS.map((def) => {
    const vars: EnvVarStatus[] = def.envVars.map((v) => ({ ...v, present: isPresent(v.name) }))
    const required = vars.filter((v) => v.required)
    const anyPresent = vars.some((v) => v.present)
    const allRequiredPresent = required.length === 0 ? anyPresent : required.every((v) => v.present)
    const state: IntegrationStatus['state'] = allRequiredPresent
      ? 'configured'
      : anyPresent
        ? 'partial'
        : 'missing'
    return { def, vars, state, environment: detectEnvironment(def) }
  })
}

// ── Rotation status (pure) ───────────────────────────────────────────────────

export type RotationState = 'unknown' | 'ok' | 'due-soon' | 'overdue'

export interface RotationStatus {
  cadenceDays: number | null
  lastRotatedAt: Date | null
  dueAt: Date | null
  daysUntilDue: number | null
  state: RotationState
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Compute rotation status from the registry cadence + the stored meta. Pure. */
export function computeRotationStatus(
  def: IntegrationDef,
  meta: { lastRotatedAt: Date | null; rotateEveryDays: number | null } | undefined,
  now: Date = new Date(),
): RotationStatus {
  const cadenceDays = meta?.rotateEveryDays ?? def.rotationDays ?? null
  const lastRotatedAt = meta?.lastRotatedAt ?? null
  if (!lastRotatedAt || !cadenceDays) {
    return { cadenceDays, lastRotatedAt, dueAt: null, daysUntilDue: null, state: 'unknown' }
  }
  const dueAt = new Date(lastRotatedAt.getTime() + cadenceDays * DAY_MS)
  const daysUntilDue = Math.round((dueAt.getTime() - now.getTime()) / DAY_MS)
  const state: RotationState = daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 14 ? 'due-soon' : 'ok'
  return { cadenceDays, lastRotatedAt, dueAt, daysUntilDue, state }
}

export const CATEGORY_ORDER: IntegrationCategory[] = [
  'Payments',
  'Authentication',
  'Storage & Hosting',
  'Email',
  'AI',
  'Data APIs',
  'Logistics',
  'Sales Channels',
  'Monitoring',
  'Internal Services',
  'Platform Core',
]
