// Profile completeness — the ring in the settings top band
// (design/partner-profile-prototype-v2.html st-topband, Front Face slice 3).
// Pure + dependency-free so it's unit-testable and client/server-safe.
//
// Weights sum to 100. `nextHint` = the highest-impact missing piece, phrased
// as the action the partner should take next.

export interface CompletenessInput {
  hasLogo: boolean
  hasCover: boolean
  taglineLength: number
  aboutLength: number
  bestForCount: number
  disclosureFull: boolean
  published: boolean
  verifiedCertCount: number
}

export interface Completeness {
  pct: number
  nextHint: string | null
}

interface Rule {
  weight: number
  /** 0..1 earned fraction */
  earned: (i: CompletenessInput) => number
  hint: string
}

// Portfolio removed from the program (Pavel 2026-07-13) — its 15 points were
// redistributed to About / Publish / Certifications so weights still sum 100.
const RULES: Rule[] = [
  { weight: 10, earned: (i) => (i.hasLogo ? 1 : 0), hint: 'Upload your company logo' },
  { weight: 5, earned: (i) => (i.hasCover ? 1 : 0), hint: 'Add a cover image' },
  { weight: 10, earned: (i) => (i.taglineLength > 0 ? 1 : 0), hint: 'Write your tagline' },
  { weight: 20, earned: (i) => (i.aboutLength >= 80 ? 1 : i.aboutLength > 0 ? 0.5 : 0), hint: 'Write your About section' },
  { weight: 10, earned: (i) => Math.min(1, i.bestForCount / 3), hint: 'Add best-for tags' },
  { weight: 10, earned: (i) => (i.disclosureFull ? 1 : 0), hint: 'Set disclosure to Full "Manufactured by"' },
  { weight: 20, earned: (i) => (i.published ? 1 : 0), hint: 'Publish your public profile' },
  { weight: 15, earned: (i) => (i.verifiedCertCount > 0 ? 1 : 0), hint: 'Get a certification verified' },
]

export function computeProfileCompleteness(input: CompletenessInput): Completeness {
  let pct = 0
  let nextHint: string | null = null
  let biggestGap = 0
  for (const r of RULES) {
    const e = r.earned(input)
    pct += r.weight * e
    const gap = r.weight * (1 - e)
    if (gap > biggestGap) {
      biggestGap = gap
      nextHint = r.hint
    }
  }
  return { pct: Math.round(pct), nextHint: biggestGap > 0 ? nextHint : null }
}
