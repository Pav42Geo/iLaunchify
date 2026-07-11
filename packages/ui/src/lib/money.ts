// Canonical money formatting (M4 — replaces ~15 copy-pasted cents→"$" helpers
// scattered across the four apps + packages under names like money/usd/formatCents/
// fmtMoney/formatCurrency/formatDollars). ONE rounding rule (toFixed(2)) so no two
// screens can drift. Pure, zero-dep — safe to import anywhere that depends on
// @ilaunchify/ui. The audit (AUDIT_2026-07-09_CONSISTENCY.md, M4) flagged the
// duplication; this is the single source of truth every call site should use.

/** Cents → "$1,?.XX" (always 2 decimals). e.g. 12345 → "$123.45", 500 → "$5.00". */
export function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

/** Same as formatCents but renders null/undefined as an em-dash — the common
 *  "no value yet" variant (settings forms, optional prices). */
export function formatCentsOrDash(cents: number | null | undefined): string {
  return cents == null ? '—' : formatCents(cents)
}
