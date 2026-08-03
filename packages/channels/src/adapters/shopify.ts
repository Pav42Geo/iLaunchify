// Shopify adapter (Phase C1, CHANNEL_MANAGEMENT_SPEC + docs/SHOP_CONNECT_E2E_2026-07-24.md).
// First REAL adapter behind the seam: OAuth connect, listing push (productSet),
// order pull (GraphQL Admin API), webhooks (ORDERS_PAID / ORDERS_CANCELLED /
// APP_UNINSTALLED), inventory set, fulfillment + tracking pushback.
//
// Facts pinned against shopify.dev 2026-07 (research pass 2026-07-24):
//   - Admin GraphQL only (public apps GraphQL-exclusive since 2025-04);
//     endpoint /admin/api/2026-07/graphql.json, X-Shopify-Access-Token header.
//   - Offline access token: exchange returns { access_token, scope }, NO
//     expiry field, no refresh (token-lifecycle policy 'shopify' = NEVER).
//   - webhookSubscriptionCreate takes `uri` (callbackUrl is DEPRECATED).
//   - fulfillmentCreate (V2 is deprecated) + lineItemsByFulfillmentOrder.
//   - Webhook HMAC: base64 HMAC-SHA256 of the RAW body with the app client
//     secret, header x-shopify-hmac-sha256; shop identity in
//     x-shopify-shop-domain (our B4 app-level identifyWebhook path).
//   - Throttling arrives as HTTP 200 + errors[].extensions.code THROTTLED.
//
// ⚠ BUNDLE SAFETY: this file must stay importable from the channels BARREL
// (resolve.ts). NO node:crypto / node:* imports: HMAC uses WebCrypto
// (globalThis.crypto.subtle, async: the seam's verifyWebhook allows
// Promise<boolean> since C1). Network via global fetch, timeout-capped
// (AbortSignal.timeout): the fal-freeze lesson.

import type {
  ChannelAdapter,
  ConnectionCtx,
  ExternalListing,
  ExternalOrder,
  ExternalOrderLine,
  ListingInput,
  TokenSet,
  TrackingInput,
} from '../adapter'

export const SHOPIFY_API_VERSION = '2026-07'
/** Least-scope set for the C1 feature surface (registry row note). */
export const SHOPIFY_SCOPES =
  'write_products,read_orders,read_inventory,write_inventory,read_locations,read_merchant_managed_fulfillment_orders,write_merchant_managed_fulfillment_orders'

const FETCH_TIMEOUT_MS = 15_000

export interface ShopifyAdapterConfig {
  clientId: string
  clientSecret: string
  apiVersion?: string
}

// ── Pure helpers (golden-tested in shopify.test.ts) ──────────────────────────

/**
 * Normalize what a creator types ("my-store", "my-store.myshopify.com",
 * "https://my-store.myshopify.com/") to the canonical shop domain, or null if
 * it can't be a myshopify domain. Validation mirrors the regex shopify.dev
 * recommends: /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com/.
 */
export function normalizeShopDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase()
  if (!s) return null
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!s.includes('.')) s = `${s}.myshopify.com`
  if (!/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(s)) return null
  return s
}

/** Shopify displayFinancialStatus → the seam's coarse financial status. */
export function mapShopifyFinancialStatus(status: string | null | undefined): ExternalOrder['financialStatus'] {
  switch ((status ?? '').toUpperCase()) {
    case 'PAID':
    case 'PARTIALLY_REFUNDED': // money was captured; refund handling stays channel-side
      return 'PAID'
    case 'PENDING':
    case 'AUTHORIZED':
      return 'PENDING'
    case 'REFUNDED':
      return 'REFUNDED'
    default:
      return 'OTHER'
  }
}

