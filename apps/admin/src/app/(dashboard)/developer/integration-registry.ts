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
    description: 'Transactional email — magic-link sign-in, notifications, admin invites.',
    docsUrl: 'https://resend.com/docs',
    dashboardUrl: 'https://resend.com/api-keys',
    rotationDays: 180,
    lifecycle: 'live',
    testable: true,
    envVars: [
      { name: 'AUTH_RESEND_KEY', kind: 'secret', required: false },
      { name: 'AUTH_EMAIL_FROM', kind: 'config', required: false, note: 'Verified sender address' },
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
      'Creator OAuth + inbound plans + FBA box labels + MCF. Blocked on our developer-application approval; checkout/plan scaffolding already live. Gate: channel_inbound:AMAZON_FBA.',
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
    description: 'WFS inbound plans + box labels (Phase L4). GTIN-only labeling. Gate: channel_inbound:WALMART_WFS.',
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
    description: 'FBT inbound requests + carton labels (Phase L4; FBT near-mandatory since 2026-02-25). Gate: channel_inbound:TIKTOK_FBT.',
    docsUrl: 'https://partner.tiktokshop.com',
    lifecycle: 'planned',
    gateKey: 'channel_inbound:TIKTOK_FBT',
    appLinks: [{ label: 'Channel plans', href: '/logistics/channel-plans' }],
    envVars: [
      { name: 'TIKTOK_SHOP_APP_KEY', kind: 'config', required: false },
      { name: 'TIKTOK_SHOP_APP_SECRET', kind: 'secret', required: false },
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
  'Monitoring',
  'Internal Services',
  'Platform Core',
]
