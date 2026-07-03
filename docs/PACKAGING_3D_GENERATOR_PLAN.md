# In-house 3D Packaging Generator + Mockup Library — build plan

**Status:** PLAN v2 (2026-07-03, updated same day with Pavel's sourcing concept + 3 locked decisions). Triggered by Pacdora's response that they **no longer offer API integration** → `PACDORA_EVALUATION.md` §7.4 resolves to **BUILD**.
**Goal:** the Pacdora experience *inverted*. Pacdora starts from a pre-built model library; **we have no pre-built 3D library and don't want one**. Our models are generated from what partners already give us: **photos + die-lines of their real packaging** (labels, sticker labels, wraps, boxes, cans, pouches…). Real sizes come from the die-line, appearance from the photo. Output: high-realism 3D mockups with real-size die-line placeholder surfaces + generated 2D beauty-shot mockups — with **minimal admin work**.
Locked architecture still governs: **die-line = print master, 3D = derived preview, FDA marks deterministic** (`STUDIO_ARCHITECTURE_3D_2D.md`); **AI never the production-accurate checkout preview** (`MOCKUP_STRATEGY.md`).
**Substrate inventory:** `docs/3D_GENERATOR_SUBSTRATE_INVENTORY.md`.

---

## 0. LOCKED decisions (Pavel 2026-07-03)

1. **Packaging Studio (admin mode) owns ALL mockup production.** Partner photo + die-line intake → 3D generation → materials → standard renders → premium scene composer, one pipeline, one surface. Design Studio (creator) only *consumes* the library. (Matches die-line Curator already living in Packaging Studio, C9.g.)
2. **Creators CAN AI-generate scene mockups** at finalize time — clearly **labeled marketing-only**, never the production-accurate checkout preview. Reuses the AI try-on loop + rate limiter.
3. ~~All mockups free at launch~~ **SUPERSEDED same day → tier-gated at launch (Pavel):**
   - **Maker:** free **in-app preview only** — browse the library, see their design on the 3D/scene mockups; **no downloads**.
   - **Builder:** mockup downloads + premium 2D/3D scene mockups + AI scenes — **non-commercial/internal use license**.
   - **Agency:** everything Builder has + **commercial-use license** (ads, channel listings, client work) + (later) videos.
   - The **production-accurate checkout preview stays free for all tiers** — it's a platform function (the creator must see what they're buying), not a monetized mockup.
   - All gates via `lookupPlanFeature()` (PlanFeature rows, db-driven, non-code); `isPremium` + download flags on MockupAsset.
4. (Direction) **Generating from partner imagery is in-scope** — AI image-to-3D drafting is an admin-side accelerant, always admin-verified against die-line dims before ACTIVE.
5. **Three intake lanes, one pipeline** (Pavel 2026-07-03): (a) partner uploads photos + die-lines; (b) admin uploads a **source 2D image** himself → same auto-generation pipeline; (c) admin uploads **ready-to-use 2D and 3D mockups** directly. All land in the same library, organized by **packaging type, category, size** (+ style tags).

## 1. The sourcing pipeline (inverse-Pacdora) — the admin-relief core

Three intake lanes (§0.5), one Packaging Studio pipeline:

```
LANE 1 — Partner uploads (already collected)       Auto job (new)                                Admin (Packaging Studio, admin mode)
├─ white-label product photos (Layer A)   →   1. classify → StructuralPackType (6)      →   Review queue card:
└─ die-line files (PartnerFile)           →   2. normalize die-line (exists)                 ✓ approve geometry/size
                                              3. REAL dims from die-line → geometry          ✓ tweak material preset
LANE 2 — Admin source image                   4. surfaces = real-size die-line placeholders  ✓ pick hero angle
└─ admin uploads a 2D photo/reference     →   5. material preset guess from photo            → PUBLISH to library
   (+ picks packaging type & dims if          6. standard renders (4–6 angles, neutral)
   no die-line exists yet)

LANE 3 — Admin ready-made assets (no generation, straight to curation)
├─ ready 2D mockup image → print-area quad via existing PrintAreaEditor (= the built MockupTemplate photo-mask path)
└─ ready 3D model (glTF) → existing surface-binding path so creator designs still wrap; if unbindable, publish as
   static/scene-only (not design-aware) — flagged so it never serves as the checkout preview
```

Admin never models anything in lanes 1–2. The default path is **approve, not author** — same ritual as the partner RAMP queue. Manual overrides (re-draw quad, swap material, AI-draft geometry from photo for odd shapes) are exceptions, not the flow. Lane 3 is pure curation: upload → tag → publish.

### 1.1 Admin uploader modal (lanes 2–3 intake UX — Pavel sketch 2026-07-03)

Pop-up modal in **Packaging Studio (admin mode)** — one modal serves both admin lanes; one session can submit multiple linked files (e.g. source photo + die-line for the same packaging):

