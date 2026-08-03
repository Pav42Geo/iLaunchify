# Step 4 replacement: "Packaging & die-lines" (2026-07-28)

Replaces the fullscreen Packaging Studio takeover in the Add Product builder with a
regular v2 form step. The studio is KEPT as the 2D die-line editor it is today
(Pavel 2026-07-28), opened on demand from the step's die-line rows; its 3D pane
becomes a docked read-only preview, the same pattern as the creator Design
Studio. This doc is the build spec for the new step plus the migration and the
open decisions.

Companion prototype: `design/step4-packaging-dielines-prototype.html` (visual
contract; same v2 tokens as `partner-profile-prototype-v2.html`).

## 1. Why (locked reasoning)

- Die-line is the print master; 3D is a derived preview only (docs/STUDIO_ARCHITECTURE_3D_2D.md).
  Nothing a manufacturer does in Step 4 needs a canvas: it is declarations of
  manufacturing truth (containers, die-line files, constraints, mappings, phrases).
- The canvas experience belongs to creators (artwork on a die-line) and admin
  (surface authoring, library curation). Coupling manufacturer onboarding to the
  3D library growth rate buys nothing and costs listings.
- Labels are regulated: exact vectors from the manufacturer's prepress world are
  BETTER inputs than anything drawn in a browser canvas.
- Zero data-model regret: every artifact the studio would produce is already a
  column today (PackagingSystem, PackagingSystemFile role DIELINE, PackagingDieline
  with prepress spec + frames JSON + normalizedSvgKey). Only the editing surface
  changes; the studio can be layered on later with no migration.

## 2. The step at a glance

Name: "Packaging & die-lines" (STEPS[3] title + subtitle "Containers · die-lines · labels").
Chrome: a normal step like 1, 2, 3, 5, 6. The fullscreen takeover goes away, which
also removes the topbar re-render + scrollbar-gutter hacks in GuidedBuilder.

Layout: `gb-cols wide-left` (1.35fr / 1fr).

LEFT column (authoring):
1. Containers card (existing PackagingPicker, kept as-is)
2. Die-lines card (NEW: per attached container, auto-attached status + studio entry)
3. Decoration methods card (NEW, D3: per attached container, which decoration
   the manufacturer can provide for that packaging; see §3.7)
4. Two-col: Per-flavor labels (existing PerFlavorLabelsCard, pack products only)
   + Mandatory phrases (existing LabelPhrasesCard)

RIGHT column (read-only, sticky like the Step 3 label rail):
4. Preview card (NEW: parametric 3D thumb when available, flat die-line otherwise)
5. Packaging Studio access card (per-container: open the 2D editor; notes
   whether that container's docked 3D preview is available)

## 3. Cards and data writes

### 3.1 Containers (kept)
Component: `PackagingPicker.tsx` unchanged.
Writes: `addPackagingLink` / `removePackagingLink` (ProductTemplate ↔ PackagingSystem)
+ `setPackagingCoPacker` (CP-5 co-packer per size). No new work beyond v2 chrome
inherited from the shared `.gb` styles.

### 3.2 Die-lines (new card, the heart of the step)
ZERO-CLICK DEFAULT (Pavel 2026-07-28, resolves D1): attaching a container IS the
die-line step. The manufacturer is never asked to upload anything in the happy
path. On attach, the platform resolves the die-line automatically, in order:
1. The partner's EXISTING PackagingDieline for (partnerServiceId ×
   packagingTypeId × decorationMethod): die-lines are service-level and reusable
   across products, so a second product on the same container reuses it as-is.
2. Else the packaging type's assigned house template (DieCutTemplate canonical
   shape): the platform INSTANTIATES a PackagingDieline from it automatically
   (partnerFile null, normalizedSvg + zones seeded from the template).
3. Else (custom container with no house template): the only case that shows an
   upload affordance + a request thread to the platform.

One row per ATTACHED container. Each row shows:
- Container name + read-only facts from PackagingSystem (dimensions Json, material,
  topology, unitCount). Facts render as muted chips; editing them stays in the
  packaging catalog, not here.
- Die-line STATUS pill, driven by the existing DielineStatus FSM:
  - Auto-attached from template: green pill "Template attached ✓" (ready
    immediately: normalized shape + seeded zones come with the template)
  - Own upload UPLOADED / PARSED: info pill "Normalizing"
  - PARTNER_CONFIRMED: green pill "Confirmed"
  - ADMIN_VERIFIED / ACTIVE: green pill "Verified ✓"
  - No template + no upload (custom only): amber "Needs a die-line" + upload
