# Packaging composition model — scope

Drafted 2026-06-11 (Pavel). Foundation for the 3D Packaging Studio → click a
surface → Die-line Studio flow, using manually-imported Pacdora 3D + die-lines.

**Headline: the composition model already exists** (Slice C7/C8). The product →
multi-component → hierarchy → per-component die-line/design/flavor structure is
all in the schema. The only real gap is a **3D-asset + surface-map layer** on the
packaging *type*, plus a thin assembly/positioning hint. This scope confirms the
existing model handles your three example products, then specs the small additive
gap.

---

## 1. What already exists (don't rebuild)

**`PackagingComponent`** (per product) — the composition node:
- `tier` (PRIMARY/SECONDARY/TERTIARY) + `role` (CONTAINER/CARTON/CLOSURE/SEAL/INSERT/LABEL/SHIPPER)
- `packagingTypeId` (the structure) + `partnerOfferingId` (who makes it) + `selectedVariantId` (decoration choice)
- **`dielineId`** — the die-line this component prints to
- **`designVersionId`** — its own creator artwork
- **`parentComponentId` + `children` (ComponentHierarchy)** + `unitsPerParent` — containment/nesting
- **`flavorPresetId`** — per-component flavor (variety packs)
- `decorationMethod`, `accentDecorations`, `displayOrder`

**`PackagingType`** (admin-curated library): `slug`, `displayName`, `defaultTopology`
(SINGLE_CONTAINER, MULTI_CONTAINER_BOX, CAPSULE_JAR, POUCH_*, TUBE, CASE…),
`containerCategory` (CONTAINER/CLOSURE/SEAL), **`defaultDimensions` Json**,
**`defaultSurfaces` Json**, `imageFileId`.

**`PackagingComponentVariant`** — decoration choices per slot (plain vs custom cap,
foil vs shrink seal), each with its own `dielineId` + `isCustomizable`.

**`PackagingDieline`** — die-line per type+decoration, with `surfaces` + `frames`
(scoped slots) + normalization fields. **`DieCutTemplate` already has `model3dKey`**
— precedent for storing a 3D asset key.

So: composition, hierarchy, per-component die-line + design + flavor, decoration
variants, dimensions, and frames are **all already modeled**.

## 2. Your three examples map cleanly to the existing model