/** GraphQL order node (orders query below) → the seam's ExternalOrder. */
export function mapShopifyOrderNode(node: ShopifyOrderNode): ExternalOrder {
  const lines: ExternalOrderLine[] = (node.lineItems?.edges ?? [])
    .map((e) => e.node)
    .filter((l): l is NonNullable<typeof l> => Boolean(l))
    .map((l) => ({
      externalLineId: l.id,
      externalVariantId: l.variant?.id ?? '',
      quantity: l.quantity,
      unitPrice: l.originalUnitPriceSet?.shopMoney?.amount ?? '0',
      ...(l.title ? { title: l.title } : {}),
    }))
  const a = node.shippingAddress
  return {
    externalOrderId: node.id,
    placedAtIso: node.createdAt,
    financialStatus: mapShopifyFinancialStatus(node.displayFinancialStatus),
    currency: node.totalPriceSet?.shopMoney?.currencyCode ?? 'USD',
    totalPrice: node.totalPriceSet?.shopMoney?.amount ?? '0',
    lines,
    shipTo: a
      ? {
          name: a.name ?? '',
          address1: a.address1 ?? '',
          ...(a.address2 ? { address2: a.address2 } : {}),
          city: a.city ?? '',
          ...(a.provinceCode ? { provinceCode: a.provinceCode } : {}),
          postalCode: a.zip ?? '',
          countryCode: a.countryCodeV2 ?? 'US',
          ...(a.phone ? { phone: a.phone } : {}),
        }
      : null,
    raw: node,
  }
}

export interface ShopifyOrderNode {
  id: string
  createdAt: string
  displayFinancialStatus?: string | null
  totalPriceSet?: { shopMoney?: { amount?: string; currencyCode?: string } | null } | null
  shippingAddress?: {
    name?: string | null
    address1?: string | null
    address2?: string | null
    city?: string | null
    provinceCode?: string | null
    zip?: string | null
    countryCodeV2?: string | null
    phone?: string | null
  } | null
  lineItems?: {
    edges?: Array<{
      node?: {
        id: string
        title?: string | null
        quantity: number
        variant?: { id: string } | null
        originalUnitPriceSet?: { shopMoney?: { amount?: string } | null } | null
      } | null
    }>
  } | null
}

// ── WebCrypto HMAC (bundle-safe; async by nature) ────────────────────────────

async function hmacSha256Base64(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await globalThis.crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const sig = new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(payload)))
  let bin = ''
  for (const b of sig) bin += String.fromCharCode(b)
  return btoa(bin)
}

