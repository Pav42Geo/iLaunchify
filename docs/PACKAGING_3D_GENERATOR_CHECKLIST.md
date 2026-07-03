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

## G3 — Parametric engine + intake auto-pipeline (~8–10d)

- [ ] G3.1 Parametric generators for all 6 StructuralPackTypes, dims from die-line/PackagingType, per-surface UVs — pure + golden-file tests
- [ ] G3.2 Intake auto-job: classify → normalize die-line (exists) → geometry → placeholder surfaces → material guess → 4–6 neutral renders
- [ ] G3.3 Admin review queue in Packaging Studio admin mode (approve/tweak/publish — RAMP-queue ritual)
- [ ] G3.4 Admin uploader modal per plan §1.1 (lanes 2–3: file-kind detect, in-modal dieline/glTF preview, intent switch, inline PackagingType create, dims+unit scale check, attribution, guardrails)
- [ ] G3.5 Library taxonomy filters (packaging type → category → size → styleTags), URL-driven per admin surface pattern

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
