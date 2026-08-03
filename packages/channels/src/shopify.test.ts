// Goldens for the Shopify adapter's PURE surface (Phase C1). Sync-only so the
// pure runner executes them; network methods are exercised against a dev store.

import { describe, it, expect } from 'vitest'
import {
  normalizeShopDomain,
  mapShopifyFinancialStatus,
  mapShopifyOrderNode,
  timingSafeEqualStr,
  createShopifyAdapter,
  SHOPIFY_SCOPES,
  type ShopifyOrderNode,
} from './adapters/shopify'

describe('normalizeShopDomain', () => {
  it('accepts bare handles, full domains, and URLs', () => {
    expect(normalizeShopDomain('my-store')).toBe('my-store.myshopify.com')
    expect(normalizeShopDomain('My-Store.myshopify.com')).toBe('my-store.myshopify.com')
    expect(normalizeShopDomain('https://my-store.myshopify.com/')).toBe('my-store.myshopify.com')
    expect(normalizeShopDomain(' http://my-store.myshopify.com/admin ')).toBe('my-store.myshopify.com')
  })
  it('rejects non-myshopify hosts and junk', () => {
    expect(normalizeShopDomain('example.com')).toBe(null)
    expect(normalizeShopDomain('my_store')).toBe(null) // underscore not allowed
    expect(normalizeShopDomain('-lead-hyphen')).toBe(null)
    expect(normalizeShopDomain('')).toBe(null)
    expect(normalizeShopDomain('evil.myshopify.com.attacker.io')).toBe(null)
  })
})

describe('buildAuthUrl', () => {
  const adapter = createShopifyAdapter({ clientId: 'test-client-id', clientSecret: 'shh' })
  it('golden: authorize URL shape with least scopes and no grant_options', () => {
    const url = adapter.buildAuthUrl({
      state: 'STATE123',
      redirectUri: 'https://app.example.com/api/channels/oauth/shopify/callback',
      shopHint: 'my-store',
    })
    expect(url.startsWith('https://my-store.myshopify.com/admin/oauth/authorize?')).toBe(true)
    const q = new URL(url).searchParams
    expect(q.get('client_id')).toBe('test-client-id')
    expect(q.get('scope')).toBe(SHOPIFY_SCOPES)
    expect(q.get('redirect_uri')).toBe('https://app.example.com/api/channels/oauth/shopify/callback')
    expect(q.get('state')).toBe('STATE123')
    expect(q.get('grant_options[]')).toBe(null) // offline token is the default
  })
  it('throws without a usable shop domain', () => {
    expect(() => adapter.buildAuthUrl({ state: 's', redirectUri: 'https://x/cb' })).toThrow(/store domain/)
  })
})

describe('mapShopifyFinancialStatus', () => {
  it('maps the money truthfully', () => {
    expect(mapShopifyFinancialStatus('PAID')).toBe('PAID')
    expect(mapShopifyFinancialStatus('PARTIALLY_REFUNDED')).toBe('PAID')
    expect(mapShopifyFinancialStatus('PENDING')).toBe('PENDING')
    expect(mapShopifyFinancialStatus('AUTHORIZED')).toBe('PENDING')
    expect(mapShopifyFinancialStatus('REFUNDED')).toBe('REFUNDED')
    expect(mapShopifyFinancialStatus('VOIDED')).toBe('OTHER')
    expect(mapShopifyFinancialStatus(null)).toBe('OTHER')
  })
})

describe('mapShopifyOrderNode', () => {
  const node: ShopifyOrderNode = {
    id: 'gid://shopify/Order/4057210552342',
    createdAt: '2026-07-24T12:00:00Z',
    displayFinancialStatus: 'PAID',
    totalPriceSet: { shopMoney: { amount: '41.98', currencyCode: 'USD' } },
    shippingAddress: {
      name: 'Jane Buyer',
      address1: '1 Main St',
      address2: 'Apt 2',
      city: 'Charlotte',
      provinceCode: 'NC',
      zip: '28273',
      countryCodeV2: 'US',
      phone: '+17045550100',
    },
    lineItems: {
      edges: [
        {
          node: {
            id: 'gid://shopify/LineItem/111',
            title: 'Strawberry · 12-pack',
            quantity: 2,
            variant: { id: 'gid://shopify/ProductVariant/222' },
            originalUnitPriceSet: { shopMoney: { amount: '20.99' } },
          },
        },
      ],
    },
  }
  it('golden: full node maps to the seam shape', () => {
    const o = mapShopifyOrderNode(node)
    expect(o.externalOrderId).toBe('gid://shopify/Order/4057210552342')
    expect(o.financialStatus).toBe('PAID')
    expect(o.currency).toBe('USD')
    expect(o.totalPrice).toBe('41.98')
    expect(o.lines.length).toBe(1)
    expect(o.lines[0]!.externalVariantId).toBe('gid://shopify/ProductVariant/222')
    expect(o.lines[0]!.quantity).toBe(2)
    expect(o.lines[0]!.unitPrice).toBe('20.99')
    expect(o.shipTo!.name).toBe('Jane Buyer')
    expect(o.shipTo!.postalCode).toBe('28273')
    expect(o.shipTo!.countryCode).toBe('US')
    expect(o.raw).toBe(node)
  })
  it('tolerates a missing address and empty lines', () => {
    const bare = mapShopifyOrderNode({ id: 'gid://shopify/Order/1', createdAt: '2026-01-01T00:00:00Z' })
    expect(bare.shipTo).toBe(null)
    expect(bare.lines.length).toBe(0)
    expect(bare.financialStatus).toBe('OTHER')
  })
})

describe('identifyWebhook + timing-safe compare', () => {
  const adapter = createShopifyAdapter({ clientId: 'id', clientSecret: 'shh' })
  it('identifies the shop from x-shopify-shop-domain', () => {
    const id = adapter.identifyWebhook!({
      headers: { 'x-shopify-shop-domain': 'my-store.myshopify.com', 'x-shopify-topic': 'orders/paid' },
      rawBody: '{}',
    })
    expect(id?.externalAccountId).toBe('my-store.myshopify.com')
    expect(id?.topic).toBe('orders/paid')
  })
  it('returns null without the shop header', () => {
    expect(adapter.identifyWebhook!({ headers: {}, rawBody: '{}' })).toBe(null)
  })
  it('timingSafeEqualStr compares correctly', () => {
    expect(timingSafeEqualStr('abc', 'abc')).toBe(true)
    expect(timingSafeEqualStr('abc', 'abd')).toBe(false)
    expect(timingSafeEqualStr('abc', 'ab')).toBe(false)
  })
})
