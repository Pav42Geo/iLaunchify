'use client'

// Auto-detect label sections by content (DS-72a).
//
// Walks every text object on the canvas and pattern-matches its content
// against the FDA-required label sections. When a match lands, we stamp
// `customRole` on the object so the compliance scan + downstream tooling
// (export manifest, print pipeline) treat the section as if the creator
// had dropped it via the Label drawer.
//
// Why this exists: creators who type the ingredient statement / net
// quantity / etc. as free text shouldn't be punished for not knowing the
// system expects pre-tagged sections. The scan should recognize them
// either way. This also unlocks "no warning needed" for designs that
// look fine because they actually ARE fine — the user just typed the
// content directly instead of clicking "Add ingredient statement" in
// the drawer.
//
// What this CAN'T do today:
//   - Read text baked into uploaded PDFs / Images (no canvas text
//     objects to walk). That's Tesseract OCR territory — V2.
//   - Distinguish a "Pavel Georgiev" tagline from the product's actual
//     Statement of Identity unless productCtx supplies the name to match.
//   - Catch every regional / international convention. The pattern
//     catalog is US-FDA-focused; EU / Canada / etc. land when those
//     rule packs do.
//
// See docs/AUTO_RECOGNITION_PLAN.md for the broader OCR + AI vision
// roadmap.

import type { FabricCanvas, FabricObject } from './types'
import type { LabelSectionRole } from './objects'

export interface AutoDetection {
  role: LabelSectionRole
  /** The fabric object we stamped. Caller can highlight + select. */
  object: FabricObject
  /** Confidence — high (≥0.9) auto-tagged, medium suggested w/ review. */
  confidence: number
  /** Why we matched — for the UI to explain to the creator. */
  rationale: string
}

export interface AutoDetectContext {
  productName?: string
}

/**
 * Walk the canvas, pattern-match each text object, return + stamp all
 * detected required-label sections.
 *
 * Each detected object is stamped via `obj.set('customRole', role)` so
 * the rest of the system treats it identically to a Label-drawer-dropped
 * section. The stamp round-trips through autosave (customRole is in
 * CANVAS_PROPERTIES_TO_INCLUDE).
 *
 * Returns the detection list — order is the order of detection, not
 * canvas-z-order. Caller can render it in the CompliancePanel as
 * "Recognized on canvas" findings.
 */
export function autoDetectLabelSections(
  canvas: FabricCanvas | null,
  ctx: AutoDetectContext = {},
): AutoDetection[] {
  if (!canvas) return []

  const detections: AutoDetection[] = []
  // Track which roles we've already detected so multiple matches don't
  // double-stamp (whichever has the highest confidence wins).
  const detectedRoles = new Set<LabelSectionRole>()

  for (const obj of canvas.getObjects()) {
    const o = obj as { type?: string; text?: string; customRole?: LabelSectionRole }
    // Skip non-text or objects already tagged with a role.
    const isTextType =
      o.type === 'text' || o.type === 'i-text' || o.type === 'textbox'
    if (!isTextType) continue
    if (o.customRole) continue // already tagged — respect explicit drops
    const text = o.text?.trim()
    if (!text) continue

    const match = matchPattern(text, ctx)
    if (!match) continue
    if (detectedRoles.has(match.role)) continue

    ;(obj as unknown as {
      set: (k: string, v: unknown) => void
    }).set('customRole', match.role)
    detectedRoles.add(match.role)
    detections.push({
      role: match.role,
      object: obj,
      confidence: match.confidence,
      rationale: match.rationale,
    })
  }

  if (detections.length > 0) {
    // One render at the end so we don't thrash for every match.
    canvas.requestRenderAll()
  }
  return detections
}

// ============================================================================
// Pattern catalog
// ============================================================================

interface PatternMatch {
  role: LabelSectionRole
  confidence: number
  rationale: string
}

/**
 * Best-effort role inference from a single text block. Order matters —
 * specific patterns first, fuzzy last. Confidence values:
 *
 *   0.99 — unambiguous canonical prefix ("INGREDIENTS:", "NET WT")
 *   0.95 — strong convention but text could be tagline ("Manufactured for")
 *   0.85 — fuzzy match against productCtx.productName for SOI
 */