1. **Upload window** — drag/drop + picker; **file-kind auto-detect** (SVG/PDF/AI/DXF → die-line; JPG/PNG → photo/ready-2D; GLB/glTF → ready-3D) with manual override chip; type/size validation inline.
2. **Preview pane** — renders on upload: image preview for photos/ready-2D; for die-lines, run `dielineParse` client-side and show the **recognized cut/crease layers + coverage warnings** in-modal (catch bad files at upload, not later); for glTF, spin it in the existing `Dieline3DViewer` and show **surface-binding result** (design-aware ✓ / static-only).
3. **Intent switch** — "**Generate from this**" (lane 2: source image/die-line → §1 auto-pipeline) vs "**Ready-to-use mockup**" (lane 3: straight to library as DRAFT).
4. **Packaging assignment** — pick existing PackagingType or **create one inline** (admin owns taxonomy — name, structural type, dims); category + size auto-fill from it.
5. **Name + metadata** — display name; **dimensions + unit (mm/in) with scale check** (declared dims vs SVG viewBox — what makes "real size" trustworthy); material/substrate + finish; capacity/volume; style tags; camera/angle tag for ready-2D; notes.
6. **Source attribution** — optional: which partner the file came from (links PartnerFile provenance) + rights note; files immutable after submit, re-upload = new version.
7. **Submit** — lane 2 kicks the auto-generation job (progress surfaces in the review queue); lane 3 lands in the library as DRAFT → admin publishes. Everything audited (`MOCKUP_*` actions, existing pattern).

Guardrails: min photo resolution, white-label check (no branding in source photos — preset reject reason), duplicate detection by content hash, ready-3D without surface binding auto-flagged `designAware=false`.

(Partner-side lane-1 uploads keep their existing flow — product photos + die-line files already arrive via the partner editor; no new partner surface needed for V1 of this.)

## 2. What "Pacdora-like" decomposes into

| Capability | Pacdora | Us today | Gap |
|---|---|---|---|
| 1. Geometry | 500+ pre-built library | Parametric BOX/CYLINDER/FLAT in `Dieline3DViewer` + glTF path (`model3dKey` + tested surface binding) | Parametric engine for all 6 StructuralPackTypes; fold-from-net; **intake auto-pipeline** |
| 2. Design binding | UV-mapped templates | Fabric canvas → CanvasTexture live 3D (`LivePreview3DDock`), die-line frames, surface↔face binding | Per-panel UV from normalizedSvg; glTF texture swap verification |
| 3. Realism | PBR + studio lighting | Basic three.js materials | **The visible gap**: substrate PBR presets, HDRI, shadows/AO |
| 4. Output | PNG/video/scenes, credits | PNG capture exists | Render→Asset pipeline; **mockup library**; scene composer; video (deferred) |

## 3. Architecture — three layers, one new package

