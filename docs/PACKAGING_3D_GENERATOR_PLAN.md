# In-house 3D Packaging Generator + Mockup Library — build plan

**Status:** PLAN v2 (2026-07-03, updated same day with Pavel's sourcing concept + 3 locked decisions). Triggered by Pacdora's response that they **no longer offer API integration** → `PACDORA_EVALUATION.md` §7.4 resolves to **BUILD**.
**Goal:** the Pacdora experience *inverted*. Pacdora starts from a pre-built model library; **we have no pre-built 3D library and don't want one**. Our models are generated from what partners already give us: **photos + die-lines of their real packaging** (labels, sticker labels, wraps, boxes, cans, pouches…). Real sizes come from the die-line, appearance from the photo. Output: high-realism 3D mockups with real-size die-line placeholder surfaces + generated 2D beauty-shot mockups — with **minimal admin work**.
Locked architecture still governs: **die-line = print master, 3D = derived preview, FDA marks deterministic** (`STUDIO_ARCHITECTURE_3D_2D.md`); **AI never the production-accurate checkout preview** (`MOCKUP_STRATEGY.md`).
**Substrate inventory:** `docs/3D_GENERATOR_SUBSTRATE_INVENTORY.md`.

---

## 0. LOCKED decisions (Pavel 2026-07-03)

1. **Packaging Studio (admin mode) owns ALL mockup *production* (the library of surfaces/geometry/scenes).** Partner photo + die-line intake → 3D generation → materials → standard renders → premium scene composer, one pipeline, one surface. (Matches die-line Curator already living in Packaging Studio, C9.g.) **AMENDED 2026-07-03 (Pavel):** "creator only *consumes*" is superseded — the creator now has a **first-class side** of the mockup job (see §9). Admin still *produces* the shared library; the creator *personalizes* it (their design pre-composited), *contributes* their own mockup bases, and *publishes* channel-ready images to their connected stores. Two sides of one job, not one.
2. **Creators CAN AI-generate scene mockups** at finalize time — clearly **labeled marketing-only**, never the production-accurate checkout preview. Reuses the AI try-on loop + rate limiter.
3. ~~All mockups free at launch~~ **SUPERSEDED same day → tier-gated at launch (Pavel):**
   - **Maker:** free **in-app preview only** — browse the library, see their design on the 3D/scene mockups; **no downloads**.
   - **Builder:** mockup downloads + premium 2D/3D scene mockups + AI scenes — **non-commercial/internal use license**.
   - **Agency:** everything Builder has + **commercial-use license** (ads, channel listings, client work) + (later) videos.
   - The **production-accurate checkout preview stays free for all tiers** — it's a platform function (the creator must see what they're buying), not a monetized mockup.
   - All gates via `lookupPlanFeature()` (PlanFeature rows, db-driven, non-code); `isPremium` + download flags on MockupAsset.
4. (Direction) **Generating from partner imagery is in-scope** — AI image-to-3D drafting is an admin-side accelerant, always admin-verified against die-line dims before ACTIVE.
5. **Three intake lanes, one pipeline** (Pavel 2026-07-03): (a) partner uploads photos + die-lines; (b) admin uploads a **source 2D image** himself → same auto-generation pipeline; (c) admin uploads **ready-to-use 2D and 3D mockups** directly. All land in the same library, organized by **packaging type, category, size** (+ style tags).

6. **The creator has a first-class side of the mockup job** (Pavel 2026-07-03). Admin *produces* the library; the creator *personalizes / contributes / publishes*. The two sides share one substrate (`MockupAsset` + the packaging-3d engine), differ only in surface and permissions. Build the admin side first (already planned), then the creator side (new §9) reusing every piece.

7. **Design-aware on open — no "apply" step** (Pavel 2026-07-03). When the creator opens the Mockup Library, **every mockup already wears their current design**, composited live. They browse *their own product*, not blank templates. This is the Kittl/Smartmockups/Pacdora convention (live wrap / AI auto-place / real-time 3D). Implementation = the creator's Fabric canvas → CanvasTexture per surface (exists) rendered against each library geometry/quad; nothing to "apply."

