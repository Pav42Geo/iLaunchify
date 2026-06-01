// Cost estimation from token usage.
//
// Rates locked in docs/builds/ai-recipe-parser-economics.md §2: Haiku 4.5
// ~$1.00/MTok input, ~$5.00/MTok output. Cache rates follow Anthropic's
// standard ratios (write 1.25× input, read 0.10× input). The economics doc
// flags: VERIFY exact 4.5 pricing on console.anthropic.com before production.

const PER_TOKEN = {
  input: 1.0 / 1_000_000,
  output: 5.0 / 1_000_000,
  cacheWrite: 1.25 / 1_000_000,
  cacheRead: 0.1 / 1_000_000,
}

/**
 * Permissive usage shape — decoupled from @anthropic-ai/sdk's version-specific
 * Usage type so this package type-checks across SDK minor versions. The cache
 * fields are absent on older SDKs / non-cached calls.
 */
export interface TokenUsage {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
}

export function estimateCostUsd(usage: TokenUsage): number {
  const inputTokens = usage.input_tokens ?? 0
  const outputTokens = usage.output_tokens ?? 0
  const cacheRead = usage.cache_read_input_tokens ?? 0
  const cacheWrite = usage.cache_creation_input_tokens ?? 0
  const cost =
    inputTokens * PER_TOKEN.input +
    outputTokens * PER_TOKEN.output +
    cacheWrite * PER_TOKEN.cacheWrite +
    cacheRead * PER_TOKEN.cacheRead
  // Round to 6 dp — fractions of a cent matter at aggregate.
  return Math.round(cost * 1_000_000) / 1_000_000
}