- PRIMARY action on a ready row: "Open in Packaging Studio" (the §3.2b fullscreen
  modal) where the manufacturer arranges mandatory + recommended elements.
- SECONDARY action: "Replace with your own die-line" (PDF / AI / SVG,
  DielineFileFormat). The file lands as PartnerFile, linked both ways we already
  support: `PackagingSystemFile` (role 'DIELINE', panel, label) on the container
  row AND the `PackagingDieline` row, so the prepress pipeline (trim/safe/fold
  parse, canonicalShape match, admin verify) picks it up. Replacing keeps the
  arranged zones where the shapes match.
- Structured spec fields (widthMm / heightMm / depthMm / bleedMm) show read-only
  once parsed; a "fix measurements" affordance opens a small inline edit that
  writes PackagingDieline (partner-entered spec is already nullable-until-confirmed).

Each row also carries a LABEL ZONES affordance once the die-line is normalized
(see §3.2b): a status chip ("Zones 8/8 placed ✓" / "Review zones" / amber
"3 zones missing") that opens the focused zones editor.

Explicitly OUT of this card itself: trim/safe box drawing and fold-line editing
(parse + admin fix-ups). Frame ARRANGING is in: via the §3.2b drill-in.

### 3.2b Label zones: opens the EXISTING 2D Packaging Studio
DECIDED (Pavel 2026-07-28): the Packaging Studio is KEPT as the 2D die-line
editor it is today, and that is where the manufacturer arranges the mandatory
FDA elements (PackagingDieline.frames FrameLayout, docs/DIELINE_FRAME_EDITOR_SPEC.md,
@ilaunchify/ui canvas/frames). No new modal editor is built. What changes is the
entry point and the studio's positioning:
- Entry (Pavel 2026-07-28): "Arrange label zones" on a die-line row opens the
  existing studio SCOPED to that die-line as a FULLSCREEN MODAL, exactly the
  same takeover chrome the studio has right now. Its chrome carries a "Save"
  button and an "X" close: finishing an edit is save-and-exit back to the Step 4
  form (Save persists PackagingDieline.frames and closes; X closes, prompting
  only when there are unsaved changes). No route navigation, no new editor
  shell. It is no longer the step every manufacturer must pass through: the form
  step is the required path, the studio modal is the opt-in editing surface.
- Positioning: 2D-first. The 3D inside the studio becomes a DOCKED READ-ONLY
  PREVIEW, the same pattern as the creator Design Studio's docked preview
  (STUDIO_ARCHITECTURE_3D_2D P1: Packaging3DView + canvas snapshot). It renders
  when the container has a parametric/glTF model and simply stays hidden when
  it doesn't. No 3D library dependency, no "full 3D mockup experience" promised.

Flow:
1. Upload → normalize → the platform AUTO-SEEDS a zone layout from the matched
   canonical shape (DieCutTemplate defaults propagated via canonicalShapeId).
   Most manufacturers accept the seed and never open the studio.
2. "Arrange label zones" opens the existing 2D studio on the flat normalized
   die-line with the typed slots as draggable/resizable frames: statement of
   identity, net quantity, Nutrition/Supplement Facts, ingredient list, allergen
   statement, manufacturer line, GTIN/barcode, recycling/disposal marks,
   certification seals, mandatory phrases. Slots are content-agnostic: the
   actual copy/panel resolves at composition from the right scope (recipe /
   material / certs / phrases / market), so arranging is layout-only and can
   never edit regulated content. The docked 3D preview (when available) reflects
   the zone layout live but is never interactive editing.
3. A checklist rail mirrors the label engine's requirements for this product's
   domain: every mandatory element shows placed/missing, with panel-rule
   validation (e.g. FDA: identity + net quantity on the PDP, net quantity in the
   bottom 30%; Facts + ingredients + manufacturer on the information panel).
   "Confirm zones" is enabled only when every mandatory element is placed and
   passes the panel rules; confirming writes frames + framesUpdatedAt and moves
   the row toward PARTNER_CONFIRMED.
4. Admin verify stays the final gate (ADMIN_VERIFIED), and admin can adjust the
   canonical-shape defaults so the NEXT upload of that shape auto-seeds better.