8. **The Mockup Library lives INSIDE the existing product preview step — NOT a new step** (Pavel 2026-07-03, corrected). The creator flow keeps its current shape: `Design Studio → **Product Preview** → Checkout`. The product-preview surface that already exists (the design-aware preview / `MockupModal` seam already sitting in the canvas) **gains** the full Mockup Library — browse, favorites, export, publish — in place. Do **not** insert an extra route between design and checkout. The **production-accurate checkout preview stays a separate, free, deterministic render** (locked) — the library's beauty shots never replace it.

9. **Creators publish channel-ready mockups straight to their connected channels** (Pavel 2026-07-03). From the Preview screen the creator selects renders → exports **per-channel compliant image sets** → pushes them into the product listing gallery on Shopify / TikTok Shop / Etsy / Amazon / Walmart via the existing **ChannelAdapter** seam (see docs/CHANNEL_MANAGEMENT_SPEC.md). Mirror Printify's Mockup-Library publish flow: pick which sync, order them, star a primary, map per-variant, **field-scoped re-sync** (image-only by default, never clobber channel SEO/pricing). Research: docs/MOCKUP_LIBRARY_UX_RESEARCH.md.

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

### 4.1 `MockupAsset` schema (G2.2 proposal — additive; needs Pavel sign-off + prisma-migrator; NOT applied)
Distinct from `MockupTemplate` (the 2D photo-mask *template*, schema ~L5248, which stays as-is). `MockupAsset` is the **library item** — one rendered/generated/curated mockup. Reuses `MockupTemplateStatus` (DRAFT/ACTIVE/ARCHIVED) and the `Asset` soft-FK + cuid conventions already in the schema. A design-aware 2D item can carry its own `printAreaQuad` so the creator's design composites onto it (unifies the photo-mask path into the library).

```prisma
enum MockupAssetKind   { STANDARD_RENDER  SCENE_2D  SCENE_3D_VIDEO  AI_SCENE }
enum MockupAssetSource { GENERATED  ADMIN_SCENE  ADMIN_READY_2D  ADMIN_READY_3D  CREATOR_AI }
// reuse existing enum MockupTemplateStatus { DRAFT ACTIVE ARCHIVED }

model MockupAsset {
  id              String               @id @default(cuid())
  packagingTypeId String
  packagingType   PackagingType        @relation(fields: [packagingTypeId], references: [id], onDelete: Cascade)
  kind            MockupAssetKind
  sourceKind      MockupAssetSource
  // The rendered image / video / glTF file (soft FK → Asset, like MockupTemplate.baseImageAssetId).
  assetId         String
  title           String?
  // Can the creator's design wrap onto it? false for unbindable ready-mades → never the checkout preview.
  designAware     Boolean              @default(true)
  // Design-aware 2D compositing (optional): 4 corners TL,TR,BR,BL in 0..1 + which surface.
  printAreaQuad   Json?
  surfaceKey      String?
  // 3D/scene metadata
  cameraPreset    String?              // 'front-3q' | 'hero' | 'top' …
  sceneRef        String?              // scene-template id for SCENE_* / AI_SCENE
  // Browse taxonomy (packaging type × category × size × style) — filters URL-driven.
  categorySlug    String?              // one of the 13 locked product categories
  styleTags       String[]             // DesignLibraryItem styleTags vocab
  widthMm         Decimal?             // explicit dims for ready-mades; else derive from PackagingType
  heightMm        Decimal?
  depthMm         Decimal?
  // Tier gate (§0.3): premium items are download/Builder-Agency; license via lookupPlanFeature at action time.
  isPremium       Boolean              @default(false)
  // Ownership: null = admin/platform library; set = creator-owned (CREATOR_AI scenes, own-photo).
  creatorUserId   String?              // soft FK → User
  sourcePartnerId String?              // soft FK → Partner (lane-1 provenance/attribution)
  status          MockupTemplateStatus @default(DRAFT)
  displayOrder    Int                  @default(0)
  createdAt       DateTime             @default(now())
  updatedAt       DateTime             @updatedAt

  @@index([packagingTypeId, status])
  @@index([kind, status])
  @@index([categorySlug, status])
  @@index([creatorUserId])
}
// + back-relation on PackagingType:  mockupAssets MockupAsset[]
```
Cockroach-safe (cuid ids, `String[]`, `Decimal?`, enums; no `@db.Text`). After apply: `pnpm db:push` → `pnpm db:generate` → `rm -rf apps/*/.next` → restart.

