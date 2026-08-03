// =============================================================================
// Deterministic stub adapter (CHANNEL_MANAGEMENT_SPEC §3.1) — the whole channel
// pipeline runs keyless in dev, demos, and tests: connect "succeeds", listings
// get stable fake external ids, pullOrders fabricates a reproducible paid order,
// fulfillment pushes no-op. Same input → same output; NO network.
// =============================================================================

import type {
  ChannelAdapter,
  ConnectionCtx,
  ExternalListing,
  ExternalOrder,
  ListingInput,
  TokenSet,
  TrackingInput,
} from '../adapter'

/** djb2 — stable short hash for deterministic fake ids. */
function stableId(seed: string): string {
  let h = 5381
  for (let i = 0; i < seed.length; i++) h = ((h << 5) + h + seed.charCodeAt(i)) >>> 0
  return h.toString(36)
}

export function createStubAdapter(): ChannelAdapter {
  return {
    code: 'stub',
    displayName: 'Stub (dev)',

    buildAuthUrl({ state, redirectUri }) {
      // Dev flow: "authorize" by bouncing straight back with a fake code.
      return `${redirectUri}?code=stub-code&state=${encodeURIComponent(state)}`
    },

    async exchangeCode({ shopHint }): Promise<TokenSet> {
      return {
        accessToken: 'stub-access-token',
        refreshToken: 'stub-refresh-token',
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
        scopes: ['read_orders', 'write_products'],
        externalAccountId: shopHint ?? 'stub-shop.example',
      }
    },

    async refresh(tokens: TokenSet): Promise<TokenSet> {
      // Track B3: keyless refresh so /api/cron/channel-tokens is exercisable in
      // dev. Same shape a real adapter returns: fresh access token + expiry;
      // the refresh credential rolls (rotating-refresh channels like Etsy).
      return {
        ...tokens,
        accessToken: 'stub-access-token',
        refreshToken: tokens.refreshToken ?? 'stub-refresh-token',
        expiresAt: Date.now() + 24 * 60 * 60 * 1000,
      }
    },

    async pushListing(_ctx: ConnectionCtx, listing: ListingInput): Promise<ExternalListing> {
      const lid = `stub-listing-${stableId(listing.title)}`
      const variantIds: Record<string, string> = {}
      for (const v of listing.variants) variantIds[v.variantKey] = `stub-var-${stableId(v.variantKey)}`
      return { externalListingId: lid, externalUrl: `https://stub.example/listing/${lid}`, variantIds }
    },

    async updateListing() {
      /* no-op */
    },

    async archiveListing() {
      /* no-op */
    },

    async setInventory() {
      /* no-op */
    },

    async registerWebhooks() {
      return { webhookSecret: 'stub-webhook-secret' }
    },

    verifyWebhook({ headers, secret }) {
      // Dev doorbell auth: the caller (curl / test) presents the secret in a
      // header; real adapters HMAC the raw body instead (Track B4).
      return headers['x-stub-signature'] === secret
    },

    identifyWebhook({ headers, rawBody }) {
      // App-level identity fallback: header wins, then a `shop` field in the
      // JSON body. Mirrors the Shopify shop-domain-header pattern.
      const fromHeader = headers['x-stub-shop']
      if (fromHeader) return { externalAccountId: fromHeader }
      try {
        const parsed = JSON.parse(rawBody) as { shop?: string; topic?: string }
        if (parsed.shop) return { externalAccountId: parsed.shop, ...(parsed.topic ? { topic: parsed.topic } : {}) }
      } catch {
        /* not JSON */
      }
      return null
    },

    async pullOrders(ctx: ConnectionCtx, sinceIso: string): Promise<ExternalOrder[]> {
      // Reproducible paid orders per (connection, day) — enough to exercise the
      // import → map → route pipeline in dev without a real store. Two flavors:
      //   1. An UNMAPPED line (always): exercises the NEEDS_ATTENTION inbox.
      //   2. A MAPPABLE line (only when the caller supplied knownVariantIds):
      //      lands READY and feeds the C2.2 router + auto-billing e2e.
      const day = sinceIso.slice(0, 10)
      const shipTo = {
        name: 'Stub Buyer',
        address1: '1 Test Street',
        city: 'Austin',
        provinceCode: 'TX',
        postalCode: '78701',
        countryCode: 'US',
      }
      const oid = `stub-order-${stableId(`${ctx.connectionId}:${day}`)}`
      const orders: ExternalOrder[] = [
        {
          externalOrderId: oid,
          placedAtIso: `${day}T12:00:00Z`,
          financialStatus: 'PAID',
          currency: 'USD',
          totalPrice: '24.99',
          lines: [
            {
              externalLineId: `${oid}-1`,
              externalVariantId: 'stub-var-unmapped', // exercises NEEDS_ATTENTION
              quantity: 1,
              unitPrice: '24.99',
              title: 'Stub product',
            },
          ],
          shipTo,
          raw: { stub: true, oid },
        },
      ]
      const mappable = ctx.knownVariantIds?.[0]
      if (mappable) {
        const moid = `stub-order-${stableId(`${ctx.connectionId}:${day}:mapped`)}`
        orders.push({
          externalOrderId: moid,
          placedAtIso: `${day}T12:30:00Z`,
          financialStatus: 'PAID',
          currency: 'USD',
          totalPrice: '9.66',
          lines: [
            {
              externalLineId: `${moid}-1`,
              externalVariantId: mappable,
              quantity: 1,
              unitPrice: '9.66',
              title: 'Stub product (mapped)',
            },
          ],
          shipTo,
          raw: { stub: true, oid: moid, mapped: true },
        })
      }
      return orders
    },

    async ackOrder() {
      /* no-op */
    },

    async pushFulfillment(_ctx: ConnectionCtx, _externalOrderId: string, _tracking: TrackingInput) {
      /* no-op */
    },

    async cancelExternalOrder() {
      /* no-op */
    },
  }
}
