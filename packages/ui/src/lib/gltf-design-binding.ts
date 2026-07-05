// Which of an imported glTF's materials should carry the creator's design, given the
// target surface (from the die-cut role). Pure decision — the three.js viewer collects
// material names + runs bindGltfMaterialsToSurfaces, then calls materialsForDesign to
// pick which to texture. Extracted here so the decision (the subtle part) is unit-tested
// independently of the un-testable three.js render path.

import { preferredFace, type BoxFace } from './surface-face'
import type { BindableSurface } from './gltf-surface-binding'

export type DesignFace = 'body' | 'top' | 'front'

/** Name-based fallback: does THIS material name look like it carries the design for the
 *  target surface? Lid sticker → cap/lid materials; body/front → label/body materials
 *  (and, as a safe default, anything not clearly a cap or base). */
export function materialTakesDesign(name: string, target: DesignFace): boolean {
  const n = name.toLowerCase()
  const isCap = /(lid|cap|closure|neck|top)/.test(n)
  const isBase = /(bottom|base|underside|foot)/.test(n)
  if (target === 'top') return isCap
  const isLabel = /(label|body|wrap|front|pdp|sleeve|main|panel|art)/.test(n)
  return isLabel || (!isCap && !isBase)
}

/** The box face the design targets for a given design surface. */
function targetBoxFace(target: DesignFace): BoxFace {
  return target === 'top' ? 'top' : 'front'
}

/**
 * Decide which material NAMES receive the design. Priority:
 *   1. EXACT: materials bound (via the admin surface map) to a surface matching the
 *      target face (top = lid; front/body = the front/body/side surfaces).
 *   2. HEURISTIC: material names that look like the target (materialTakesDesign).
 *   3. ALL: never render blank — if nothing matched, texture everything.
 * Pure + deterministic.
 */
export function materialsForDesign(
  materialNames: string[],
  binding: Record<string, string>,
  surfaces: BindableSurface[],
  target: DesignFace,
): string[] {
  if (surfaces.length > 0) {
    const face = targetBoxFace(target)
    const targetKeys = new Set(
      surfaces
        .filter((s) => {
          const f = preferredFace(s)
          return f === face || (face === 'front' && f !== 'top' && f !== 'bottom')
        })
        .map((s) => s.key),
    )
    const bound = materialNames.filter((n) => {
      const key = binding[n]
      return key !== undefined && targetKeys.has(key)
    })
    if (bound.length > 0) return bound
  }
  const heuristic = materialNames.filter((n) => materialTakesDesign(n, target))
  if (heuristic.length > 0) return heuristic
  return materialNames
}
