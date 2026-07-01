# Design Template Library — Plan & Research

**Status:** PLAN (research round) · drafted 2026-06-23 · supersedes the flat premium-template
list shipped in Phase 3c (commits `979c7b6` / `89bd021`).
**Owner decisions locked (Pavel 2026-06-23):** shape-family die-line matching · one primary
style + multi-tags · all 5 domains (OTC seeded but hidden until admin activates it via the
existing `DomainSetting` toggle) · admin authors templates **inside the Design Studio** by
pulling a specific die-line into the canvas, designing, and saving.

This document is the agreed shape before any schema or UI is written. Nothing here is built yet.

---

## 1. The problem we're solving

A creator opens the Design Studio for their product. We want them to see **only templates that
fit their actual packaging**, organised the way Canva organises its library: pick the surface
you're designing, filter by *style*, optionally recolor to a palette, apply.

Two facts about our product model drive everything:

1. **A product is N packaging components, each with its own die-line.** A "can in a 6-pack box"
   is two `PackagingComponent` rows — one `CAN`, one `CARTON` — each with a `PackagingDieline`
   (real `widthMm`/`heightMm`/`surfaces`/`frames`). They are **two separate design surfaces**
   with totally different aspect ratios. A template built for a can wrap will never fit a carton
   face, so matching has to be by die-line **geometry**, not by a type name.
2. **A product has exactly one domain** (`LabelingType`: FOOD / DIETARY_SUPPLEMENT /
   PET_PRODUCT / OTC / COSMETIC). A cosmetic product must never be shown pet-food styles.

So a template lives at the intersection of **(domain) × (die-line shape) × (style)** and is either
**regular** or **premium**.

## 2. What already exists (don't rebuild)

| Capability | Where | State |
|---|---|---|
| `BrandTemplate` with `packagingTypeId`, `isPremium`, `tier`, `colorRoles`, `canvasJson`, `thumbnailUrl` | `packages/db` schema | shipped; `packagingTypeId` is **not read** anywhere yet |
| Premium admin CRUD + Agency creator gallery (flat list) | `/admin/templates`, Studio `TemplatesDrawer` | shipped Phase 3c |
| Recolor engine — `recolorCanvasJson`, `collectCanvasColors`, `autoMapColors`, role mapping | `packages/ui/src/color` | shipped |
| Brand palettes / swatches + harmony generator + palette extraction | `BrandPalette`/`BrandSwatch`, color engine | shipped |
| Die-line geometry — `PackagingDieline` (trim/safe/surfaces/frames) + shared frame editor | `packages/db`, `@ilaunchify/ui` | shipped |
| Domain on/off — `DomainSetting` + `isDomainEnabled` | `packages/db` | shipped (OTC off by default) |
| Studio canvas shell + die-line frame editor (the substrate admin authoring reuses) | creator + partner Studio | shipped |

**The gap:** templates have no *domain* and no *style* dimension, the die-line target isn't used
to filter, there's no palette picker in the drawer, and admins can only paste raw canvas JSON.

## 3. Canva UX teardown (the model we're adapting)

