# glTF ↔ surface binding — convention & plan

**Status:** convention locked + pure resolver shipped 2026-07-01. Render-time texture swap is
the remaining (browser-unverifiable) step. Part of Studio 3D+2D **deeper Phase 3**
(`STUDIO_ARCHITECTURE_3D_2D.md`).

## Problem

An imported glTF/glb is arbitrary geometry with named meshes/materials. To texture each face
from the **right die-line** (front = front label, lid = cap label, …) — and to route a click on
a face to that surface's editor — we must know which glTF **material** corresponds to which
authored **surface**. This doc is that mapping convention.

## The convention (authoring side)

When an admin imports a 3D model in the Packaging Studio, name the glTF **materials** (or
meshes) after the decorable surface they cover. Any of these resolve automatically:

1. **Exact surface key** — material `wrap` ↔ surface `key: "wrap"`. (Most explicit; preferred.)
2. **Part name** — material `lid_material` ↔ surface `part: "lid"`.
3. **Label keyword** — material `Front` ↔ surface `label: "Front wrap"`.
4. **Face keyword** — material `Cap` → top face; binds to a surface that also reads as top
   (Lid/Cap/Closure/Neck). Same rules as `assignSurfaceFaces` (`surface-face.ts`).

Materials that match nothing render as the plain **substrate** (no design) — safe default.

**Guidance for model prep:** name the printed material exactly the surface key. A can wrap →
material `wrap`; a carton → `front` / `back` / `left` / `right` / `top` / `bottom`.

## The resolver (shipped, tested)

`bindGltfMaterialsToSurfaces(materialNames, surfaces) → { [materialName]: surfaceKey }`
in `@ilaunchify/ui/lib/gltf-surface-binding` — pure, deterministic, framework-free.
Priority: exact key → part substring → label substring → keyword-face. Unmatched → omitted.
Covered by `gltf-surface-binding.test.ts` (7 checks, tsc+node harness — vitest can't run in the
sandbox). Face keywords reuse `preferredFace` from `surface-face.ts`.

## Render-time consumer (remaining — needs a real model to eyeball)

In `Packaging3DView` (admin) / a glTF-capable `Dieline3DViewer`, after `GLTFLoader` loads the
scene:

1. Walk `scene.traverse` collecting `mesh.material.name` for every mesh.
2. Call `bindGltfMaterialsToSurfaces(names, surfaces)`.
3. For each bound material, set `material.map` = the bound surface's die-line design texture
   (SVG/raster), `flipY=false`, `colorSpace=SRGBColorSpace`, `needsUpdate=true`.
4. On raycast click, read `hit.object.material.name` → look up the surface via the binding →
   open that surface's die-line editor (mirrors the parametric surface-marker flow).
5. Fallback: any mesh whose material isn't bound keeps its substrate material.

This step is deferred because it can't be verified without a browser + a real named glTF; the
binding logic it depends on is already tested. When a real model is available, wire steps 1–5
and eyeball.

## Why not auto-derive from UVs / geometry

We considered inferring faces from mesh position/normals. It's brittle across arbitrary models
(rotated exports, merged meshes, non-axis-aligned packs). Material-name convention is explicit,
predictable, and puts the (one-time) naming cost on model import — matching how Esko/Pacdora
treat the structural file as the authored source of truth.
