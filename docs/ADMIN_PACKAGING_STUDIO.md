# Admin 3D Packaging Studio — design spec

Status: **PROPOSAL (research + architecture)** · 2026-07-01 · not built yet.

Goal (Pavel): an **admin-only visual** way to manage packaging — not just the tabular
admin models we already have, but a real 3D studio where the admin can:

1. Create packages / import 3D (and 2D) packaging mockups and assign them to a package.
2. Curate, save, and organize **die-lines by category**.
3. For each 3D mockup, define **label surface borders** — clickable regions on the model
   that correspond to a die-line (a lid on top, a wrap on a jar, a full surface, a label
   that wraps a glass bottle + cap, a pizza-box top, …).
4. Clicking a surface opens the **2D Fabric.js canvas in the same place** (where the
   three.js surface was) to manage/curate the die-line(s) belonging to that surface.
5. Partners consume the result: in the Add-Product Packaging Studio step they click a
   surface → get sent to the 2D canvas for that die-line.

The admin authors the model + surfaces + die-line bindings; partners (and creators) design
into them.

---

## How the pros do it (research)

- **Pacdora** (closest consumer analogue): one browser flow that generates a **die-line**
  from dimensions, wraps **artwork onto the 3D model** in real time, offers a big **mockup
  library organized by category** (7000+), material/scene control, and export. The lesson:
  keep die-line ⇄ 3D ⇄ artwork in **one surface**, and lean on a **categorized mockup
  library**. ([Pacdora](https://www.pacdora.com/), [3D mockup guide](https://custompackagingpro.com/blog/pacdora-guide-2026-3d-packaging-mockups-dielines-and-product-design-online), [mockups by category](https://www.pacdora.com/mockups))
- **three.js clickable hotspots** (the "assign borders / clickable surface" mechanic): the
  established pattern is **raycast to a mesh/region**, and render interactive markers with
  **`CSS2DRenderer`** (HTML labels blended into 3D). Surfaces are prepared in Blender as
  named meshes / empty markers, or defined as **UV regions**, then mapped 3D→2D screen space
  for the click target. ([three.js hotspots](https://www.tetranyde.com/blog/hotspot-threejs/), [three.js forum: hotspots](https://discourse.threejs.org/t/how-to-add-hotspot-to-3d-models/17874), [custom UV mapping](https://discourse.threejs.org/t/custom-uv-mapping/38677))
- **Structural / decal pros** (Esko ArtiosCAD, Adobe Substance 3D Stager): parametric
  structural templates fold from a 2D die-line into 3D; **labels are placed as decals /
  UV-projected regions** onto a surface. Our "surface border → die-line" is exactly a
  named decal region bound to a die-line.

**Takeaways for us:**
- One studio surface: 3D model + clickable surfaces + inline 2D die-line editor (we already
  have the 3D↔flat fold + inline die-line editor — don't rebuild them).
- Surfaces = **named, categorized, clickable regions** with a die-line binding.
- A **categorized model + die-line library** is the backbone (we already have the taxonomy).
- Use **`CSS2DRenderer` markers + raycast** for the clickable borders; load imported mockups
  as **glTF/GLB**; keep parametric can/jar/box for the common cases.

---

## What already exists (build on this — don't restart)

- **`packaging-3d.ts`** (partner) — framework-agnostic **three.js controller** ported from
  `docs/prototypes/packaging-3d-studio-spike.html`: renders a parametric package
  (can/jar/box), **hover + click a decorable SURFACE**, and animates the **3D ↔ flat
  die-line fold**. three.js from CDN at runtime (no npm dep). `StudioSurfaceDef` already
  models a surface: `{ key, label, role, decorable, surfaceRole: 'pdp'|'info'|'other',
  part: 'body'|'lid', group, defaultBleedMm }`.
- **`PackagingStudioStep`** (partner Add-Product) — the full 3D studio step + inline
  **3D ⇄ die-line** editor (top bar + left rail + drawers). This is the click-through UX
  Pavel wants, already assembled.
- **`Dieline3DViewer`** (`@ilaunchify/ui`) — the 3D viewer component.
- **Admin `DielineCurator`** (`/dielines/[dielineId]`) — die-line curation (normalize,
  frames, ADMIN_VERIFIED) with the shared frame editor.
- **Schema (the important part — most of it is already here):**
  - `PackagingType` (admin-managed canonical package): **`model3dKey`** (imported glTF/GLB
    R2 key), `model3dSource`, `model3dThumbKey`, `defaultTopology`, **`containerCategory`**
    (categorization), `defaultDimensions`, **`defaultSurfaces` Json** (`[{name,
    defaultBleedMm}]`), `defaultDieCutTemplateId`, **`dielines PackagingDieline[]`**,
    `mockupTemplates`.
  - `PackagingDieline`: `surfaces Json` (`[{name, trimBox}]`), `frames`, `foldLines`,
    `trimBox`, `safeAreaBox`, `thumbnailKey`, `normalizedSvgKey`, `adminVerifiedAt`.

So: 3D import ✓, categorization ✓, surfaces (as JSON) ✓, die-lines per package ✓, the 3D
studio + fold + inline die-line editor ✓. **The gaps are the per-surface → die-line
binding + clickable-region geometry, and an admin authoring UI that ties it together.**

---

## Recommended architecture

Anchor everything on **`PackagingType`** (it's already the admin-managed canonical package
with a 3D model, category, surfaces, and die-lines). No new top-level model needed — the
work is (a) **enriching the surface JSON**, (b) an **admin authoring studio**, (c) the
**header entry**.

### 1. Enrich `PackagingType.defaultSurfaces` (additive JSON — no migration)

From `[{ name, defaultBleedMm }]` to a richer, self-describing surface:

```jsonc
{
  "key": "lid_top",
  "label": "Lid top",
  "role": "CLOSURE",              // CONTAINER | CLOSURE | WRAP | PANEL …
  "surfaceRole": "info",         // pdp | info | other  (already exists)
  "part": "lid",                 // body | lid | panel-N
  "defaultBleedMm": 2,
  // --- NEW: the clickable border on the 3D model ---
  "hotspot": {
    "meshName": "lid_top",       // named mesh in the glTF, OR
    "uvRect": { "x": 0.0, "y": 0.0, "w": 1.0, "h": 1.0 },   // UV region for a decal, OR
    "anchor": { "x": 0, "y": 1.1, "z": 0 }                   // 3D anchor for a CSS2D marker
  },
  // --- NEW: which die-line(s) this surface opens ---
  "dielineIds": ["<PackagingDieline id>"],   // one, or a set (variety multi-panel)
  "sortOrder": 1
}
```

This carries everything: the label, the role, the **clickable region** (mesh / UV / anchor),
and the **die-line binding**. It lives in the existing JSON column → **no migration**, just a
typed helper + admin editor. (If we later want per-surface indexing we can promote to a real
`PackagingSurface` table; JSON-first keeps V1 cheap and reversible.)

### 2. The admin authoring studio (reuse, don't rebuild)

A management surface + a 3D authoring canvas:

- **Model library** (categorized): list `PackagingType`s by `containerCategory`, with 3D
  thumbnail, surface count, die-line count, verified state. Create / import a model
  (`model3dKey` glTF/GLB upload to R2, or pick a parametric topology).
- **3D authoring canvas** (three.js, reuse `packaging-3d.ts` + `Dieline3DViewer`):
  - Load the model (parametric topology or imported glTF).
  - **Define surfaces / borders**: click a mesh (raycast) or draw a UV region → name it,
    set role/part/bleed → it becomes a **clickable hotspot** (CSS2DRenderer marker).
  - **Bind a die-line** to each surface (pick from this package's `dielines`, or create a
    new die-line for it → opens the die-line editor).
  - **Click a surface → 2D Fabric canvas in place**: reuse the existing inline 3D ⇄
    die-line editor (already in `PackagingStudioStep`) to design/curate that surface's
    die-line(s), then fold back to 3D.
- **Die-line management**: curate (normalize + frames + ADMIN_VERIFIED via the existing
  `DielineCurator` core), save, and organize by `containerCategory` / `PackagingType`.

Because the CanvasLayoutShell / three.js studio **can't be imported cross-app**, the
authoring canvas lives in the **creator app** (like `/studio` does) at a new admin route,
e.g. `/studio/packaging?admin=1&packagingTypeId=…`. The **model library + categorization
management** can live in the **admin app** (it's admin data) and deep-link into the canvas.

### 3. Partner consumption (already the flow)

In the Add-Product Packaging Studio step, a partner clicks a surface on the 3D model →
sent to the 2D canvas for that surface's die-line — which is exactly what the enriched
surface JSON now drives (`hotspot` + `dielineIds`).

### 4. Header access (admin)

A second top-bar icon next to "Design Studio (Admin)" — **"Packaging Studio (Admin)"**
(Box/Package icon) → `/go/packaging-studio` (same session-establishing bridge we just built)
→ the packaging authoring canvas. (Or, if we keep the library in the admin app, the icon
opens the admin model library, which deep-links into the canvas.)

---

## Data-model summary

| Need | Where it lives | New? |
|---|---|---|
| Imported 3D mockup (glTF/GLB) | `PackagingType.model3dKey` (+ source/thumb) | exists |
| 2D mockup image | `PackagingType.imageFileId` / `MockupTemplate` | exists |
| Categorization | `PackagingType.containerCategory` | exists |
| Surfaces on the model | `PackagingType.defaultSurfaces` JSON | **enrich shape** |
| Clickable border geometry | `defaultSurfaces[].hotspot` | **new (JSON)** |
| Surface → die-line binding | `defaultSurfaces[].dielineIds` | **new (JSON)** |
| Die-lines per package | `PackagingType.dielines[]` | exists |
| Die-line curation | `PackagingDieline` + `DielineCurator` | exists |

Net new **schema**: essentially none (JSON enrichment). Net new **build**: the admin
authoring studio UI + surface-authoring/hotspot tooling + the header entry.

---

## Phased build plan

- **P0 — Spec + typed surface model.** ✅ DONE 2026-07-01. `packages/ui/src/lib/
  packaging-surfaces.ts` — `PackagingSurface` + `resolvePackagingSurfaces` /
  `serializePackagingSurfaces` + helpers, JSON-first, legacy-compatible, golden test green.
- **P1 — Admin model library.** ✅ DONE 2026-07-01 (create + status; glTF import UI is
  P1.5). `apps/admin/.../packaging-studio` — visual grid by category, KPI strip, create
  model (name/topology/category), surface + die-line counts via the resolver. Header icon
  "Packaging Studio (Admin)" (Box) + sidebar entry. "Author 3D surfaces" is the disabled P2 seam.
- **P2 — 3D authoring canvas.** ✅ DONE 2026-07-01. Slice A: `/studio/packaging` surface
  editor (label/role/purpose/part/bleed/decorable) saving to `defaultSurfaces` via the
  resolver. Slice B: **live three.js viewer** (`Packaging3DView`, CDN-loaded, isolated from
  the partner studio) — parametric model per topology, clickable surface **markers**
  projected onto the model, drag-rotate + zoom, and a **"Place marker"** raycast mode that
  sets the selected surface's 3D `hotspot.anchor`. (Refinements to eyeball: glTF-import
  models + exact per-mesh borders come with P1.5.)
- **3D model import (glTF/glb).** ✅ DONE 2026-07-01. Admins can import a real 3D mockup
  per package from the studio Library drawer ("Import .glb" / Replace / Remove). Stored in
  R2 via `packagingModelAssetKey` + `uploadFile`; persisted to `PackagingType.model3dKey` +
  `model3dSource=UPLOAD` (existing fields — no migration). `attachPackagingModel3d` /
  `removePackagingModel3d` (catalog:write + audit); loader returns a signed `model3dUrl`.
  `Packaging3DView` loads the real mesh via GLTFLoader (jsDelivr r128 UMD), normalized +
  centered, with a **bulletproof parametric fallback** on any load failure (never breaks
  authoring). 40MB cap. NOTE: GLB render path is unverified in the build sandbox — eyeball
  live. Next: 2D mockup image import (needs a schema field), real thumbnails in the grid.

- **Entry points — grid AND studio (both).** ✅ DONE 2026-07-01. Two surfaces on purpose:
  the **management grid** at admin `/packaging-studio` (sidebar → Design Studio → Packaging
  Studio) for browsing/creating/deprecating the whole catalog; and the **Step-4 studio**
  opened from the **top-bar packaging icon** → `/go/packaging-studio` (creator app,
  Design Studio Admin Mode look). The studio opens with a **model picker in its Library
  drawer** (search + category chips + cards → deep-links `?packagingTypeId`); the grid's
  "Author surfaces" still deep-links a specific model. `loadPackagingModelList()` feeds the
  picker.

- **Shared Step-4 chrome — `PackagingStudioShell` (@ilaunchify/ui).** ✅ DONE 2026-07-01.
  Extracted the partner Step-4 chrome (top bar · 3D⇄Die-line toggle · left rail ·
  slide-out drawer · canvas) into a presentational `PackagingStudioShell` with a
  `mode` prop + data/callback slots. **Admin** (`SurfaceAuthoringClient`, creator app
  `/studio/packaging`) and **partner** (`PackagingStudioStep`, the hot file) both now
  render this shell — single source of truth for the studio frame. Server actions stay
  in each host (a UI package can't hold `'use server'`); each host binds its own
  actions to the shell's slots. Admin rail = Library (model + die-lines) · Surfaces
  (author borders + bind die-lines); partner rail unchanged (Library/Frames/Guides/
  Layers/Finishes). No runtime cost — sharing is source/build-time only; each app still
  bundles + runs its own copy per browser session.

- **P3 — Surface → die-line binding + click-through.** ✅ DONE 2026-07-01. Per-surface
  die-line multi-select binding, and **"Edit die-line" opens the shared `DielineFrameEditor`
  in place** (full view) loaded with the die-line's frames/trim/safe; auto-persists via
  `saveDielineFrames`; "Back to surfaces" returns. (Backdrop image = null for now — frames
  on a blank surface until signed-URL wiring; real backdrop lands with P1.5/storage.)
- **P4 — Partner consumption.** Ensure the Add-Product step reads the enriched surfaces so
  partner surface-clicks route to the right die-line.
- **P5 — Polish.** Materials/scene (Pacdora-style), export, per-surface previews.

Only P2/P3 are genuinely new 3D work; P0/P1/P4 mostly wire existing substrate.

## Open decisions (for Pavel)

1. **Library home:** model library in the **admin app** (deep-links into the creator canvas)
   vs. everything inside the creator canvas. Recommendation: **library in admin, canvas in
   creator** (matches how `/studio` already works, keeps management data in admin).
2. **Hotspot authoring model:** click named glTF meshes (needs well-prepared models) vs. draw
   UV/decal rectangles (works on any model, more flexible). Recommendation: **support both**,
   default to **draw-a-region** for imported mockups and **named surfaces** for parametric.
3. **Surface persistence:** JSON-first on `PackagingType.defaultSurfaces` (V1, no migration)
   vs. a dedicated `PackagingSurface` table (indexed, V2). Recommendation: **JSON-first**.
