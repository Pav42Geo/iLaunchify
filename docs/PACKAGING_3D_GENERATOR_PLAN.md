# In-house 3D Packaging Generator — build plan

**Status:** PLAN for discussion (2026-07-03). Triggered by Pacdora's response that they **no longer offer API integration** → `PACDORA_EVALUATION.md` §7.4 resolves to **BUILD**.
**Goal:** the Pacdora experience, adapted to us — creator's flat 2D design → **high-realism 3D mockup**, live in Studio and as checkout/marketing-grade renders — while keeping our locked architecture: **die-line = print master, 3D = derived preview, FDA marks deterministic** (`STUDIO_ARCHITECTURE_3D_2D.md`), and **AI never the production-accurate checkout preview** (`MOCKUP_STRATEGY.md`).
**Substrate inventory:** `docs/3D_GENERATOR_SUBSTRATE_INVENTORY.md` (compiled 2026-07-03).

---

## 1. What "Pacdora-like" actually decomposes into

Pacdora = four capabilities. We already own most of the hard, differentiated parts:

| Capability | Pacdora | Us today | Gap |
|---|---|---|---|
| 1. Geometry (model of the container) | 500+ template library | Parametric BOX/CYLINDER/FLAT in `Dieline3DViewer` + glTF path (`model3dKey` + surface binding, unit-tested) | Parametric engine for all 6 StructuralPackTypes; fold-from-net for cartons |
| 2. Design binding (flat art → surfaces) | UV-mapped templates | Fabric canvas → CanvasTexture live 3D (`LivePreview3DDock`), die-line frames, surface↔face binding | Per-panel UV mapping from normalizedSvg; glTF texture swap verification |
| 3. Realism (materials + lighting) | PBR + studio lighting | Basic three.js materials | **The visible gap**: substrate PBR presets, HDRI, shadows/AO |
| 4. Output (renders, scenes, animation) | PNG/video/scenes | PNG capture exists (viewer) | Checkout-grade path-traced render → Asset; scene presets |

So this is NOT a from-zero build. It's (a) a realism upgrade, (b) a parametric+fold geometry engine, (c) a render pipeline.

## 2. Architecture — three layers, one new package

