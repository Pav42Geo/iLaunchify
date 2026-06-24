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
  Admin Mode badge) next to the Die-line Curator.
- Admin generates against a canonical die-line → curates → **saves as a premium
  `BrandTemplate`/library template** (domain × shape × style, `isPremium`, `tier`,
  `colorRoles` for recolor — schema already exists in [[DESIGN_TEMPLATE_LIBRARY]]).
- These become the high-quality, compliance-correct starting points creators pick from.
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

## 12. The one-sentence pitch

> Describe it in plain words; we generate four on-brand concepts **into your real
> die-line**, drop in your **true** ingredients, allergens, Nutrition Facts, barcode and
> every FDA-required mark for your category and market, show it folding in 3D, and export
> a **print-ready** dieline your manufacturer can run — the only AI packaging tool whose
> output is correct, not just pretty.
