// =============================================================================
// @ilaunchify/channels — the ChannelAdapter seam (CHANNEL_MANAGEMENT_SPEC §3.1).
//
// ONE provider-agnostic interface so the channel field can churn without touching
// callers (same philosophy as @ilaunchify/imagegen's provider seam):
//   • big four (shopify / tiktok / amazon / walmart) → native adapters
//   • long-tail six (etsy / woocommerce / wix / squarespace / bigcommerce / ebay)
//     → native OR unified-API-backed adapters, decided at C5 — callers can't tell.
//   • stub adapter → the whole pipeline runs keyless in dev/tests.
//
// This file is TYPES ONLY — no network, no SDKs, no Prisma. Concrete adapters
// live in ./adapters/*; server actions own persistence + secrets (tokens are
// stored as REFS to the secret store, never raw — SECURITY_ARCHITECTURE).
// =============================================================================

/** Locked roster (Pavel 2026-07-02) — 10 supported channels. */
export const CHANNEL_CODES = [
  'shopify',
  'tiktok',
  'amazon',
  'walmart',
  'etsy',
  'woocommerce',
  'wix',
  'squarespace',
  'bigcommerce',
  'ebay',
] as const
export type ChannelCode = (typeof CHANNEL_CODES)[number]

/** OAuth token set — the caller persists these as secret-store refs. */
export interface TokenSet {
  accessToken: string
  refreshToken?: string
  /** Epoch ms; short-lived tokens (Walmart 15 min) rely on this. */
  expiresAt?: number
  scopes?: string[]
  /** External account identity resolved during exchange (shop domain, seller id…). */
  externalAccountId?: string
}

/** A connection handle passed to every adapter call. Tokens are resolved by the
 *  caller from the secret store just-in-time — adapters never see refs. */
export interface ConnectionCtx {
  connectionId: string
  externalAccountId: string | null
  tokens: TokenSet
  /** Channel-specific settings blob (location ids, policy ids, store URL…). */
  settings?: Record<string, unknown>
  /** External variant ids the platform already linked for this connection
   *  (ChannelVariantLink.externalVariantId), supplied by the CALLER so the
   *  adapter stays Prisma-free. Real adapters ignore it; the STUB uses it to
   *  fabricate a MAPPABLE paid order so the dev pipeline can reach READY ->
   *  route -> auto-bill without a real store (C2.2 e2e, 2026-07-22). */
  knownVariantIds?: string[]
}

// --- Catalog → channel ------------------------------------------------------

export interface ListingVariantInput {
  /** Platform-side identity (echoed back in the mapping). */
  variantKey: string // `${productId}:${flavorPresetId ?? 'base'}:${packKey ?? 'unit'}`
  title: string // "Strawberry · 12-pack"
  sku?: string | null
  gtin?: string | null
  price: string // decimal string, channel currency
  imageUrls?: string[]
}

export interface ListingInput {
  title: string
  descriptionHtml?: string
  imageUrls: string[]
  variants: ListingVariantInput[]
  /** ON_DEMAND lists as made-to-order; BULK starts at 0 until the pool syncs. */
  mode: 'ON_DEMAND' | 'BULK'
  currency: string // 'USD'
  tags?: string[]
  /** Etsy production-partner disclosure & friends. */
  channelMeta?: Record<string, unknown>
}

export interface ExternalListing {
  externalListingId: string
  externalUrl?: string
  /** externalVariantId per variantKey — the atom the order mapper joins on. */
  variantIds: Record<string, string>
}

// --- Orders ← channel --------------------------------------------------------

export interface ExternalOrderLine {
  externalLineId: string
  externalVariantId: string
  quantity: number
  unitPrice: string
  title?: string
}

export interface ExternalOrder {
  externalOrderId: string
  placedAtIso: string
  financialStatus: 'PAID' | 'PENDING' | 'REFUNDED' | 'OTHER'
  currency: string
  totalPrice: string
  lines: ExternalOrderLine[]
  shipTo: {
    name: string
    address1: string
    address2?: string
    city: string
    provinceCode?: string
    postalCode: string
    countryCode: string
    phone?: string
  } | null
  /** Raw provider payload — persisted verbatim as the legal snapshot. */
  raw: unknown
}

export interface TrackingInput {
  carrier: string
  trackingNumber: string
  trackingUrl?: string
  /** External line ids covered — omit for a complete fulfillment. */
  lineIds?: string[]
}

// --- The seam -----------------------------------------------------------------

export interface ChannelAdapter {
  code: ChannelCode | 'stub'
  /** Human label for logs/UI. */
  displayName: string

  // Connect (OAuth-style; WooCommerce/BigCommerce adapt key-pair entry to this shape)
  buildAuthUrl(input: { state: string; redirectUri: string; shopHint?: string }): string
  exchangeCode(input: { code: string; redirectUri: string; shopHint?: string }): Promise<TokenSet>
  refresh?(tokens: TokenSet): Promise<TokenSet>

  // Catalog →
  pushListing(ctx: ConnectionCtx, listing: ListingInput): Promise<ExternalListing>
  updateListing?(ctx: ConnectionCtx, externalListingId: string, listing: Partial<ListingInput>): Promise<void>
  archiveListing?(ctx: ConnectionCtx, externalListingId: string): Promise<void>
  /** qty as number, or 'MADE_TO_ORDER' for on-demand listings. */
  setInventory(ctx: ConnectionCtx, externalVariantId: string, qty: number | 'MADE_TO_ORDER'): Promise<void>

  // Orders ←
  registerWebhooks?(ctx: ConnectionCtx, callbackUrl: string): Promise<{ webhookSecret?: string }>
  verifyWebhook?(input: { headers: Record<string, string>; rawBody: string; secret: string }): boolean
  /** Poll fallback — webhooks miss; every adapter must support pull. */
  pullOrders(ctx: ConnectionCtx, sinceIso: string): Promise<ExternalOrder[]>
  ackOrder?(ctx: ConnectionCtx, externalOrderId: string): Promise<void>

  // Fulfillment →
  pushFulfillment(ctx: ConnectionCtx, externalOrderId: string, tracking: TrackingInput): Promise<void>
  cancelExternalOrder?(ctx: ConnectionCtx, externalOrderId: string, reason?: string): Promise<void>
}
