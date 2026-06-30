// Pure per-flavor lead-time resolver (docs/PER_FLAVOR_RECIPES.md §4).
//
// No React, no I/O — the same rules the partner builder, the marketplace PDP,
// and order routing all apply to quote production lead. Built on the existing
// `applyFlavorChangeover` convention (sibling pack-composition.ts): the extra
// for N distinct flavors is `(N-1) * changeoverDays`.
//
// Locked decisions (Pavel 2026-06-30 — GLOBAL lead is authoritative):
//   - The product STANDARD (global) lead is the FLOOR. It captures everything
//     around the product that applies regardless of flavor — printing,
//     packaging, boxing, QA, etc.
//   - A per-flavor lead can only EXTEND the global, never shorten it: effective
//     flavor lead = max(standard, flavor.leadTimeDays). A flavor value below the
//     standard has no effect (the global wins).
//   - Effective product lead = max(standard, max flavor lead) + (N-1)*changeover.
//   - Soft, NON-blocking note when a flavor override is set BELOW the standard
//     (it won't apply — the global floor governs).

import { applyFlavorChangeover } from './pack-composition'

/** Effective lead for ONE flavor: the GLOBAL standard is the floor, a flavor
 *  override can only raise it. Null override → the standard. */
export function effectiveFlavorLead(
  flavorLeadDays: number | null | undefined,
  standardLeadDays: number,
): number {
  if (flavorLeadDays == null) return standardLeadDays
  return Math.max(standardLeadDays, flavorLeadDays)
}

/**
 * Effective product / order lead across the involved flavors:
 * `max(standard, max flavor lead) + (N-1) * changeover` where N is the number of
 * distinct involved flavors. The global standard is always the floor; with no
 * flavors (or all null) it IS the standard. A single flavor adds no changeover
 * (per `applyFlavorChangeover`). `changeoverDays` is clamped at 0.
 */
export function effectiveProductLead(
  standardLeadDays: number,
  flavorLeads: (number | null | undefined)[],
  changeoverDays: number,
): number {
  if (flavorLeads.length === 0) return standardLeadDays
  const maxLead = Math.max(
    standardLeadDays,
    ...flavorLeads.map((f) => effectiveFlavorLead(f, standardLeadDays)),
  )
  // Reuse the changeover convention: extra = (N-1) * changeover.
  return applyFlavorChangeover(maxLead, flavorLeads.length, changeoverDays) ?? maxLead
}

/**
 * Soft, non-blocking builder note. Because the GLOBAL standard is the floor, a
 * flavor override set BELOW it has no effect — return a message naming how many
 * flavors are below the standard so the manufacturer knows those values are
 * ignored. Returns null when no override is below the standard.
 */
export function leadConflictWarning(
  standardLeadDays: number,
  flavorLeads: (number | null | undefined)[],
): string | null {
  const below = flavorLeads.filter((f) => f != null && (f as number) < standardLeadDays).length
  if (below === 0) return null
  return `${below} flavor${below === 1 ? '' : 's'} below the standard lead (${standardLeadDays}d) — the standard governs, so ${below === 1 ? 'that value' : 'those values'} won't shorten production.`
}
