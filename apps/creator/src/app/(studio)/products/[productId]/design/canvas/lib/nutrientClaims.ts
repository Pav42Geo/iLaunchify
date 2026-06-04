// Track C / C6 — FDA nutrient-content-claim auto-suggestion engine.
//
// Pure, framework-free. Given a Nutrition Facts dataset, returns the
// nutrient-content claims the product is *eligible* to print, each with the
// governing 21 CFR citation and the numeric basis. This is an ELIGIBILITY
// helper, not legal sign-off: thresholds follow 21 CFR 101.54/101.60/101.61/
// 101.62, evaluated against the per-serving values shown on the panel. Some
// claims carry extra conditions (disclosure statements, "not nutritionally
// inferior", per-RACC vs per-50g for small servings) that a human still owns —
// surfaced in `caveat` where relevant.
//
// Mirrors the pure-module convention of labelFormats.ts (app-local, no React,
// no Prisma) so it can be unit-reasoned and reused by a server validator later.

import type { NutritionPanelData, NutritionRow } from '@ilaunchify/ui'

export type ClaimStrength = 'free' | 'low' | 'good' | 'excellent' | 'none'

export interface NutrientClaim {
  /** The printable claim phrase, e.g. "Low sodium". */
  claim: string
  /** The nutrient the claim is about, e.g. "Sodium". */
  nutrient: string
  /** Plain-language basis for eligibility (the value vs the limit). */
  basis: string
  /** Governing CFR citation. */
  cfr: string
  /** Strength bucket — drives ordering + badge color. */
  strength: ClaimStrength
  /** Extra human-owned condition the creator must confirm, if any. */
  caveat?: string
}

/* ----------------------------- value parsing ----------------------------- */

/** Parse "35mg" → 35, "1.5g" → 1.5, "0mcg" → 0. Unit-agnostic numeric pull. */
function amount(value: string | undefined): number | null {
  if (!value) return null
  const m = value.replace(/,/g, '').match(/-?\d*\.?\d+/)
  if (!m) return null
  const n = Number(m[0])
  return Number.isFinite(n) ? n : null
}

function findRow(rows: NutritionRow[], label: string): NutritionRow | undefined {
  const want = label.toLowerCase()
  return rows.find((r) => r.label.toLowerCase() === want)
}

/** Numeric per-serving amount of a named row (in its own unit), or null. */
function rowAmount(rows: NutritionRow[], label: string): number | null {
  return amount(findRow(rows, label)?.value)
}

function dv(rows: NutritionRow[], label: string): number | null {
  const r = findRow(rows, label)
  return r && r.dvPercent != null ? r.dvPercent : null
}

/* ------------------------------- the engine ------------------------------ */

/**
 * Suggest every nutrient-content claim the dataset is eligible for, ordered
 * strongest-first within each nutrient (free → low, excellent → good).
 */
