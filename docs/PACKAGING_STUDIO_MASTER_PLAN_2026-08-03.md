# Packaging Studio MASTER PLAN (2026-08-03)

One answer to "what is the full plan for packaging in the studio", stitched from
every plan already written (ADMIN_PACKAGING_STUDIO.md, PACKAGING_3D_GENERATOR_PLAN.md,
PACKAGING_ENTITY_MANAGEMENT_AUDIT.md, PACKAGING_LIBRARY_ARCHITECTURE.md,
PACKAGING_COMPOSITION_MODEL.md, AI_PACKAGING_GENERATOR.md, MOCKUP_STRATEGY,
PACKAGING_REVIEW.md, PACKAGING_STUDIO_CONSOLIDATION_2026-08-03.md,
PACKAGING_STUDIO_AUDIT_2026-08-03.md) plus Pavel's decisions today.
Prototype: design/packaging-studio-admin-v2-prototype.html (v2.1).

## The mental model (Pavel, locked 2026-08-03)

**PackagingType (the container) is the hub** (entity audit's hub-and-spoke call).
**A surface IS a die-line.** No separate surfaces concept in the UX: every
die-line of a container renders as an EMPTY DIE-LINE REGION on the 3D object;
clicking a region opens it flat in the 2D editor. `defaultSurfaces` JSON becomes
a DERIVED artifact (one entry per die-line, carrying the hotspot anchor), not a
separately authored thing.

A container carries exactly four asset kinds:

| # | Asset | Cardinality | Schema (exists) | Notes |
|---|---|---|---|---|
| 1 | Die-lines (print masters) | many | `PackagingDieline` | Upload (PDF/AI/SVG/DXF) or GENERATE from dimensions. Die-line = print master; 3D = derived (locked architecture). |
| 2 | 3D model | ONE | `PackagingType.model3dKey` | Imported GLB today; GENERATED from partner photo + die-line in the 3D-generator era; parametric fallback always. |
| 3 | 2D photo mockups | many | `MockupTemplate` (photo + printAreaQuad + surfaceKey + DRAFT/ACTIVE) | Admin marks the print area; artwork warps into the quad. Creator-side personalization/publish is the locked mockup-library plan. |
| 4 | Thumbnail | one | `model3dThumbKey` | Starred photo, or auto-rendered from the GLB. |

**The ONE UX:** a Library panel + a single popup. The popup creates OR edits a
container with all four asset kinds in one place (details, die-lines, 3D model
slot, 2D photo mockups). Imported (partner-submitted) containers are editable
with the same popup. No sidebar module zoo, no separate admin pages for
packaging management (extends the studio-first rule from the consolidation doc
to the admin side). Category navigation = the Design Studio carousel (pinned
arrows over white fades, wheel scroll, chevron expands the taxonomy).

## Build phases

- **M1 · The popup, wired.** `updatePackagingModel` (rename, recategorize,
  topology, dims: does not exist yet), single GLB slot (existing
  `attachPackagingModel3d`), die-line create per container (upload path +
  from-dimensions generator writing `PackagingDieline` owned by the type), 2D
  photos creating `MockupTemplate` DRAFT rows. Popup opens from Library
  (+ New container) and from every card's Edit, including imported ones.
- **M2 · Die-line zones on the object.** Derive surface JSON 1:1 from die-lines
  (placement → anchor), render zones (empty = dashed/hatched, designed = solid),
  click-through to `DielineFrameEditor` WITH the real signed-URL backdrop
  (audit G4). Delete the separate surface-authoring rail.
- **M3 · Print-area marking in the studio.** Embed the existing MockupManager
  quad editor (admin product-mockups tool) so a freshly added photo gets its
  print area marked without leaving the studio; DRAFT → ACTIVE FSM.
- **M4 · Thumbnails + polish.** Auto-render the GLB to a PNG thumb on import
  (audit G5), starred-photo override, carousel parity, card counts.
- **M5 · Partner consumption.** Step-4 renders the SAME zones component; verify
  partner clicks route to the bound die-line (audit G6). Publish gates unchanged.
- **M6 · Generation era** (existing locked plans, unchanged): 3D models
  generated from partner photo + die-line (PACKAGING_3D_GENERATOR_PLAN G-phases),
  AI creative layer on deterministic regulated layer (AI_PACKAGING_GENERATOR),
  creator personalization + channel publish of mockups (mockup-library plan).
- **M7 · Retirement.** Admin /packaging-studio grid becomes a read-only KPI view
  or folds into the studio; partner /packaging retires per the consolidation doc.

## Today's decision log (Pavel 2026-08-03)

1. One Library + one popup; kill the multi-drawer rail.
2. Surface = die-line; surfaces show as empty die-line regions ON the 3D object.
3. Imported containers get the same Edit popup.
4. 3D model and 2D photo mockups upload SEPARATELY (one GLB slot vs many photos).
5. Category carousel identical to the Design Studio pattern.
6. Prototype-first workflow: bless design/packaging-studio-admin-v2-prototype.html,
   then build M1+M2 to match.
