// D5 (ROUTING_BINDING_MODEL.md §6/§9) — multi-flavor lead time.
//
// A variety pack of N flavors: if the manufacturer runs them sequentially the
// production time adds up; if in parallel (the common case + default) the lead
// time is just the single longest flavor's band time. `sequential` comes from
// ProductTemplate.flavorsRunSequentially (manufacturer-declared, default false).
//
// Pure — node-verified by multi-flavor-lead.selftest.ts.

export function resolveMultiFlavorLeadDays(input: {
  /** Band-matched lead-time days per flavor (already qty / fulfillment-mode resolved). */
  flavorBandDays: number[]
  /** True = sequential runs (sum); false = parallel (max). */
  sequential: boolean
}): number {
  const days = input.flavorBandDays.filter((d) => Number.isFinite(d) && d >= 0)
  if (days.length === 0) return 0
  return input.sequential ? days.reduce((a, b) => a + b, 0) : Math.max(...days)
}

// -----------------------------------------------------------------------------
// Per-flavor recipe lead (LOCKED 2026-06-30 — GLOBAL floor + changeover).
//
// Source of truth for the rule is packages/ui/src/lib/lead.ts (effectiveFlavorLead
// / effectiveProductLead), shown in the partner builder, the marketplace PDP, and
// the admin product detail. These pure mirrors let the ORDER MANIFEST quote the
// SAME number server-side (the ui package is a frontend dep we don't pull into
// orders). Keep the two in lockstep — both are covered by tests.
//
//   - The product STANDARD (global) lead is the FLOOR — it captures everything
//     that applies regardless of flavor (printing, packaging, QA, …).
//   - A per-flavor lead can only EXTEND the floor, never shorten it:
//     effective flavor lead = max(standard, flavor.leadTimeDays). null → standard.
//   - Order lead across the involved flavors = max(standard, max effective flavor
//     lead) + (N-1) * changeoverDays, where N = number of distinct involved
//     flavors (a single flavor adds no changeover). changeoverDays comes from the
//     admin-tunable OrderSettings (default 1).
// -----------------------------------------------------------------------------

/** Effective lead for ONE flavor: the global standard is the floor; a flavor
 *  override can only raise it. Null/undefined override → the standard. Pure. */
export function effectiveFlavorLeadDays(
  flavorLeadDays: number | null | undefined,
  standardLeadDays: number,
): number {
  const std = Math.max(0, Math.floor(standardLeadDays || 0))
  if (flavorLeadDays == null) return std
  return Math.max(std, Math.max(0, Math.floor(flavorLeadDays)))
}

/**
 * Effective ORDER production lead across the involved flavors:
 * `max(standard, max effective-flavor-lead) + (N-1) * changeover`.
 * No flavors (single-recipe / non-pack) → the standard floor. Pure; integer-day.
 */
export function resolveOrderLeadDays(input: {
  standardLeadDays: number
  /** Per-flavor lead-time overrides for the flavors on THIS order (null = floor). */
  flavorLeadDays: Array<number | null | undefined>
  /** Extra production days per additional distinct flavor (OrderSettings, default 1). */
  changeoverDays: number
}): number {
  const std = Math.max(0, Math.floor(input.standardLeadDays || 0))
  const n = input.flavorLeadDays.length
  if (n === 0) return std
  const maxLead = Math.max(std, ...input.flavorLeadDays.map((f) => effectiveFlavorLeadDays(f, std)))
  const extraFlavors = Math.max(0, n - 1)
  return maxLead + extraFlavors * Math.max(0, Math.floor(input.changeoverDays || 0))
}
