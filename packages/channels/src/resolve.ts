// Adapter resolution (CHANNEL_MANAGEMENT_SPEC §3.1). Native adapters register
// here as they land (C1 shopify, C3 tiktok, C4 amazon, C5 walmart + long-tail).
// Anything not yet backed by a real adapter resolves to the deterministic stub
// in non-production (the whole pipeline stays runnable keyless) and to `null`
// in production so callers fail loudly instead of "fulfilling" against a stub.

import type { ChannelAdapter, ChannelCode } from './adapter'
import { createStubAdapter } from './adapters/stub'

export function resolveChannelAdapter(
  code: ChannelCode,
  env: Record<string, string | undefined> = typeof process !== 'undefined' ? process.env : {},
): ChannelAdapter | null {
  // C1+: switch(code) returns real adapters when their env keys are present.
  const isProd = env.NODE_ENV === 'production'
  if (isProd) return null
  return createStubAdapter()
}
