// =============================================================================
// Frame compliance gate — the submit-gate brain. docs/DIELINE_FRAME_EDITOR_SPEC.md §5.
// =============================================================================
//
// Pure + DB-free. Given a die-line's frame layout, the objects actually placed
// on the design, and the composition context, it decides whether the label may
// go to production. The guides are soft while editing; THIS is the hard gate at
// submit.
//
// For every REQUIRED frame that applies in this context:
//   • PRESENT   — a visible object of that role exists           (else MISSING)
//   • IN_BOUNDS — the object sits inside the surface safe area    (else OUT_OF_BOUNDS)
//   • FRESH     — recipe-derived objects match the current recipe (else STALE)
//
// The app collects `placed` from the canvas (role + visibility + normalized
// bounds + recipeHash) and supplies the current recipeHash + per-surface safe
// areas. Everything here is deterministic so it unit-tests + runs identically in
// the creator Studio CompliancePanel and in the server-side submit check.

import {
  type FrameKind,
  type FrameLayout,
  type NormBox,
  type FrameContext,
  requiredFrames,
} from './frames'

export type ComplianceStatus = 'pass' | 'fail'
export type CheckCode = 'MISSING' | 'OUT_OF_BOUNDS' | 'STALE'

/** An object actually placed on the design, in the same normalized space as frames. */
export interface PlacedObject {
  kind: FrameKind
  visible: boolean
  box: NormBox
  surfaceId?: string
  /** Recipe-derived objects carry the hash of the recipe they were generated from. */
  recipeHash?: string | null
}

export interface ComplianceContext extends FrameContext {
  /** Hash/snapshot of the current recipe — recipe-derived objects must match. */
  currentRecipeHash?: string | null
  /** Safe-area box per surface (key = surfaceId; PRIMARY_SURFACE for the default). */
  safeAreaBySurface?: Record<string, NormBox>
}

export interface CheckIssue {
  code: CheckCode
  message: string
}

export interface FrameCheck {
  frameId: string
  kind: FrameKind
  surfaceId?: string
  status: ComplianceStatus
  issues: CheckIssue[]
}

export interface ComplianceReport {
  status: ComplianceStatus
  checks: FrameCheck[]
  failureCount: number
}

export const PRIMARY_SURFACE = '__primary__'

/**
 * Canonical map from a canvas object's role to the frame KIND it satisfies, so
 * the gate (and Code's Studio wiring) agree on what a placed object counts as.
 * `customType` = CanvasCustomType (panels/badge/barcode); `customRole` =
 * LabelSectionRole (DS-55 text-section tags). Returns null for untagged/creative
 * objects (logos, free text, imagery) which don't satisfy any required slot.
 */
export function frameKindFromCanvasRole(
  customType?: string | null,
  customRole?: string | null,
): FrameKind | null {
  switch (customRole) {
    case 'statement-of-identity': return 'STATEMENT_OF_IDENTITY'
    case 'ingredients': return 'INGREDIENTS'
    case 'allergens': return 'ALLERGENS'
    case 'net-weight': return 'NET_QUANTITY'
    case 'manufacturer-info': return 'MANUFACTURER'
  }
  switch (customType) {
    case 'nutrition-panel':
    case 'nutrition-aggregate-panel':
    case 'supplement-panel':
    case 'aafco-panel':
    case 'drug-facts-panel':
      return 'NUTRITION_FACTS'
    case 'barcode': return 'BARCODE'
    case 'cert-badge': return 'CERTIFICATIONS'
  }
  return null
}

/**
 * Small deterministic string hash (FNV-1a, base36). Use it to stamp a
 * recipe-derived object with the recipe it was generated from, so the gate's
 * staleness check is a cheap string compare:
 *   recipeHash(JSON.stringify(orderedIngredientFingerprint))
 */
export function stableHash(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

const EPS = 0.005 // ~0.5% tolerance for box containment

/** Is inner fully inside outer (with tolerance)? */
function contains(outer: NormBox, inner: NormBox): boolean {
  return (
    inner.x >= outer.x - EPS &&
    inner.y >= outer.y - EPS &&
    inner.x + inner.w <= outer.x + outer.w + EPS &&
    inner.y + inner.h <= outer.y + outer.h + EPS
  )
}

const RECIPE_DERIVED = new Set<FrameKind>(['NUTRITION_FACTS', 'INGREDIENTS', 'ALLERGENS'])

function humanKind(k: FrameKind): string {
  return k
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * Validate a design against its die-line's required frames. `block` = there is
 * at least one failing required frame.
 */
export function checkFrameCompliance(
  layout: FrameLayout | null | undefined,
  placed: PlacedObject[],
  ctx: ComplianceContext,
): ComplianceReport {
  const checks: FrameCheck[] = []

  for (const rf of requiredFrames(layout, ctx)) {
    const frame = rf.frame
    const surfaceKey = frame.surfaceId ?? PRIMARY_SURFACE
    const issues: CheckIssue[] = []

    // 1. PRESENT — a visible object of this role on the same surface.
    const match = placed.find(
      (o) =>
        o.kind === frame.kind &&
        o.visible &&
        (o.surfaceId ?? PRIMARY_SURFACE) === surfaceKey,
    )

    if (!match) {
      issues.push({
        code: 'MISSING',
        message: `${humanKind(frame.kind)} is required but missing or hidden.`,
      })
    } else {
      // 2. IN_BOUNDS — inside the surface safe area (skip if no safe area supplied).
      const safe = ctx.safeAreaBySurface?.[surfaceKey]
      if (safe && !contains(safe, match.box)) {
        issues.push({
          code: 'OUT_OF_BOUNDS',
          message: `${humanKind(frame.kind)} extends outside the safe area.`,
        })
      }
      // 3. FRESH — recipe-derived objects must match the current recipe.
      if (RECIPE_DERIVED.has(frame.kind) && ctx.currentRecipeHash != null) {
        if (match.recipeHash !== ctx.currentRecipeHash) {
          issues.push({
            code: 'STALE',
            message: `${humanKind(frame.kind)} is out of date — refresh it to match the current recipe.`,
          })
        }
      }
    }

    checks.push({
      frameId: frame.id,
      kind: frame.kind,
      surfaceId: frame.surfaceId,
      status: issues.length === 0 ? 'pass' : 'fail',
      issues,
    })
  }

  const failureCount = checks.filter((c) => c.status === 'fail').length
  return {
    status: failureCount === 0 ? 'pass' : 'fail',
    checks,
    failureCount,
  }
}
