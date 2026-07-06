// Review aspect-attribution engine (pure) — docs/REVIEW_ATTRIBUTION_MODEL.md.
// No prisma, no I/O. The caller resolves the order's workflow graph into
// normalized legs and hands them here; this module decides which aspect chips
// to offer, routes each criticism to the responsible partner service, derives
// visibility, and enforces the §3.2a fair re-anchor guard.
//
// Why legs (not dispatch rows): DispatchType is only PRODUCT | LABEL | COPACKING,
// while fulfillment/FC is tracked outside that enum. Decoupling the engine from
// dispatch types keeps it correct as the graph evolves — the server maps
// dispatches + FC selection → { role, partnerServiceId } legs, we do the rest.

import type { RatedRole } from './partner-rating'

// ---------------------------------------------------------------------------
// Aspect registry (§3.1). Order = display order of the chips.
// PRODUCT is always offered (it targets the product itself, not a partner).
// Every other aspect resolves to a partner leg, with an explicit fallback chain.
// ---------------------------------------------------------------------------

export type ReviewAspect = 'PRODUCT' | 'PACKAGING' | 'PRINTING' | 'FULFILLMENT'

export type AspectVisibility = 'PUBLIC' | 'ADMIN_SELF'

export interface AspectDef {
  aspect: ReviewAspect
  label: string // chip label
  prompt: string // the micro-note placeholder ("What happened with …")
  /** Roles that can own this aspect, in fallback priority order. Empty = the product itself. */
  roleChain: readonly RatedRole[]
}

export const REVIEW_ASPECTS: readonly AspectDef[] = [
  {
    aspect: 'PRODUCT',
    label: 'Product',
    prompt: 'What was wrong with the product itself?',
    roleChain: [], // the branded product — no partner
  },
  {
    aspect: 'PRINTING',
    label: 'Printing',
    prompt: 'What happened with the printing or label?',
    roleChain: ['PRINTER'],
  },
  {
    aspect: 'PACKAGING',
    label: 'Packaging',
    // Co-packer owns packaging; if there was no co-pack leg the manufacturer
    // packed it themselves, so the note routes to them instead.
    prompt: 'What happened with the packaging?',
    roleChain: ['COPACKER', 'MANUFACTURER'],
  },
  {
    aspect: 'FULFILLMENT',
    label: 'Delivery',
    prompt: 'What happened with fulfillment or delivery?',
    roleChain: ['WAREHOUSE'],
  },
] as const

const ASPECT_BY_KEY: Record<ReviewAspect, AspectDef> = Object.fromEntries(
  REVIEW_ASPECTS.map((a) => [a.aspect, a]),
) as Record<ReviewAspect, AspectDef>

export function aspectDef(aspect: ReviewAspect): AspectDef {
  return ASPECT_BY_KEY[aspect]
}

// ---------------------------------------------------------------------------
// Visibility (§3.4) — snapshotted at capture from the role's policy. Printer +
// manufacturer notes are public (competition is the point / product-adjacent);
// co-packer + FC are admin+self until a creator-facing selection surface exists.
// ---------------------------------------------------------------------------

export function visibilityForRole(role: RatedRole): AspectVisibility {
  return role === 'PRINTER' || role === 'MANUFACTURER' ? 'PUBLIC' : 'ADMIN_SELF'
}

// ---------------------------------------------------------------------------
// Order legs + aspect → partner resolution (§3.1)
// ---------------------------------------------------------------------------

/** A partner that touched this order, normalized from the workflow graph. */
export interface OrderLeg {
  role: RatedRole
  partnerServiceId: string
}

export interface ResolvedAspect {
  aspect: ReviewAspect
  /** null for PRODUCT (targets the product, not a partner). */
  partnerServiceId: string | null
  role: RatedRole | null
  visibility: AspectVisibility
}

/**
 * Resolve every offerable aspect for an order to its responsible leg.
 * PRODUCT is always present. A partner aspect appears only if some role in its
 * fallback chain has a leg on this order (first match wins). Deterministic.
 */
export function resolveAspectPartners(legs: readonly OrderLeg[]): ResolvedAspect[] {
  const byRole = new Map<RatedRole, string>()
  for (const leg of legs) {
    // First leg of a role wins (stable); ignore blanks defensively.
    if (leg.partnerServiceId && !byRole.has(leg.role)) byRole.set(leg.role, leg.partnerServiceId)
  }

  const out: ResolvedAspect[] = []
  for (const def of REVIEW_ASPECTS) {
    if (def.roleChain.length === 0) {
      out.push({ aspect: def.aspect, partnerServiceId: null, role: null, visibility: 'PUBLIC' })
      continue
    }
    const role = def.roleChain.find((r) => byRole.has(r))
    if (!role) continue // no responsible partner on this order → chip not offered
    out.push({
      aspect: def.aspect,
      partnerServiceId: byRole.get(role)!,
      role,
      visibility: visibilityForRole(role),
    })
  }
  return out
}

/** Just the aspect keys to render as chips (PRODUCT + resolvable partner aspects). */
export function availableAspects(legs: readonly OrderLeg[]): ReviewAspect[] {
  return resolveAspectPartners(legs).map((r) => r.aspect)
}

/** Look up one resolved aspect (used when persisting a note). */
export function resolveOneAspect(
  legs: readonly OrderLeg[],
  aspect: ReviewAspect,
): ResolvedAspect | null {
  return resolveAspectPartners(legs).find((r) => r.aspect === aspect) ?? null
}