Publish gating: same philosophy as the rest of the builder (no hard gates while
iterating): missing zones show amber and surface on the Review passport, but do
not block stepping. The compliance check before a BRANDED sample / go-live is
where zones become mandatory (existing dieline-passes-compliance gate).

### 3.3 Per-flavor labels (kept)
`PerFlavorLabelsCard` unchanged (renders only when packUiKindForProfile = 'pack').
Writes: `setFlavorDieline` (shared template vs custom per flavor).

### 3.4 Mandatory phrases (kept)
`LabelPhrasesCard` unchanged. Writes: `saveProductPhraseFacts` / `saveProductPhrases`.
Locked phrases keep their CFR citation and cannot be removed (prototype shows the
lock treatment).

### 3.5 Preview (new, read-only)
Sticky right rail, mirrors the Step 3 live-label pattern:
- Green pill "Preview · derived from die-line" (honest naming: never "print file").
- If the container's PackagingType maps to a parametric primitive in
  `packages/packaging-3d`: render the read-only 3D thumb (Packaging3DView, no
  orbit controls needed for v1; a single beauty angle is enough).
- Else if `PackagingDieline.thumbnailKey` or `normalizedSvgKey` exists: render the
  flat die-line preview.
- Else: neutral placeholder ("Preview appears once a die-line is uploaded").
No interaction, no library dependency, no blocking.

### 3.6 Packaging Studio access (revised: always available, no unlock flag)
SUPERSEDED (Pavel 2026-07-28): the studio is the 2D die-line editor, and 2D does
not depend on the 3D library, so there is nothing to unlock.
- Every container row with an uploaded die-line shows "Open in Packaging Studio"
  (same surface the §3.2b zones entry opens). Rows without a die-line show
  "Upload a die-line first" (muted).
- The docked 3D preview inside the studio appears automatically per container
  when a parametric/glTF model exists, and is absent otherwise. Availability is
  a fact of the library, not an admin flag.
- The `PackagingType.studioReady` flag from the earlier draft is DROPPED. If a
  gate is ever wanted for a future creator-facing 3D mockup experience, that is
  a separate decision on the creator side.

### 3.7 Decoration methods (new card, D3 resolved 2026-07-29)
Per attached container, the manufacturer specifies WHICH decoration methods they
can provide for that specific packaging (DecorationMethod enum: direct print,
pressure-sensitive label, shrink sleeve, in-mold label, screen print, hot stamp,
emboss, deboss, spot UV, none). UI: a chip row per container, multi-select, with
optional per-method MOQ where the schema supports it.
- Persistence: PartnerPackagingOffering rows (the same rows the on-demand
  fulfillment card reads as candidates, and that link a PackagingDieline via its
  decorationMethod). Pre-seeded from what the partner's service builders already
  declared; edits here write back to the same rows so there is ONE source.
- Downstream: drives the PDP decoration choice (decoration shows on the PDP only
  when the chosen container has more than one method) and the §4b.2 made-to-order
  finish card on Step 5.
- Note: a die-line is per (packagingType × decorationMethod), so adding a second
  method to a container can surface a second die-line row in §3.2 (auto-resolved
  the same zero-click way).

## 4. What moves where (nothing is parked away from users)

