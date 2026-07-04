# 3D Packaging Generator — execution checklist

**Source of truth:** `docs/PACKAGING_3D_GENERATOR_PLAN.md` (v2, decisions LOCKED 2026-07-03). Work top-to-bottom; each slice ends typecheck-green with a commit handed to Pavel. Sequencing LOCKED: **G1+G2 = V1.5, ship first.**

## 0. Pre-flight (before any code)

- [ ] Commit the plan docs (Pavel): plan, checklist, substrate inventory, PACDORA_EVALUATION + MOCKUP_STRATEGY updates, roadmap
- [ ] **Pin the "commercial use" definition** for the license ladder (open question: does Builder's PERSONAL license cover their own channel listings?) → one line in plan §0.3
- [ ] Confirm zone ownership with Code: creator Design Studio "Mockups" panel + LivePreview3DDock edits (canvas = Code's historical zone; agree single-writer per file before G1.3/G2.3)
- [ ] Read `docs/3D_GENERATOR_SUBSTRATE_INVENTORY.md` — do not rebuild anything listed there

## G1 — Realism upgrade (~5–8d)

- [x] G1.1 `packages/packaging-3d` scaffold (pure, Prisma-free, DI'd; suites registered in run-vitest-suites.mjs)
- [x] G1.2 PBR preset map keyed to `PackagingMaterial` (8 finishes) + `resolvePbrMaterialKind` (slug/SubstrateCategory → kind) — pure module + unit tests; admin-tunable `MockupRenderSetting` table later, constants first
- [x] G1.3a `Dieline3DViewer` (npm three@0.184, shared by LivePreview3DDock + MockupModal): PMREM `RoomEnvironment` env map + contact shadow + `MeshPhysicalMaterial` w/ optional `PbrSurfaceParams` prop; no vendored HDRI asset (procedural room, CC0/no-CDN). Backward compatible, typecheck-green.
- [x] G1.3b `PbrSurfaceParams` re-exported from `@ilaunchify/ui`; `LivePreview3DDock` accepts + forwards `material` (shell drives finish next)
- [x] G1.3c `Packaging3DView` (admin, r128 CDN) r128-safe realism: contact shadow + fill light + finish-aware roughness/metalness seam. Typecheck-green.
- [x] G1.3d `Packaging3DView` migrated off r128 CDN → npm `three@0.184`: PMREM RoomEnvironment env + contact shadow + `MeshPhysicalMaterial` + jsm `GLTFLoader`; dropped `any` (real `@types/three`); orbit/place-mode/markers preserved. `three`+`@types/three` added to `apps/creator` deps (**needs `pnpm install`**). Typecheck-green; **needs browser QA**.
- [x] G1.3e `CanvasLayoutShell` resolves the product's default finish (FOIL_METALLIC→metal; else name→matte/gloss/soft-touch/…) via `resolvePbrPreset` → passes `material` into `LivePreview3DDock`. `@ilaunchify/packaging-3d` added to `apps/creator` deps. Creator app typecheck-green. **Requires `pnpm install`** to create the real workspace link (sandbox used a symlink).
- [~] G1.4 glTF design-texture swap — `Dieline3DViewer` now takes a `modelUrl` prop (jsm GLTFLoader): loads the imported model, centers/scales, applies the design texture (`textureImageUrl`/`textureSvg`) to its materials (first pass = all mesh materials; per-surface binding via `bindGltfMaterialsToSurfaces` is the follow-up), env-lit. **Gated on `modelUrl` → existing callers unaffected.** Typecheck-green; needs browser QA. **NEXT: plumb the packaging type's `model3dUrl` → LivePreview3DDock → viewer so the creator sees their design on the imported model.**
- [ ] G1.5 Visual QA pass: one product per StructuralPackType rendered before/after screenshots

## G2 — Render pipeline + library substrate (~6–8d)

- [ ] G2.1 three-gpu-pathtracer integration: progressive preview → final still ≤10s mid hardware (LOCKED budget); PNG → `Asset`
- [~] G2.2 Schema (additive) `MockupAsset` — **DRAFTED as proposal in plan §4.1** (kind/sourceKind/assetId/designAware/printAreaQuad/taxonomy/isPremium/creatorUserId/status; reuses `MockupTemplateStatus`; distinct from `MockupTemplate`). Pending Pavel sign-off → prisma-migrator → `pnpm db:push` → `pnpm db:generate` → `rm -rf apps/*/.next` → restart (3-layer stale-client gotcha). Do NOT apply unilaterally.
- [ ] G2.3 Creator "Mockups" panel (Design Studio, finalize step): browse library with own design composited, save favorites (`ProductMockupPick` — proposal drafted plan §4.3; uses `filterLibrary`/`facetCounts` + `pickDefaultThumbnail`)
- [ ] G2.4 **Tier gates ship here**: `mockupLicense` PlanFeature `PREVIEW_ONLY|PERSONAL|COMMERCIAL` (Maker/Builder/Agency) + download action gated via `lookupPlanFeature()`; license line in download dialog
- [ ] G2.5 AuditLog on publish/download (`MOCKUP_*` actions); checkout preview stays free-for-all path
- [ ] G2.6 Replace CSS `MockupModal` shapes with real renders

## G2b — Creator Preview → Mockup Library surface (~6–8d · plan §9) — Code-zone, broker first

- [ ] G2b.1 Embed the Mockup Library **inside the existing Product Preview step** (NOT a new route) — expand the current `MockupModal`/preview seam into the full library (browse/favorites/export/publish); also expose a **"Revise mockups" modal gallery from the product page** (revisit any time before publish, §9.7)
- [~] G2b.1b **Always-on default mockup**: auto-wrap product on ≥1 mockup as the canonical **thumbnail** across product list / order list / channel main-image candidate (§9.7). Pure selection built — `render-presets.ts` `pickDefaultThumbnail` (prefer STANDARD_RENDER on hero `front-3q`) + `CAMERA_PRESETS`/`DEFAULT_INTAKE_ANGLES` (also the G3.2 neutral render set). App-side auto-generate + persist thumbnail remains.
- [ ] G2b.2 **Design-aware on open** (§0.7): render the current Fabric design (CanvasTexture per surface) onto every library `MockupAsset` — no "apply" step; re-compose on upstream design edits
- [ ] G2b.3 Grid UX: large-thumbnail grid, multi-select (checkbox + Select-all + Shift-range), favorite/star, two-axis browse (packaging type × category/size + style tags), paginate 50
- [ ] G2b.4 Tier gates here: `mockupLicense` PlanFeature `PREVIEW_ONLY|PERSONAL|COMMERCIAL` (Maker/Builder/Agency), watermarked premium preview + corner badge, license line at download; AuditLog `MOCKUP_*`
- [ ] G2b.5 Empty/loading states (never false-empty; progress while composing); progressive disclosure (pick/export up front, size/format behind Advanced)
- [ ] G2b.6 Checkout production-accurate preview stays a separate free deterministic render (locked) — Preview beauty shots never replace it

## G3 — Parametric engine + intake auto-pipeline (~8–10d)

- [~] G3.1 Parametric geometry — `parametric-geometry.ts` `buildParametricModel(topology, dims)` (pure, tested): primitive BOX/CYLINDER/PLANE per the 10 PackagingTopologies, resolved real-mm bounds (depth derived when omitted), real-size per-surface panels (BOX 6 faces, CYLINDER wrap+caps+lid, PLANE front/back) with decorable/face/role. Real dims now drive `Packaging3DView` proportions (G3.1-viz ✓, done). **NEXT (visible): build actual three.js LatheGeometry from the lathe profile (below) in the Packaging Studio.**
- [x] G3.1b **Lathe container engine** — `lathe-container.ts` `buildLatheContainer(spec)` (pure, tested): real-mm revolve profile for CAN/BOTTLE/JAR/TUB/TUBE + label band + `labelWrapTarget` (circumference × band height = the exact wrap die-line size, 1mm=1mm). This is the LABEL-die-line container path (plan §2.5) — the reliable, real-size, spec-scaled engine (research: CONTAINER_3D_FROM_IMAGE_RESEARCH.md).
- [~] G3.1c Lathe container **rendered in `Packaging3DView`** via `THREE.LatheGeometry(profile)` (CAPSULE_JAR→BOTTLE neck, TUBE→TUBE, else CAN; boxes unchanged) — bottles/tubes now show as real shapes at real proportions. **Done.** Remaining: wrap the label die-line onto the body band (cylindrical UV at `2πr × h`) + `dielineClass` (STRUCTURAL|LABEL) + ContainerModel spec on PackagingType (schema — propose).
- [x] G3.1e **Cross-section loft engine** — `loft-container.ts` `buildLoftContainer(spec)` + `superellipsePoint` (pure, tested): rounded-rect/oval body (superellipse) → shoulder blend → round neck = the Simply-Lemonade bottle family that pure lathe can't do. Outputs sections + sampled rings (bottom→top) + front label band. This is the "created realistic model" path for square/oval bottles (parametric, not AI).
- [ ] G3.1f **(NEXT, visible)** render the loft in `Packaging3DView` — connect the loft rings into a `THREE.BufferGeometry` (loft the body) + caps; admin picks family (round-lathe vs square-loft) + dims.
- [~] G3.1d **AI image-to-3D — DEPRIORITIZED** (Pavel 2026-07-03): not the realism source (won't be realistic; his transparent bottle is worst-case). Container model = parametric (lathe + loft) *created* OR glTF *imported*. AI at most a distant fallback for irregular; do not build now.
- [ ] G3.2 Intake auto-job: classify → normalize die-line (exists) → geometry → placeholder surfaces → material guess → 4–6 neutral renders
- [ ] G3.3 Admin review queue in Packaging Studio admin mode (approve/tweak/publish — RAMP-queue ritual)
- [ ] G3.4 Admin uploader modal per plan §1.1 (lanes 2–3: file-kind detect, in-modal dieline/glTF preview, intent switch, inline PackagingType create, dims+unit scale check, attribution, guardrails)
- [~] G3.5 Library taxonomy filters (packaging type → category → size → styleTags), URL-driven per admin surface pattern. **Pure engine built** — `library-filter.ts`: `SIZE_BUCKETS`/`sizeBucketFor`, `LibraryFilter` + `filterLibrary` (AND across facets, any-of within styleTags, query), `facetCounts` (inline per-facet counts, incl. base-narrowed faceted-search). App-side URL wiring + chips remain.

## G3b — Creator-uploaded mockup bases (~4–6d · plan §9.3) — Code-zone, broker first

- [ ] G3b.1 Creator upload own product photo → **4-corner print-area warp** (reuse `StudioMockup.printAreaQuad` + `matrix3dForQuad`); private + reusable per creator
- [ ] G3b.2 Own-photo mockups are design-aware (creator design composites into the quad live), listed alongside platform library
- [ ] G3b.3 Optional AI background-removal helper (not a gate); white-label / resolution guardrails; content-hash dedupe
- [ ] G3b.4 Tier gate for own-photo mockups (open decision §10.2)

## G7 — Publish-to-channel (~8–10d · plan §9.4) — Code-zone (ChannelAdapter), broker first · Agency-gated (own-channel = COMMERCIAL)

- [x] G7.0 **Publish FSM** — `@ilaunchify/channels/publish-fsm.ts` built (pure, tested): states DRAFT/HELD/SCHEDULED/PUSHED/LIVE/PAUSED/ERROR, `canPublishTransition`, `evaluatePublishRelease`. **EXTENDS existing `ChannelProductLink`+`ChannelPublishState`** — NOT a new model.
- [ ] G7.0a Apply **additive schema delta** (needs Pavel sign-off + prisma-migrator): +HELD/+SCHEDULED enum values, new `ChannelPublishTrigger`, `ChannelProductLink.{publishTrigger,publishAt,heldReason,releaseOnOrderId}` (all nullable/Cockroach-safe) → db:push → db:generate → rm -rf apps/*/.next
- [ ] G7.0b **Hold-until-delivered wiring**: on order FSM → delivered, run `evaluatePublishRelease` for links with `ON_ORDER_DELIVERED`; advance HELD/SCHEDULED→PUSHED (+ AuditLog). Scheduled-datetime sweep for `SCHEDULED_AT`.
- [ ] G7.0c **Channel targeting**: publish one / several / **bulk** across the creator's connected+tracked channels; state is per-channel; **Unpublish** = first-class image-scoped pull-back via ChannelAdapter
- [x] G7.1 **Per-channel compliant export presets** — `@ilaunchify/packaging-3d/channel-export.ts` built (pure, tested): `CHANNEL_IMAGE_SPECS` for shopify/amazon/etsy/tiktok/walmart/google/meta (aspect, px, bg, formats, maxBytes, `verified` flag), `exportTargetFor`/`exportPlan`. Login-gated channels flagged `verified:false` — re-verify before locking.
- [x] G7.2 **Main-image legality guardrail** — `mainImageEligibility` + `pickPrimaryRender` (prefers clean STANDARD_RENDER; null when only scenes on a white-main channel). UI wiring (auto-steer to position 1) lands with G7.3.
- [x] G7.2b **Compliance validator + normalization planner** — `channel-compliance.ts` (pure, tested): `validateForChannel` (format/min-px/bytes/transparency/white-bg/main-legality → ERROR blocks publish, WARN auto-fixable) + `normalizationPlan` (ordered steps: flatten→white-bg→pad-square→downscale→convert→compress, or `CANNOT_FIX` below min res). App layer executes the plan with sharp/canvas at G7.3.
- [ ] G7.3 Publish flow (Printify pattern): select renders → drag-order → star primary → map per-variant (auto-map flavor presets → variants) → push via **ChannelAdapter**. **Readiness gate built** — `publish-readiness.ts` `evaluatePublishReadiness(channels, renders)` (per-channel primary pick + compliance + blockers + overallReady); the publish action calls this before the `ChannelProductLink` FSM.
- [ ] G7.4 Shopify mechanics (first adapter): `fileCreate`/`stagedUploadsCreate` → poll `READY` → attach → variant `mediaSrc` → `productReorderMedia` (pos 0 = featured)
- [ ] G7.5 **Field-scoped re-sync** (image-only default; never clobber SEO/price/tags); warn on imageless new variant; AuditLog on publish
- [ ] G7.6 AI-disclosure: IPTC `DigitalSourceType` on AI scenes + carry marketing-only label through export

## G4 — Fold-from-net (~8–12d, hardest — spike first)

- [ ] G4.1 2-day spike: normalizedSvg cut/crease → FOLD format → Origami-Simulator-style solver → folded mesh (accept/reject approach before committing)
- [ ] G4.2 Production fold engine + per-panel UVs; carton/corrugate types
- [ ] G4.3 Fold animation (bonus, timebox)

## G5 — Scene composer + creator AI scenes (~7–10d)

- [ ] G5.1 Admin scene templates (backgrounds/props/lighting) + path-traced scene renders → library
- [ ] G5.2 AI backgrounds for scenes (product in frame = true render; only scene generated)
- [ ] G5.3 Creator AI scene generation — labeled marketing-only, rate-limited; per-tier quota = PlanFeature rows (numbers TBD at build)
- [ ] G5.4 glTF curation queue + optional Tripo/Meshy admin drafting (needs API key + Pavel go)

## G6 — V2 (do not build now)

- 3D turntable/fold videos (Builder/Agency) · premium re-pricing pass · server render farm if volume demands

## Standing rules (every slice)

- Additive schema only · every mutation writes AuditLog · FSM helpers not inline updates · no @db.Text · tenant ownership guards from packages/auth · typecheck before commit · commit immediately (two-agent tree)
