# iLaunchify AI Packaging Design Generator — architecture + build plan

Status: **PLAN (design locked direction, not built)** · Drafted 2026-06-23 · Owner Pavel
Related: [[DESIGN_TEMPLATE_LIBRARY]], [[DIELINE_MANAGEMENT_UX]], [[MOCKUP_STRATEGY]],
[[LABEL_RENDERING_STANDARD]], `packages/nutrition`, `packages/ui/src/canvas`, Brand Kit.

> One-line thesis: **everyone else generates a pretty picture and hopes the legal
> zones are right. We generate the creative layer with AI and render the regulated
> + real-product layer deterministically — onto a real, manufacturable die-line.**
> That is the moat. "Compliance-true AI packaging."

---

## 0. Why this, why now

Pavel asked us to study Packify.ai (and Pacdora's AI Creation panel) in exhaustive
detail, take everything useful, and beat it — specifically by folding in the
FDA-required and recommended symbols/phrases and the *real product data* iLaunchify
already holds, so the generated artwork is correct, not decorative fiction.

The screenshots show the state of the art and its fatal flaw in one frame: Packify's
beautiful "Mood Cookies" box renders the brand as **"TMOOD COOKES"**, the ingredients
as **"STRULEC COUOLES STALUAAFELES"**, and invents a Nutrition Facts panel plus
"Manufacturer: Wal Mart." Gorgeous, unusable, and in a regulated category, a legal
liability. We are the one platform that already owns the *true* version of every one
of those elements (recipe → engine → label artifacts; brand → Brand Kit; structure →
normalized die-line + frames). So we don't have the text-fidelity problem the whole
category has — because **we never ask the AI to draw the text that matters.**

---

## 1. Competitive teardown — what to take, what to beat

### Pacdora — "AI Creation" panel (screenshots 1–4)
- **Structured prompt scaffold**: `product / brand / style / elements / colors`, each a
  fillable slot. Kills the blank-prompt problem. **TAKE.**
- **Chip palettes** behind `+Style / +Color / +Element` (Minimal, Vintage, Luxury…;
  Vibrant, Morandi, Pastel…; Florals, Botanicals, Celestial…). **TAKE** — but map ours
  to our `styleTags` vocabulary so it threads into template matching + Brand Kit.
- **Generates onto the real die-line**: the flat with true dims (202/315/62 mm) is the
  canvas; a 3D preview with Open⇄Close fold slider + Outside/Inside + package-colour
  swatches sits beside it. **TAKE — and we already built `Dieline3DViewer` + substrates.**
- GPT-4o + ~6k 3D mockups; reviewers say Pacdora needs the *least* rework before
  production because it emits a real dieline. That bar is the one to clear.

### Packify.ai — "design agent" (screenshots 5–24)
- **Chat-first intake**: "What type of packaging are you creating?" → analyzes intent,
  extracts Packaging Type / Main Colour Tone / Key Visual Elements / brand name. **TAKE**
  the conversational refinement, but seed it from our structured product data, not from
  scratch.
- **Guided form**: Product, Brand, Logo upload (Beta), Packaging, Elements, Style, Color.
- **Three-tab inspiration modal**: Theme Color (palette picker), **Competitive Analysis**
  (upload a competitor pack photo → AI reverse-engineers a descriptive prompt you can
  Copy/adapt), Packaging Style (40+ chips). **TAKE Competitive Analysis — it's the
  standout**, and we can do it better by grounding it in the creator's niche + category.
- **Packaging-type picker** (box / stand-up pouch / mailer / bottle / jar / gable bag /
  tube / cup) drives the *rendering model*. **TAKE — maps 1:1 to our `StructuralPackType`
  / `PackagingType` taxonomy.**
- **Generate → 4 photoreal variations** in lifestyle settings, thumbs up/down, Re-design,
  Download all, "Not satisfied? Get expert design" (human fallback). **TAKE all of it.**
- Per-design hover: **Download · Edit · Export dieline · AI background.**
- **AI Background / AI Photography**: cut out the pack, drop it into generated scenes
  (orchids, driftwood). **TAKE — we already have the Mockup Strategy Layer A/B/C + admin
  mockup manager; this is the "Layer C in scenes" extension.**
- **Export dieline → Choose-a-Mockup → 3D edit → AI editor** (Images/Text/Shapes/Layers)
  → manually edit all text → **export high-res dieline** → opens in Illustrator with a
  proper *Dieline information* legend (Bleed/Trim/Crease, material, thickness). **This
  whole bridge is exactly our Studio + die-line normalization + Curator + prepress
  export.** We already own it; Packify bolts it on, we have it native.
- **Weaknesses to beat**: garbled text in the regulated zones, invented Facts panel,
  invented manufacturer, no domain/market awareness, no true ingredient/allergen data,
  no real barcode/GTIN.

### The wider field (web research, June 2026)
- AI image models still **garble on-pack copy**; Midjourney/Flux fail legibility.
  **Ideogram v3** and **Recraft v3** are the text-rendering leaders (Ideogram ~75–82%
  correct on short strings; Recraft adds palette control + **vector/SVG output**), but
  *none* is print-safe for legal text. Conclusion that drives our whole architecture:
  **AI draws mood, never the mandatory text.**
- Pacdora is the only competitor that emits a real dieline; that's the production bar.
- Human-in-the-loop "get expert design" is a common monetized fallback.

**Net:** take the intake scaffolding, chips, competitive analysis, packaging-type→model
routing, 4-variations + photography, and the dieline-export bridge. Beat them on the
one axis they structurally can't fix without our data: **correctness.**

---

## 2. The core idea — two-layer generation

Every generated design is the composite of two layers with a hard boundary between them:

```
  ┌─────────────────────────────────────────────────────────────┐
  │  CREATIVE LAYER  (AI-generated, per panel, structure-locked)  │
  │  • background art, illustration, pattern, texture, mood        │
  │  • brand colour fields, hero imagery, decorative type accents  │
  │  • generated INTO the normalized die-line geometry + bleed     │
  └─────────────────────────────────────────────────────────────┘
                              ⊕  composited, never overlapping
  ┌─────────────────────────────────────────────────────────────┐
  │  TRUTH LAYER  (deterministic vector, pinned into frames)      │
  │  • Statement of Identity, net quantity, brand name (Brand Kit) │
  │  • the regulated Facts panel  (Nutrition / Supplement / Drug / │
  │    INCI / AAFCO)  ← from @ilaunchify/nutrition, NOT the AI      │
  │  • ingredient list + allergen statement  ← from the recipe     │
  │  • required + recommended marks/phrases per domain × market    │
  │  • GTIN/UPC barcode, manufacturer of record, lot/expiry slots  │
  └─────────────────────────────────────────────────────────────┘
```

The **frames model we already built** (`@ilaunchify/ui/canvas/frames.ts`, scoped slots
RECIPE/MATERIAL/PRODUCT/IDENTITY/CREATIVE with `pinnedContent` + provenance) *is* the
boundary. CREATIVE-scope frames are where the AI is allowed to paint; every other scope
is a reserved zone the AI must leave clear and we fill with truth. The partner already
places mandatory-element frames on the die-line; those become **negative-space masks**
the generator must respect.

This is why our output is print-safe and theirs isn't: the legal/real content is never
in the diffusion model's hands.

---

## 3. How it reuses what we already built

| Need | Already shipped | Role in the generator |
|---|---|---|
| Manufacturable canvas | Die-line normalization + Curator + `normalizedSvgKey` | The generation substrate — true geometry, bleed, fold lines |
| Reserved vs paintable zones | Scoped **frames** + `pinnedContent` + provenance | The CREATIVE/TRUTH boundary + mandatory-element masks |
| Regulated panels | `@ilaunchify/nutrition` + 5 SVG renderers (Nutrition/Supplement/Drug/INCI/AAFCO) | The TRUTH layer, rendered deterministically per market/audience |
| Real product data | ProductTemplate / recipe / SoI / GTIN / allergens | Auto-fills brand, ingredients, net qty, barcode |
| On-brand generation | **Brand Kit** (palette, fonts, logo, BrandTemplate) | Seeds prompt + recolor + locks logo/type |
| Recolour to palette | `recolor` engine + `canRecolorTemplate` | Post-gen palette conform |
| 3D check | **`Dieline3DViewer`** (just built) + substrates | Pacdora-style preview + parse-correctness |
| Photography | Mockup Strategy A/B/C + admin mockup manager + `PrintAreaEditor` | "AI Background" / lifestyle scenes |
| History | EditSnapshot + Version History | Every generation is a snapshot; restore/compare |
| Templates | [[DESIGN_TEMPLATE_LIBRARY]] (domain × shape × style) | Admin saves a generation as a premium template |
| Export | Prepress preflight + dieline export bundle | Print-ready AI/PDF with Bleed/Trim/Crease legend |

The generator is mostly **orchestration glue over modules that already exist** plus one
new external dependency (an image-gen provider) and a thin per-panel compositor.

---

## 4. Generation pipeline

```
1. INTAKE          structured slots (product/brand/style/elements/colors) +
                   packaging-type picker + optional competitive-analysis reference.
                   Auto-seeded from the ProductTemplate, niche, audience tags, Brand Kit.
2. PROMPT ASSEMBLY deterministic prompt builder → merges slots + style chips + brand
                   palette/fonts + substrate + "negative prompt: no text in reserved
                   zones, leave panel margins clear". Pure, testable, no model call.
3. STRUCTURE LOCK  load normalized die-line + frames. Build a per-panel mask: CREATIVE
                   frames = paintable; TRUTH frames + Facts panel bbox = keep-clear.
4. GENERATE        per-panel (or per-face) image-gen call with the mask (inpaint /
                   ControlNet-style structure conditioning). N variations. Backgrounds
                   + illustration only; decorative type via a text-capable model
                   (Ideogram/Recraft) ONLY in CREATIVE frames, never for legal copy.
5. COMPOSITE       place generated art into CREATIVE frames on the die-line; render the
                   TRUTH layer (Facts panel, SoI, ingredients, allergens, barcode,
                   required marks/phrases) as vector pinned into its frames.
6. PREVIEW         flat die-line + Dieline3DViewer (fold slider, substrate) + 4 variants.
7. REFINE          thumbs up/down, re-roll a panel, recolor-to-palette, swap style,
                   chat ("make the hero bigger"), or open in the full Studio to edit.
8. EXPORT          prepress preflight → print-ready dieline (PDF/AI w/ Bleed-Trim-Crease
                   legend) + PNG/3D for sharing. Or (admin) save as a premium template.
```

Steps 1–3, 5, 8 are deterministic and **fully testable in-sandbox today**. Step 4 is the
only model-dependent piece and is isolated behind a provider interface.

---

## 5. Model strategy (provider-abstracted)

One internal interface, swappable providers, because the field moves monthly:

- **Backgrounds / illustration / pattern / mood** → a strong general model with
  structure conditioning (Flux/SDXL family + ControlNet, or provider equivalent),
  driven by the panel mask so art respects geometry + bleed.
- **Decorative type accents inside CREATIVE frames** → text-capable model
  (**Ideogram v3 / Recraft v3**; Recraft can return vector/SVG + palette control).
- **Legal / mandatory / real-data text** → **never a model.** Deterministic vector
  from our engines. This is the rule that makes us print-safe.
- **AI photography / backgrounds-in-scene** → image-to-image over the composited pack
  (Mockup Layer C), reusing the mockup manager's print-area quads.

Interface sketch (`packages/ai-design` or `packages/imagegen`):
`generatePanelArt({ prompt, negativePrompt, maskPng, width, height, n }) → ImageRef[]`.
Cost-, rate-, and content-moderation-gated; provider key lives in the Integrations
registry (env-backed, already built). Reuse the existing AI rate-limiter (Tier 0.4).

---

## 6. The differentiator in detail — compliance-true injection

Pavel's headline ask. For the product being designed, before/after generation we inject
the **required and recommended** elements for its `labelingType` (domain) × `marketCode`
(jurisdiction). These are data, rendered as vector, pinned to frames — never AI-drawn.

Per domain × market, a **Mandatory-Element Pack** (extends the existing FDA rule packs /
`packages/compliance`) supplies:

- **Required text**: Statement of Identity, net quantity statement (FDA placement +
  type-size rules), ingredient list, allergen "Contains" statement, name+address of
  manufacturer/packer/distributor, the regulated **Facts panel** (already rendered by
  `@ilaunchify/nutrition`), domain-specific warnings (Drug Facts, supplement
  "These statements have not been evaluated…", etc.).
- **Required symbols/marks**: where applicable — e.g. recycling/resin codes, **℞**/
  Rx-only, cosmetics PAO (period-after-opening), "est;" e-mark (EU), Tidyman, etc.,
  scoped by market (US active now, CA/EU schema-ready per [[ilaunchify-markets-and-regions]]).
- **Recommended (non-mandatory) marks/phrases**: cert badges the product actually holds
  (we already reconcile `certBadges`), QR to brand/COA, storage/handling, "best by",
  social handles — surfaced as *suggestions* the creator can accept.
- A **live compliance gate** (`frame-compliance` already exists): the generated design
  cannot export until every required element for its domain×market is present, legible
  at minimum type size, and inside the safe area. The generator literally **cannot
  produce a non-compliant artifact** — the opposite of the Packify screenshot.

Output of the generator is therefore a design that is *simultaneously* a marketing
asset and a regulatory-correct artifact, with a coverage report ("all 9 required
elements present; 2 recommended marks available").

This is build-to-spec, deterministic, test-anchored — consistent with
[[ilaunchify-labels-are-regulated-build-to-spec]]. The marks/phrases library is
admin-curated and versioned (reuse the `MaterialMark` model pattern), so counsel can
sign off and we can reproduce any artifact for legal defense.

---

## 7. Two audiences, one engine (Pavel 2026-06-23)

The same generation engine serves two surfaces, gated by capability/tier:

### A. Admin — **Premium Template Authoring**
- Lives in the **admin Design Studio "Admin Mode"** (already built: `/studio?adminMode=1`,
  Admin Mode badge) next to the Die-line Curator. The same `AiCreatePanel` mounts here,
  unmetered.
- Admin generates against a canonical die-line → curates → **"Save as premium template"**,
  which **classifies the saved template on two axes** (Pavel 2026-06-23):
  1. a **Packaging category** — the marketplace Product Category / packaging taxonomy the
     template is offered under (so creators find it by category), and
  2. a **die-line template** it *belongs to* — the canonical `DieCutTemplate` (shape) the
     generation was authored against, so the template only shows for products on a
     compatible die-line.
  Plus the existing `domain × style`, `isPremium`, `tier`, `colorRoles` (recolor) fields
  from [[DESIGN_TEMPLATE_LIBRARY]]. The save writes/updates a library `BrandTemplate` row
  linked to `packagingCategoryId` + `dieCutTemplateId`, and stamps the source
  `AiDesignGeneration.savedTemplateId`.
- These become the high-quality, compliance-correct starting points creators pick from —
  filtered by category + matched to their product's die-line shape.
- Gated by `requireCapability('catalog:write')`.

### B. Creators — **Builder & Agency self-serve** (NOT Maker)
- Lives in the **creator Design Studio** as an "AI Create" entry in the left rail
  (alongside Elements/Brand/Templates).
- Builder/Agency only — Maker uses the premium template library + recolor, but does not
  get raw generation (cost + positioning). Gate via `packages/auth` tier helpers, same
  pattern as `canRecolorTemplate` / Agency label download.
- Creator generations are **constrained harder**: their Brand Kit logo/fonts are locked
  in, their product's real data + mandatory pack is auto-injected, recolor conforms to
  their palette. Fewer footguns, more on-brand.
- **Credits**: generation consumes credits (Pacdora/Packify both meter — note the "30"
  counter in the screenshots). Tie to tier (monthly allotment) + top-ups via the
  existing payments stack. Admin generation is unmetered.

Both paths share: the pipeline (§4), the truth layer (§2/§6), the 3D preview, export.
Difference is entry point, guardrail strength, who can save-as-template, and metering.

---

## 8. UX surface (the "AI Create" panel)

Mirrors the best of both competitors, themed to our locked design system (pink/black
pill/neon-on-dark), inside the existing Studio chrome:

- **Left rail entry "AI Create"** → opens a panel with:
  - Structured prompt scaffold (Product/Brand/Style/Elements/Colors) **pre-filled** from
    the product + Brand Kit (our edge: it starts 80% complete).
  - Chip palettes (`+Style / +Color / +Element`) bound to our `styleTags` vocab.
  - **Competitive Analysis**: drop a reference pack → reverse-prompt grounded in the
    product's niche/category → editable.
  - **Packaging-type** is already known (the product has a die-line) — shown, not asked.
  - Reference image upload; "email me when ready"; **Generate** (shows credit cost).
- **Right**: `Dieline3DViewer` small window → fullscreen (already built), substrate
  swatches, Outside/Inside.
- **Result tray**: 4 variations, thumbs up/down, Re-roll, Recolor-to-palette, **Edit in
  Studio**, **Export dieline**, **AI background** (scenes). "Get expert design" → support
  ticket to a human (reuse `@ilaunchify/support`).
- **Compliance chip** always visible: "9/9 required present" green, or "missing net
  quantity" with a jump-to-fix — gates export.

---

## 9. Data model (additive, cast-guard pattern)

- `AiDesignGeneration` — one generation run: `productTemplateId?`, `dielineId?`,
  `brandId?`, `authorUserId`, `scope` (ADMIN_TEMPLATE | CREATOR), `promptJson`
  (assembled slots), `provider`, `model`, `status` FSM (QUEUED→RUNNING→READY→FAILED),
  `variationKeys[]` (R2), `creditsSpent`, `complianceReport Json`, audit.
- `AiPromptPreset` — admin-curated style/color/element chip vocab (maps to `styleTags`).
- `AiGenerationCredit` — ledger (mirror the `SampleCredit` pattern): grant by tier,
  consume per run, top-up via payments. Admin scope = unmetered.
- `MandatoryElementPack` — per `labelingType` × `marketCode`: required/recommended
  elements + marks (versioned; extends `packages/compliance` rule packs + `MaterialMark`).
- Reuse: `BrandTemplate`/library template (`isPremium`/`tier`/`colorRoles`), `EditSnapshot`
  (each generation = a snapshot), frames, `certBadges`.

All additive; ships behind the cast-guard pattern so it typechecks pre-`db push`.

---

## 10. Phased build plan

Dependency-gated. P0–P2 are buildable/testable **with zero external deps today**
(deterministic pieces); the model call (P3) needs one provider integration.

- **P0 — Prompt + compliance engines (pure, testable now)**
  - `packages/ai-design`: deterministic `assemblePrompt(slots, brandKit, substrate)` +
    `negativePromptFor(frames)` (keep-clear zones). Golden tests.
  - `MandatoryElementPack` resolver: `requiredElements(labelingType, marketCode)` →
    list + which are already satisfied by product data. Golden tests. (No model.)
- **P1 — Structure lock + compositor (pure)**
  - Per-panel mask builder from normalized die-line + frames (CREATIVE vs keep-clear).
  - Compositor: place art refs into CREATIVE frames + render TRUTH layer (reuse nutrition
    SVG + frame `pinnedContent`). Output a composited preview SVG/PNG. Golden tests.
  - Wire `Dieline3DViewer` + compliance gate. Fully demoable **without any AI** using
    placeholder art tiles.
- **P2 — UX shell (no model)**
  - "AI Create" panel (admin + creator entries), intake scaffold pre-filled, chips,
    Competitive-Analysis stub (reverse-prompt deferred to P4), result tray, credit chip,
    tier gating (Builder/Agency + admin capability). Runs end-to-end on placeholder art.
- **P3 — Image-gen provider integration** *(needs: provider key + `packages/imagegen`)*
  - Provider interface + first adapter (background/illustration w/ structure conditioning).
  - `AiDesignGeneration` FSM + credits ledger + rate-limit + moderation.
  - Replace placeholder art with real generations. **This is the unlock.**
- **P4 — Text-capable accents + Competitive Analysis** *(needs: Ideogram/Recraft)*
  - Decorative type in CREATIVE frames only; reference-image → reverse-prompt.
- **P5 — AI Photography / backgrounds-in-scene** *(reuses Mockup A/B/C)*
- **P6 — Admin "save as premium template"** + creator credit top-ups + "Get expert
  design" → support ticket.

Each phase typechecks + commits independently; P0/P1 carry golden suites like the rest
of the die-line stack.

---

## 11. Risks + guardrails

- **Text fidelity** → solved by architecture: AI never draws legal text (§2/§5).
- **Compliance liability** → mandatory pack + export gate + reproducible vector artifacts
  + counsel-reviewed marks library (per [[ilaunchify-operational-philosophy-v1]]).
- **Cost** → credits/metering, per-panel (not whole-sheet) regen, caching, tier gating.
- **IP / copyright** → originate styles, don't imitate named artists/brands; competitive
  analysis extracts *attributes* (palette, layout, mood) not pixels; moderation on refs.
- **Provider lock-in** → provider-abstracted interface; key in Integrations registry.
- **Two-agent collisions** → creator Studio canvas is Code's hot zone; land `packages/
  ai-design` + `packages/imagegen` as new packages, wire the Studio panel behind a flag,
  hand Code a single-writer spec for the canvas mount (per [[ilaunchify-two-agent-hot-file-collisions]]).

---

## 12. Provider & economics (locked direction 2026-06-23)

### Stack
- **Raster backgrounds/illustration** → **fal.ai FLUX.1 [dev] + ControlNet**, the
  `flux-general` **inpainting** endpoint (takes ControlNet + IP-Adapter + LoRA). We
  feed it the keep-clear mask (§2) so it paints CREATIVE zones only; the Brand Kit
  logo/board rides in as the **IP-Adapter reference** for on-brand output. ~$0.075/MP
  (ControlNet rate), billed rounded up to the nearest MP. Flux [dev] is non-commercial
  weights but **hosted fal inference is licensed for commercial use** — keep it on fal.
- **In-frame decorative type** → **Recraft** (v3/v4), **vector/SVG output** ($0.08),
  best-in-class text fidelity + palette control. Drops straight into the Fabric/SVG
  layer, stays crisp. CREATIVE frames only — never legal/mandatory text.
- **Finalize** → an **upscaler**, not native print-res generation. Upscaling an approved
  ~1 MP draft to 300 DPI is cheaper and preserves the chosen composition.

### Two-stage cost model (the hinge)
Drafts are cheap (~1 MP each); print resolution is the expensive lever and only paid on
the **one** finalized design — not all four drafts.
- **Draft cycle** (4 concepts @ ~1 MP, Flux+ControlNet): **~$0.32**.
- **Finalize** (upscale the chosen concept to print res + one Recraft vector pass):
  a 120×180 mm panel ≈ 3 MP ≈ **~$0.23**; a large carton 8–16 MP ≈ **$0.60–1.20**.

### Tiering (Pavel's resolution-vs-quantity idea → a per-period megapixel budget)
Sell **two meters**, not a confusing resolution slider:
1. **Draft generations / period** — cheap, generous.
2. **Finalize megapixel budget / period** — the real lever. A creator spends it on
   **many small labels OR a few big cartons** (same budget, their choice), with a
   **max single-render res** cap per tier. Because MP is exactly fal's billing unit,
   margin is predictable.

Starting numbers (DEFAULT_TIER_LIMITS in `@ilaunchify/imagegen` — **Pavel tunes**):

| | Maker | Builder | Agency |
|---|---|---|---|
| Draft cycles / period | 0 | 30 | 120 |
| Finalize MP budget | 0 | 36 | 240 |
| Max single render | — | 6 MP (~A5@300) | 16 MP (large cartons) |
| Stored-template storage | — | 500 MB | 5 GB |

Maker = premium templates + recolour only (no raw generation). Admin = unmetered.
Top-ups (extra credits, extra storage) ride the existing Stripe stack.

### Storage cap
A finalized print-res PNG of one panel is **5–30 MB**; a saved template also keeps the
composite SVG + thumbnail. So storage is a real R2 cost → **per-tier MB cap + a usage
ledger** (`GenerationStorageUsage`, KB-precision). Save debits bytes; over-cap blocks the
save with an upgrade/delete prompt. Drafts auto-expire (~30 days); finalized templates
persist.

### Build state (P3 foundation, no key needed)
- `@ilaunchify/imagegen` SHIPPED: the **provider seam** (`ImageGenProvider` —
  `generatePanels`/`generateVectorType`/`upscale`; `providerStatus(env)` reports
  configured/missing for `FAL_KEY`/`RECRAFT_API_KEY`) + the **pure metering engine**
  (`tierLimits`, `panelMegapixels`, `quoteDraft`, `quoteFinalize`, `canStartDraft`/
  `canFinalize`/`canStore`, `estimateStoredTemplateBytes`). 10 golden cases.
- Schema SHIPPED (additive, needs Mac `db push`): `AiDesignGeneration`,
  `AiGenerationUsage`, `AiGenerationCredit`, `GenerationStorageUsage` + `AiGenScope`/
  `AiGenStatus` enums.
- **Still gated on Pavel:** final price points + allotments, and the fal/Recraft keys.
- **P3 next:** fal + Recraft adapters implementing `ImageGenProvider`; `AiDesignGeneration`
  FSM + usage debits via the metering engine; reuse the Tier-0.4 AI rate-limiter; keys in
  the Integrations registry.

---

## 13. Domain-aware generation (SHIPPED 2026-06-23)

Compliance is domain-aware already (§6). This makes the **creative layer** domain-aware
too — so a supplement isn't offered "Kawaii doodles" and a cosmetic leans premium/minimal
— without ever bending compliance.

**Two layers of domain-appropriateness, kept separate:**
1. **Structure** — *inherited, not invented.* We're die-line-first; the die-line already
   encodes the package, and the taxonomy binds it to the domain
   (`Category.labelingType` → domain → `StructuralPackType`/`DieCutTemplate`). The
   generator works on the product's die-line, so structure is domain-correct by
   construction. The **only** place we *recommend* a structure is the "no die-line yet /
   manual packaging idea" path — see `recommendedPackageTypes` below.
2. **Creative** — domain-tuned defaults: chip presets + prompt tone + substrate hint.

**Engine — `@ilaunchify/ai-design/domainPreset.ts` (pure, golden-tested):**
- `domainPreset(domain)` → `{ styles, colors, elements, promptTone, substrateHint,
  packageTypes }`. Distinct personality per domain (FOOD = appetite/warm; SUPPLEMENT =
  clinical/trust; OTC = medical-grade/legible; COSMETIC = premium/editorial; PET =
  playful/friendly).
- `resolveDomainOptions(domain, overrides?)` → merges the domain defaults with **admin
  `AiGeneratorSettings` overrides** (per-domain vocab). Any provided dimension replaces
  that dimension; omitted dimensions keep the domain default.
- `recommendedPackageTypes(domain)` → domain-appropriate structures for the no-die-line
  path only (supplement → bottle/jar; cosmetic → tube/jar/pump; food → carton/pouch…).

**Prompt wiring:** `assemblePrompt` gains `domainTone`, woven in as a `Mood: …` clause.
`planGeneration` defaults `domainTone` to `domainPreset(domain).promptTone`, so every
generation is domain-tuned automatically (override-able).

**Guardrail:** domain shapes creative + the *recommended* structure only — it never
overrides compliance, and it's only DEFAULTS (admin can override per domain; creator can
always deviate).

**Admin flexibility:** the `AiGeneratorSettings` option vocabulary is **per-domain** — the
admin edits the FOOD / SUPPLEMENT / OTC / COSMETIC / PET chip sets, tones and substrate
hints independently. `resolveDomainOptions` is the read path that layers admin overrides
over the code defaults.

---

## 14. Coordinated sets & variant families (SHIPPED 2026-06-23)

Two *different* multi-output axes. Both produce a consistent "family," but by
different mechanisms — and they compose into a matrix.

### 14a. Coordinated SET — one product, many die-lines (jar front + top, box + carton…)
Applies to **any** multi-die-line package, not just jars. The creator multi-selects
the die-lines ("design as a coordinated set"); we generate them from **one shared brief
+ one shared seed**, so they come out as a family (same palette, motif, mood) while each
is generated **into its own die-line** (respecting its geometry, bleed, safe area). Each
label still carries its **own truth layer** (the front holds the full Facts panel +
ingredients; the round top holds just brand + net qty).

Compliance is evaluated at the **PACKAGE level**: a mandatory element only has to appear
on **one** surface of the pack, so we UNION the satisfied elements across all the pack's
labels and score once.

Engine — `@ilaunchify/ui/planGenerationSet(brief, targets[])` → `{ seed, perDieline[],
compliance }`; package roll-up via `@ilaunchify/ai-design/evaluateCompliancePackage`.
Pure, golden-tested. Cost: one draft cycle for the family; finalize MP summed across the
labels the creator keeps.

### 14b. Variant FAMILY (flavors) — one die-line, N variants (7 protein-bar flavors)
Identical brand look; only the **flavour accent colour** + the **flavour design element**
differ. The rule that makes them *identical*: you **cannot** independently AI-generate
each flavour (diffusion is stochastic → they'd drift). So it's **base-then-derive**:
1. Generate + approve **one MASTER** design (the brand look).
2. **Derive** each flavour deterministically — recolour the master's `FLAVOR_ACCENT`
   colour role to the flavour's hex, and swap the flavour-accent frame's element
   (sliced strawberry vs cocoa). **Everything else is locked** (layout, typography,
   logo, motif, geometry, all truth zones) → guaranteed identical brand.

Each flavour still gets its **own** truth layer — its recipe drives its own Facts panel
(different macros per flavour) — via the existing per-flavor labels model. Only the
CREATIVE derivation is shared.

**Batch or add-one-later:** derivative seeds are a stable function of the master seed +
flavour id (`master:flavorId`), so generating all 7 at once and adding an 8th flavour
next month yield the same deterministic result for a given flavour. The creator specifies
"how many + the specifics of each" (name, accent colour, element) in one table.

Engine — `@ilaunchify/ai-design/planFlavorSeries(masterSeed, flavors[])` →
`{ masterSeed, derivatives[], lockedInvariants[], rejected[] }`. Pure, golden-tested;
rejects duplicate ids / bad hex (surfaced, never silently dropped). The recolour uses the
existing recolor engine + `colorRoles`; the flavour element is one small AI render placed
into the SAME frame.

**Cost efficiency:** a 7-flavour series ≈ **1 full generation + 7 small element renders +
7 recolours** — far cheaper (and far more consistent) than 7 full generations. Meters
accordingly.

### 14c. The matrix (set × flavors)
A jar with front + top labels **and** 7 flavours = die-lines × variants. Flavour 1 is the
coordinated SET (master); flavours 2–7 derive by recolour + element-swap **across every
label in the set** — so the whole line stays a family in both dimensions.

**Guardrail (both):** families share the *creative* layer; each member keeps its own
correct *truth* layer, and compliance is enforced per member (variant) and per package
(set). Consistency never overrides correctness.

---

## 15. Output settings & presets (SHIPPED 2026-06-23)

The export/finalize knobs, governed by a **three-layer model**: admin defines the
allowed set + defaults + presets; the creator picks within that; the tier gates the
hard caps. Nothing illegal can ever be exported.

**Settings (`OutputSettings`):** `format` (PNG/PDF/SVG/AI/GLB), `dpi`, `colorProfile`
(RGB/CMYK), `marks` (bleed + crop/registration), `layered` (flattened vs editable/vector),
`watermark`, `variations`, `batch` (whole coordinated set / flavour series at once),
`whiteLabel` (no iLaunchify branding).

**Engine — `@ilaunchify/imagegen/output.ts` (pure, golden-tested):**
- `resolveOutputPolicy(tier, overrides?)` → the effective **allowed set + defaults** for
  a tier, merging admin `AiGeneratorSettings` overrides over the code defaults.
- `presetsForTier(tier, presets)` → the admin-authored `OutputPreset`s a tier may use
  (gated by `minTier`).
- `clampOutput(requested, policy)` → **the hard guard**: snaps any creator request DOWN
  to the tier caps (format, dpi, CMYK, layered, batch, white-label, variations; forces
  watermark where required) and **reports every downgrade** — nothing silently changed.
- `applyPreset(preset, policy)` → apply a preset then clamp.

**Tier gating (DEFAULT_OUTPUT_POLICIES — admin tunes):**

| | Maker | Builder | Agency |
|---|---|---|---|
| Formats | PNG | PDF, PNG | PDF, AI, SVG, PNG, GLB |
| Max DPI | 96 (watermarked) | 300 | 600 |
| CMYK | — | ✓ | ✓ |
| Dieline marks | — | ✓ | ✓ |
| Layered / editable | — | — | ✓ |
| Batch (set/flavours) | — | — | ✓ |
| White-label | — | — | ✓ |
| Watermark | forced on | off | off |
| Max variations | 2 | 4 | 6 |

**Regulation — hard vs soft.** Hard caps (max DPI, CMYK, layered, batch, white-label,
variations) are **server-enforced** through `clampOutput(policy)` where the policy comes
from `AiGeneratorSettings` + the tier — the *same* mechanism as `tierLimits` (metering)
and `resolveDomainOptions`. DPI also ties into the megapixel budget (§12). Soft choices
(which preset, marks on/off within the allowed range) are the creator's to adjust. The
admin can **loosen or tighten per tier** and author/curate presets with **no code change**.

**Schema (additive, needs Mac `db push`):** `AiOutputPreset` (id, label, minTier,
settingsJson, sortOrder, active) — admin CRUD; the per-tier policy overrides live in the
`AiGeneratorSettings` singleton alongside the tier limits + per-domain vocab.

---

## 16. The one-sentence pitch

> Describe it in plain words; we generate four on-brand concepts **into your real
> die-line**, drop in your **true** ingredients, allergens, Nutrition Facts, barcode and
> every FDA-required mark for your category and market, show it folding in 3D, and export
> a **print-ready** dieline your manufacturer can run — the only AI packaging tool whose
> output is correct, not just pretty.
