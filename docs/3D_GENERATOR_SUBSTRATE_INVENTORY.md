# In-House 3D Packaging Generator — Substrate Inventory

**Date:** 2026-07-03 · **Status:** Research complete, ready for build planning

---

## Executive Summary

iLaunchify has substantial 3D/die-line infrastructure **locked in place and production-ready**. The architecture is **three-layer (die-line master → design canvas → 3D preview)**, with die-line normalization, glTF surface binding, and parametric fallback all implemented. 

**What's shipped:** Three.js viewer, die-line SVG generation/parsing, surface binding logic, multi-panel box support, creator live preview, mockup modal, and full schema support.

**What's stubbed:** Parametric geometry engine output structure, die-cut outline generator, fold-from-net animation (Phase 5), and glTF render-time texture binding verification.

**Plan impact:** The in-house generator can build on this foundation. No rework of existing infrastructure needed; the plan must deliver: (1) parametric geometry engine, (2) die-cut outline SVG from net, (3) wire glTF material texture binding in render, (4) multi-component assembly positioning.

---

## (A) WHAT EXISTS AND WORKS TODAY

### 1. Three.js 3D Viewer (Production)

**Path:** `/packages/ui/src/canvas/Dieline3DViewer.tsx`  
**Status:** ✅ Fully shipped, tested, integrated into two creator UI surfaces

**Shapes supported:**
- `BOX` (rigid rectangular structures: cartons, trays, boxes)
- `CYLINDER` (wraps, sleeves, bottles, jars)
- `FLAT` (pouches, sachets, stickers, cards)
- Category-to-shape mapping: 15+ die-cut types (BOTTLE_WRAP→CYLINDER, BOX_PANEL→BOX, etc.)

