// Re-export of the canonical sample-quote engine (packages/orders). This used to
// be a byte-identical copy; collapsed to a single source 2026-06-22. Existing
// imports of `../lib/sample-quote` keep working unchanged.
export {
  quoteSample,
  hasSamplerSet,
  formatCents,
  type SampleKind,
  type SampleOption,
  type SampleMode,
  type SampleSelection,
  type SampleQuoteLine,
  type SampleQuote,
} from '@ilaunchify/orders'