**A. Jar with front/back/top labels.**
- 1× `PackagingComponent` role=CONTAINER (the jar) → its wrap die-line (front+back are regions of the wrap net) + its design.
- 1× component role=CLOSURE (the lid) → its own die-line + design.
- (Front/back aren't separate components — they're faces of the jar's wrap die-line, which `PackagingDieline.surfaces` already represents.)

**B. 6 cans + outer box.**
- 1× component role=CONTAINER (can), `parentComponentId` → the carton, `unitsPerParent`=6, its wrap die-line + design.
- 1× component role=CARTON (the box) → its net die-line (6 faces in `surfaces`) + design.

**C. 3 flavors of canned energy drink + paper sleeve.**
- 3× component role=CONTAINER (can), each `flavorPresetId` = a different flavor, each `unitsPerParent`=1, each its own die-line + design (different flavor label).
- 1× component role=SLEEVE/CARTON wrapping them (`parentComponentId`) → its die-line + design.

No new composition entities needed — the hierarchy + per-component fields cover all three.

## 3. The gap — the 3D-asset + surface-map layer

What's missing is purely what the **3D Packaging Studio** needs to render the scene
and let the partner *click a surface*:

1. **A 3D model per packaging type** (the imported Pacdora glTF). `PackagingType`
   has a reference *photo* (`imageFileId`) but no 3D model key. (`DieCutTemplate.model3dKey`
   is the precedent.)
2. **A clickable surface map** — each decorable region on the model tagged with the
   component **role/slot** it decorates + its UV/region, so a click resolves to a
   component → its die-line. `defaultSurfaces` exists but isn't tied to 3D regions
   or component roles yet.
3. **Provenance** — mark assets imported from Pacdora (licensing/audit), distinct
   from uploaded or parametric.
4. **Assembly hint** — how children sit inside a parent in 3D (the 6 cans in the
   carton). Light: a layout arrangement per parent.

## 4. Additive schema (small, no-regret)

```prisma
enum Model3DSource {
  PACDORA_IMPORT   // downloaded from Pacdora (track for licensing)
  UPLOAD           // partner/admin uploaded glTF
  PARAMETRIC       // generated from topology + dimensions (future)
}

model PackagingType {
  // …existing…
  model3dKey       String?         // imported glTF/glb (R2 storage key)
  model3dSource    Model3DSource?  // provenance
  model3dThumbKey  String?         // preview thumbnail
  // Enrich defaultSurfaces → each entry: { key, label, role, region/UV, defaultBleedMm }
  // (Json shape upgrade — no column change; documented in TS type below.)
}

model PackagingComponent {
  // …existing…
  // Optional per-instance overrides (else inherit from PackagingType):
  widthMm     Float?
  heightMm    Float?
  depthMm     Float?
  childLayout Json?   // how children arrange in 3D inside this parent (e.g. {rows,cols} or positions)
}
```

```ts
// PackagingType.defaultSurfaces : SurfaceDescriptor[]
interface SurfaceDescriptor {
  key: string                 // "wrap" | "front" | "lid_top" | "face_1"…
  label: string
  role: string                // ComponentRole this surface decorates (CONTAINER/CLOSURE/CARTON…)
  uvRegion?: { x: number; y: number; w: number; h: number }  // for click-to-select on the model
  defaultBleedMm?: number
}
```

That's the entire schema delta — a few nullable columns + a Json-shape upgrade.
Everything else reuses the existing composition model.

## 5. Consumption flow (how the Studio + Die-line + Creator use it)

1. **Compose** (Packaging Studio): partner picks packaging types → creates
   `PackagingComponent` rows (with hierarchy). Each type carries its 3D model +
   surface map.
2. **Assemble the 3D scene**: load each component's type `model3dKey`, scale to its
   dims, position children per parent `childLayout`. (three.js — Studio logic, not schema.)
3. **Click a surface** → resolve `SurfaceDescriptor.role` → the matching
   `PackagingComponent` → its `dielineId` → open the **Die-line Studio** for that
   die-line (frames already attached).
4. **Creator Studio**: each component's `designVersionId` is the artwork for that
   die-line; the normalized template + frames drive placement + the compliance gate.
5. **Compliance gate**: run `checkFrameCompliance` per component die-line; the
   product passes when every component's required frames pass (extends the gate
   we built across the composition).

## 6. Import pipeline + request flow (app work, not schema)

- **Admin import** (the Pacdora workflow): admin downloads a glTF + die-line from
  Pacdora → uploads via an admin tool → creates/updates `PackagingType`
  (`model3dKey`, `model3dSource=PACDORA_IMPORT`, surfaces) + a `PackagingDieline`
  (geometry + surfaces) → status ACTIVE. Now selectable by partners.
- **"Can't find my packaging" request**: partner submits topology + dimensions +
  reference → admin queue → admin builds it on Pacdora + imports (above) → notifies.
  (Creates a real `PackagingType` so the library compounds from demand.)

## 7. Phasing

- **P1 — schema delta** (§4): `Model3DSource`, `PackagingType.model3d*`, surface-map TS shape, `PackagingComponent` dim/childLayout. Additive migration.
- **P2 — admin import tool** + request queue (§6).
- **P3 — Packaging Studio** (three.js): assemble scene from component models, click-surface → Die-line Studio.
- **P4 — wire Die-line + Creator + compliance per component/surface** (mostly built — reconnect to the composition).

## 8. Open questions

1. **Single vs multi-component in the first cut?** Single-component products
   (one container) ship fastest; multi-component (6-packs, variety + box) is the
   richer case but adds the assembly/positioning work. Recommend single-component
   P3 launch, multi-component fast-follow.
2. **Where the partner composes** — inside the product builder's packaging step
   (the integrated-flow goal) vs. a dedicated Packaging Studio entry. The model is
   the same either way; this is the flow-placement decision from before.
