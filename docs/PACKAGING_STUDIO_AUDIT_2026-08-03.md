# Admin Packaging Studio audit (2026-08-03)

Pavel's target: ONE studio where an admin can create a container, assign it to a
group (category), name it, attach die-lines that belong to it, attach mockups
(2D + 3D), author surfaces, and have partners consume the result. This audits
what exists against that target. Companion docs: ADMIN_PACKAGING_STUDIO.md
(design spec, P0-P3 built 2026-07-01), PACKAGING_ENTITY_MANAGEMENT_AUDIT.md,
PACKAGING_STUDIO_CONSOLIDATION_2026-08-03.md (partner side).

## Fixed today

- F1. **Import .glb hung forever.** Root cause: creator app next.config.js had no
  `serverActions.bodySizeLimit`, so Next rejected any model over the 1MB default
  before the action ran. Set to 50mb (models cap at 40MB). Admin app got 25mb for
  its own uploads (certificates, logos, symbols). Requires dev server restart.
- F2. Files uploaded before the MinIO env restart were stranded in .dev-storage
  (reads 404). Migration one-liner documented in ilaunchify-local-uploads-minio
  memory; run it whenever a signed URL 404s on an old upload.

## What already exists (do not rebuild)

| Capability | Where | State |
|---|---|---|
| Create container (name, topology, category) | admin `/packaging-studio` grid, `createPackagingModel` | Works, but lives OUTSIDE the studio canvas |
| Status (ACTIVE / DEPRECATED) | admin grid, `setPackagingModelStatus` | Works |
| Library picker (84 models, search, category chips) | creator `/studio/packaging` Library drawer | Works |
| 3D view: parametric per topology + GLB import + fallback | `Packaging3DView` + `attachPackagingModel3d` | Works after F1 |
| 2D mockup / preview image (ONE per container) | `attachPackagingImage` → `model3dThumbKey` | Works, single image only |
| Surface authoring (label/role/part/bleed) + Place marker hotspot | `SurfaceAuthoringClient`, saves to `defaultSurfaces` JSON | Works |
| Surface → die-line binding (multi-select) | P3, in studio | Works |
| Inline die-line frame editor | shared `DielineFrameEditor` in studio | Works, but NO backdrop image (frames on blank) |
| Die-line curation by category | creator `/studio/dielines` | Works (Pavel's call: curation is a canvas concern) |
| Partner die-line promotion on approve | admin packaging-review | Works |

## Gaps (the audit)

- **G1. Create/rename/recategorize INSIDE the studio.** Creation lives only in the
  admin grid; the studio Library drawer has no "New container" button, and there is
  NO rename or category-reassign action at all after creation (only status,
  die-cut, domains). Pavel's flow starts with "create the container" in the studio.
  Build: `updatePackagingModel(name, category, topology)` action + a small
  create/edit panel in the Library drawer. Effort: S.
- **G2. Add a die-line TO a container from the studio.** The studio only BINDS
  die-lines that already exist on the type (promoted from partner review or seeded).
  No "upload die-line file" or "create blank die-line from dimensions" for a
  container. Build: upload path (PDF/AI/SVG/DXF → PackagingDieline with
  partnerServiceId nullable/admin-owned) + create-from-dims. Effort: M. This is the
  biggest miss vs the target flow.
- **G3. Multiple mockups per container.** One preview image only (model3dThumbKey).
  The MockupTemplate model exists (admin Product Mockups tool) but is not surfaced
  in the studio. Build: mockup list panel reusing MockupTemplate. Effort: M.
- **G4. Die-line editor backdrop.** The inline editor shows frames on a blank
  canvas (P3 note: signed-URL wiring pending). The die-line's actual file should
  render underneath, same as the partner Step-4 editor does. Effort: S.
- **G5. Auto-thumbnail from GLB.** After a 3D import the picker card still shows a
  placeholder unless an image is uploaded separately. Render the GLB to a PNG
  client-side on import (canvas.toDataURL from the three.js scene) and save it as
  the thumb. Effort: S-M.
- **G6. P4 partner consumption unverified.** Enriched surfaces (hotspot +
  dielineIds) are authored but the partner Step-4 click-through has not been
  verified to route through them. Effort: verify, then S.
- **G7. Per-mesh hotspot borders for imported GLBs.** Place-marker anchors work;
  clicking named meshes / drawing UV regions (spec's recommendation for imported
  models) is not built. Effort: L. Defer until G1-G4 land.
- **G8. Entry friction.** Two surfaces by design (admin grid = manage, creator
  canvas = author). Fine, but the grid's create panel and the canvas duplicate
  nothing today BECAUSE the canvas can't create (G1). Once G1 lands, decide whether
  the grid stays as a reporting/KPI view only.

## Recommended order

1. G1 (create/edit in studio: unblocks Pavel's whole flow) + G4 (backdrop: makes
   die-line authoring real).
2. G2 (die-lines belonging to a container: upload + from-dims).
3. G3 (mockup sets) + G5 (auto-thumb).
4. G6 verification, then G7 when models are prepared with named meshes.

Rule from the consolidation doc applies here too: packaging management UX goes in
the studio, not in new admin pages.
