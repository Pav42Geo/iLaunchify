// Deterministic surface → box-face binding (Studio 3D+2D "deeper Phase 3").
//
// A multi-panel box needs each die-line SURFACE mapped to the right FACE of the 3D model.
// Earlier this was index-order (surface[0]→front, [1]→back, …) which is fragile. This maps
// by the surface's NAME / PART / ROLE using keyword rules, falls back to a stable order for
// unmatched surfaces, and never assigns the same face twice — so "Back panel", "Lid",
// "Front" land on back/top/front regardless of order.
//
// Pure + framework-free so it's unit-testable and reusable by any multi-panel consumer
// (AI coordinated sets, admin packaging studio, future glTF per-surface binding).

// The six faces of a box (source of truth; the 3D viewer imports this type). three
// BoxGeometry material order is [+X,-X,+Y,-Y,+Z,-Z] = [right,left,top,bottom,front,back].
export type BoxFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'

export interface SurfaceHint {
  label?: string | null
  part?: string | null
  role?: string | null
}

// Preference order for unmatched/overflow surfaces.
const FILL_ORDER: BoxFace[] = ['front', 'back', 'top', 'left', 'right', 'bottom']

// Keyword → face rules, checked in order. First hit wins.
const RULES: { face: BoxFace; keywords: string[] }[] = [
  { face: 'front', keywords: ['front', 'pdp', 'face', 'main', 'primary'] },
  { face: 'back', keywords: ['back', 'rear', 'info', 'nutrition', 'ingredient', 'supplement', 'drug'] },
  { face: 'top', keywords: ['top', 'lid', 'cap', 'closure', 'neck', 'header'] },
  { face: 'bottom', keywords: ['bottom', 'base', 'underside', 'foot'] },
  { face: 'left', keywords: ['left', 'side a', 'side-a', 'sidea'] },
  { face: 'right', keywords: ['right', 'side b', 'side-b', 'sideb'] },
  // Generic "side"/"wrap"/"panel" fall through to the fill order.
]

/** Best face for a single surface hint, or null when nothing matches by keyword. */
export function preferredFace(hint: SurfaceHint): BoxFace | null {
  const hay = `${hint.label ?? ''} ${hint.part ?? ''} ${hint.role ?? ''}`.toLowerCase()
  if (!hay.trim()) return null
  for (const rule of RULES) {
    if (rule.keywords.some((k) => hay.includes(k))) return rule.face
  }
  return null
}

/**
 * Assign a distinct box face to each surface, in input order. Keyword matches win first;
 * collisions and unmatched surfaces take the next free face from FILL_ORDER. Returns one
 * face per surface (undefined only if all six faces are already used — i.e. >6 surfaces).
 */
export function assignSurfaceFaces(surfaces: SurfaceHint[]): (BoxFace | undefined)[] {
  const used = new Set<BoxFace>()
  const nextFree = (): BoxFace | undefined => FILL_ORDER.find((f) => !used.has(f))

  // Pass 1 — honor keyword preferences where the face is still free.
  const out: (BoxFace | undefined)[] = surfaces.map(() => undefined)
  surfaces.forEach((s, i) => {
    const pref = preferredFace(s)
    if (pref && !used.has(pref)) {
      used.add(pref)
      out[i] = pref
    }
  })
  // Pass 2 — fill the rest (unmatched or preference-collided) with the next free face.
  surfaces.forEach((_, i) => {
    if (out[i] === undefined) {
      const f = nextFree()
      if (f) {
        used.add(f)
        out[i] = f
      }
    }
  })
  return out
}
