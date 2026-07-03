# 3D Packaging Generator — execution checklist

**Source of truth:** `docs/PACKAGING_3D_GENERATOR_PLAN.md` (v2, decisions LOCKED 2026-07-03). Work top-to-bottom; each slice ends typecheck-green with a commit handed to Pavel. Sequencing LOCKED: **G1+G2 = V1.5, ship first.**

## 0. Pre-flight (before any code)

- [ ] Commit the plan docs (Pavel): plan, checklist, substrate inventory, PACDORA_EVALUATION + MOCKUP_STRATEGY updates, roadmap
- [ ] **Pin the "commercial use" definition** for the license ladder (open question: does Builder's PERSONAL license cover their own channel listings?) → one line in plan §0.3
- [ ] Confirm zone ownership with Code: creator Design Studio "Mockups" panel + LivePreview3DDock edits (canvas = Code's historical zone; agree single-writer per file before G1.3/G2.3)
- [ ] Read `docs/3D_GENERATOR_SUBSTRATE_INVENTORY.md` — do not rebuild anything listed there

## G1 — Realism upgrade (~5–8d)

- [ ] G1.1 `packages/packaging-3d` scaffold (pure, Prisma-free, DI'd; suites registered in run-vitest-suites.mjs)
- [ ] G1.2 PBR preset map keyed to `PackagingMaterial` (matte/gloss laminate, soft-touch, kraft, metal, glass, shrink film) — pure module + unit tests; admin-tunable values in a `MockupRenderSetting` (or LogisticsSetting-pattern) table later, constants first
- [ ] G1.3 HDRI environment + contact shadows/AO wired into `Packaging3DView` (admin) and `LivePreview3DDock` (creator) — CC0 Poly Haven assets vendored, no runtime CDN
- [ ] G1.4 Verify glTF texture swap in-browser (the one untested seam flagged in the inventory) — creator design → CanvasTexture → bound material
- [ ] G1.5 Visual QA pass: one product per StructuralPackType rendered before/after screenshots

## G2 — Render pipeline + library substrate (~6–8d)

- [ ] G2.1 three-gpu-pathtracer integration: progressive preview → final still ≤10s mid hardware (LOCKED budget); PNG → `Asset`
- [ ] G2.2 Schema (additive): `MockupAsset` (packagingTypeId, kind, sourceKind, assetId, cameraPreset, sceneRef?, designAware, isPremium, status) — then `pnpm db:push` → `pnpm db:generate` → `rm -rf apps/*/.next` → restart (3-layer stale-client gotcha)
- [ ] G2.3 Creator "Mockups" panel (Design Studio, finalize step): browse library with own design composited, save favorites
- [ ] G2.4 **Tier gates ship here**: `mockupLicense` PlanFeature `PREVIEW_ONLY|PERSONAL|COMMERCIAL` (Maker/Builder/Agency) + download action gated via `lookupPlanFeature()`; license line in download dialog
- [ ] G2.5 AuditLog on publish/download (`MOCKUP_*` actions); checkout preview stays free-for-all path
- [ ] G2.6 Replace CSS `MockupModal` shapes with real renders

## G2b — Creator Preview → Mockup Library surface (~6–8d · plan §9) — Code-zone, broker first

- [ ] G2b.1 Graduate `MockupModal` into a **mandatory Preview step** after Design Studio (curating optional); route + shell; also expose a **"Revise mockups" modal gallery from the product page** (revisit any time before publish, §9.7)
- [ ] G2b.1b **Always-on default mockup**: auto-wrap product on ≥1 mockup as the canonical **thumbnail** across product list / order list / channel main-image candidate (§9.7)
- [ ] G2b.2 **Design-aware on open** (§0.7): render the current Fabric design (CanvasTexture per surface) onto every library `MockupAsset` — no "apply" step; re-compose on upstream design edits
- [ ] G2b.3 Grid UX: large-thumbnail grid, multi-select (checkbox + Select-all + Shift-range), favorite/star, two-axis browse (packaging type × category/size + style tags), paginate 50
- [ ] G2b.4 Tier gates here: `mockupLicense` PlanFeature `PREVIEW_ONLY|PERSONAL|COMMERCIAL` (Maker/Builder/Agency), watermarked premium preview + corner badge, license line at download; AuditLog `MOCKUP_*`
- [ ] G2b.5 Empty/loading states (never false-empty; progress while composing); progressive disclosure (pick/export up front, size/format behind Advanced)
- [ ] G2b.6 Checkout production-accurate preview stays a separate free deterministic render (locked) — Preview beauty shots never replace it

## G3 — Parametric engine + intake auto-pipeline (~8–10d)

- [ ] G3.1 Parametric generators for all 6 StructuralPackTypes, dims from die-line/PackagingType, per-surface UVs — pure + golden-file tests
- [ ] G3.2 Intake auto-job: classify → normalize die-line (exists) → geometry → placeholder surfaces → material guess → 4–6 neutral renders
- [ ] G3.3 Admin review queue in Packaging Studio admin mode (approve/tweak/publish — RAMP-queue ritual)
- [ ] G3.4 Admin uploader modal per plan §1.1 (lanes 2–3: file-kind detect, in-modal dieline/glTF preview, intent switch, inline PackagingType create, dims+unit scale check, attribution, guardrails)
- [ ] G3.5 Library taxonomy filters (packaging type → category → size → styleTags), URL-driven per admin surface pattern

## G3b — Creator-uploaded mockup bases (~4–6d · plan §9.3) — Code-zone, broker first

- [ ] G3b.1 Creator upload own product photo → **4-corner print-area warp** (reuse `StudioMockup.printAreaQuad` + `matrix3dForQuad`); private + reusable per creator
- [ ] G3b.2 Own-photo mockups are design-aware (creator design composites into the quad live), listed alongside platform library
- [ ] G3b.3 Optional AI background-removal helper (not a gate); white-label / resolution guardrails; content-hash dedupe
- [ ] G3b.4 Tier gate for own-photo mockups (open decision §10.2)

## G7 — Publish-to-channel (~8–10d · plan §9.4) — Code-zone (ChannelAdapter), broker first · Agency-gated (own-channel = COMMERCIAL)

- [ ] G7.0 **`ChannelPublication` FSM** (additive): DRAFT/HELD/SCHEDULED/PUBLISHED/UNPUBLISHED, **per (product × channel)**; FSM helper + AuditLog every transition (never inline)
- [ ] G7.0b **Hold-until-delivered trigger** `publishOn = ON_ORDER_DELIVERED` (+ scheduled datetime): auto-advance HELD→PUBLISHED off the order FSM delivered state; for bulk orders w/ lead time
- [ ] G7.0c **Channel targeting**: publish one / several / **bulk** across the creator's connected+tracked channels; state is per-channel; **Unpublish** = first-class image-scoped pull-back via ChannelAdapter
- [ ] G7.1 **Per-channel compliant export presets** from the spec table (Amazon/Shopify/Etsy/TikTok/Walmart/Google/Meta) — sizes, aspect, bg, format, max-size
- [ ] G7.2 **Main-image legality guardrail**: auto-steer a clean studio render to position 1 for Amazon/TikTok/Walmart; mark scenes supplementary
- [ ] G7.3 Publish flow (Printify pattern): select renders → drag-order → star primary → map per-variant (auto-map flavor presets → variants) → push via **ChannelAdapter**
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