**Inputs:**
- `widthMm, heightMm, depthMm` (dimensions in mm)
- `textureSvg?: string` (SVG string, takes priority)
- `textureImageUrl?: string` (raster image URL, fallback)
- `faces?: Partial<Record<BoxFace, FaceTexture>>` (per-face textures for multi-panel boxes)
- `baseColor?: string` (substrate hex, default #f2efe7)

**Features:**
- Manual orbit + zoom (no OrbitControls addon — self-contained, ~700 lines)
- Hinged lid for boxes (open/close slider; validates fold geometry visually)
- Raycaster click-to-select (returns u, v UVs in 0..1 + face for multi-panel routing)
- Frame capture for PNG download (`preserveDrawingBuffer`)
- Texture pipeline: raster via TextureLoader (anisotropy=4), SVG via data URI, multi-material per face
- Texture management: flipY=false, colorSpace=SRGBColorSpace (industry standard for artwork)
- Responsive (ResizeObserver)

**Deployed in:**
- **LivePreview3DDock** (creator Design Studio) — live updates every ~450ms as you design
- **MockupModal** (creator Mockup preview) — one-shot snapshot on modal open
- **Packaging3DView** (admin surface-authoring) — parametric + real glTF with fallback

**Materials/Lighting:**
- Ambient light (0.75 intensity)
- Key light (1.1 intensity, 3,5,4 position)
- Fill light (0.4 intensity, -4,2,-3 position)
- Per-surface material: MeshStandardMaterial (roughness 0.7–0.85, metalness 0.04–0.1)

### 2. Die-line SVG Generation (Production)

**Path:** `/packages/ui/src/canvas/dielineSvg.ts`  
**Status:** ✅ Shipped, pure function, unit-tested (5 test cases)

**Input:** DielineSpecInput
```ts
{
  widthMm: number          // trim width
  heightMm: number         // trim height
  bleedMm?: number         // bleed inset (default 3)
  safeAreaMm?: number      // safe-area inset from trim (default 3)
  trimBox?: { x, y, w, h } // explicit trim (overrides derived)
  safeAreaBox?: { x, y, w, h } // explicit safe area
  foldLines?: Array<{ x1, y1, x2, y2, type: 'VALLEY'|'MOUNTAIN'|'PERFORATION' }>
  surfaces?: Array<{ name, trimBox? }>  // multi-surface dies
}
```

**Output:** Complete `<svg>` document string (mm units, viewBox locked to bleed+trim)

**Stroke conventions (industry standard, locked in code):**
- Trim: `#00AEEF` (cyan, solid)
- Bleed: `#9AA0A6` (gray, dashed 2/1.5)
- Safe area: `#34A853` (green, dashed 1/1)
- Valley fold: `#D6219B` (magenta, solid)
- Mountain fold: `#EA4335` (red, solid)
- Perforation: `#F29900` (orange, dashed 1.5/1)

**Features:**
- Degenerate input handling (0 dims → minimal valid SVG, never throws)
- Per-surface labeling (text label on each surface trim box)
- White substrate background (full bleed area)
- Pure, no DOM/I/O, unit-verifiable

**Used by:**
- Frame editor (canvas overlay)
- Normalized template storage (R2 key: `normalizedSvgKey`)
- Compliance rendering
- Partner/admin viewing

### 3. Die-line SVG Auto-Parse (Partial)

**Path:** `/packages/ui/src/canvas/dielineParse.ts`  
**Status:** ✅ Shipped (SVG recognizer); PDF parse deferred (C9.d background job)

**Input:** SVG string (from partner upload)

**Output:** DielineParseResult
```ts
{
  sheetW, sheetH: number           // detected artwork size
  trimBox, bleedBox, safeBox: ParsedBox | null
  foldLines: Array<ParsedFold>     // with type: VALLEY|MOUNTAIN|PERFORATION
  confidence: { trim, bleed, safe, folds } // 0..1 per field
  parseAccuracyScore: number       // overall 0..1
  unrecognized: string[]           // coverage: elements we couldn't classify
}
```

**Authority layers (decreasing):**
1. **Name match** (layer/id/class/inkscape:label): confidence 0.95
   - Keywords: `die|cut|cutter|dieline|trim` → trim
   - `bleed` → bleed
   - `safe|safety|live` → safe
   - `crease|fold|score` → fold
   - `perf` → perforation

2. **Color convention**: confidence 0.80
   - Cyan (b>150, g>120, r<90) → trim
   - Magenta (r>150, b>120, g<90) → fold
   - Green (g>110, r<120, b<120) → safe
   - Yellow (r>180, g>140, b<90) → perforation
   - Gray (|r-g|<40, |g-b|<40) → bleed

3. **Geometry inference** (fallback): confidence 0.50
   - Largest rect → bleed
   - Mid rect → trim
   - Smallest → safe
   - Straight line segments → folds (unless classified by name/color)

**Coverage guarantee:** Every `<rect>`, `<line>`, `<path>`, `<circle>`, `<polygon>`, `<ellipse>`, `<image>` is either classified or reported in `unrecognized` (nothing silently dropped).

**Used for:**
- C9.d pipeline (partner die-line ingest)
- Parse-accuracy scoring (gates ADMIN_VERIFIED status)
- Conversion Verifier (overlay + measurement audit)

### 4. glTF Material → Surface Binding (Production)

**Path:** `/packages/ui/src/lib/gltf-surface-binding.ts`  
**Status:** ✅ Pure resolver shipped, unit-tested (7 checks), framework-free

**Input:**
- `materialNames: string[]` (from glTF mesh.material.name)
- `surfaces: BindableSurface[]` (from PackagingType.defaultSurfaces)

**Output:**
- `Record<string, string>` (materialName → surfaceKey map, deterministic)

**Algorithm (priority order):**
1. **Exact key match** — material `wrap` ↔ surface `key: "wrap"`
2. **Part substring** (bidirectional) — material `lid_material` ↔ surface `part: "lid"`
3. **Label substring** (bidirectional) — material `Front` ↔ surface `label: "Front wrap"`
4. **Face keyword** — material `Cap` resolves to top face; if a surface matches that face, bind it
   - Face keywords: Front/PDP/Primary→front, Back/Nutrition/Info→back, Lid/Cap/Closure/Neck→top, Bottom/Base/Underside→bottom, Left/Side-A→left, Right/Side-B→right

**Unmatched materials:** Omitted from output (render as substrate in three.js)

**Properties:**
- Deterministic (same inputs → same output)
- Collision-free (each material binds to ≤1 surface)
- Normalization-safe (case-insensitive, whitespace-tolerant)

**Render-time consumer (documented in `/docs/GLTF_SURFACE_BINDING.md`, unverified pending real glTF):**
1. Walk scene.traverse, collect mesh.material.name for every mesh
2. Call `bindGltfMaterialsToSurfaces(names, surfaces)`
3. For each bound material: set `material.map = designTexture`, `flipY=false`, `colorSpace=SRGBColorSpace`, `needsUpdate=true`
4. On raycast click: read `hit.object.material.name`, look up surface via binding, open that surface's editor
5. Fallback: unbound meshes keep substrate material

### 5. Deterministic Surface → Box Face Binding (Production)

**Path:** `/packages/ui/src/lib/surface-face.ts`  
**Status:** ✅ Shipped, unit-tested (12 checks), collision-free + stable

**Functions:**

**`preferredFace(hint: SurfaceHint): BoxFace | null`**
- Resolves a single surface (label, part, role) to a box face using keyword rules
- Returns null if nothing matches
- Rules (checked in order):
  - front: `['front', 'pdp', 'face', 'main', 'primary']`
  - back: `['back', 'rear', 'info', 'nutrition', 'ingredient', 'supplement', 'drug']`
  - top: `['top', 'lid', 'cap', 'closure', 'neck', 'header']`
  - bottom: `['bottom', 'base', 'underside', 'foot']`
  - left: `['left', 'side a', 'side-a', 'sidea']`
  - right: `['right', 'side b', 'side-b', 'sideb']`

**`assignSurfaceFaces(surfaces: SurfaceHint[]): (BoxFace | undefined)[]`**
- Assigns one distinct face per surface, in input order
- **Pass 1:** Honor keyword preferences where the face is still free
- **Pass 2:** Fill remaining (unmatched or collided) with next free face from fill order
- **Fill order:** `['front', 'back', 'top', 'left', 'right', 'bottom']` (stable)
- Returns undefined for each surface if all 6 faces are exhausted (>6 surfaces)

**Material order in three.js BoxGeometry:** `[+X,-X,+Y,-Y,+Z,-Z]` = `[right,left,top,bottom,front,back]` (locked in viewer)

**Used by:**
- Multi-panel box rendering (Dieline3DViewer)
- AI coordinated sets (stitching multi-surface assets)
- glTF binding fallback (when material names don't match, infer from surface hints)

### 6. Packaging Surfaces Resolver (Production)

**Path:** `/packages/ui/src/lib/packaging-surfaces.ts`  
**Status:** ✅ Shipped, pure, backward-compatible

**Data structures:**

**SurfaceRole** (enum): `'CONTAINER' | 'CLOSURE' | 'WRAP' | 'PANEL' | 'OTHER'`  
**SurfacePurpose** (enum): `'pdp' | 'info' | 'other'`

**SurfaceHotspot** (union):
- `meshName?: string` — named mesh in imported glTF (e.g., "wrap_material")
- `uvRect?: { x, y, w, h }` — 0..1 UV rectangle for decal projection (works on any model)
- `anchor?: { x, y, z }` — 3D point for CSS2D marker (label position)
- At least one must be present (validated)

**PackagingSurface** (full type):
```ts
{
  key: string              // unique slug within model (e.g., "wrap", "front_panel")
  label: string            // human name ("Front Label", "Can Wrap")
  role: SurfaceRole        // CONTAINER | CLOSURE | ...
  surfacePurpose: SurfacePurpose // pdp (product display panel) | info (back panel) | other
  part?: string            // free-form ("body", "lid", "panel-1") — matches 3D controller
  decorable: boolean       // is a partner/creator designing into this surface?
  defaultBleedMm: number   // bleed for die-cut (default 3)
  hotspot?: SurfaceHotspot // where it sits on the 3D model
  dielineIds: string[]     // PackagingDieline IDs this surface opens
  sortOrder: number        // stable input order
}
```

**Key functions:**
- `resolvePackagingSurfaces(raw: unknown): PackagingSurface[]` — parse JSON from PackagingType.defaultSurfaces (strict type coercion, deduplicates keys)
- `serializePackagingSurfaces(surfaces): unknown[]` — serialize back to JSON
- `decorableSurfaces(surfaces)` — filter by `decorable===true`
- `unboundSurfaces(surfaces)` — filter by `dielineIds.length===0` (admin's "to-bind" list)
- `surfaceForDieline(surfaces, dielineId)` — find surface that owns a die-line

**Schema:** `PackagingType.defaultSurfaces: Json?` (no new table needed; backward-compatible with legacy `[{ name, defaultBleedMm }]` shape)

### 7. Admin Packaging 3D View (Partial)

**Path:** `/apps/creator/src/app/(studio)/studio/packaging/Packaging3DView.tsx`  
**Status:** ✅ Shipped (admin surface-authoring tool); parametric + glTF fallback

**Parametric topology dimensions:**
```ts
function dimsFor(topology: string): {
  r: number        // half-width (cylinder radius or box half-width)
  h: number        // height
  d: number        // depth (boxes) or thickness (flat)
  kind: 'cyl' | 'box'
  lid: boolean     // has a separate lid?
}
```

**Supported topologies:**
- CAPSULE_JAR: r=1, h=1.8, cyl+lid
- TUBE: r=0.5, h=2.2, cyl+lid
- SINGLE_CONTAINER: r=0.9, h=2.2, cyl, no lid
- POUCH_STAND_UP, POUCH_FLAT: r=1, h=2.2, box, no lid
- STICK_PACK, SACHET: r=0.35, h=2.4, box, no lid
- MULTI_CONTAINER_BOX, CASE: r=1.4, h=2.0, box, no lid
- DEFAULT: r=1, h=2, d=1, box, no lid

**Features:**
- Parametric fallback generation (BoxGeometry + CylinderGeometry + positioned lid)
- Real glTF loading from signed R2 URL (GLTFLoader CDN) with parametric fallback on error
- Auto-scale glTF to ~2.4 units, center to origin
- Surface markers (3D → screen projection via Raycaster)
- **Place mode:** Click the 3D model to set a surface's hotspot anchor (stored on surface.hotspot.anchor)
- Default anchor inference (top surfaces → high, body surfaces → spread around front/sides)
- Manual orbit + zoom + raycasting (no OrbitControls addon)

**Camera setup:** Positioned high + centered, looking slightly below origin (keeps model on-screen)

### 8. Multi-Panel Box + Deterministic Face Binding (Production)

**Path:** Dieline3DViewer + assignSurfaceFaces  
**Status:** ✅ Phase 3 shipped (commit c651d55)

**Type:**
```ts
type BoxFace = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom'
interface FaceTexture {
  svg?: string | null
  imageUrl?: string | null
}
```

**API:**
- `Dieline3DViewer.faces?: Partial<Record<BoxFace, FaceTexture>>`
- Each face renders its own texture (SVG or raster image)
- Falls back to single texture if `faces` is undefined

**Click raycasting (Phase 2b):**
- Returns `{ u: number, v: number, face?: BoxFace }`
- Host can route to that face's surface editor (via bound surface)

**Material order (three.js BoxGeometry standard):**
- `[+X,-X,+Y,-Y,+Z,-Z]` = `[right,left,top,bottom,front,back]`
- Mapped to MATERIAL_FACE_ORDER constant in viewer

### 9. Creator Live 3D Preview (Production)

**Path:** `/apps/creator/src/app/(studio)/products/[productId]/design/canvas/LivePreview3DDock.tsx`  
**Status:** ✅ Phase 2/2b shipped

**Live snapshot subscription:**
- Subscribes to Fabric canvas events: `object:modified`, `object:added`, `object:removed`, `text:changed`
- Re-snapshots canvas every ~450ms (throttled)
- Texture updates live as you design (Pacdora moment)

**Click-to-select (Phase 2b):**
- Raycast 3D click → UV coordinates → canvas pixel coordinates (`u·widthMm·pxPerMm`, `v·heightMm·pxPerMm`)
- Hit-test Fabric objects top-down, skipping non-selectable (die-line, guides, locked truth panels)
- `setActiveObject` on match → selected object highlights in design canvas

**Shape override:** Creator can manually switch 3D shape for what-if preview (default: auto-derive from die-cut category)

**Features:**
- Dock behavior (collapsible, bottom-right button)
- PNG download via captureRef
- Expand/collapse (320px → 560px width)
- Throttled updates (no per-frame snapshotting — expensive)

### 10. Creator Mockup Preview (Production)

**Path:** `/apps/creator/src/app/(studio)/products/[productId]/design/canvas/MockupModal.tsx`  
**Status:** ✅ Phase 1 shipped; Phase 2 (real photo mockups) in progress

**Variants:**

**CSS/SVG stylized (Phase 1):**
- BOTTLE_WRAP: curved bottle with label wrapped via radial gradient
- TUB_LID: tub viewed from front with lid + side band
- POUCH_FRONT: stand-up pouch with label as front face
- BOX_PANEL: carton at 3D angle with label as panel
- STICKER: flat label on plain surface

**Real photo mockups (Phase 2, when curated):**
- `StudioMockup` type: imageUrl + printAreaQuad (4 corners as 0..1 in image)
- Quad warp via `matrix3dForQuad` (CSS 3D transform)
- Optional surfaceKey binding (map mockup to "front", "back", "wrap", "lid")

**Output:**
- PNG snapshot (flat or warped onto product photo)
- Save to product mockup chain (`saveDesignMockupRender`)
- Download to device

**Mockup switching:**
- Multiple mockups supported (front, back, wrap, lid)
- Creator browses via surface selector
- Defaults to product photo variant if curated, else stylized shape

### 11. Schema: Model3D Fields (Locked P1)

**Path:** `/packages/db/prisma/schema.prisma` (lines ~5185–5250)

**Enum:**
```prisma
enum Model3DSource {
  PACDORA_IMPORT // from Pacdora API (licensed)
  UPLOAD         // partner/admin uploaded glTF/glb
  PARAMETRIC     // generated from topology + dims (future)
}
```

**PackagingType fields:**
```prisma
model PackagingType {
  // ... existing ...
  model3dKey      String?         // R2 storage key for glTF/glb
  model3dSource   Model3DSource?  // provenance
  model3dThumbKey String?         // preview thumbnail
  defaultSurfaces Json?           // [{ key, label, role, part, decorable, defaultBleedMm, hotspot, dielineIds, sortOrder }]
  defaultTopology PackagingTopology
  containerCategory ContainerCategory?
  // ... relations ...
}
```

**PackagingDieline fields:**
```prisma
model PackagingDieline {
  // ... existing ...
  widthMm         Decimal?
  heightMm        Decimal?
  depthMm         Decimal?
  bleedMm         Decimal @default(3.0)
  trimBox         Json?           // {x,y,w,h}
  safeAreaBox     Json?
  foldLines       Json?           // [{x1,y1,x2,y2,type}]
  surfaces        Json?           // [{name, trimBox}] for multi-surface dies
  frames          Json?           // FrameLayout
  normalizedSvgKey String?        // R2 key for normalized SVG
  parseAccuracyScore Decimal?     // 0..1
  canonicalShapeId String?        // FK to DieCutTemplate (P2 mapping)
  // ... relations ...
}
```

**DieCutTemplate fields:**
```prisma
model DieCutTemplate {
  // ... existing ...
  model3dKey String?  // (V1.5+) canonical shape 3D hint
  // ... relations ...
}
```

**PackagingComponent (multi-component ready, positioning stubbed):**
```prisma
model PackagingComponent {
  // ... existing ...
  // Future: widthMm, heightMm, depthMm (per-instance overrides)
  // Future: childLayout Json? (positioning hints for children in parent)
}
```

---

## (B) WHAT'S SCHEMA-ONLY OR STUBBED

### 1. Model3DSource.PARAMETRIC

- **Status:** Enum value exists; no generator behind it
- **Parametric fallback in Packaging3DView:** Works but generates only basic primitives
  - Cylinder: `CylinderGeometry(radius, radius, height, 48 segments)`
  - Box: `BoxGeometry(2·r, h, d, 1, 1, 1)` (no subdivisions)
  - Flat: `PlaneGeometry(w, h)`
  - Optional lid: `CylinderGeometry(r·1.04, r·1.04, h·0.18)` positioned at top
- **Gap:** No topology → structured parametric geometry
  - Missing: Die-cut outline (trim/bleed/safe boxes + fold lines as structured data)
  - Missing: Glue tab placement (for carton nets)
  - Missing: Fold crease metadata (valley vs. mountain)
  - Missing: Complex topologies (compartment pouches, self-locking cartons, sleeve assembly)

### 2. Fold-from-Net Simulation

- **Status:** Dieline3DViewer has a lid hinge for BOX shapes (open/close slider, ~120° rotation)
- **Gap:** No full unfold (3D → flat net) or fold (flat net → 3D) animation
- **Verification:** Works for simple boxes; unverified for complex topologies
- **Documentation promised:** DIELINE_MANAGEMENT_UX §8, PACKAGING_3D_SPIKE_FINDINGS §2 ("fold from net engine")
- **Promised scope:** Conversion Verifier 3D preview (detect mis-folded geometry)

### 3. glTF Render-Time Texture Binding

- **Status:** Material name → surface binding logic **shipped + tested**
- **Gap:** Actual three.js texture swap (material.map assignment) in a glTF consumer **documented but unverified**
- **Reason:** Requires browser + real named glTF to eyeball; cannot be verified in CI
- **Documentation:** `/docs/GLTF_SURFACE_BINDING.md` §"Render-time consumer" (step-by-step pseudocode)
- **Remaining work:** Wire the binding result into three.js scene traversal; verify material textures update

### 4. Multi-Component Assembly + Positioning

- **Schema:** `PackagingComponent.childLayout: Json?` (stub for positioning hints)
- **Status:** Composition model (hierarchy, per-component die-line) **fully modeled**
- **Gap:** Positioning logic (how children sit inside parent in 3D) **not implemented**
- **Example:** 6 cans inside a carton (3 rows × 2 columns; each can has its own die-line)
- **Scope:** Unlocks variety packs, samplers, gift sets

### 5. Canvas Texture Integration (Documented, Not Yet Wired)

- **Status:** Documented in `/docs/STUDIO_ARCHITECTURE_3D_2D.md` §"Technical pattern"
- **Current:** Works for parametric + raster snapshots (Dieline3DViewer uses TextureLoader)
- **Gap:** Full `THREE.CanvasTexture` pipeline **not wired into glTF material.map swap**
- **Documented pattern (unimplemented):**
  - One CanvasTexture per editable panel
  - `texture.needsUpdate = true` from Fabric `after:render` event (on-change, not per-frame)
  - `texture.flipY = false` (Fabric renders flipped)
  - `texture.colorSpace = THREE.SRGBColorSpace` (else colors shift)
  - Buffer → GPU upload happens only on needsUpdate=true (cost optimization)

### 6. PDF Die-line Parse

- **Status:** SVG parse **shipped**; PDF parse is **separate C9.d background job** (unbuilt)
- **Schema:** `PackagingDieline.originalFileFormat` tracks what format was uploaded
- **Scope:** PDF → structured spec (trim/bleed/safe/fold) via pdf-parse + fallback AI
- **Note:** SVG text recognizer is the immediate need (PDF is future work per spike findings)

---

## (C) GAPS THE IN-HOUSE 3D GENERATOR PLAN MUST FILL

### For Phase 1 (Parametric + Die-cut):

**1. Parametric Geometry Engine**
- **Input:** `PackagingTopology + widthMm, heightMm, depthMm`
- **Output:** Structured object with:
  - Three.js geometry (BoxGeometry / CylinderGeometry + positioned lid/base)
  - Material assignment hints (named meshes: "body", "lid", "base", "panel-N")
  - Fold line metadata (crease points + type: VALLEY|MOUNTAIN|PERFORATION)
  - Per-face labeling (which face is front/back/top/lid/etc.)
- **Must cover:** All 10 PackagingTopology values (SINGLE_CONTAINER, POUCH_STAND_UP, TUBE, CAPSULE_JAR, MULTI_CONTAINER_BOX, CASE, STICK_PACK, SACHET, POUCH_FLAT, OTHER)
- **Nice-to-have:** Glue tab placement (carton wings for gluing, self-locking flaps)

**2. Die-cut Outline SVG Generator**
- **Input:** Parametric geometry output (or general 3D model + fold crease data)
- **Output:** Unfolded net as SVG (compatible with dielineSvgFromSpec output format)
  - Trim box (0..1 normalized to full sheet)
  - Bleed boundary (3mm or configurable inset)
  - Safe area (3mm inset from trim)
  - Fold lines (x1,y1,x2,y2 + type: VALLEY|MOUNTAIN|PERFORATION)
  - Multi-surface regions (per-surface trim boxes + labels)
- **Critical:** Preserve parametric geometry's fold crease data → DielineFold types
- **Must cover:** Simple boxes, cylinders, pouches (multi-panel nets)
- **Nice-to-have:** Complex topologies (compartment pouches, sliding locks, tear strips)

**3. Fold-from-Net Engine (Phase 5 nice-to-have)**
- **3D → flat net:** Unfold animation (reversible)
- **Flat net → 3D:** Fold animation (verify crease geometry)
- **Used by:** Conversion Verifier (3D fold preview shows if creases are wrong; errors become visually obvious)
- **Scope:** Parametric or imported glTF models with animated deformation

### For Phase 2–3 (Import + Admin Curation):

**4. glTF Material Texture Binding (Render-Time)**
- **Task:** Wire up `bindGltfMaterialsToSurfaces()` output into three.js scene
- **Steps:**
  1. Load glTF via GLTFLoader (already works in Packaging3DView)
  2. Walk scene.traverse, collect mesh.material.name
  3. Call `bindGltfMaterialsToSurfaces(names, surfaces)`
  4. For each (materialName → surfaceKey) in result:
     - Find the material in the scene
     - Load design texture for that surface (SVG or raster)
     - Set `material.map = designTexture`
     - Set `material.flipY = false`, `material.colorSpace = SRGBColorSpace`
     - Set `material.needsUpdate = true`
  5. Verify with a real named glTF in browser
- **Risk:** Low (logic is shipped + tested; only the three.js wiring is new)

**5. Real glTF Per-Surface UV Binding (Enhancement, Phase 3+)**
- **Optional:** Inspect mesh UVs + surface hints to auto-bind if material names don't match
- **Today:** Material-name matching is explicit, deterministic, puts naming cost on import
- **Future:** Could add UV inference (brittle across arbitrary models; deferred)

**6. Multi-Component Assembly Renderer**
- **Input:** `PackagingComponent` hierarchy + `childLayout` positioning hints
- **Output:** 3D scene with child models positioned inside parent
- **Example:** 6 cans (3×2 grid) inside a carton
- **Schema ready:** PackagingComponent.parentComponentId (hierarchy), unitsPerParent
- **Scope:** Unlocks variety packs, samplers, gift sets

---

## (D) KEY FILE PATHS — QUICK REFERENCE

### Core 3D Viewer:
- `/packages/ui/src/canvas/Dieline3DViewer.tsx` — three.js viewer (BOX/CYLINDER/FLAT, multi-panel, click raycasting)

### Die-line Processing:
- `/packages/ui/src/canvas/dielineSvg.ts` — SVG generation from structured spec
- `/packages/ui/src/canvas/dielineParse.ts` — SVG auto-parse (trim/bleed/safe/fold detection)
- `/packages/ui/src/canvas/dielinePdf.ts` — PDF parse foundation (C9.d phase, unbuilt)

### Surface & Face Binding:
- `/packages/ui/src/lib/gltf-surface-binding.ts` — material name → surface key resolver
- `/packages/ui/src/lib/surface-face.ts` — surface hint → box face assigner (keyword rules)
- `/packages/ui/src/lib/packaging-surfaces.ts` — PackagingSurface resolver + JSON shape

### Creator Integration:
- `/apps/creator/src/app/(studio)/products/[productId]/design/canvas/LivePreview3DDock.tsx` — live 3D preview
- `/apps/creator/src/app/(studio)/products/[productId]/design/canvas/MockupModal.tsx` — mockup (CSS + photos)
- `/apps/creator/src/app/(studio)/products/[productId]/design/canvas/CanvasLayoutShell.tsx` — shell that mounts both

### Admin:
- `/apps/creator/src/app/(studio)/studio/packaging/Packaging3DView.tsx` — parametric + glTF loader + surface markers
- `/apps/admin/src/app/(dashboard)/packaging-studio/PackagingLibraryClient.tsx` — (likely packaging type CRUD)
- `/apps/admin/src/app/(dashboard)/dielines/DielineCurator.tsx` — die-line frame editor + verification

### Schema:
- `/packages/db/prisma/schema.prisma` (lines ~5185–5250) — Model3DSource enum + PackagingType
- `/packages/db/prisma/schema.prisma` (lines ~5600–5700, approx) — PackagingDieline + DieCutTemplate
- `/packages/db/prisma/seed.ts` (line ~482–503) — DieCutTemplate seed data (includes model3dKey references)

### Documentation:
- `/docs/PACKAGING_COMPOSITION_MODEL.md` — composition model (hierarchy, die-line binding, surface map)
- `/docs/GLTF_SURFACE_BINDING.md` — glTF convention + resolver + render-time consumer (pseudocode)
- `/docs/STUDIO_ARCHITECTURE_3D_2D.md` — architecture thesis (three-layer: die-line master, design canvas, 3D preview)
- `/docs/DIELINE_MANAGEMENT_UX.md` — ops workflow (normalization, canonical shapes, frames, 3D fold preview)
- `/docs/PACKAGING_3D_SPIKE_FINDINGS.md` — spike closure + next steps (Pacdora decision, P2 admin import tool)

---

## (E) SUMMARY TABLE — EXISTS VS. STUBBED

| Component | Status | Notes |
|-----------|--------|-------|
| **3D Viewer (three.js)** | ✅ Prod | BOX/CYLINDER/FLAT; hinged lid; multi-panel; click raycasting; PNG capture |
| **Die-line SVG Gen** | ✅ Prod | trim/bleed/safe/fold from structured spec; industry colors; multi-surface |
| **Die-line SVG Parse** | ✅ Prod | SVG recognizer (name/color/geometry); PDF parse deferred (C9.d phase) |
| **glTF Material→Surface Binding** | ✅ Prod | Deterministic resolver (7 tests); render-time texture swap documented, unverified |
| **Surface→Face Binding** | ✅ Prod | Keyword rules + stable fill order; collision-free (12 tests) |
| **Packaging Surfaces Resolver** | ✅ Prod | Full type + helpers; backward-compatible JSON shape |
| **Admin Packaging 3DView** | ✅ Prod | Parametric + glTF fallback; surface markers; "place" mode |
| **Creator Live 3D Preview** | ✅ Prod | Throttled Fabric→snapshot→3D; click-to-select; shape override |
| **Creator Mockup (CSS)** | ✅ Prod | Stylized shapes (bottle, tub, pouch, box, sticker) |
| **Creator Mockup (Photos)** | 🟡 WIP | Real photo + quad warp; template framework in place |
| **Schema (Model3D columns)** | ✅ Prod | Enum + PackagingType fields locked; DieCutTemplate hint (V1.5+) |
| **Parametric Engine** | ❌ Gap | Topology → geometry exists as fallback; no structured output |
| **Die-cut Outline Gen** | ❌ Gap | Must build from parametric; fold lines critical |
| **Fold-from-Net** | ❌ Gap | Lid hinge works; full net unfold/fold promised, unbuilt |
| **glTF Render Texture Swap** | ⚠️ Gap | Logic shipped, texture binding code unverified in browser |
| **Multi-Component Assembly** | ❌ Gap | Schema ready (hierarchy, childLayout); positioning logic missing |
| **PDF Parse** | ❌ Gap | C9.d phase; SVG parse shipped |

---

## Bottom Line

**The in-house 3D generator can build on a solid foundation:**
- Three.js viewer, die-line generation/parsing, surface binding, and schema are all production-ready.
- The composition model (multi-component hierarchy, per-component die-lines) is modeled and ready to use.
- Admin and creator UIs for 3D are shipped and actively used.
- Parametric fallback exists but outputs only basic primitives.

**The plan must deliver:**
1. **Parametric geometry engine** — topology + dims → structured three.js geometry + fold metadata
2. **Die-cut outline generator** — net SVG with fold line types (valley/mountain/perforation)
3. **Render-time glTF texture binding** — wire the ready-built material resolver into three.js
4. **Multi-component assembly** — position child models inside parent

Everything else is infrastructure-complete; these four pieces are the engine core for Phase 1.
