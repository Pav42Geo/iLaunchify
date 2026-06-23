# Die-line Management & Normalization — Admin UX Architecture

> STATUS: SPEC (design locked across Pavel design sessions 2026-06-23). Builds on
> `docs/builds/_V1_DIELINE_NORMALIZATION.md` (C9 pipeline) and the shipped
> Die-line Curator (`/dielines`, commits 3b7fd08 + 9d4b478). Nothing in the
> "Operations workspace / Verifier / 3D" sections is built yet.

## 0. The mental-model shift

A die-line is **not a file to upload and edit**. It is a **physical shape that
recurs across many partners**, arriving **in sets** (a product's components) and
**in context** (a partner's packaging offering). Admin die-line management has
three objects, not one:

1. **Submission** — the partner's raw upload. IMMUTABLE. The legal/press source.
2. **Canonical shape** — house-standard geometry + frame conventions, admin-owned
   (`DieCutTemplate`, extended). Normalized ONCE per distinct shape.
3. **Normalized twin** — the platform copy the creator Studio renders
   (`normalizedSvgKey`).

The admin's real job: **curate a shape library and map submissions onto it** —
turning the work from O(every die-line) into O(distinct shapes).

## 1. Data model (what already exists)

- `PackagingDieline` — partnerServiceId, packagingTypeId, decorationMethod,
  `partnerFileId` (immutable original), structured spec
  (`widthMm/heightMm/bleedMm/trimBox/safeAreaBox/foldLines/surfaces`),
  `frames` (FrameLayout, **normalized 0..1 to the trim box**), `normalizedSvgKey`,
  `parseAccuracyScore`, status FSM (UPLOADED→PARSED→PARTNER_CONFIRMED→
  ADMIN_VERIFIED→ACTIVE→ARCHIVED), `adminVerified*`.
- `PartnerPackagingOffering` — partnerService + packagingType + decorationMethod
  + `dieline` (typed FK). Unique [partnerService, packagingType, decorationMethod].
  This is the **partner-catalog context**.
- `PackagingComponent` — role (CONTAINER/CARTON/CLOSURE/SEAL/INSERT/LABEL/SHIPPER),
  packagingTypeId, `dielineId`. A `ProductTemplate` has many components →
  **a product carries a SET of die-lines.**
- `DieCutTemplate` — canonical shapes the Studio uses (category, name, w/h mm,
  outlineSvg). **GAP: `PackagingDieline` has no link to it.**
- Shared `DielineFrameEditor` (`@ilaunchify/ui`) + `dielineSvgFromSpec` (normalized
  SVG generator) + `validateFrameLayout` (preflight) — all built.

## 2. The schema gap to close (the one enabling change)

```
PackagingDieline {
  canonicalShapeId  String?   // → DieCutTemplate (the shape it maps to)
  matchConfidence   Decimal?  // 0..1 auto-match score
  clusterKey        String?   // geometry/aspect bucket for clustering
  // frames carry partner intent; add per-frame origin (see §6)
}
```

Everything else (offerings, components, product set, FSM, Curator, normalized SVG,
frame editor) already exists. This single link unlocks clustering + propagation +
the shape lens.

## 3. The workspace — "Die-line Operations"

Default landing = a **triage Inbox**; everything else is a **lens** over the same
rows. Each row carries CONTEXT (partner · product · component role · packaging
type) and **what it blocks** (which products/orders wait on it).

**Inbox / Triage** — prioritized: new-partner's first N, low `parseAccuracyScore`,
creator-flagged, unmapped-to-canonical. Sampling-based (not every die-line is
gated; see _V1_DIELINE_NORMALIZATION §admin verification).

**Lens 1 — By Product (the set view).** Open a partner product → all its component
die-lines as an **exploded set** (CONTAINER + CARTON + CLOSURE…) with a per-
component **completeness checklist**. Normalize the whole set in one session; the
product is **gated from go-live** until every component die-line is ADMIN_VERIFIED.
This is how die-lines actually arrive → the natural review unit.

**Lens 2 — By Packaging Type / Shape (the reuse engine).** Open a packaging type →
the **canonical shape** + every partner submission **clustered under it**:
"12 partners submitted this 16oz bottle wrap." Normalize the canonical ONCE →
review 12 auto-matches instead of redrawing 12 times. Where standardization +
leverage live.

**Lens 3 — By Partner.** A partner's full die-line portfolio + parse/compliance
health (onboarding + account review).

The hands-on editor in every lens = the **Curator (Studio)** already built
(Spec ⇄ Frames).

## 4. Recognition (auto-parse) — reading bleed/safe/cut/fold from any upload

Layers of DECREASING authority; each detected line gets confidence + provenance:

1. **Vector box metadata (highest):** PDF `TrimBox`→trim, `BleedBox`→bleed,
   `MediaBox`→sheet. Exact when present.
2. **Layer / spot-channel names:** die|cut|cutter|dieline→cut; bleed; safe|live;
   crease|fold|score→fold; perf→perforation.
3. **Color conventions:** Cyan100→cut, Magenta100→crease/fold, Yellow→perf, spot
   named "Dieline/Cutter"→cut.
4. **Geometry inference (fallback):** outermost closed path=bleed; next inset
   rect=trim; further inset=safe; straight interior segments=folds.

Output: structured spec + per-field `parseAccuracyScore`. (This is C9.d — specced,
unbuilt. `pdf-parse` + `svgo`; AI parser fallback later.)

## 5. Reconversion → unified platform lines

Detected spec → `dielineSvgFromSpec`, which ALWAYS redraws in the locked house
palette regardless of source colors:

- trim = cyan `#00AEEF` · bleed = dashed gray `#9AA0A6` · safe = dashed green
  `#34A853` · valley fold = magenta `#D6219B` · mountain = red `#EA4335` ·
  perforation = dashed orange `#F29900`.

50 partners' divergent files → one consistent visual language in the Studio.

## 6. Frames — partner-placed mandatory elements, mostly self-transferring

The PARTNER already places mandatory-element frames (SOI, Net Quantity,
Manufacturer, Barcode, Nutrition/Supplement Facts, Ingredients, Allergens,
Recycling/Compostability marks, Certifications, Mandatory Phrases, Logo, Imagery)
in their Die-line Studio → persisted as `frames` (FrameLayout, **0..1 of trim
box**).

- **Auto-transfer:** because frames are FRACTIONAL, re-standardizing the trim
  carries them onto the unified die-line with NO manual re-placement. The Curator
  loads them (already wired). Admin reviews, doesn't rebuild.
- **Re-anchor only what breaks:** if normalization re-segments surfaces, any frame
  whose surface no longer exists is flagged "needs re-anchor"; the rest stay put.
- **Reconcile vs canonical:** when matched to a canonical shape with house-standard
  frame ZONES, show partner-placed frames vs canonical zones + "snap to zone."
  Partner intent default; canonical is the guide.
- **Provenance:** per-frame `placedBy: PARTNER | ADMIN`; admin adjustments audited;
  partner's original intent preserved in `EditSnapshot` version history.

## 7. The Conversion Verifier — the trust feature ("is it correct + no data loss?")

A panel in the Curator with FOUR checks, gating ADMIN_VERIFIED:

1. **Three-way onion-skin overlay:** Original ▸ Detected ▸ Normalized at 1:1 with
   a fade slider; a "ghost-diff" highlights in red any place normalized cut/fold
   lines don't sit exactly on the original's.
2. **Measurement audit:** numeric table — detected trim W×H / bleed / fold offsets
   vs partner's DECLARED dims vs the file's bounding boxes, in mm, with tolerance
   bands (±0.5mm green; beyond = amber).
3. **Coverage / unrecognized-elements flag:** account for EVERY path + spot channel
   in the original; anything unclassified (extra die path, unknown foil channel)
   surfaces as "unrecognized — review." Nothing is silently dropped.
4. **Frame preflight (`validateFrameLayout`):** post-normalization, every REQUIRED
   mandatory-element frame present + inside safe area + on a valid surface.

### The safety net that makes aggressive auto-parse safe

The original file is **immutable and is what ships to the printer** (export-bundle
spec). Normalization only produces the Studio-facing twin. So even a missed
mis-detection can't corrupt production — **press uses the partner's untouched
original.** Normalization affects the design preview only; the Verifier catches
that. This is what lets us auto-parse aggressively without risk.

## 8. 3D preview (Three.js, Pacdora-inspired)

The normalized die-line + canonical shape map onto a 3D mesh of the structure
(bottle/jar/pouch/box); artwork as wrap texture.

- **3D is a VERIFICATION surface, not decoration:** a mis-detected fold makes the
  box fold WRONG in 3D — errors a flat view hides become unmistakable when the
  structure won't close cleanly.
- **Confidence-aware:** tentative (low-confidence) folds render dashed/amber in 3D.
- **Scope honestly:** per the Mockup strategy, full parametric structures are
  **Pacdora-gated**. Ship a lightweight Three.js fold preview for PRIMITIVE shapes
  (box / cylinder / pouch) now; reserve complex parametric die-lines for the
  Pacdora decision. The Verifier works in 2D regardless; 3D is the enhanced layer.

## 9. Full per-die-line lifecycle

```
partner uploads file + places mandatory frames
      ↓ (C9.d auto-parse — confidence per line)
system detects bleed/safe/cut/fold  →  reconvert to unified house lines
      ↓
frames auto-carry via 0..1 mapping
      ↓
Conversion Verifier: overlay + measurements + coverage + frame preflight + 3D fold
      ↓ (admin re-anchors/reconciles ONLY flagged items)
admin confirms → ADMIN_VERIFIED → ACTIVE
      ↓
Studio renders the normalized twin · PRESS uses the immutable original
```

## 10. Phasing

- **P1 (mostly UI, no new tables):** Operations workspace — Inbox + the three
  lenses over existing data; each row opens the Curator. Immediate value.
- **P2:** `canonicalShapeId` + manual "map to shape"; Product set-view with the
  go-live completeness gate; frame provenance field.
- **P3:** auto-cluster by geometry + suggested match + canonical propagation; frame
  reconciliation vs canonical zones.
- **P4:** C9.d auto-parse (raw file → draft spec) + the Conversion Verifier
  (overlay + measurement audit + coverage); the last unbuilt pipeline piece.
- **P5:** Three.js 3D fold preview (primitives now, Pacdora-gated parametric later).

## 11a. Frame content fidelity (Pavel 2026-06-23)

Frames today are content-AGNOSTIC typed slots; content resolves per-product at
composition. But a partner may pin DIE-LINE-INTRINSIC content on a frame — specific
mandatory phrases, a "Keep Frozen" mark, recycling symbols — that is NOT derived
from any product. Requirement: whatever the partner places + saves on the die-line
(including that pinned content) must RENDER on the canvas everywhere — admin
Curator, creator Studio, mockups — not just as an empty slot rectangle.

→ Extend the frame model so a frame can carry optional pinned content
(`pinnedContent`: { kind, ref/value }) alongside the scope it resolves from. The
renderer draws pinned content immediately (die-line-intrinsic), and still resolves
product-scoped slots (Nutrition Facts, etc.) when a product context exists. On a
bare die-line (admin authoring, no product) the pinned content + symbol/phrase
frames must still be visible. Provenance per frame: `placedBy: PARTNER | ADMIN`.

BUILT (commit c651d55): `Frame.pinnedContent { text?, symbolSlug? }` + source
widened to PLATFORM|PARTNER|ADMIN. The shared `DielineFrameEditor` renders pinned
text/symbol directly in the frame box, and the selected-frame panel has a
"Pinned text / mark" input — so partner-placed phrases/symbols show on the canvas
in BOTH the partner studio and the admin Curator. Persists via the existing Json
`frames` column (no schema change). FOLLOW-UP: render pinned content in the
creator Fabric Studio (CanvasLayoutShell / DieCutFrame) + a real symbol-library
picker (PackagingSymbol) instead of free text.

## 11b. Admin design authoring on die-lines + AI generation (Pavel 2026-06-23)

The admin pulls a die-line — even one already assigned to a specific package or a
SET of die-lines — and authors a design/template on its shape:
- **Manually** in the Design Studio (admin mode), OR
- **Via an AI tool** that GENERATES a design from an uploaded image or from another
  uploaded design (the deferred "AI Template Generator", DESIGN_TEMPLATE_LIBRARY §9a).

Saved designs **appear immediately everywhere** — the template library + creator
Studio (the existing Regular/Premium save→propagate path).

BUILT (commit after f277662): once a die-line is mapped to a canonical shape
(P2a), the Curator shows **"Design in Studio"** → opens `/studio?adminMode=1&
dieCut={canonicalShapeId}`, i.e. the admin Design Studio on that exact shape. Save
there flows through the existing template library (Regular = all creators, Premium
= Agency). The `canonicalShapeId` mapping is the bridge that makes a partner
die-line designable as a reusable template.

STILL TODO: (1) AI Template Generator — image/design upload → generated layout
(DESIGN_TEMPLATE_LIBRARY §9a, deferred); (2) frame content fidelity (§11a) so
partner-pinned phrases/symbols render on the authored design; (3) authoring on a
SPECIFIC partner die-line shape (not only the canonical), when the admin wants the
exact partner geometry rather than the house-standard.

## 11. Why this is novel

No existing platform does: shape-clustering + canonical propagation (normalize a
shape once, propagate house conventions); set-based product review with a go-live
gate; suggested-match-and-confirm instead of redraw; a Conversion Verifier with a
coverage guarantee on an immutable-original substrate; and 3D used as a
parse-correctness check. The orchestration thesis applied to die-lines.
