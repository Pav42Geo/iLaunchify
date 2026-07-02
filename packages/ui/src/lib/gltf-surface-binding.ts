// glTF material → surface binding (Studio 3D+2D "deeper Phase 3", render-time half).
//
// An imported glTF has named meshes/materials (e.g. "Front", "body_wrap", "Lid"). To texture
// each face from the RIGHT die-line, we bind each glTF MATERIAL NAME to one of the model's
// authored SURFACES (key/label/part/role). This is the pure resolver — the three.js consumer
// then swaps `material.map` for the bound surface's design. Deterministic + framework-free so
// it's unit-testable; the actual texture swap (unverifiable in CI) lives in the viewer.
//
// Matching priority per material name: (a) exact surface KEY, (b) PART substring either way,
// (c) LABEL substring either way, (d) keyword FACE match (Front↔front, Lid↔top, …). Unmatched
// materials get no binding (render as substrate).

import { preferredFace, type SurfaceHint } from './surface-face'

export interface BindableSurface extends SurfaceHint {
  key: string
}

const norm = (s?: string | null): string =>
  (s ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

/** Resolve `{ materialName: surfaceKey }` bindings for an imported glTF's materials. */
export function bindGltfMaterialsToSurfaces(materialNames: string[], surfaces: BindableSurface[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const mat of materialNames) {
    const m = norm(mat)
    if (!m) continue

    // a. exact surface key
    let hit = surfaces.find((s) => norm(s.key) === m)
    // b. part substring (either direction)
    if (!hit) hit = surfaces.find((s) => s.part && contains(m, norm(s.part)))
    // c. label substring (either direction)
    if (!hit) hit = surfaces.find((s) => s.label && contains(m, norm(s.label)))
    // d. keyword face match (both the material name and the surface resolve to the same face)
    if (!hit) {
      const mf = preferredFace({ label: mat })
      if (mf) hit = surfaces.find((s) => preferredFace(s) === mf)
    }

    if (hit) out[mat] = hit.key
  }
  return out
}

function contains(a: string, b: string): boolean {
  if (!a || !b) return false
  return a.includes(b) || b.includes(a)
}