/** Constant-time-ish string compare (both sides same-encoding digests). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export function createShopifyAdapter(config: ShopifyAdapterConfig): ChannelAdapter {
  const apiVersion = config.apiVersion ?? SHOPIFY_API_VERSION

  function shopFromCtx(ctx: ConnectionCtx): string {
    const shop = normalizeShopDomain(ctx.externalAccountId ?? '')
    if (!shop) throw new Error('shopify: connection has no valid shop domain (externalAccountId)')
    return shop
  }

  async function gql<T>(shop: string, accessToken: string, query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': accessToken },
      body: JSON.stringify({ query, variables: variables ?? {} }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`shopify: HTTP ${res.status} from ${shop}`)
    const body = (await res.json()) as {
      data?: T
      errors?: Array<{ message?: string; extensions?: { code?: string } }>
    }
    if (body.errors?.length) {
      const first = body.errors[0]
      const code = first?.extensions?.code
      throw new Error(`shopify: ${code === 'THROTTLED' ? 'throttled' : (first?.message ?? 'GraphQL error')}`)
    }
    if (!body.data) throw new Error('shopify: empty GraphQL response')
    return body.data
  }

  function assertNoUserErrors(where: string, errs: Array<{ field?: unknown; message?: string }> | undefined | null): void {
    if (errs && errs.length > 0) throw new Error(`shopify ${where}: ${errs[0]?.message ?? 'userError'}`)
  }

  async function primaryLocationId(shop: string, token: string, ctx: ConnectionCtx): Promise<string> {
    const cached = ctx.settings?.shopifyLocationId
    if (typeof cached === 'string' && cached) return cached
    const data = await gql<{ locations: { edges: Array<{ node: { id: string } }> } }>(
      shop,
      token,
      `query { locations(first: 1) { edges { node { id } } } }`,
    )
    const id = data.locations.edges[0]?.node.id
    if (!id) throw new Error('shopify: shop has no inventory location')
    return id
  }

  return {
    code: 'shopify',
    displayName: 'Shopify',

    // ── Connect ──────────────────────────────────────────────────────────────
    buildAuthUrl({ state, redirectUri, shopHint }) {
      const shop = normalizeShopDomain(shopHint ?? '')
      if (!shop) throw new Error('shopify: a myshopify.com store domain is required to start the connection')
      const p = new URLSearchParams({
        client_id: config.clientId,
        scope: SHOPIFY_SCOPES,
        redirect_uri: redirectUri,
        state,
        // no grant_options[]: offline (non-expiring) access token is the default
      })
      return `https://${shop}/admin/oauth/authorize?${p.toString()}`
    },

    async exchangeCode({ code, shopHint }): Promise<TokenSet> {
      const shop = normalizeShopDomain(shopHint ?? '')
      if (!shop) throw new Error('shopify: callback is missing the shop domain')
      const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, code }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
      if (!res.ok) throw new Error(`shopify: token exchange failed (HTTP ${res.status})`)
      const body = (await res.json()) as { access_token?: string; scope?: string }
      if (!body.access_token) throw new Error('shopify: token exchange returned no access token')
      return {
        accessToken: body.access_token,
        // Offline token: no refresh, no expiry (token-lifecycle 'shopify' = NEVER).
        scopes: body.scope ? body.scope.split(',') : [],
        externalAccountId: shop,
      }
    },

    // ── Catalog → ────────────────────────────────────────────────────────────
    async pushListing(ctx: ConnectionCtx, listing: ListingInput): Promise<ExternalListing> {
      const shop = shopFromCtx(ctx)
      const token = ctx.tokens.accessToken
      const optionName = 'Variant'
      const input = {
        title: listing.title,
        descriptionHtml: listing.descriptionHtml ?? '',
        status: 'ACTIVE',
        productOptions: [{ name: optionName, values: listing.variants.map((v) => ({ name: v.title })) }],
        variants: listing.variants.map((v) => ({
          optionValues: [{ optionName, name: v.title }],
          price: v.price,
          ...(v.sku ? { sku: v.sku } : {}),
          ...(v.gtin ? { barcode: v.gtin } : {}),
          // ON_DEMAND (made-to-order) sells without stock; BULK tracks the pool.
          inventoryPolicy: listing.mode === 'ON_DEMAND' ? 'CONTINUE' : 'DENY',
          inventoryItem: { tracked: listing.mode !== 'ON_DEMAND' },
        })),
        ...(listing.imageUrls.length
          ? { files: listing.imageUrls.map((u) => ({ originalSource: u, contentType: 'IMAGE' })) }
          : {}),
      }
      const data = await gql<{
        productSet: {
          product: {
            id: string
            onlineStoreUrl: string | null
            variants: { nodes: Array<{ id: string; sku: string | null; title: string | null }> }
          } | null
          userErrors: Array<{ field?: unknown; message?: string }>
        }
      }>(
        shop,
        token,
        `mutation productSet($input: ProductSetInput!) {
          productSet(input: $input, synchronous: true) {
            product { id onlineStoreUrl variants(first: 100) { nodes { id sku title } } }
            userErrors { field message }
          }
        }`,
        { input },
      )
      assertNoUserErrors('productSet', data.productSet.userErrors)
      const product = data.productSet.product
      if (!product) throw new Error('shopify productSet: no product returned')

      // variantKey ↔ external variant id: match by sku when we sent one, else
      // by the option value (variant title): the mapping atom for order ingest.
      const variantIds: Record<string, string> = {}
      for (const v of listing.variants) {
        const bySku = v.sku ? product.variants.nodes.find((n) => n.sku === v.sku) : undefined
        const byTitle = product.variants.nodes.find((n) => n.title === v.title)
        const match = bySku ?? byTitle
        if (match) variantIds[v.variantKey] = match.id
      }
      return {
        externalListingId: product.id,
        externalUrl: product.onlineStoreUrl ?? `https://${shop}/admin/products/${product.id.split('/').pop()}`,
        variantIds,
      }
    },

    async archiveListing(ctx: ConnectionCtx, externalListingId: string): Promise<void> {
      const shop = shopFromCtx(ctx)
      const data = await gql<{ productUpdate: { userErrors: Array<{ message?: string }> } }>(
        shop,
        ctx.tokens.accessToken,
        `mutation archive($input: ProductInput!) {
          productUpdate(input: $input) { userErrors { field message } }
        }`,
        { input: { id: externalListingId, status: 'ARCHIVED' } },
      )
      assertNoUserErrors('productUpdate', data.productUpdate.userErrors)
    },

    async setInventory(ctx: ConnectionCtx, externalVariantId: string, qty: number | 'MADE_TO_ORDER'): Promise<void> {
      const shop = shopFromCtx(ctx)
      const token = ctx.tokens.accessToken
      const v = await gql<{
        productVariant: { id: string; product: { id: string }; inventoryItem: { id: string } } | null
      }>(
        shop,
        token,
        `query variant($id: ID!) {
          productVariant(id: $id) { id product { id } inventoryItem { id } }
        }`,
        { id: externalVariantId },
      )
      if (!v.productVariant) throw new Error('shopify setInventory: variant not found')

      if (qty === 'MADE_TO_ORDER') {
        // Sellable without stock: policy CONTINUE + stop tracking the item.
        const upd = await gql<{
          productVariantsBulkUpdate: { userErrors: Array<{ message?: string }> }
        }>(
          shop,
          token,
          `mutation mto($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
          }`,
          {
            productId: v.productVariant.product.id,
            variants: [{ id: v.productVariant.id, inventoryPolicy: 'CONTINUE', inventoryItem: { tracked: false } }],
          },
        )
        assertNoUserErrors('productVariantsBulkUpdate', upd.productVariantsBulkUpdate.userErrors)
        return
      }

      const locationId = await primaryLocationId(shop, token, ctx)
      const set = await gql<{ inventorySetQuantities: { userErrors: Array<{ message?: string }> } }>(
        shop,
        token,
        `mutation setQty($input: InventorySetQuantitiesInput!) {
          inventorySetQuantities(input: $input) { userErrors { field message } }
        }`,
        {
          input: {
            name: 'available',
            reason: 'correction',
            ignoreCompareQuantity: true, // platform pool is the source of truth (spec §3.3)
            quantities: [{ inventoryItemId: v.productVariant.inventoryItem.id, locationId, quantity: qty }],
          },
        },
      )
      assertNoUserErrors('inventorySetQuantities', set.inventorySetQuantities.userErrors)
    },

    // ── Orders ← ─────────────────────────────────────────────────────────────
    async registerWebhooks(ctx: ConnectionCtx, callbackUrl: string): Promise<{ webhookSecret?: string }> {
      const shop = shopFromCtx(ctx)
      const token = ctx.tokens.accessToken
      // App-level identity (x-shopify-shop-domain → identifyWebhook): strip the
      // per-connection ?cid= that the OAuth callback appends for other channels.
      const uri = callbackUrl.split('?')[0] as string
      for (const topic of ['ORDERS_PAID', 'ORDERS_CANCELLED', 'APP_UNINSTALLED']) {
        const data = await gql<{
          webhookSubscriptionCreate: { userErrors: Array<{ message?: string }> }
        }>(
          shop,
          token,
          `mutation hook($topic: WebhookSubscriptionTopic!, $webhookSubscription: WebhookSubscriptionInput!) {
            webhookSubscriptionCreate(topic: $topic, webhookSubscription: $webhookSubscription) {
              webhookSubscription { id }
              userErrors { field message }
            }
          }`,
          { topic, webhookSubscription: { uri, format: 'JSON' } },
        )
        const errs = data.webhookSubscriptionCreate.userErrors
        // Reconnect idempotency: an already-registered topic errors with
        // "address ... taken": that is success for our purposes.
        if (errs.length && !/taken/i.test(errs[0]?.message ?? '')) {
          throw new Error(`shopify webhookSubscriptionCreate ${topic}: ${errs[0]?.message ?? 'userError'}`)
        }
      }
      // Shopify signs deliveries with the APP client secret; sealing a
      // per-connection copy lets the B4 receiver verify without env access.
      return { webhookSecret: config.clientSecret }
    },

    verifyWebhook({ headers, rawBody, secret }) {
      const presented = headers['x-shopify-hmac-sha256']
      if (!presented) return false
      return hmacSha256Base64(secret, rawBody).then((expected) => timingSafeEqualStr(expected, presented))
    },

    identifyWebhook({ headers }) {
      const shop = headers['x-shopify-shop-domain']
      if (!shop) return null
      return { externalAccountId: shop, ...(headers['x-shopify-topic'] ? { topic: headers['x-shopify-topic'] } : {}) }
    },

    async pullOrders(ctx: ConnectionCtx, sinceIso: string): Promise<ExternalOrder[]> {
      const shop = shopFromCtx(ctx)
      const data = await gql<{ orders: { edges: Array<{ node: ShopifyOrderNode }> } }>(
        shop,
        ctx.tokens.accessToken,
        `query pull($q: String!) {
          orders(first: 50, query: $q, sortKey: UPDATED_AT) {
            edges { node {
              id name createdAt displayFinancialStatus
              totalPriceSet { shopMoney { amount currencyCode } }
              shippingAddress { name address1 address2 city provinceCode zip countryCodeV2 phone }
              lineItems(first: 50) { edges { node {
                id title quantity
                variant { id }
                originalUnitPriceSet { shopMoney { amount } }
              } } }
            } }
          }
        }`,
        { q: `financial_status:paid updated_at:>=${sinceIso}` },
      )
      return data.orders.edges.map((e) => mapShopifyOrderNode(e.node))
    },

    // ── Fulfillment → ────────────────────────────────────────────────────────
    async pushFulfillment(ctx: ConnectionCtx, externalOrderId: string, tracking: TrackingInput): Promise<void> {
      const shop = shopFromCtx(ctx)
      const token = ctx.tokens.accessToken
      const data = await gql<{
        order: { fulfillmentOrders: { edges: Array<{ node: { id: string; status: string } }> } } | null
      }>(
        shop,
        token,
        `query fos($id: ID!) {
          order(id: $id) { fulfillmentOrders(first: 10) { edges { node { id status } } } }
        }`,
        { id: externalOrderId },
      )
      const open = (data.order?.fulfillmentOrders.edges ?? [])
        .map((e) => e.node)
        .filter((n) => n.status === 'OPEN' || n.status === 'IN_PROGRESS')
      if (open.length === 0) throw new Error('shopify pushFulfillment: no open fulfillment orders on this order')

      const created = await gql<{
        fulfillmentCreate: { userErrors: Array<{ message?: string }> }
      }>(
        shop,
        token,
        `mutation fulfill($fulfillment: FulfillmentInput!) {
          fulfillmentCreate(fulfillment: $fulfillment) {
            fulfillment { id status }
            userErrors { field message }
          }
        }`,
        {
          fulfillment: {
            // Omitting fulfillmentOrderLineItems fulfills every remaining line.
            lineItemsByFulfillmentOrder: open.map((fo) => ({ fulfillmentOrderId: fo.id })),
            notifyCustomer: true,
            trackingInfo: {
              company: tracking.carrier,
              number: tracking.trackingNumber,
              ...(tracking.trackingUrl ? { url: tracking.trackingUrl } : {}),
            },
          },
        },
      )
      assertNoUserErrors('fulfillmentCreate', created.fulfillmentCreate.userErrors)
    },
  }
}