### 4.2 `MockupRenderSetting` — admin-tunable PBR presets (proposal; additive; NOT applied)
Makes G1.2's `PBR_PRESETS` constants **DB-driven** (plan G1.2 "admin-tunable values in a table later"). One row per finish kind; the app reads the row and overrides the packaging-3d constant, which stays the fallback. LogisticsSetting/OrderSettings pattern (admin-editable knobs, code has safe defaults).

```prisma
model MockupRenderSetting {
  id                 String   @id @default(cuid())
  // The PbrMaterialKind ('MATTE_LAMINATE' | 'GLOSS_LAMINATE' | 'SOFT_TOUCH' |
  // 'KRAFT' | 'UNCOATED_PAPER' | 'METAL' | 'GLASS' | 'SHRINK_FILM').
  kind               String   @unique
  roughness          Float
  metalness          Float
  clearcoat          Float
  clearcoatRoughness Float
  transmission       Float
  ior                Float
  thickness          Float
  sheen              Float
  sheenRoughness     Float
  envMapIntensity    Float
  suggestedBaseColorHex String?
  updatedByAdminId   String?  // soft FK → User (admin who last tuned it)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt
}
```
Resolution order at render time: `MockupRenderSetting[kind]` (if present) → `PBR_PRESETS[kind]` (packaging-3d constant). Global knobs (default env intensity, contact-shadow opacity, HDRI choice) can ride as extra rows or a small singleton later — presets first. `Float` is Cockroach-safe.

### 4.3 `ProductMockupPick` — creator favorites/curation (proposal; additive; NOT applied)
The creator's saved selection of library mockups for a product (§9.2 favorites + §9.7 "revise mockups" curation). Decoupled from channel publish (that ordering/primary lives per-channel in `ChannelProductLink` media, §9.4).

```prisma
model ProductMockupPick {
  id            String      @id @default(cuid())
  productId     String
  product       Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  mockupAssetId String      // soft FK → MockupAsset
  // Starred as a keeper / the creator's default beauty shot for this product.
  pinned        Boolean     @default(false)
  displayOrder  Int         @default(0)
  createdAt     DateTime    @default(now())

  @@unique([productId, mockupAssetId])
  @@index([productId, pinned])
}
// + back-relation on Product:  mockupPicks ProductMockupPick[]
```
The always-on default thumbnail (§9.7) = the auto-generated STANDARD_RENDER picked by `pickDefaultThumbnail`; a creator pin overrides it. Cockroach-safe. Draft alongside G2b when the creator panel lands.

## 5. Phases

| Phase | Scope | Effort | Ships |
|---|---|---|---|
| **G1 — Realism upgrade** | PBR presets per PackagingMaterial + HDRI + shadows in Packaging3DView + LivePreview3DDock; verify glTF texture swap | ~5–8d | Visible quality jump on everything that already renders |
| **G2 — Render pipeline + library substrate** | three-gpu-pathtracer render → PNG Asset; `MockupAsset` model (admin-produced library) | ~6–8d | Layer-C renders replace CSS MockupModal; library exists |
| **G2b — Mockup Library in the existing Product Preview step** (see §9) | Embed the library in the **existing Product Preview** (not a new step); **design pre-composited on every mockup on open** (§0.7); grid + multi-select + favorites; tier gates (`mockupLicense`) + license-at-download | ~6–8d | The creator UX Pavel asked for — browse *their* product on the library, save favorites, export |
| **G3 — Parametric engine + intake auto-pipeline** | 6 StructuralPackTypes parametric from die-line dims; §1 auto job + admin review queue in Packaging Studio | ~8–10d | Partner upload → approved 3D mockup with near-zero admin work |
| **G3b — Creator-uploaded mockup bases** (see §9.3) | Creator uploads own product photo → **4-corner print-area warp** (reuses `printAreaQuad` + `matrix3dForQuad`); private, reusable, design-aware | ~4–6d | Beats Mediamodifier's PSD-only path; own-photo mockups |
| **G4 — Fold-from-net** | normalizedSvg → FOLD → folded carton mesh + per-panel UVs; fold animation bonus | ~8–12d (hardest) | Cartons/corrugate photoreal |
| **G5 — Scene composer + creator AI scenes** | Admin scene templates + AI backgrounds; creator AI scene generation (labeled, rate-limited); glTF curation queue + Tripo/Meshy drafting | ~7–10d + API keys | The "awesome mockups" tier (tier-gated per §0.3) |
| **G7 — Publish-to-channel** (see §9.4) | Per-channel **compliant export presets** + main-image legality guardrail; push into listing gallery via **ChannelAdapter**; order/star-primary/per-variant map; field-scoped re-sync | ~8–10d | Creator publishes channel-ready mockups straight to Shopify/TikTok/Etsy/Amazon/Walmart |
| **G6 — Video** (deferred) | 3D turntable/fold videos (Builder/Agency) | — | V2 |