function matchPattern(text: string, ctx: AutoDetectContext): PatternMatch | null {
  const t = text.trim()

  // ---- INGREDIENT STATEMENT ----
  // The FDA-conventional prefix is exact enough to be confident.
  if (/^ingredients?\s*[:.\-]/i.test(t)) {
    return {
      role: 'ingredients',
      confidence: 0.99,
      rationale: 'Starts with "INGREDIENTS:" per 21 CFR 101.4(a)',
    }
  }

  // ---- ALLERGEN STATEMENT ----
  // FALCPA / FASTER convention: "Contains: " followed by allergens.
  if (/^contains\s*[:.\-]/i.test(t)) {
    return {
      role: 'allergens',
      confidence: 0.99,
      rationale: 'Starts with "CONTAINS:" per 21 CFR 101.91',
    }
  }

  // ---- NET QUANTITY ----
  // High-confidence: explicit FDA prefix.
  if (/^\s*net\s*(wt\.?|weight|wt)\b/i.test(t)) {
    return {
      role: 'net-weight',
      confidence: 0.99,
      rationale: 'Starts with "NET WT" per 21 CFR 101.105',
    }
  }
  // Also high-confidence for fluid measure: "NET 16 FL OZ (473 mL)"
  if (/^\s*net\s+\d/i.test(t) && /(fl\s*oz|fluid\s*ounce|ml|liter|litre|pt|qt|gal|gallon)\b/i.test(t)) {
    return {
      role: 'net-weight',
      confidence: 0.97,
      rationale: 'Starts with "NET" and contains a fluid measure',
    }
  }
  // Count items: "60 CAPSULES", "100 TABLETS"
  if (
    /^\s*\d+\s+(capsules?|tablets?|softgels?|gummies|gummy|servings?|pieces?|sachets?|count)\b/i.test(
      t,
    )
  ) {
    return {
      role: 'net-weight',
      confidence: 0.93,
      rationale: 'Count format "N UNITS" — net quantity by count',
    }
  }

  // ---- MANUFACTURER / DISTRIBUTOR INFO ----
  // 21 CFR 101.5 conventional phrasings.
  if (
    /(manufactured|distributed|packed|produced)\s+(for|by)\b/i.test(t) ||
    /\bmfg\.?\s+by\b/i.test(t) ||
    /\bdist\.?\s+by\b/i.test(t)
  ) {
    return {
      role: 'manufacturer-info',
      confidence: 0.95,
      rationale: 'Contains "Manufactured for / Distributed by" phrasing',
    }
  }

  // ---- STATEMENT OF IDENTITY ----
  // Hardest to detect without context. If productCtx provides the
  // product name, we match against it (fuzzy, case-insensitive,
  // ignoring whitespace differences). Confidence here is lower because
  // a tagline that happens to contain the brand could match too.
  if (ctx.productName) {
    const name = ctx.productName.toLowerCase().trim()
    const norm = t.toLowerCase().replace(/\s+/g, ' ').trim()
    if (norm === name || norm.includes(name)) {
      // Lower confidence when the matched text is much longer than the
      // product name (likely a tagline / description that mentions it).
      const ratio = name.length / norm.length
      const confidence = ratio > 0.6 ? 0.85 : 0.7
      return {
        role: 'statement-of-identity',
        confidence,
        rationale: `Matches the product name "${ctx.productName}"`,
      }
    }
  }

  return null
}

/**
 * Find detection objects on the canvas by role — caller uses for "Find
 * on canvas" jumps from the CompliancePanel.
 */
export function findDetectedByRole(
  canvas: FabricCanvas | null,
  role: LabelSectionRole,
): FabricObject | null {
  if (!canvas) return null
  for (const obj of canvas.getObjects()) {
    const cr = (obj as { customRole?: LabelSectionRole }).customRole
    if (cr === role) return obj
  }
  return null
}