From Canva's template library ([GrackerAI case study](https://gracker.ai/case-studies/canva),
[Trupeer how-to](https://www.trupeer.ai/tutorials/how-to-search-templates-in-canva)):

- **Format/size first.** You're always inside a fixed canvas size; templates shown are the ones
  that fit it. → our analog is **die-line surface**: you pick which component you're designing,
  and only templates whose geometry fits that surface appear.
- **Style / theme / color facets.** A left "all filters" rail narrows by *design style* tags
  (minimalist, modern, vintage…), color, and theme. Same card style for every thumbnail so a
  group reads as one set.
- **Search by descriptive words** ("minimalist", "luxury", "retro") on top of the facets.
- **Premium templates** are crown-badged inline, mixed with free ones, gated at apply time.
- **Apply, then edit** — the template populates the canvas; the user recolors/edits from there.

We adopt: **surface tabs → style chips + more-filters + color + search → thumbnail grid with
premium badges → palette picker → apply + recolor**.

## 4. Style taxonomy (the research deliverable)

Each domain gets its own taxonomy of **~26–30 styles**, clustered into four facet groups so the
filter UI stays legible. A template carries **one primary style** (drives grouping in the grid)
plus any number of **secondary tags** (drive filtering/search). The *Trend* and *Audience* facets
are largely shared vocabulary across domains; *Aesthetic* and *Positioning* are domain-specific.

Sources informing the lists: cosmetics —
[Berlin Packaging 2026](https://www.berlinpackaging.com/insights/perspectives/2026-cosmetic-packaging-trends),
[BeautyMatter](https://beautymatter.com/articles/the-beauty-packaging-trends-set-to-define-2026);
supplements — [99designs supplement gallery](https://99designs.com/inspiration/labels/supplement),
[DesignerPeople](https://www.designerpeople.com/blog/health-supplement-packaging-design/); pet —
[Printpack 2026 trends](https://www.printpack.com/4-pet-food-packaging-trends-shaping-2026/),
[99designs pet gallery](https://99designs.com/inspiration/packaging/pet-food).

### 4.1 Cosmetic / Personal Care (30)

- **Aesthetic:** Minimal / Clean · Clinical / Derma-Science · Luxury / Premium · Wellness & Spa ·
  Natural / Botanical · Retro / Vintage · Bold / Expressive · Editorial / Monochrome ·
  Apothecary / Handcrafted · Maximalist / Pattern · Y2K / Hyper-color · Cottagecore / Soft ·
  Gradient / Aura · Hand-drawn / Illustrative
- **Positioning:** Medical-grade / Dermatology · K-Beauty · Clean-beauty / Non-toxic ·
  Vegan / Cruelty-free · Fragrance / Perfume · Men's Grooming · Gender-neutral / Unisex
- **Audience:** Teen / Gen-Z · Mature / Anti-aging · Baby / Gentle
- **Trend / Seasonal:** Eco / Kraft-sustainable · Holiday / Gift · Summer / Suncare ·
  Limited-edition · Brutalist / Industrial · Pastel / Calm

### 4.2 Food & Beverage (30)

- **Aesthetic:** Modern-Minimal · Bold / Street · Premium / Gourmet · Heritage / Craft ·
  Playful / Fun · Farmhouse / Rustic · Retro / Diner · Hand-drawn / Illustrative ·
  Editorial / Typographic · Maximalist / Pattern · Vibrant / Pop
- **Positioning:** Better-for-you / Clean-label · Functional / Performance · Keto / Low-sugar ·
  Organic / Natural · Artisanal / Small-batch · Global / Ethnic-cuisine · Indulgent / Dessert ·
  Plant-based / Vegan
- **Beverage:** Craft-soda / Sparkling · Coffee / Tea · Energy / Hydration · Cocktail / Spirit-inspired
- **Audience:** Kids / Family · Athletes / Fitness · Premium-gifting
- **Trend / Seasonal:** Eco / Sustainable · Seasonal / Holiday · Nostalgic / Vintage-revival

### 4.3 Supplement / Nutraceutical (27)

- **Aesthetic:** Clinical / Pharma · Minimal / Clean · Bold / Sports · Wellness / Lifestyle ·
  Natural / Herbal · Luxury / Longevity · Editorial / Science · Pastel / Calm ·
  Dark / Premium-black · Vibrant / Energy
- **Positioning:** Sports-performance · Women's-wellness · Men's-health · Beauty-from-within ·
  Gut / Probiotic · Cognitive / Nootropic · Sleep / Recovery · Immunity · Vegan / Plant-based ·
  Kids / Gummies
- **Audience:** Senior / 55+ · Athlete · Everyday-wellness
- **Trend:** Eco / Sustainable · Clean-label / Transparent · Apothecary / Botanical-modern ·
  Molecular / Pattern

### 4.4 Pet (26)

- **Aesthetic:** Premium / Human-grade · Natural / Raw · Veterinary / Clinical · Playful / Fun ·
  Farmhouse / Heritage · Modern-Minimal · Bold / Vibrant · Hand-drawn / Illustrative ·
  Editorial / Typographic · Luxury / Boutique
- **Positioning:** Grain-free / Limited-ingredient · Fresh / Refrigerated · Functional / Health ·
  Treat / Indulgent · Breed-specific · Life-stage (puppy / senior) · Vet-recommended / Rx ·
  Sustainable / Eco
- **Animal / Audience:** Dog · Cat · Small-pet / Exotic
- **Trend / Seasonal:** Eco / Kraft · Holiday / Gift · Subscription / DTC-modern

### 4.5 OTC — seeded but hidden until admin activates (20)

Clinical / Pharma · Trust-blue / White · Modern-DTC · Pediatric / Family · Natural-OTC ·
Pain-relief / Bold · Cold & Flu / Seasonal · Digestive · Allergy · First-aid · Sleep-aid ·
Minimal / Clean · Senior / Large-type · Homeopathic / Natural · Premium / Pharmacy-brand ·
Value / Generic · Topical / Derm · Eye & Ear care · Vitamin-adjacent · Trust / Authority.

> OTC styles seed `active=false` and are filtered out everywhere until `DomainSetting(OTC)` is
> enabled — same pattern the OTC builder flow already follows.

### 4.6 Shared secondary vocabulary (multi-tag, cross-domain)

- **Trend:** Minimalist · Maximalist · Retro / Vintage · Y2K · Cottagecore · Brutalist ·
  Hand-drawn · Gradient / Aura · Mono / Editorial
- **Seasonal / Occasion:** Holiday · Summer · Valentine · Back-to-school · Limited-edition
- **Audience:** Kids · Men · Women · Unisex · Senior · Gen-Z

## 5. Proposed data model (additive, CockroachDB-safe)

**New `TemplateStyle` reference table (seeded):**

```
TemplateStyle {
  id        String  @id @default(uuid())
  domain    LabelingType
  facet     TemplateStyleFacet   // AESTHETIC | POSITIONING | AUDIENCE | TREND
  slug      String               // unique per (domain) — e.g. 'luxury-premium'
  label     String
  sortOrder Int      @default(0)
  active    Boolean  @default(true)   // OTC rows seed false
  @@unique([domain, slug])
  @@index([domain, active])
}
```

**`BrandTemplate` additions:**

```
domain                  LabelingType?           // required for premium library templates
matchMode               TemplateMatchMode @default(SHAPE_FAMILY)  // SHAPE_FAMILY | EXACT
targetContainerCategory ContainerCategory?      // shape-family key (CAN, CARTON, BOTTLE…)
targetTopology          PackagingTopology?
aspectBucket            AspectBucket?           // WRAP, PANEL_TALL, PANEL_SQUARE, PANEL_WIDE…
targetSurface           String?                 // die-line surface name (front panel, wrap…)
// packagingTypeId already exists → used as the EXACT-match key
```

**`TemplateStyleAssignment` junction (primary + multi-tag in one table):**

```
TemplateStyleAssignment {
  templateId String
  styleId    String
  isPrimary  Boolean @default(false)   // exactly one true per template → grid grouping
  @@id([templateId, styleId])
  @@index([styleId])
}
```

Everything is additive — no drops. Mac handoff is the usual `pnpm db:push` → `db:generate`
→ `rm -rf apps/*/.next`.

## 6. Matching — shape-family, grouped by component

Pure, testable function (lives in `@ilaunchify/ui` or a new `packages/templates`):

```
matchTemplatesToProduct(components, domain, templates) → TemplateSection[]
```

For each `PackagingComponent` of the product:
1. Resolve its die-line → derive `ContainerCategory`, `PackagingTopology`, and an **aspect
   bucket** from `trimBox` (W/H).
2. A template matches the component when:
   - `domain` equals the product domain, **and**
   - `matchMode === EXACT` → `packagingTypeId` equals the component's type, **or**
   - `matchMode === SHAPE_FAMILY` → `targetContainerCategory` equals **and** `aspectBucket`
     equals (within tolerance).
   - **Exact wins** — if both an exact and a shape-family template exist, exact sorts first.
3. Return one **section per component** ("Bottle label", "6-pack carton"), and inside each,
   templates **grouped by their primary style**, premium and regular interleaved.

**Aspect buckets (first cut, tunable):** `WRAP` (≥2.5:1, can/bottle wraps) · `PANEL_WIDE`
(1.3–2.5) · `PANEL_SQUARE` (0.8–1.3) · `PANEL_TALL` (≤0.8) · `LONG_STRIP` (stick packs/sachets).
Thresholds are an open knob (§9).

## 7. Creator UX — Canva-style library

Reworks the `TemplatesDrawer` built in Phase 3c. Because a grid wants room, this likely graduates
from a narrow rail drawer to a **"Browse templates" expandable panel/modal** (Canva pattern),
still launched from the Templates rail tool.

Layout:
- **Surface tabs (top):** one per packaging component — "Bottle label", "6-pack carton". Selecting
  a tab scopes the grid to that die-line and switches the active canvas surface.
- **Filter row:** primary **Style chips** for the product's domain → **More filters** popover
  (trend / audience / seasonal multi-tags) → **Color** filter → **search** → **Premium** toggle.
- **Grid:** uniform thumbnail cards, premium crown badge, hover preview, lazy-loaded, paginated.
- **Palette picker:** brand palettes (built) + curated sets + on-the-fly harmony → **live recolor
  preview** on hover/selection via `recolorCanvasJson`; role-tagged templates recolor exactly,
  untagged fall back to dominant-remap.
- **Apply:** `loadFromJSON` onto the active surface, recolor with the chosen palette, then offer
  "Save as my template".
- **Empty state:** "No *[style]* templates for this *[die-line]* yet — start blank or request one."
- **Favorites + Recently used** rows at the top.

### 7.1 Recolor model — layered, role-based (Pavel 2026-06-23)

Manual per-object recoloring is the wrong default. Best practice (Canva, Adobe Express) is a
**layered** model that leads with one automatic action and lets users refine by group. All five
layers run on the same engine — `recolorCanvasJson` + the authored `colorRoles` map.

1. **One-click palette apply — the 80% path.** Template authored with a few color *roles*
   (primary / secondary / accent / background / neutral). User picks a palette (brand palette /
   curated / generated harmony) → engine maps palette → roles → the whole template recolors
   coherently in one tap. This is the default, biggest action.
2. **Shuffle.** A palette maps onto roles several valid ways. A *Shuffle* button re-permutes the
   role→color assignment so users find a great combo by tapping, not thinking. Highest-delight,
   near-free (same engine, new permutation).
3. **Recolor by group (refinement).** A row of swatches below Apply, each = a **color group**
   (all objects sharing a source color/role). Tap a swatch → picker → recolors that group
   everywhere. Groups are **auto-detected** from `colorRoles` (untagged templates fall back to
   dominant-color clustering via `collectCanvasColors`) — never manual multi-select.
4. **Lock a swatch.** Pin a group (e.g. logo color) so Apply + Shuffle skip it
   (`recolorCanvasJson` already supports `skipLocked`).
5. **Two-level reset.** Reset one group, or Reset all → back to authored colors. The original
   color map is held in state, so reset is lossless.

Guardrails: **live preview on hover** before commit; optional **contrast warning** when a recolor
pushes text below legibility against its new background.

Lives in two places: a *preview* recolor in the template library before apply, and a persistent
**Recolor panel** on the canvas after apply for continued tweaking.

## 8. Admin authoring — inside the Design Studio (Pavel 2026-06-23)

Admins build templates the way a designer would, not by pasting JSON:

1. **New flow** (`/admin/templates/new` or an admin mode of the Studio shell): admin picks
   **Domain → Die-line** (a `PackagingType` + a specific `PackagingDieline`).
2. The selected die-line **loads into the canvas as the design substrate** — reusing the existing
   shared die-line frame editor + Studio canvas, but with **no product context** (template-author
   mode).
3. Admin designs on the real print surface (frames, safe area, bleed all honoured).
4. **Save as template** captures `canvasJson` + thumbnail and binds: domain · primary style +
   tags · die-line target (`packagingTypeId` + derived `targetContainerCategory`/`aspectBucket`/
   `targetSurface`) · `isPremium` + `tier` · `colorRoles` (auto-suggested from
   `collectCanvasColors`, admin confirms the role mapping).
5. Saved into the system templates brand (premium) — immediately matchable by creators whose
   product shares that die-line shape + domain.

This is the largest build phase; it reuses the creator canvas wholesale and adds a die-line picker
+ a template-metadata save panel.

**Reuse the EXISTING Design Studio — not a separate editor (Pavel 2026-06-23).** Admin authoring
mounts the same `CanvasLayoutShell` creators use, with admin-appropriate functionality. Key
constraint: `CanvasLayoutShell` lives in **apps/creator**, so the admin app can't import it. The
authoring route therefore lives in the **creator app, gated to admins** (`requireCapability`), e.g.
`/(studio)/template-author?dieCut=…&domain=…`:
- A server loader builds **neutral, product-less props** (chosen die-line → `dieCut`; system
  templates brand → `brandAssets`; `labelingType` = chosen domain; recipe/nutrition/mockups/flavors
  = null/[]).
- `CanvasLayoutShell` gains a thin `templateAuthor` mode that (a) hides product-only rail tools
  (Product, Label-facts, Compliance/Mockup/Export) and (b) routes "Save as template" → the admin
  library save (Regular/Premium + domain + style + die-line metadata) instead of `saveAsBrandTemplate`.
- The admin /templates page links out to this route ("Design in Studio").
The metadata-save plumbing already exists (`adminCreateLibraryTemplate`, style options, regular/
premium, `listActiveDieCuts`); the Studio mode just calls it. Because `CanvasLayoutShell` is the
central (Code-shared) Studio file, the `templateAuthor` hook must be surgical.

### 8.1 Admin Design Studio — broader vision (Pavel 2026-06-23)

Pavel's larger intent: the admin uses the **same Design Studio** in an admin mode, with editing
capabilities for the platform building blocks creators consume — not only templates, but also:
- **Templates** — author Regular/Premium designs per die-line (this phase).
- **Mandatory phrases** — create/edit the regulated phrase library surfaced in the Studio.
- **Categories** — create/manage product categories + their domain bindings.
- **Packaging & die-lines** — add/edit packaging types and die-lines from inside the Studio.
- Potentially **everything** the Studio touches, with admin-grade permissions.

This is a multi-slice program, not one build. Each block already has an admin surface today
(`/admin/phrases`, `/admin/categories`, `/admin/packing-types`, `/admin/dielines`, `/admin/products`);
the vision is to bring those authoring/edit capabilities **into the Studio shell** behind an admin
mode, so the admin designs and curates in the same canvas creators use. Sequencing + which blocks
move into the Studio first is an open product decision — start with template authoring (plumbing
ready), then layer the others.

### 8.2 Die-line targeting is derived, not hand-picked (2026-06-30)

Every save path (admin Studio authoring, AI-generated concepts) tags the template with the die-line
it belongs to via one shared pure helper — `deriveTemplateTargeting()` in `@ilaunchify/ui`
(`lib/template-match.ts`, golden-tested). It resolves `{ targetContainerCategory, aspectBucket }` from
whatever the caller knows, preferring the product's **real `ContainerCategory`** (full 30-value
vocabulary, from the packaging type) and falling back to mapping the coarse 6-value `DieCutCategory`
(`DIE_CUT_CATEGORY_TO_CONTAINER`); the aspect bucket comes from the surface's mm dimensions
(`aspectBucketFor`). This guarantees a saved template's targeting round-trips through
`matchTemplatesToProduct` onto the exact die-line it was authored on — so in the creator canvas, a
product's die-line pulls in **only** the templates that belong to it. The admin Studio route
(`/studio`) now derives its `templateAuthor` container + aspect from this helper instead of a local
partial map.

## 9. Phasing

1. **Research + taxonomy** — this doc. ✅
2. **Schema + seed** — `TemplateStyle` (+ seed all 5 domains, OTC inactive) · `BrandTemplate`
   die-line/domain/match fields · `TemplateStyleAssignment` · enums. Additive; Mac push.
3. **Matching engine** — pure `matchTemplatesToProduct` + aspect-bucket derivation + golden tests.
4. **Creator Canva-style library + recolor** — surface tabs · style/color/search filters · the
   §7.1 layered recolor (apply / shuffle / by-group / lock / reset) · apply · favorites/recent ·
   empty states.
5. **Admin in-Studio authoring** — die-line picker → canvas substrate → save-with-metadata.
6. **Seed initial library + analytics** — ~5–10 real templates per (domain × top die-line × style)
   · usage tracking (which styles/templates get applied) to guide design investment.
7. **AI Template Generator** (§9a) — deferred; generates role-tagged, die-line-bound templates.

## 9a. AI Template Generator (future phase)

Deferred — added after the curated library + recolor ship. Generates **net-new** templates
(layout + art) for a given `(domain × die-line × style)` from a prompt and/or the creator's brand
(logo, palette, fonts, product name). Two non-negotiables so it fits the system above:

- **Output is real canvas JSON bound to a die-line**, honouring trim/safe/bleed — same substrate
  as admin authoring (§8), not a flat image.
- **It emits `colorRoles`** on every generated design, so the §7.1 recolor model (apply / shuffle /
  by-group / lock / reset) works on AI templates for free.

Likely a generate → review → save flow; admin-curated AI templates can enter the premium library,
creator-generated ones become the creator's own templates. Out of scope for the current build.

## 10. Open decisions (not blocking this doc)

1. **Aspect-bucket thresholds** (§6) — confirm the W/H cutoffs against real die-lines once a few
   are uploaded.
2. **Library surface** — expandable panel vs. full modal vs. keep the narrow drawer.
3. **Regular (non-premium) templates** — platform-seeded only, or can creators publish/share their
   own into the public regular pool?
4. **Favorites scope** — per creator, per brand, or per product.
5. **Multi-panel cartons** — does one "carton template" span front/back/side surfaces, or is it
   one template per panel? (Affects `targetSurface` granularity.)
6. **Trend/seasonal facets** — ship in v1 of the library or fast-follow after primary Style works.

## 11. What Pavel asked for → where it's covered

- Templates matched to current product die-lines → §1, §6 (shape-family, exact-preferred).
- Grouped by die-line (can + box) then by style → §6 (section per component → primary-style groups).
- Categorised by style per product type / domain → §4 (26–30 per domain), §5 (`TemplateStyle`).
- 20–30 groups per domain, domain-specific (cosmetics ≠ pet) → §4.1–4.5.
- Select & apply a color palette, recolor → §7 (palette picker + recolor engine).
- Regular + premium → §5 (`isPremium`/`tier`), §7 (badges + apply-gating).
- Canva-like UX → §3 teardown, §7 layout.
- Admin authors templates in-Studio from a die-line → §8.
- Additions Pavel may not have called out → §6 (geometry not type-name), §8, §10 (multi-panel,
  empty states, favorites, analytics, OTC hidden-until-active).