Sequencing (LOCKED 2026-07-03): **G1+G2+G2b land in V1.5** (~3 wks) — delivers the Pacdora feel *and* the creator Preview surface with design-aware library, **including the tier gates** (preview free / downloads + premium Builder-Agency, PlanFeature rows ship with G2b). G3/G3b then G7 (channel publish) follow; G4–G5 as scheduled. V1 checkout keeps the 2D photo-mask (LOCKED).

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

## 9. The creator side — Preview → Mockup → Publish (Pavel 2026-07-03)

New locked scope (§0.6–0.9). Full UX research + citations: **docs/MOCKUP_LIBRARY_UX_RESEARCH.md**. This is the *creator* half of the mockup job; the admin half (§1–§4) produces the shared library, this half personalizes/contributes/publishes it. Reuses the same `MockupAsset` substrate + packaging-3d engine — no parallel stack.

**Flow:** `Design Studio → **Product Preview** → Checkout` — **unchanged**. The Mockup Library is embedded **inside the existing Product Preview step** (NOT a new step, Pavel corrected 2026-07-03). Product Preview is already the step after the Design Studio; it simply gains the library. **Selecting/adding mockups is optional** — the creator may pass through without curating, and the platform **always auto-wraps the product onto ≥1 default mockup** (§9.7) so a beauty thumbnail always exists.

### 9.1 Design-aware library on open (§0.7 — the headline)
The instant the creator lands on Preview, the grid **already shows their current design on every mockup** — no "apply." Mechanism = existing creator Fabric canvas → `CanvasTexture` per surface, rendered against each library item's geometry/quad (the `LivePreview3DDock` + `MockupModal` pipeline, promoted to a full surface). Design edits upstream re-compose the whole grid. This is the Kittl "edit once, all mockups update" / Smartmockups AI-auto-place / Pacdora real-time-3D convention.

### 9.2 Preview surface UX (must-haves, from research §6)
- **Visual grid, comparison-first**: large thumbnails, hierarchy + whitespace; the design already on each. Two-axis browse (packaging type × category/size + style tags) shared with the admin library.
- **Multi-select + Select-all + Shift-range + favorites/star** (Polaris resource-list); ≤2 promoted bulk actions ("Export images", "Publish to store"), rest in overflow; paginate past 50.
- **Never-blank / never-false-empty**: progress indicator while renders compose; first-run empty state teaches + one CTA.
- **Progressive disclosure**: pick / export / publish up front; size/format/channel-mapping behind "Advanced."
- **Tier gates (§0.3)**: Maker = in-app preview only (no download); Builder = downloads (PERSONAL); Agency = COMMERCIAL. Full watermarked preview of premium/scene mockups + corner badge; upgrade prompt at the download friction point; **license line stated at the download moment**.
- **WYSIWYG trust**: exported image == preview; AI/marketing-only renders labelled distinctly from the production-accurate checkout preview (which stays free + deterministic).

### 9.3 Creator-uploaded mockup bases (G3b)
Creator uploads their **own product photo** → drags a **4-corner print area** → their design warps onto it (reuses `StudioMockup.printAreaQuad` + `matrix3dForQuad`, already in `MockupModal`). Private + reusable per creator; design-aware like the rest. Optional AI background-removal helper (not a gate). Research finding: **no major competitor exposes an in-browser 4-corner/displacement editor** — this is a leapfrog, and cheap because the substrate exists.

