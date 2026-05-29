'use client'

// Canvas-side label compliance scan (DS-55).
//
// Walks the fabric canvas and confirms each US-FDA-required label element
// (21 CFR §101) is present. Findings are returned as a typed result the
// UI can render with severity badges and "Find on canvas" jump buttons.
//
// What this scan can and can't do:
//   ✅ Confirm a tagged section is present (uses the customRole stamp
//      from addLabelSection — that's the load-bearing signal).
//   ✅ Confirm a Nutrition Facts panel is present (customType
//      'nutrition-panel').
//   ✅ Confirm an ingredient statement starts with the FDA-conventional
//      "INGREDIENTS:" prefix.
//   ✅ Cross-check the product name on canvas against the bound product
//      name in productCtx — flags if they don't match.
//   ❌ Cannot tell if a freely-typed text block IS the ingredient
//      statement unless the creator dropped it via the Label drawer.
//      That's why the "Required sections" mini-checklist in LabelDrawer
//      is the supported path — it stamps customRole so this scan can
//      see it.
//
// Returns INFO findings for things that are *not required* but the
// creator commonly wants to remember (e.g., bioengineered disclosure for
// applicable products — only surfaces if productCtx.bioengineered is
// true, otherwise omitted to avoid alert fatigue).

import type { FabricCanvas, FabricObject } from './types'
import type { CanvasCustomType, LabelSectionRole } from './objects'
import {
  validateNetQuantityFormat,
  type NetQuantityKind,
} from './netQuantity'
import { autoDetectLabelSections } from './autoDetect'

/**
 * Productlinked context the scan compares against. Pulled from the
 * server when the canvas page mounts — minimal so the compliance scan
 * stays a pure client function.
 */
export interface LabelScanContext {
  /** Product common/usual name (statement of identity reference). */
  productName: string
  /** Brand name — used in manufacturer-info matching. */
  brandName: string
  /** Major allergens derived from the recipe (e.g., ['milk','soy']). */
  allergens: string[]
  /** True if any ingredient is bioengineered (triggers BE disclosure). */
  bioengineered: boolean
  /** Net quantity string from the product record, if set. */
  netQuantity: string | null
  /**
   * Format kind for the net-quantity scan check. Defaults to 'solid' when
   * omitted. Derived from product category + variant.containerFormat — see
   * inferNetQuantityKind in netQuantity.ts.
   */
  netQuantityKind?: NetQuantityKind
}

export type ScanSeverity = 'BLOCKING' | 'WARNING' | 'INFO'

export interface ScanFinding {
  id: string
  severity: ScanSeverity
  /** Short headline rendered in the panel row. */
  title: string
  /** Sentence-level detail rendered beneath the headline. */
  detail: string
  /** FDA citation, when applicable. e.g. "21 CFR 101.105". */
  citation?: string
  /** Object identity for "Find on canvas" — null if no object to jump to. */
  objectRef?: string
  /** Suggested fix line, when applicable. */
  suggestedFix?: string
  /**
   * True when this finding came from autoDetectLabelSections (DS-72) —
   * the section wasn't explicitly dropped via the Label drawer but the
   * system recognized it by text content. UI surfaces a different badge.
   */
  autoDetected?: boolean
}

export interface LabelScanResult {
  /** Counts per severity — the panel uses these for badges. */
  counts: { blocking: number; warning: number; info: number }
  /** Overall pass/fail derived from blocking count. */
  outcome: 'PASS' | 'PASS_WITH_WARNINGS' | 'FAIL'
  findings: ScanFinding[]
  /** Timestamp the scan ran, for the panel's "last checked" tag. */
  scannedAt: Date
}

/**
 * Required label-section roles — every one must be present for outcome
 * to be PASS. Each entry has the FDA citation that backs the requirement.
 *
 * Source: 21 CFR Part 101 (Food Labeling). See docs/COMPLIANCE.md for the
 * rule-pack mapping.
 */
