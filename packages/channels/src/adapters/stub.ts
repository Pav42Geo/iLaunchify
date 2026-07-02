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

    verifyWebhook({ secret }) {
      return secret === 'stub-webhook-secret'
    },

    async pullOrders(ctx: ConnectionCtx, sinceIso: string): Promise<ExternalOrder[]> {
      // One reproducible paid order per (connection, day) — enough to exercise
      // the import → map → route pipeline in dev without a real store.
      const day = sinceIso.slice(0, 10)
      const oid = `stub-order-${stableId(`${ctx.connectionId}:${day}`)}`
      return [
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
          shipTo: {
            name: 'Stub Buyer',
            address1: '1 Test Street',
            city: 'Austin',
            provinceCode: 'TX',
            postalCode: '78701',
            countryCode: 'US',
          },
          raw: { stub: true, oid },
        },
      ]
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
