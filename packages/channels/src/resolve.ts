// Adapter resolution (CHANNEL_MANAGEMENT_SPEC §3.1). Native adapters register
// here as they land (C1 shopify, C3 tiktok, C4 amazon, C5 walmart + long-tail).
// A real adapter activates when its platform-app env keys are present (the
// integrations-registry pattern: presence only, values never leave env).
// Anything not yet backed by a real adapter resolves to the deterministic stub
// in non-production (the whole pipeline stays runnable keyless) and to `null`
// in production so callers fail loudly instead of "fulfilling" against a stub.

import type { ChannelAdapter, ChannelCode } from './adapter'
import { createStubAdapter } from './adapters/stub'
import { createShopifyAdapter } from './adapters/shopify'

export function resolveChannelAdapter(
  code: ChannelCode,
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): ChannelAdapter | null {
  // C1: Shopify goes REAL as soon as the Dev Dashboard app keys land in env.
  if (code === 'shopify' && env.SHOPIFY_APP_CLIENT_ID && env.SHOPIFY_APP_CLIENT_SECRET) {
    return createShopifyAdapter({ clientId: env.SHOPIFY_APP_CLIENT_ID, clientSecret: env.SHOPIFY_APP_CLIENT_SECRET })
  }
  const isProd = env.NODE_ENV === 'production'
  if (isProd) return null
  return createStubAdapter()
}