### 9.4 Publish-to-channel (G7) — mirror Printify, gated by a publish state model
- **Per-channel compliant export presets** (the differentiator — nobody bakes these): auto-produce a compliant image set per connected channel from the channel spec table in the research doc (Amazon 1:1 ≥1600 pure-white RGB255 product≥85%; Shopify 2048²; Etsy ≥2000 <1MB no-transparency; TikTok 1:1 white main; Walmart 2200² seamless-white; etc.).
- **Main-image legality guardrail**: on Amazon/TikTok/Walmart the *first* image must be plain-white product-only — auto-steer a clean studio render into position 1 and mark lifestyle/scene renders as supplementary. No competitor does channel-aware primary selection.
- **Publish flow** (Printify pattern): select which renders sync → drag-order → **star primary** → **map per-variant** (auto-map flavor presets → Shopify variants) → push into the listing gallery via **ChannelAdapter** (docs/CHANNEL_MANAGEMENT_SPEC.md). Shopify mechanics: `fileCreate`/`stagedUploadsCreate` → poll `READY` → attach to product → variant `mediaSrc` points at product media → `productReorderMedia` (position 0 = featured).
- **Field-scoped re-sync**: image-only by default; never clobber channel-side title/description/price/tags; **warn when a new variant would publish imageless** (Printify's lesson).
- **AI-disclosure**: write IPTC `DigitalSourceType` on AI scenes (Google Merchant) + carry the marketing-only label through export.

#### 9.4.1 Publish state model (LOCKED 2026-07-03, Pavel) — publishing is never auto-immediate
The creator controls *when* and *where*, because on-demand vs bulk changes the timing calculus. **EXTEND the existing `ChannelProductLink` + `ChannelPublishState` (schema.prisma ~L4322) — do NOT add a new `ChannelPublication` model** (the per-(product × channel) link, per-variant `ChannelVariantLink`, mode, `lastPushedAt`, and "transitions only via the @ilaunchify/channels FSM helper" rule all already exist). Never publish silently on save.

- **States** (existing enum `DRAFT/PUSHED/LIVE/PAUSED/ERROR` + two additive values `HELD`, `SCHEDULED`). Plan-term ↔ enum: PUBLISHED = `LIVE`, UNPUBLISHED = `PAUSED`. Happy path `DRAFT → PUSHED → LIVE`; hold path `DRAFT → HELD/SCHEDULED → PUSHED → LIVE`. FSM helper: **`@ilaunchify/channels` `publish-fsm.ts`** (`canPublishTransition`, `evaluatePublishRelease`), pure + tested. Every transition writes AuditLog (server action).
- **HELD** — creator explicitly holds. **Bulk orders with lead time**: publish should *not* fire immediately; the creator can **hold until the order is delivered**, then publish. Trigger `ON_ORDER_DELIVERED` auto-advances HELD → PUSHED when the linked production order reaches delivered (release guard `evaluatePublishRelease`, hooks the order FSM — not a manual reminder). `SCHEDULED_AT` datetime and `MANUAL` also supported.
- **PAUSED (unpublish)** — removes/hides the listing images via the same ChannelAdapter (per-field, image-scoped) — a first-class action, not a delete.
- **Channel targeting:** publish to **one selected connected channel, several, or bulk-publish to all** the creator's connected channels. State is **per channel** (a product can be `LIVE` on Shopify while `HELD` on TikTok) — already true, since `ChannelProductLink` is keyed `@@unique([channelId, productId])`.
- **First adapter target:** **Shopify** (cleanest media API, no white-bg rule) — the FSM + per-channel fan-out is channel-generic, so TikTok/Etsy/Amazon/Walmart adapters slot behind the same helper.

**Additive schema delta (proposed — needs Pavel sign-off + prisma-migrator; NOT yet applied):**
```prisma
enum ChannelPublishState { DRAFT  HELD  SCHEDULED  PUSHED  LIVE  PAUSED  ERROR }   // + HELD, SCHEDULED
enum ChannelPublishTrigger { MANUAL  SCHEDULED_AT  ON_ORDER_DELIVERED }             // new
model ChannelProductLink {
  // …existing…
  publishTrigger   ChannelPublishTrigger @default(MANUAL)
  publishAt        DateTime?   // SCHEDULED_AT armed time
  heldReason       String?     // why HELD (creator note / "await delivery")
  releaseOnOrderId String?     // soft FK → production Order whose delivered state releases the hold
}
```
All additive/nullable (Cockroach-safe: enum-value adds + nullable cols; no `@db.Text`). After apply: `pnpm db:push` → `pnpm db:generate` → `rm -rf apps/*/.next` → restart (3-layer stale-client gotcha).

### 9.5 Reuse (creator side adds almost no new substrate)
`MockupModal` + `StudioMockup`/`printAreaQuad`/`matrix3dForQuad` · `LivePreview3DDock` CanvasTexture pipeline · `MockupAsset` (shared) · packaging-3d engine (G1–G4) · `lookupPlanFeature()` tier gates · AI try-on loop + rate limiter (creator AI scenes) · **ChannelAdapter** seam + connected-channel registry (channel publish) · `saveDesignMockupRender` render-chain.

### 9.7 Default mockup + revisit-anytime from the product page (LOCKED 2026-07-03, Pavel)
- **Always-on default mockup:** even if the creator skips curating on the Preview step, the platform auto-generates **at least one mockup of the product wrapped in the design** and stores it as the product's **canonical thumbnail** — used across the creator **product list, order list, and channel listing** so nothing is ever thumbnail-less. Default pick = a clean studio render on the product's primary surface (also the channel-legal main-image candidate, §9.4).
- **Revisit from the product page:** each product on the creator's product page carries a **"Revise mockups" affordance** (a suggested/creative-idea prompt + button) that opens a **modal mockup gallery** — the same design-aware library — so the creator can add/swap/re-curate mockups **any time before publishing to channels**, decoupled from the one-time linear flow. This modal is the pre-publish gateway: curate here, then hand off to the §9.4 publish state model.

### 9.6 Zone / ownership note
The Preview surface + `MockupModal`/`LivePreview3DDock` live in the **creator Design Studio canvas = Code's historical single-writer zone**. G2b/G3b/G7 must be brokered single-writer-per-file with Code before build (pre-flight item). Cowork owns the packaging-3d engine + admin library; the creator canvas seam is coordinated.

## 10. Creator-side decisions — RESOLVED (Pavel 2026-07-03)
1. **Preview screen** — ✅ LOCKED (corrected): the Mockup Library is embedded in the **existing Product Preview step — NOT a new step**; flow stays Design Studio → Product Preview → Checkout. **Curating mockups is optional**; platform always produces a default wrapped thumbnail (§9.7); a "Revise mockups" modal on the product page lets the creator re-curate any time before publish.
2. **Creator-uploaded mockup bases (G3b)** — ✅ LOCKED: **Builder + Agency**. Maker uses the platform library only.
3. **Publish-to-channel (G7)** — ✅ LOCKED: not a single "first channel + immediate push" — a **publish state model** (DRAFT/HELD/SCHEDULED/PUBLISHED/UNPUBLISHED, §9.4.1) with **hold-until-order-delivered** trigger, **per-channel state**, and **select-one / several / bulk** publish across connected channels. **Shopify** is the first adapter; the FSM is channel-generic.
4. **"Commercial use" definition** — ✅ LOCKED: publishing to the creator's **own live sales channel = COMMERCIAL use → Agency tier**. Builder's PERSONAL license = internal/proofing/export only, not channel publish. (Resolves the pre-flight license-ladder question too.)

Remaining open:
- **AI scenes on the Preview screen** — same rate limiter + caps as the AI try-on loop, or a separate quota? (G5 build-time PlanFeature.)
- **Bulk-order "hold until delivered" default** — should HELD→PUBLISHED-on-delivery be the *default* for bulk orders (opt-out), or always creator-initiated? (Decide at G7 build.)

---
*Supersedes the Pacdora-gated 3D path in `MOCKUP_STRATEGY.md` §V2 and `PACDORA_EVALUATION.md` (RESOLVED 2026-07-03). Creator-side scope (§9) added 2026-07-03; research in `MOCKUP_LIBRARY_UX_RESEARCH.md`.*