- `PackagingStudioStep.tsx` / PackagingStudioShell: KEPT as the 2D die-line
  editor it is today. It stops rendering INLINE at cur === 3; instead it opens
  on demand from a die-line row ("Arrange label zones" / "Open in Packaging
  Studio") as the same fullscreen modal takeover it uses now, scoped to that
  die-line, with Save + X chrome (save-and-exit returns to the form step).
  Repositioned 2D-first: its 3D pane becomes the docked read-only preview
  (§3.2b). The existing fullscreen plumbing (topbar re-render, scrollbar-gutter
  reservation) moves WITH the modal instead of living in the builder's default
  path, so steps 1-6 render as plain pages and the hacks apply only while the
  studio modal is open.
- `saveCustomDieline` / `loadCustomDieline` (inline editor for type-less custom
  packaging): KEPT, reachable from the Containers card for custom packaging
  (D2 resolved 2026-07-29).
- KEPT + reused verbatim: PackagingPicker, PerFlavorLabelsCard, LabelPhrasesCard,
  the whole PackagingDieline pipeline, packaging-studio-actions catalog functions
  (loadPackagingCatalog / attachCatalogType / createCustomPackaging /
  submitPackagingForReview / addPackagingFilesToSystem) which back the Containers
  card's "attach another container" path.
- GuidedBuilder cleanup once the new step lands: remove the Step-4 fullscreen
  special cases (scrollbarGutter reservation comment block, topbarRight re-render
  prop, studioLogo prop can stay wired for the parked studio).

## 5. Frames: three-layer authorship (seed → arrange → verify)

Superseding the earlier "frames move to admin entirely" position (Pavel
2026-07-28: the manufacturer must keep the ability to arrange the mandatory FDA
elements on the die-line):

- SEED (platform): on normalize, auto-place a zone layout from the canonical
  shape's defaults (DieCutTemplate, propagated via canonicalShapeId). Admin
  curates these defaults once per house shape in the admin die-line surface
  (/dielines + DIELINE_FRAME_EDITOR_SPEC).
- ARRANGE (manufacturer, optional): the §3.2b Label-zones drill-in. Same
  FrameLayout storage, same typed slots, validated live against the label
  engine's per-domain mandatory list + panel rules. Layout only; regulated
  content always resolves from the engine at composition.
- VERIFY (admin): unchanged final check (ADMIN_VERIFIED); adjustments feed back
  into the canonical defaults.

PackagingDieline.frames stays the single storage for all three layers.

## 6. Build plan (each phase shippable)

- P4a Form step: new `PackagingDielinesStep.tsx` (Containers + Die-lines card with
  zero-click auto-attach + status pills, Decoration methods card (§3.7), the two
  kept cards in two-col, inline custom editor reachable from Containers).
  GuidedBuilder renders it at cur === 3; STEPS[3] renamed "Packaging & die-lines".
  Fullscreen code paths stop rendering inline. Admin prerequisite: assign house
  DieCutTemplates to the launch PackagingTypes so auto-attach has something to
  attach.
- P4b Preview rail: read-only preview card (parametric match → 3D thumb; else
  thumbnail/normalizedSvg; else placeholder) + measurement fix-up inline edit.
- P4c Studio wiring: "Arrange label zones" / "Open in Packaging Studio" on the
  die-line rows opens the EXISTING studio scoped to that die-line, as today's
  fullscreen modal with Save + X (save-and-exit); add the mandatory-elements
  checklist + panel-rule validation to the studio if not already present;
  auto-seed zones from canonical-shape defaults on normalize.
- P4d Docked 3D preview: reposition the studio's 3D pane as the read-only docked
  preview (Packaging3DView; shown only when the container has a model), mirroring
  the creator Design Studio pattern. No unlock flag, no schema change.

## 7. Open decisions (Pavel)

- D1 RESOLVED 2026-07-28 (Pavel): fully automatic and ZERO-CLICK. Choosing the
  container auto-attaches its die-line (existing partner die-line first, else
  instantiate from the type's house template); no upload ask, no "send me a
  template" button in the main flow. The manufacturer's action is opening the
  studio to arrange mandatory + recommended elements. Upload survives only as
  "Replace with your own die-line", and a request thread appears only for a
  custom container with no house template (path 3 in §3.2).
- D2 RESOLVED 2026-07-29 (Pavel): KEEP the inline custom die-line editor
  reachable from the Containers card for custom packaging (saveCustomDieline /
  loadCustomDieline stay wired, not parked). Custom packaging still flows
  through submitPackagingForReview for the catalog side; the inline editor
  covers its die-line while that runs.
- D3 RESOLVED 2026-07-29 (Pavel): YES, Step 4 gets a per-container Decoration
  methods card (§3.7): the manufacturer specifies what decoration they can
  provide for that specific packaging. Writes PartnerPackagingOffering (one
  source with the service builders).
- D4 RESOLVED 2026-07-28: no unlock flag at all. The studio (2D editor) is
  always available once a die-line exists; the docked 3D preview appears per
  container whenever its model exists in the library.
- D5 RESOLVED 2026-07-29 (Pavel): the step is named "Packaging & die-lines"
  (subtitle "Containers · die-lines · labels").

ALL DECISIONS CLOSED (D1 zero-click auto-attach · D2 inline custom editor kept ·
D3 per-container decoration card · D4 no unlock flag · D5 name). P4a is
unblocked. Clarified 2026-07-29: the studio that opens from the die-line rows is
the CURRENT Packaging Studio exactly as built today; the overlay in the design
prototype is a sketch stand-in, not a new editor.
