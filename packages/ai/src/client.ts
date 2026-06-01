// Anthropic SDK init. Reads ANTHROPIC_API_KEY from env. Lazily constructed so
// importing the package never throws at module-load when the key is absent —
// the gate is enforced at call time with a clear error.

import Anthropic from '@anthropic-ai/sdk'

export const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

let cached: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY not configured')
  }
  if (!cached) {
    cached = new Anthropic({ apiKey })
  }
  return cached
}
