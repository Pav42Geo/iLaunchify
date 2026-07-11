// Canonical money formatting (M4 — replaces ~15 copy-pasted cents→"$" helpers
// scattered across the four apps + packages under names like money/usd/formatCents/
// fmtMoney/formatCurrency/formatDollars). ONE format everywhere so no two screens
// can drift. Pure, zero-dep — safe to import anywhere that depends on @ilaunchify/ui.
// The audit (AUDIT_2026-07-09_CONSISTENCY.md, M4) flagged the duplication; this is
// the single source of truth every call site should use.
//
// Uses en-US grouping ("$1,234.56") — the correct money display, matching the
// Intl.NumberFormat/toLocaleString sites this consolidates. The locale is PINNED
// to 'en-US' (not the ambient default) so server and client render identically —
// an unpinned toLocaleString drifts between Node and the browser and causes React
// hydration mismatches. Always 2 decimals.

/** Cents → "$1,234.56" (grouped, always 2 decimals). e.g. 123456 → "$1,234.56",
 *  12345 → "$123.45", 500 → "$5.00". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Same as formatCents but renders null/undefined as an em-dash — the common
 *  "no value yet" variant (settings forms, optional prices). */
export function formatCentsOrDash(cents: number | null | undefined): string {
  return cents == null ? '—' : formatCents(cents)
}