New pure package **`packages/packaging-3d`** (Prisma-free, DI'd like `packages/shipping`; pure suites in run-vitest-suites.mjs):

- **Geometry sources, priority order:**
  - **A. Parametric primitives** — real dims from the die-line/PackagingType → generated geometry with per-surface UVs. Covers the 6 StructuralPackTypes = bulk of CPG.
  - **B. Fold-from-net** — folding cartons/corrugate: `normalizedSvg` cut/crease → **FOLD format** → fold solver → folded mesh + per-panel UVs. Adapt MIT-licensed [Origami Simulator](https://github.com/amandaghassaei/OrigamiSimulator) + [FOLD spec](https://github.com/edemaine/fold). `dielineParse.ts` already separates cut vs crease.
  - **C. glTF** — already supported. Admin-curated; AI image-to-3D ([Tripo](https://www.tripo3d.ai/api)/Meshy) drafts from partner photos for odd shapes, admin-verified (locked §0.4).
- **Binding:** creator Fabric canvas → CanvasTexture per surface (exists); die-line panel ↔ UV region mapping; deterministic FDA marks composited as vector layer (exists).
- **Realism + output:** PBR presets keyed to `PackagingMaterial` (matte/gloss laminate, soft-touch, kraft, metal, glass, shrink film — admin-tunable) + HDRI studio envs (Poly Haven CC0) + contact shadows. Real-time = WebGL PBR in the dock. Checkout/marketing stills = in-browser progressive path tracing ([three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer)) → `Asset`. No server GPU in V1.5.

## 4. The Mockup Library (new model)

- **`MockupAsset`** (additive): packagingTypeId, kind (`STANDARD_RENDER` | `SCENE_2D` | `SCENE_3D_VIDEO` | `AI_SCENE`), sourceKind (`GENERATED` | `ADMIN_SCENE` | `ADMIN_READY_2D` | `ADMIN_READY_3D` | `CREATOR_AI`), assetId, cameraPreset, sceneRef?, `designAware` bool (can the creator's design wrap onto it — false for unbindable ready-mades), **isPremium** + download gating per §0.3 tier model, status DRAFT→ACTIVE.
- **Organization/browse taxonomy** (admin library + creator panel share it): **packaging type** (structural, 6 types) → **product category** (13 locked) → **size** (dims from the die-line/PackagingType; explicit dims for lane-3 ready-mades) → style tags (reuse DesignLibraryItem styleTags pattern). Filters URL-driven like every admin list surface.
- **Access (§0.3 tier model):** Maker previews everything in-app (standard renders + scene mockups with their design composited) but downloads nothing; Builder/Agency download renders + get premium scenes/AI scenes (+ videos in V2). Checkout-accurate preview free for all.
- **Scene composer** (Packaging Studio admin mode): pick generated 3D model → choose scene template (background, props, lighting) or AI background → path-traced render → publish to library. AI backgrounds allowed — the *product* in frame is the true render; only the scene is generated (consistent with the locked AI principle).
- **Creator flow (Design Studio, finalize/pre-checkout):** design done → "Mockups" panel on the product → browse library renders of *their own design* (composited live) → pick/save favorites → optionally **AI-generate a scene** (labeled marketing-only, rate-limited) → checkout preview itself stays the production-accurate render (locked).

## 5. Phases

| Phase | Scope | Effort | Ships |
|---|---|---|---|
| **G1 — Realism upgrade** | PBR presets per PackagingMaterial + HDRI + shadows in Packaging3DView + LivePreview3DDock; verify glTF texture swap | ~5–8d | Visible quality jump on everything that already renders |
| **G2 — Render pipeline + library substrate** | three-gpu-pathtracer render → PNG Asset; `MockupAsset` model + creator "Mockups" panel (browse + save) | ~6–8d | Layer-C renders replace CSS MockupModal; library exists |
| **G3 — Parametric engine + intake auto-pipeline** | 6 StructuralPackTypes parametric from die-line dims; §1 auto job + admin review queue in Packaging Studio | ~8–10d | Partner upload → approved 3D mockup with near-zero admin work |
| **G4 — Fold-from-net** | normalizedSvg → FOLD → folded carton mesh + per-panel UVs; fold animation bonus | ~8–12d (hardest) | Cartons/corrugate photoreal |
| **G5 — Scene composer + creator AI scenes** | Admin scene templates + AI backgrounds; creator AI scene generation (labeled, rate-limited); glTF curation queue + Tripo/Meshy drafting | ~7–10d + API keys | The "awesome mockups" tier — still all free (§0.3) |
| **G6 — Video** (deferred) | 3D turntable/fold videos (Builder/Agency) | — | V2 |

Sequencing (LOCKED 2026-07-03): **G1+G2 land in V1.5** (~2–3 wks) — delivers the Pacdora feel on existing geometry, **including the tier gates** (preview free / downloads + premium Builder-Agency, PlanFeature rows ship with G2). G3–G5 follow. V1 checkout keeps the 2D photo-mask (LOCKED).

## 6. What we explicitly do NOT build

- No pre-built/licensed 3D template marketplace — geometry comes from partner die-lines + photos.
- No AI geometry straight to creators — AI drafts are admin-verified only.
- No server GPU render farm in V1.5 — in-browser path tracing first.
- No monetization machinery at launch — `isPremium` flag only (§0.3).

## 7. Reuse map (zero rework)

`Dieline3DViewer` · `LivePreview3DDock` · `gltf-surface-binding.ts` + `surface-face.ts` · `dielineSvg.ts` / `dielineParse.ts` · `packaging-surfaces.ts` · MockupTemplate substrate + PrintAreaEditor (2D masks stay as V1 + photo fallback) · AI try-on loop + rate limiter · RAMP-queue review pattern · schema: `Model3DSource`, `PackagingType.model3d*`, `PackagingDieline`.

## 8. Open decisions — RESOLVED (Pavel 2026-07-03)

1. **Sequencing** — ✅ LOCKED: **G1+G2 pull into V1.5**; G3–G5 follow, G6 (video) V2.
2. **Render budget** — ✅ LOCKED: **≤10s path-traced still on mid hardware** (progressive preview shows immediately, refines to final).
3. **Asset licensing + downloads** — ✅ LOCKED: **CC0 assets only** (Poly Haven; no licensed-set budget). License ladder: **Maker = preview-only in-app, no downloads; Builder = downloads, non-commercial; Agency = commercial use** (Pavel 2026-07-03). Encode as `mockupLicense` PlanFeature: `PREVIEW_ONLY | PERSONAL | COMMERCIAL`; downloads watermark-free only where licensed; surface the license line in the download dialog.
4. **Monetization** — ✅ LOCKED (supersedes §0.3 v1): **NOT free at launch** — premium mockups + downloads are Builder/Agency features via `lookupPlanFeature()`. Maker keeps free preview.

Remaining open: creator AI scene caps per tier (quota numbers = PlanFeature rows, decide at G5 build time).

---
*Supersedes the Pacdora-gated 3D path in `MOCKUP_STRATEGY.md` §V2 and `PACDORA_EVALUATION.md` (RESOLVED 2026-07-03).*
