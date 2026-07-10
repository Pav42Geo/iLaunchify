// Co-creation shared UI vocabulary — single source for every surface that
// renders briefs (Brief Builder, Opportunity Pool, Shortlist, Room, admin).
// Moved out of per-page constants (Pavel 2026-07-10: no duplicated/hardcoded
// vocab in components).
//
// NOTE both of these are V1 stand-ins for DB-owned data:
//  - BRIEF_CLAIM_POOL → becomes an admin-curated table when the claims
//    taxonomy lands (tracked in CO_CREATION_MARKETPLACE_SPEC — claims feed
//    fit-scoring, so the vocabulary must stay in lock-step platform-wide).
//  - NICHE_GRADIENT → mirrors the marketing-copy layer in
//    apps/marketing/src/lib/niches.ts (slugs = seed-niches.ts, LOCKED). When
//    niche gradients move into the Niche table, read them from there instead.

import type { ProductGradient } from '../tokens/colors'

/** Must-have claim vocabulary for product briefs (demo CLAIM_POOL parity). */
export const BRIEF_CLAIM_POOL = [
  'High-protein',
  'No added sugar',
  'Vegan',
  'Functional',
  'Clean-label',
  'Low-sugar',
  'Keto',
  'Gluten-free',
  'Adaptogenic',
  'Electrolytes',
  'Organic',
  'Nootropic',
] as const
export type BriefClaim = (typeof BRIEF_CLAIM_POOL)[number]

/** Layer-1 niche slug → product gradient (8 locked slugs). */
export const NICHE_GRADIENT: Record<string, ProductGradient> = {
  'energy-performance': 'purple',
  wellness: 'mint',
  beauty: 'pink',
  'healthy-lifestyle': 'lime',
  gourmet: 'coral',
  'family-kids': 'yellow',
  'pet-wellness': 'cyan',
  'social-lifestyle': 'sky',
}

/** Gradient for a niche slug with a safe fallback. */
export function nicheGradientKey(slug: string | null | undefined): ProductGradient {
  return (slug && NICHE_GRADIENT[slug]) || 'pink'
}

/**
 * One-line room status for the switcher, derived from the RECIPE object —
 * plus an attention chip when the ball is in the VIEWER's court.
 * (creator reviews; maker submits/revises.)
 */
export function roomRecipeStatusLine(
  recipe: { status: string; currentVersion: number } | null,
  mode: 'creator' | 'partner',
): { line: string; attention: string | null } {
  if (!recipe || recipe.status === 'DRAFT') {
    return mode === 'creator'
      ? { line: "awaiting maker's v1", attention: null }
      : { line: 'submit your v1', attention: 'your move' }
  }
  switch (recipe.status) {
    case 'SUBMITTED':
    case 'IN_REVIEW':
      return {
        line: `recipe v${recipe.currentVersion} in review`,
        attention: mode === 'creator' ? 'your review' : null,
      }
    case 'CHANGES_REQUESTED':
      return { line: 'changes requested', attention: mode === 'partner' ? 'revise' : null }
    case 'APPROVED':
    case 'LOCKED':
      return { line: 'recipe approved', attention: null }
    default:
      return { line: recipe.status.toLowerCase().replaceAll('_', ' '), attention: null }
  }
}