export function suggestNutrientClaims(data: NutritionPanelData): NutrientClaim[] {
  const rows = data.rows
  const out: NutrientClaim[] = []

  // ----- Calories (21 CFR 101.60(b)) -----
  const cal = data.calories
  if (cal < 5) {
    out.push({
      claim: 'Calorie free',
      nutrient: 'Calories',
      basis: `${cal} cal per serving — under the 5 cal limit`,
      cfr: '21 CFR 101.60(b)(1)',
      strength: 'free',
    })
  } else if (cal <= 40) {
    out.push({
      claim: 'Low calorie',
      nutrient: 'Calories',
      basis: `${cal} cal per serving — at or under the 40 cal limit`,
      cfr: '21 CFR 101.60(b)(2)',
      strength: 'low',
      caveat: 'Per-RACC basis; foods with a small reference amount use a per-50g test.',
    })
  }

  // ----- Total Fat (21 CFR 101.62(b)) -----
  const fat = rowAmount(rows, 'Total Fat')
  if (fat != null) {
    if (fat < 0.5) {
      out.push({
        claim: 'Fat free',
        nutrient: 'Total Fat',
        basis: `${fat}g per serving — under the 0.5g limit`,
        cfr: '21 CFR 101.62(b)(1)',
        strength: 'free',
      })
    } else if (fat <= 3) {
      out.push({
        claim: 'Low fat',
        nutrient: 'Total Fat',
        basis: `${fat}g per serving — at or under the 3g limit`,
        cfr: '21 CFR 101.62(b)(2)',
        strength: 'low',
      })
    }
  }

  // ----- Saturated Fat (21 CFR 101.62(c)) -----
  const sat = rowAmount(rows, 'Saturated Fat')
  const trans = rowAmount(rows, 'Trans Fat')
  if (sat != null) {
    if (sat < 0.5 && (trans == null || trans < 0.5)) {
      out.push({
        claim: 'Saturated fat free',
        nutrient: 'Saturated Fat',
        basis: `${sat}g sat fat${trans != null ? ` + ${trans}g trans` : ''} — both under 0.5g`,
        cfr: '21 CFR 101.62(c)(1)',
        strength: 'free',
      })
    } else if (sat <= 1) {
      out.push({
        claim: 'Low saturated fat',
        nutrient: 'Saturated Fat',
        basis: `${sat}g per serving — at or under the 1g limit`,
        cfr: '21 CFR 101.62(c)(2)',
        strength: 'low',
        caveat: 'Also requires ≤15% of calories from saturated fat.',
      })
    }
  }

  // ----- Cholesterol (21 CFR 101.62(d)) — gated on sat fat ≤2g -----
  const chol = rowAmount(rows, 'Cholesterol')
  if (chol != null && (sat == null || sat <= 2)) {
    if (chol < 2) {
      out.push({
        claim: 'Cholesterol free',
        nutrient: 'Cholesterol',
        basis: `${chol}mg per serving — under the 2mg limit`,
        cfr: '21 CFR 101.62(d)(1)',
        strength: 'free',
      })
    } else if (chol <= 20) {
      out.push({
        claim: 'Low cholesterol',
        nutrient: 'Cholesterol',
        basis: `${chol}mg per serving — at or under the 20mg limit`,
        cfr: '21 CFR 101.62(d)(2)',
        strength: 'low',
      })
    }
  }

  // ----- Sodium (21 CFR 101.61(b)) -----
  const sodium = rowAmount(rows, 'Sodium')
  if (sodium != null) {
    if (sodium < 5) {
      out.push({
        claim: 'Sodium free',
        nutrient: 'Sodium',
        basis: `${sodium}mg per serving — under the 5mg limit`,
        cfr: '21 CFR 101.61(b)(1)',
        strength: 'free',
      })
    } else if (sodium <= 35) {
      out.push({
        claim: 'Very low sodium',
        nutrient: 'Sodium',
        basis: `${sodium}mg per serving — at or under the 35mg limit`,
        cfr: '21 CFR 101.61(b)(3)',
        strength: 'low',
      })
    } else if (sodium <= 140) {
      out.push({
        claim: 'Low sodium',
        nutrient: 'Sodium',
        basis: `${sodium}mg per serving — at or under the 140mg limit`,
        cfr: '21 CFR 101.61(b)(4)',
        strength: 'low',
      })
    }
  }

  // ----- Sugars (21 CFR 101.60(c)) -----
  const sugars = rowAmount(rows, 'Total Sugars')
  if (sugars != null && sugars < 0.5) {
    out.push({
      claim: 'Sugar free',
      nutrient: 'Total Sugars',
      basis: `${sugars}g per serving — under the 0.5g limit`,
      cfr: '21 CFR 101.60(c)(1)',
      strength: 'free',
    })
  }
  if (data.addedSugarG != null && data.addedSugarG === 0) {
    out.push({
      claim: 'No added sugars',
      nutrient: 'Added Sugars',
      basis: '0g added sugars',
      cfr: '21 CFR 101.60(c)(2)',
      strength: 'free',
      caveat:
        'Requires no added-sugar ingredients AND the food is not otherwise nutritionally inferior.',
    })
  }

  // ----- "Good/Excellent source of" — DV-driven (21 CFR 101.54(b)/(c)) -----
  // Applies to fiber, protein, and the listed vitamins/minerals.
  const SOURCE_NUTRIENTS = [
    'Dietary Fiber',
    'Protein',
    'Vitamin D',
    'Calcium',
    'Iron',
    'Potassium',
  ]
  for (const nutrient of SOURCE_NUTRIENTS) {
    const pct = dv(rows, nutrient)
    if (pct == null) continue
    const fiber = nutrient === 'Dietary Fiber'
    if (pct >= 20) {
      out.push({
        claim: fiber ? 'High fiber' : `Excellent source of ${nutrient.toLowerCase()}`,
        nutrient,
        basis: `${pct}% DV per serving — at or above the 20% threshold`,
        cfr: '21 CFR 101.54(b)',
        strength: 'excellent',
        ...(fiber
          ? { caveat: 'High-fiber foods >3g fat per serving must also disclose total fat.' }
          : {}),
      })
    } else if (pct >= 10) {
      out.push({
        claim: fiber ? 'Good source of fiber' : `Good source of ${nutrient.toLowerCase()}`,
        nutrient,
        basis: `${pct}% DV per serving — within the 10–19% range`,
        cfr: '21 CFR 101.54(c)',
        strength: 'good',
      })
    }
  }

  return out
}