New pure package **`packages/packaging-3d`** (Prisma-free, DI'd like `packages/shipping`; pure suites in run-vitest-suites.mjs):

```
[Geometry source]        [Binding]                  [Realism + output]
 A. Parametric engine →   surface ↔ UV region →      PBR material presets (per PackagingMaterial)
 B. Fold-from-net     →   Fabric CanvasTexture →     HDRI studio envs + contact shadows
 C. Curated glTF      →   deterministic FDA marks →  real-time preview (WebGL) 
                                                     + path-traced still render → Asset
```

**Geometry sources, in priority order:**
- **A. Parametric primitives** — dims from PackagingType → generated geometry with correct per-surface UVs. Covers the 6 StructuralPackTypes (jar, can, bottle, pouch, tube, box) = the bulk of CPG SKUs. Deterministic, cheap, no assets needed.
- **B. Fold-from-net** — for folding cartons/corrugate: `normalizedSvg` cut/crease layers → **FOLD format** → fold solver → folded mesh with per-panel UVs. Adapt the MIT-licensed [Origami Simulator](https://github.com/amandaghassaei/OrigamiSimulator) approach + [FOLD spec](https://github.com/edemaine/fold) (three.js-native, proven). Our die-line parse (`dielineParse.ts`) already separates cut vs crease.
- **C. Curated glTF** — already supported (Model3DSource, material→surface resolver). Admin curation queue for complex/long-tail shapes. Optional accelerant: AI image-to-3D ([Tripo API](https://www.tripo3d.ai/api) / Meshy) drafts a glTF from the partner's white-label photo → **admin verifies against real dims before ACTIVE** (open decision §6.1).

**Realism layer (the "wow" gap):**
- Substrate **PBR presets keyed to `PackagingMaterial`** (G3 typed capabilities): matte/gloss laminate, soft-touch, kraft, metal can, glass jar, shrink film — roughness/metalness/clearcoat/normal params, admin-tunable.
- **HDRI studio environments** (Poly Haven, CC0) + camera presets + contact shadow/AO.
- **Real-time** = three.js WebGL PBR in the existing dock (good-enough live preview).
- **Checkout/marketing-grade** = progressive path tracing **in-browser** via [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer) (renders in seconds client-side, zero server GPU cost) → saved as `Asset` on DesignVersion/OrderItem. Server-side headless render farm deferred until volume justifies it.

## 3. Phases

| Phase | Scope | Effort | Ships |
|---|---|---|---|
| **G1 — Realism upgrade** | PBR presets per PackagingMaterial + HDRI + shadows in Packaging3DView + LivePreview3DDock; verify glTF texture swap in-browser | ~5–8d | Immediately visible quality jump on everything that already renders |
| **G2 — Render pipeline** | three-gpu-pathtracer "Generate mockup" → PNG Asset (Studio + checkout preview + creator marketing download); camera/scene presets | ~4–6d | Layer-C renders replace CSS MockupModal shapes |
| **G3 — Parametric engine** | All 6 StructuralPackTypes parametric with per-surface UVs, dims from PackagingType; replaces BOX/CYLINDER/FLAT fallback | ~6–8d | Every packaging type gets a real 3D mockup with zero admin asset work |
| **G4 — Fold-from-net** | normalizedSvg → FOLD → fold solver → folded carton mesh + per-panel UVs; fold animation as a bonus | ~8–12d (hardest) | Cartons/corrugate photoreal + the fold animation moment |
| **G5 — Curation + long-tail** | Admin glTF curation queue in Studio (C9.g pattern); optional Tripo/Meshy admin-side drafting; scene/background library | ~5d + API key | Long-tail shapes without hand-modeling |

Sequencing note: **G1+G2 first** — they deliver the Pacdora "feel" on existing geometry in ~2 weeks. G3/G4 widen coverage. V1 checkout keeps the 2D photo-mask (LOCKED); 3D renders slot in as the Layer-C upgrade when G2 lands (suggested V1.5, no longer V2-blocked since the external dependency is gone).

## 4. What we explicitly do NOT build

- No Pacdora-style public template marketplace — our library is PackagingType-driven.
- No AI-generated geometry straight to creators — AI drafts are admin-curated only (locked principle: checkout preview must faithfully represent the physical product).
- No server GPU render farm in V1.5 — in-browser path tracing first.
- No video renders / configurators until stills prove demand.

## 5. Reuse map (already built, zero rework)

`Dieline3DViewer` (raycasting, PNG capture) · `LivePreview3DDock` (CanvasTexture live design) · `gltf-surface-binding.ts` + `surface-face.ts` (deterministic, tested) · `dielineSvg.ts` / `dielineParse.ts` (cut/crease separation) · `packaging-surfaces.ts` resolver · schema: `Model3DSource`, `PackagingType.model3d*`, `PackagingDieline`, MockupTemplate substrate.

## 6. Open decisions (Pavel)

1. **AI image-to-3D as admin accelerant** (G5) — allowed under the "AI never production-accurate" principle if admin verifies dims before ACTIVE? Or geometry stays hand-curated?
2. **Sequencing** — pull G1+G2 into V1.5 (recommended; external blocker gone) or keep all 3D in V2?
3. **Render budget** — target quality/time for the path-traced still (e.g., ≤10s on mid hardware)?
4. **Asset licensing** — CC0 (Poly Haven) HDRIs/materials only, or budget for licensed studio sets?

---
*Supersedes the Pacdora-gated 3D path in `MOCKUP_STRATEGY.md` §V2 and `PACDORA_EVALUATION.md` (RESOLVED 2026-07-03).*
