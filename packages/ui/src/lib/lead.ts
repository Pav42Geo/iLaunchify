// Pure per-flavor lead-time resolver (docs/PER_FLAVOR_RECIPES.md §4).
//
// No React, no I/O — the same rules the partner builder, the marketplace PDP,
// and order routing all apply to quote production lead. Built on the existing
// `applyFlavorChangeover` convention (sibling pack-composition.ts): the extra
// for N distinct flavors is `(N-1) * changeoverDays`.
//
// Locked decisions:
//   - Per flavor wins: effective lead = flavor.leadTimeDays ?? standardLead.
//   - Effective product lead = max(effective lead over involved flavors)
//     + (distinctCount - 1) * changeover.
//   - The standard lead is the floor for any un-overridden flavor and the
//     fallback when nothing is overridden. A flavor override may be LOWER than
//     the standard.
//   - Soft, NON-blocking warning when EVERY flavor is overridden AND the
//     standard exceeds the max override (the product will quote the lower max).

import { applyFlavorChangeover } from './pack-composition'

/** Effective lead for ONE flavor: its override if set, else the product
 *  standard. A flavor override may be lower than the standard. */
export function effectiveFlavorLead(
  flavorLeadDays: number | null | undefined,
  standardLeadDays: number,
): number {
  return flavorLeadDays ?? standardLeadDays
}

/**
 * Effective product / order lead across the involved flavors:
 * `max(effectiveFlavorLead over flavors) + (N-1) * changeover` where N is the
 * number of distinct involved flavors. With no flavors (or all null) it falls
 * back to the standard lead; a single flavor adds no changeover (per
 * `applyFlavorChangeover`). `changeoverDays` is clamped at 0.
 */
export function effectiveProductLead(
  standardLeadDays: number,
  flavorLeads: (number | null | undefined)[],
  changeoverDays: number,
): number {
  if (flavorLeads.length === 0) return standardLeadDays
  const maxLead = Math.max(
    ...flavorLeads.map((f) => effectiveFlavorLead(f, standardLeadDays)),
  )
  // Reuse the changeover convention: extra = (N-1) * changeover.
  return applyFlavorChangeover(maxLead, flavorLeads.length, changeoverDays) ?? maxLead
}

/**
 * Soft, non-blocking builder warning. Returns a message ONLY when every flavor
 * has an explicit override AND the product standard exceeds the max override
 * (so the product will quote the lower max). Returns null otherwise — including
 * when any flavor is un-overridden (the standard is still its floor).
 */
export function leadConflictWarning(
  standardLeadDays: number,
  flavorLeads: (number | null | undefined)[],
): string | null {
  if (flavorLeads.length === 0) return null
  const allOverridden = flavorLeads.every((f) => f != null)
  if (!allOverridden) return null
  const maxOverride = Math.max(...(flavorLeads as number[]))
  if (standardLeadDays > maxOverride) {
    return `Standard lead (${standardLeadDays}d) exceeds every flavor (max ${maxOverride}d) — the product will quote ${maxOverride}d.`
  }
  return null
}
