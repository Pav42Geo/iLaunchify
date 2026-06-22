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