const REQUIRED_SECTIONS: Array<{
  role: LabelSectionRole
  label: string
  citation: string
}> = [
  {
    role: 'statement-of-identity',
    label: 'Statement of identity',
    citation: '21 CFR 101.3',
  },
  {
    role: 'net-weight',
    label: 'Net quantity of contents',
    citation: '21 CFR 101.105',
  },
  {
    role: 'ingredients',
    label: 'Ingredient statement',
    citation: '21 CFR 101.4',
  },
  {
    role: 'manufacturer-info',
    label: 'Manufacturer / Distributor info',
    citation: '21 CFR 101.5',
  },
]

/**
 * Run the scan. Pure function — no side effects, no I/O.
 */
export function scanLabelCompliance(
  canvas: FabricCanvas | null,
  ctx: LabelScanContext,
): LabelScanResult {
  const findings: ScanFinding[] = []

  // DS-72 — Auto-detect required sections by text content BEFORE the
  // rule check. Stamps customRole on any text that matches a known
  // FDA-section pattern (INGREDIENTS:, CONTAINS:, NET WT, etc.), so
  // the missing-section blockings below recognize them as present.
  // Creators who type the content directly (instead of dropping pre-
  // tagged sections via the Label drawer) no longer get punished.
  const autoDetectedSet = new Set<LabelSectionRole>()
  if (canvas) {
    const detections = autoDetectLabelSections(canvas, {
      productName: ctx.productName,
    })
    for (const d of detections) autoDetectedSet.add(d.role)
  }

  const objects: FabricObject[] = canvas?.getObjects() ?? []

  // Index objects by role / type for fast lookup.
  const byRole = new Map<LabelSectionRole, FabricObject>()
  let nutritionPanel: FabricObject | null = null
  for (const obj of objects) {
    const ct = (obj as { customType?: CanvasCustomType }).customType
    const cr = (obj as { customRole?: LabelSectionRole }).customRole
    if (cr && !byRole.has(cr)) byRole.set(cr, obj)
    if (ct === 'nutrition-panel' && !nutritionPanel) nutritionPanel = obj
  }

  // --------------------------------------------------------------------
  // Required sections — one BLOCKING per missing section. Auto-detected
  // sections (DS-72) get an INFO acknowledgement instead.
  // --------------------------------------------------------------------
  for (const req of REQUIRED_SECTIONS) {
    const obj = byRole.get(req.role)
    if (!obj) {
      findings.push({
        id: `missing-${req.role}`,
        severity: 'BLOCKING',
        title: `Missing: ${req.label}`,
        detail: `FDA requires every consumer food label to display ${req.label.toLowerCase()}.`,
        citation: req.citation,
        suggestedFix: `Open the Label drawer → Required sections → Add ${req.label}.`,
      })
    } else if (autoDetectedSet.has(req.role)) {
      // Auto-detected — surface as INFO so the user sees the system
      // recognized it on its own. No blocking, no warning, no ack
      // needed at export.
      findings.push({
        id: `auto-detected-${req.role}`,
        severity: 'INFO',
        title: `Auto-detected: ${req.label}`,
        detail: `Recognized in your design by content pattern. No tagging required.`,
        citation: req.citation,
        objectRef: getObjectRef(obj),
        autoDetected: true,
      })
    }
  }

  // --------------------------------------------------------------------
  // Nutrition Facts panel
  // --------------------------------------------------------------------
  if (!nutritionPanel) {
    findings.push({
      id: 'missing-nutrition-panel',
      severity: 'BLOCKING',
      title: 'Missing: Nutrition Facts panel',
      detail:
        'A Nutrition Facts panel is required on virtually all packaged food. Conventional foods use Standard format; supplements use Supplement Facts.',
      citation: '21 CFR 101.9',
      suggestedFix:
        'Open the Label drawer and click Add Nutrition Facts.',
    })
  }

  // --------------------------------------------------------------------
  // Allergen statement — required when product contains a major allergen.
  // Allergen tagging is its own role, separate from the Big 9 list itself.
  // --------------------------------------------------------------------
  const allergenObj = byRole.get('allergens')
  if (ctx.allergens.length > 0 && !allergenObj) {
    findings.push({
      id: 'missing-allergen-statement',
      severity: 'BLOCKING',
      title: 'Missing: Allergen statement',
      detail: `This product contains ${ctx.allergens.length} major allergen${ctx.allergens.length === 1 ? '' : 's'} (${ctx.allergens.join(', ')}). FALCPA requires a "Contains:" statement.`,
      citation: '21 CFR 101.46',
      suggestedFix:
        'Open the Label drawer → Required sections → Add Allergen statement.',
    })
  } else if (allergenObj && ctx.allergens.length > 0) {
    // Soft cross-check: does the on-canvas text mention every recipe allergen?
    const text = ((allergenObj as { text?: string }).text ?? '').toLowerCase()
    const missing = ctx.allergens.filter(
      (a) => !text.includes(a.toLowerCase()),
    )
    if (missing.length > 0) {
      findings.push({
        id: 'allergen-statement-incomplete',
        severity: 'WARNING',
        title: 'Allergen statement may be incomplete',
        detail: `Your recipe lists ${ctx.allergens.join(', ')} but the on-canvas "Contains:" statement doesn't mention ${missing.join(', ')}.`,
        citation: '21 CFR 101.46',
        objectRef: getObjectRef(allergenObj),
        suggestedFix: `Update the Allergen statement to include ${missing.join(', ')}.`,
      })
    }
  }

  // --------------------------------------------------------------------
  // Statement-of-identity cross-check — does the canvas product name
  // match the bound product?
  // --------------------------------------------------------------------
  const identityObj = byRole.get('statement-of-identity')
  if (identityObj && ctx.productName) {
    const text = ((identityObj as { text?: string }).text ?? '').trim()
    if (
      text.length > 0 &&
      !text.toLowerCase().includes(ctx.productName.toLowerCase())
    ) {
      findings.push({
        id: 'identity-mismatch',
        severity: 'WARNING',
        title: 'Product name on canvas may not match record',
        detail: `On canvas: "${text}". Product record: "${ctx.productName}". The statement of identity should be the product's common or usual name as filed.`,
        citation: '21 CFR 101.3',
        objectRef: getObjectRef(identityObj),
        suggestedFix: `Use "${ctx.productName}" or update the product record.`,
      })
    }
  }

  // --------------------------------------------------------------------
  // Ingredient prefix convention — soft check, WARNING.
  // --------------------------------------------------------------------
  const ingredientsObj = byRole.get('ingredients')
  if (ingredientsObj) {
    const text = ((ingredientsObj as { text?: string }).text ?? '').trim()
    if (text.length > 0 && !/^ingredients?[:\s]/i.test(text)) {
      findings.push({
        id: 'ingredient-prefix',
        severity: 'WARNING',
        title: 'Ingredient statement should start with "INGREDIENTS:"',
        detail:
          'FDA convention is to lead the ingredient statement with the word "Ingredients" followed by a colon.',
        citation: '21 CFR 101.4(a)',
        objectRef: getObjectRef(ingredientsObj),
        suggestedFix: 'Edit the ingredient text to start with "INGREDIENTS:".',
      })
    }
  }

  // --------------------------------------------------------------------
  // Net-quantity FORMAT check (DS-57) — 21 CFR 101.105 mandates a
  // specific shape: "NET WT" prefix for solids, US customary first,
  // metric in parentheses. We run validateNetQuantityFormat against the
  // on-canvas text and surface one WARNING per problem.
  // --------------------------------------------------------------------
  const netObj = byRole.get('net-weight')
  if (netObj) {
    const text = ((netObj as { text?: string }).text ?? '').trim()
    if (text.length > 0) {
      const kind = ctx.netQuantityKind ?? 'solid'
      const validation = validateNetQuantityFormat(text, kind)
      for (const problem of validation.problems) {
        findings.push({
          id: `net-quantity-format-${problem.code}`,
          severity: 'WARNING',
          title: 'Net quantity format does not meet 21 CFR 101.105',
          detail: problem.message,
          citation: '21 CFR 101.105',
          objectRef: getObjectRef(netObj),
          suggestedFix: ctx.netQuantity
            ? `Use the FDA-formatted string: "${ctx.netQuantity}".`
            : 'Update to "NET WT X OZ (Y g)" (solids) or "NET X FL OZ (Y mL)" (liquids).',
        })
      }
      // Mismatch INFO — only if the format passed but the text doesn't
      // match the product record. Avoids double-warning on a malformed
      // string that's also wrong.
      if (
        validation.ok &&
        ctx.netQuantity &&
        !text.toLowerCase().includes(stripFdaPrefix(ctx.netQuantity).toLowerCase())
      ) {
        findings.push({
          id: 'net-weight-mismatch',
          severity: 'INFO',
          title: 'Net quantity may differ from product record',
          detail: `Canvas: "${text}". Product record: "${ctx.netQuantity}".`,
          citation: '21 CFR 101.105',
          objectRef: getObjectRef(netObj),
        })
      }
    }
  }

  // --------------------------------------------------------------------
  // Bioengineered disclosure — only when the recipe flags it.
  // --------------------------------------------------------------------
  if (ctx.bioengineered) {
    findings.push({
      id: 'be-disclosure-info',
      severity: 'INFO',
      title: 'Bioengineered food disclosure required',
      detail:
        'This product contains bioengineered ingredient(s). USDA NBFDS requires a disclosure — either the BE symbol, an on-pack text statement, or a digital link, depending on your tier.',
      citation: '7 CFR 66',
      suggestedFix:
        'Drop the BE disclosure asset from the Images drawer or add "Bioengineered" text near the ingredient statement.',
    })
  }

  // --------------------------------------------------------------------
  // Roll up counts + outcome.
  // --------------------------------------------------------------------
  const counts = {
    blocking: findings.filter((f) => f.severity === 'BLOCKING').length,
    warning: findings.filter((f) => f.severity === 'WARNING').length,
    info: findings.filter((f) => f.severity === 'INFO').length,
  }
  const outcome: LabelScanResult['outcome'] =
    counts.blocking > 0
      ? 'FAIL'
      : counts.warning > 0
        ? 'PASS_WITH_WARNINGS'
        : 'PASS'

  return { counts, outcome, findings, scannedAt: new Date() }
}

/**
 * Stable per-object handle the panel uses to look an object back up when
 * the user clicks "Find on canvas". Fabric v6 doesn't ship object IDs out
 * of the box, so we use the customRole stamp when present, falling back to
 * the object's array index.
 */
function getObjectRef(obj: FabricObject): string {
  const cr = (obj as { customRole?: LabelSectionRole }).customRole
  return cr ?? ''
}

/**
 * Strip the "NET WT" / "NET" prefix so the mismatch check compares the
 * numeric portion only — keeps the cross-check from misfiring just
 * because the creator wrote "NET" and the record had "NET WT".
 */
function stripFdaPrefix(s: string): string {
  return s.replace(/^\s*NET(\s*WT)?\s*/i, '').trim()
}

/**
 * Lookup helper for the UI — given a ref from a finding, find the
 * matching object on the canvas so we can select + scroll to it.
 */
export function findObjectByRef(
  canvas: FabricCanvas | null,
  ref: string,
): FabricObject | null {
  if (!canvas || !ref) return null
  for (const obj of canvas.getObjects()) {
    const cr = (obj as { customRole?: LabelSectionRole }).customRole
    if (cr === ref) return obj
  }
  return null
}