// ---------------------------------------------------------------------------
// §3.2a Fair re-anchoring — the three-way fork + guards
// ---------------------------------------------------------------------------

/** Product-star threshold at/below which the attribution fork is offered. */
export const REANCHOR_TRIGGER_MAX_STARS = 3

/** Creator's answer to "was it the product, or how a partner handled it?". */
export type AttributionOutcome = 'PRODUCT' | 'MIX' | 'PARTNER'

export interface AttributionResult {
  /** The star to persist on ProductReview (may differ from the original). */
  productRating: number
  /** Did we move the product star off a partner's fault? (sets ReviewAspectNote.reanchored) */
  reanchored: boolean
  /** Should the UI push the creator into the partner's dimensional rating next? */
  openPartnerRating: boolean
  /** Route the aspect note(s) to the partner? */
  routeNote: boolean
}

/**
 * Should the attribution fork be shown at all? Only when the product was rated
 * low AND at least one partner aspect was tagged (you can't re-anchor into thin
 * air — §3.2a anti-gaming).
 */
export function shouldOfferAttributionFork(
  productRating: number,
  taggedAspects: readonly ReviewAspect[],
): boolean {
  if (productRating > REANCHOR_TRIGGER_MAX_STARS) return false
  return taggedAspects.some((a) => a !== 'PRODUCT')
}

/**
 * Guard for the product-only re-star on the PARTNER branch. The new star must
 * be a whole 1–5 AND >= the original — re-anchoring removes partner blame from
 * the product, it must never be a lever to hand out a strategic higher-than-felt
 * score in the opposite direction... it can only recover, never inflate beyond
 * the honest product-only impression the creator now gives. (§3.2a)
 */
export function validateReanchorRating(
  originalRating: number,
  newRating: number,
): { ok: true } | { ok: false; error: string } {
  if (!Number.isInteger(newRating) || newRating < 1 || newRating > 5) {
    return { ok: false, error: 'Rate the product 1–5 stars' }
  }
  if (newRating < originalRating) {
    return {
      ok: false,
      error: 'A product-only rating can only be the same or higher — the partner issue routes separately',
    }
  }
  return { ok: true }
}

/**
 * Resolve the fork outcome into what to persist. `newProductRating` is required
 * only on the PARTNER branch (the product-only re-star); ignored otherwise.
 * Returns an error string if the PARTNER re-star fails the guard.
 */
export function applyAttributionOutcome(args: {
  outcome: AttributionOutcome
  originalRating: number
  newProductRating?: number
}): { ok: true; result: AttributionResult } | { ok: false; error: string } {
  const { outcome, originalRating, newProductRating } = args

  if (outcome === 'PRODUCT') {
    // Mostly the product — star stands; a minor note may still route if written.
    return {
      ok: true,
      result: { productRating: originalRating, reanchored: false, openPartnerRating: false, routeNote: true },
    }
  }

  if (outcome === 'MIX') {
    // Genuine product miss AND a partner gripe — keep the star, route the note,
    // and push the creator to score the partner so the gripe has a rated home.
    return {
      ok: true,
      result: { productRating: originalRating, reanchored: false, openPartnerRating: true, routeNote: true },
    }
  }

  // PARTNER — the product was fine; re-anchor the product star.
  if (newProductRating === undefined) {
    return { ok: false, error: 'A product-only rating is required to re-anchor' }
  }
  const guard = validateReanchorRating(originalRating, newProductRating)
  if (!guard.ok) return { ok: false, error: guard.error }
  return {
    ok: true,
    result: { productRating: newProductRating, reanchored: true, openPartnerRating: true, routeNote: true },
  }
}

// ---------------------------------------------------------------------------
// Admin control defaults (§ admin controls) — the singleton's shape lives in the
// DB; these are the safe defaults the resolver falls back to when unset.
// ---------------------------------------------------------------------------

export interface ReviewAttributionControls {
  /** Master switch for the whole attribution layer. */
  attributionEnabled: boolean
  /** Offer the §3.2a re-anchor fork on low + tagged reviews. */
  reanchorEnabled: boolean
  /** Enforce new-star >= original on the PARTNER branch. */
  enforceReanchorFloor: boolean
  /** Aspects the creator may tag (PRODUCT is implicit and always allowed). */
  offeredAspects: readonly ReviewAspect[]
  /** Flag a partner for admin review when its re-anchor share exceeds this (0–1). */
  reanchorFlagRate: number
  /** Minimum notes before the re-anchor-rate flag can fire (small-sample guard). */
  reanchorFlagMinNotes: number
}

export const DEFAULT_ATTRIBUTION_CONTROLS: ReviewAttributionControls = {
  attributionEnabled: true,
  reanchorEnabled: true,
  enforceReanchorFloor: true,
  offeredAspects: ['PACKAGING', 'PRINTING', 'FULFILLMENT'],
  reanchorFlagRate: 0.5,
  reanchorFlagMinNotes: 10,
}

/** Filter resolved aspects by the admin's offered set (PRODUCT always kept). */
export function applyOfferedAspects(
  resolved: readonly ResolvedAspect[],
  offered: readonly ReviewAspect[],
): ResolvedAspect[] {
  const allow = new Set<ReviewAspect>(['PRODUCT', ...offered])
  return resolved.filter((r) => allow.has(r.aspect))
}
