// Goldens for the stub adapter's webhook surface (Track B4). Sync-only so the
// pure runner executes them (the async adapter methods are exercised e2e).

import { describe, it, expect } from 'vitest'
import { createStubAdapter } from './adapters/stub'

const adapter = createStubAdapter()

describe('stub verifyWebhook', () => {
  it('accepts the secret presented in x-stub-signature', () => {
    const ok = adapter.verifyWebhook!({
      headers: { 'x-stub-signature': 'stub-webhook-secret' },
      rawBody: '{}',
      secret: 'stub-webhook-secret',
    })
    expect(ok).toBe(true)
  })

  it('rejects a wrong or missing signature header', () => {
    expect(
      adapter.verifyWebhook!({ headers: { 'x-stub-signature': 'nope' }, rawBody: '{}', secret: 'stub-webhook-secret' }),
    ).toBe(false)
    expect(adapter.verifyWebhook!({ headers: {}, rawBody: '{}', secret: 'stub-webhook-secret' })).toBe(false)
  })
})

describe('stub identifyWebhook', () => {
  it('prefers the x-stub-shop header', () => {
    const id = adapter.identifyWebhook!({ headers: { 'x-stub-shop': 'shop-a.example' }, rawBody: '{"shop":"other"}' })
    expect(id?.externalAccountId).toBe('shop-a.example')
  })

  it('falls back to the JSON body shop field and carries topic', () => {
    const id = adapter.identifyWebhook!({ headers: {}, rawBody: '{"shop":"shop-b.example","topic":"order.paid"}' })
    expect(id?.externalAccountId).toBe('shop-b.example')
    expect(id?.topic).toBe('order.paid')
  })

  it('returns null for unidentifiable payloads (including non-JSON)', () => {
    expect(adapter.identifyWebhook!({ headers: {}, rawBody: 'not json' })).toBe(null)
    expect(adapter.identifyWebhook!({ headers: {}, rawBody: '{"no":"shop"}' })).toBe(null)
  })
})
