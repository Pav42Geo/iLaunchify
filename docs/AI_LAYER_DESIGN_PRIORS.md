# AI Layer — Design Priors

**Status:** Future feature roadmap, not V1. This doc exists so V1 schema and architecture choices don't paint us into a corner when we get here.

**The vision (Pavel, 2026-05-18):** Eventually the platform will host an AI layer that handles:

1. **Template generators** — auto-generate label designs, storefront layouts, packaging mockups from a brand profile.
2. **Brand identity creation** — given a creator's audience, niche, and rough preferences, generate color palette, typography, voice/tone, positioning statements, logo direction.
3. **AI video generation** — produce short-form video content featuring the created products.
4. **Social media posting** — post the generated content to the creator's social channels with brand-tone-aware copy and a strategy that fits the creator's positioning.
5. **Ready-to-use design library** — curated catalog of pre-made label/storefront/packaging designs that creators can clone and customize.
6. **AI die-cut design generation** — given a specific die-cut template (the physical cutting outline + bleed/safe-area constraints) and a brand profile, AI generates artwork that fits the cut shape and renders correctly when produced by a print provider.

**Timeline:** Post-V1, likely V1.5 onwards. Not part of the 12-week roadmap.

---

## Why this matters now (even though we're not building it)

A few V1 decisions are cheap if we make them with AI in mind and expensive to change later. They're the only things we should adjust *today*. Everything else stays as-is in `ARCHITECTURE.md`.

The AI features all rotate around the same conceptual hub: **the creator's Brand**. Brand colors, brand voice, brand audience, brand assets. If the V1 schema buries brand data inside `CreatorProfile` or scattered across `Product` rows, the AI layer has to do a massive refactor to find its inputs. If V1 makes Brand a first-class entity from day one, the AI layer just reads it.

---

## V1 changes informed by the AI roadmap

These are *additions* to the architecture in `ARCHITECTURE.md`, not replacements.

### 1. `Brand` as a first-class V1 entity

**What changes:** Instead of cramming brand attributes into `CreatorProfile`, introduce a separate `Brand` model. A creator has 1..N brands (V1 default: 1, but the relationship supports many).

```prisma
model Brand {
  id                String   @id @default(cuid())
  creatorProfileId  String
  name              String
  handle            String   @unique          // public URL slug; falls back to creator handle if creator has 1 brand
  positioning       String?                   // short positioning statement
  // Visual identity
  colorPrimary      String?                   // hex
  colorSecondary    String?
  colorAccent       String?
  fontDisplay       String?                   // font family name from approved list
  fontBody          String?
  logoAssetId       String?                   // → Asset
  // Voice & tone — captured as structured fields AI can read directly
  voiceArchetype    BrandArchetype?           // HERO | SAGE | CAREGIVER | EXPLORER | CREATOR | JESTER | etc.
  voiceFormality    Int?                      // 1..5, casual to formal
  voicePlayfulness  Int?                      // 1..5, serious to playful
  voiceWarmth       Int?                      // 1..5, distant to warm
  voiceNotes        String?                   // free-text overrides
  // Audience model — supports AI strategy generation
  audienceAgeMin    Int?
  audienceAgeMax    Int?
  audienceGender    String?                   // multi-select via enum or JSON
  audienceInterests Json?                     // array of tags
  audienceValues    Json?                     // array of value statements
  // Social — needed for AI social posting later
  socialAccounts    SocialAccount[]
  products          Product[]
  templates         Template[]
  creatorProfile    CreatorProfile @relation(fields: [creatorProfileId], references: [id])
}

enum BrandArchetype {
  HERO
  SAGE
  CAREGIVER
  EXPLORER
  CREATOR
  JESTER
  EVERYMAN
  INNOCENT
  LOVER
  MAGICIAN
  OUTLAW
  RULER
}
```

**Why now:** Even without AI, V1 needs colors and fonts somewhere — labels and storefronts have to use them. The FOD codebase put them in scattered theme JSON files (`frontend/src/themes/*.json`). Making Brand first-class costs one extra model in V1 and saves a painful migration later.

**Migration cost if deferred:** **High.** Every `Product`, `Template`, and `Asset` ends up with foreign keys to Brand — backfilling them later means writing migration logic to invent a Brand row for every existing creator and rewire all their existing data.

### 2. `Product.brandId` foreign key (instead of `Product.creatorId`)

**What changes:** A Product belongs to a Brand, which belongs to a CreatorProfile. Indirect, but it preserves the multi-brand future without forcing it.

```prisma
model Product {
  id        String   @id @default(cuid())
  brandId   String
  // ... existing product fields
  brand     Brand    @relation(fields: [brandId], references: [id])
}
```

**V1 default:** A creator's first signup auto-creates a Brand with `name = creator.displayName`, `handle = creator.handle`. Multi-brand UX is hidden in V1 (the dropdown only has one option, so we don't render it). Schema is ready when we expose it.

### 3. `Asset.source` and `Asset.generationMeta`

**What changes:** The Asset model gains a `source` enum and a `generationMeta` JSON field. V1 only uses `USER_UPLOAD` and `TEMPLATE_RENDER`. The AI layer later adds `AI_GENERATED`.

```prisma
model Asset {
  id              String       @id @default(cuid())
  brandId         String?
  source          AssetSource  @default(USER_UPLOAD)
  generationMeta  Json?        // V1: null. Future: { model, prompt, params, seed, parentAssetId }
  // ... existing fields (url, mime, dimensions, etc.)
}

enum AssetSource {
  USER_UPLOAD
  TEMPLATE_RENDER
  AI_GENERATED        // V1.5+
}
```

**Migration cost if deferred:** Low (just an enum and a column). But establishing the convention now means AI-generated assets don't have to be retrofitted with provenance tracking.

### 4. `SocialAccount` model (table only, no UI yet)

**What changes:** Add the model so OAuth-connected social accounts have a home. V1 doesn't expose the UI to connect them; the table is just there.

```prisma
model SocialAccount {
  id              String          @id @default(cuid())
  brandId         String
  platform        SocialPlatform
  externalUserId  String
  handle          String
  accessTokenRef  String          // pointer to secrets store; never store the token in the DB
  refreshTokenRef String?
  scope           String
  connectedAt     DateTime        @default(now())
  brand           Brand           @relation(fields: [brandId], references: [id])
  @@unique([brandId, platform])
}

enum SocialPlatform {
  INSTAGRAM
  TIKTOK
  YOUTUBE
  PINTEREST
  X
  FACEBOOK
}
```

**V1 cost:** One model, no migrations later when the AI layer needs to start writing to it.

### 5. Job queue infrastructure already in V1

**Confirmed:** Redis is already in the V1 stack (`docker-compose.yml`), which means BullMQ or a similar job queue is a small add later. AI jobs (image gen, video gen, social post scheduling) plug into this queue without infrastructure rework.

### 6. `DieCutTemplate` as a V1 entity

**What changes:** Die-cut templates are physical printing specifications — the cutting outline, bleed area, safe area, supported materials. They need to exist in V1 because:

- Print providers must declare which die-cuts they can produce (capability profile).
- Label `Template` rows reference a `DieCutTemplate` so the label renderer knows the physical shape (a rectangular Nutrition Facts panel renders differently from an oval bottle wrap).
- Order routing filters print providers by whether they support the chosen die-cut.

```prisma
model DieCutTemplate {
  id              String   @id @default(cuid())
  name            String                  // "Standard rectangle 3x4in", "Bottle oval 2.5x6in"
  slug            String   @unique
  category        DieCutCategory          // BOTTLE_WRAP | TUB_LID | POUCH_FRONT | BOX_PANEL | STICKER | CUSTOM
  widthMm         Float
  heightMm        Float
  outlineSvg      String                  // SVG path of the cut outline
  bleedMm         Float    @default(3.0)
  safeAreaMm      Float    @default(3.0)
  isStandard      Boolean  @default(true) // V1: only standard shapes; custom upload is V1.5+
  isActive        Boolean  @default(true)

  templates       Template[]
  partnerServices PartnerServiceDieCut[]  // many-to-many: which print providers can produce this
}

enum DieCutCategory {
  BOTTLE_WRAP
  TUB_LID
  POUCH_FRONT
  BOX_PANEL
  STICKER
  CUSTOM         // V1.5+
}

// Junction: which die-cuts a LABEL_PRINTING service supports
model PartnerServiceDieCut {
  partnerServiceId  String
  dieCutTemplateId  String
  // Per-relationship overrides
  surchargeUsd      Decimal?              // optional extra cost for this die-cut
  leadTimeDays      Int?                  // override the service's default lead time
  partnerService    PartnerService    @relation(fields: [partnerServiceId], references: [id])
  dieCutTemplate    DieCutTemplate    @relation(fields: [dieCutTemplateId], references: [id])
  @@id([partnerServiceId, dieCutTemplateId])
}
```

**V1 default catalog:** 6–10 standard die-cuts (one rectangle, one oval, one round, one pouch front, one tub lid, one bottle wrap — enough to cover the supplement + functional-beverage shapes that V1 sells). Seed data ships with the schema. Print providers select from this catalog during their service onboarding; custom uploads are V1.5+.

**Future AI integration:** the AI die-cut generator (V1.5+) reads the `outlineSvg` + `bleedMm` + `safeAreaMm` and produces artwork constrained to fit. The `DieCutTemplate.id` becomes one of the inputs to the prompt — alongside the `Brand` row — so the generator knows both *what shape it has to fit inside* and *what aesthetic the brand wants*.

### 7. `DesignLibraryItem` model (V1 catalog + V1.5 AI authorship)

**What changes:** A separate model for the curated/ready-to-use design catalog. This is *not* the same as `Template` (which is owned by a Brand). A `DesignLibraryItem` is platform-owned, browsable by all creators, clonable into a Brand-owned `Template`.

```prisma
model DesignLibraryItem {
  id              String       @id @default(cuid())
  name            String
  description     String?
  category        DieCutCategory
  dieCutTemplateId String                  // every library design targets a specific die-cut
  previewAssetId  String                  // thumbnail/preview image
  templateSpec    Json                    // serialized design (layers, text slots, color slots, image slots)
  tags            String[]                // ["minimal", "organic", "bold-typography", ...]
  source          DesignLibrarySource  @default(CURATED)
  isActive        Boolean      @default(true)
  // When AI generates additions to the library, source = AI_AUTHORED + provenance in generationMeta
  generationMeta  Json?
  dieCutTemplate  DieCutTemplate @relation(fields: [dieCutTemplateId], references: [id])
}

enum DesignLibrarySource {
  CURATED         // human-designed, curated by the platform team
  AI_AUTHORED     // AI-generated and approved for the catalog (V1.5+)
  PARTNER_SUBMITTED  // V2: print providers contribute designs
}
```

**Cloning into a Brand:** when a creator picks a library item, the platform creates a new `Template` + `TemplateVersion` belonging to the creator's `Brand`. The library item itself is untouched; the creator can now customize their copy freely. This preserves library item provenance (you can always trace "which library item did this Brand start from").

**V1 scope:** Ship 20–30 curated library items covering the V1 die-cut catalog × 3–5 aesthetic variants (minimal, bold, classic, organic, premium). These are design work, not engineering work — but the *table* and the *clone-into-Template* flow need to exist in V1 so creators have a fast path to a working product.

---

## V1 changes we are NOT making

These would be premature:

- ❌ Vector database (pgvector / Pinecone / Weaviate) for AI retrieval. Add when there's actual AI work that needs it.
- ❌ AI service stub in `services/`. Build it when there's real AI code to host.
- ❌ Brand voice as an LLM-callable API. The structured fields above are enough; the AI layer wraps them.
- ❌ Generic "AI provider" abstraction. YAGNI until we know which provider(s) we'll use.
- ❌ Prompt management system. A few hardcoded prompts in the AI service is fine when we get there.
- ❌ Template versioning to support AI variants. Existing `TemplateVersion` model handles this.

---

## Forward-compatible patterns for the AI layer

Documenting these so future-Pavel and future-AI-engineer don't reinvent them:

### Template parameterization

Templates already version. When the AI layer generates a template, it writes a new `TemplateVersion` row whose source = `AI_GENERATED` (added later), with a parent reference. The render pipeline (`services/compliance/app/label_render.py`) already takes a `Brand` as input — when AI generates a template tuned to a brand, the renderer doesn't change. The model:

```
Template (parameterized) + Brand (data) → Rendered Asset
```

This holds whether the template is human-authored or AI-authored. V1 only needs human-authored templates; the structure absorbs AI templates without change.

### Brand → AI → Asset → Product flow

The intended future flow:

```
1. Creator completes brand identity quiz
2. AI reads Brand row, generates suggestions:
   - 3 color palettes
   - 2 typography pairings
   - 1 voice profile
3. Creator picks/edits → Brand row updated
4. AI generates 5 template candidates → 5 TemplateVersion rows with source=AI_GENERATED
5. Creator picks one → Product points at that TemplateVersion
6. AI generates 3 video assets featuring the product → Asset rows with source=AI_GENERATED
7. AI drafts social posts → queued via BullMQ → posted via SocialAccount tokens
```

Every arrow above is V1.5+. Every noun in the flow is a V1 entity. That's the win.

### Compliance and AI generation

Critical: AI-generated label content is regulated content. The compliance rule packs (already V1) apply to AI output the same way they apply to human-designed labels. The compliance service runs against any TemplateVersion regardless of source. AI doesn't get to bypass compliance — it goes through the same `POST /v1/compliance/check` pipeline.

This is a feature: it means the AI layer can run in a generate-and-validate loop ("generate a label, run compliance check, regenerate if violations") without special-casing.

### Audit + provenance

`Asset.generationMeta` (JSON) holds: `model`, `prompt`, `params`, `seed`, `parentAssetId`. Every AI-generated asset is reproducible from its meta. This matters for:
- Creator support ("why did the AI pick this color?" → show the prompt)
- Compliance investigations ("was this image AI-generated? from what brand profile state?")
- Cost tracking (which prompts are expensive, which generations get used)

---

## Open questions for when we approach the AI layer

(Not for now — for later. Captured so future-us doesn't have to rediscover them.)

1. **Which models?** OpenAI/Anthropic/Stability for image, OpenAI/Anthropic for text, Runway/Pika/Veo for video. Mix likely.
2. **Self-host any of it?** Probably not — the operational burden swamps the per-call cost for V1.5 volume.
3. **Subscription vs. usage billing for AI features?** Affects pricing model and Stripe setup.
4. **How "auto" is auto-posting?** Always-on, or scheduled-with-approval, or human-approved-each-time? Probably the latter for the first version.
5. **Brand voice as model fine-tuning vs. prompt engineering?** Almost certainly prompt engineering for the first 100 brands; fine-tuning becomes interesting only if there's a clear quality gap.

---

## What this changes about the V1 schema port

When porting `FOD-reference/prisma/schema.prisma` to `packages/db/prisma/schema.prisma` in Week 1:

- Add the new `Brand` model.
- Add the `BrandArchetype` enum.
- Add `SocialAccount` model + `SocialPlatform` enum (table only, no UI).
- Add `AssetSource` enum and `Asset.source` + `Asset.generationMeta`.
- Change `Product.creatorId` to `Product.brandId`.
- Add `DieCutTemplate` model + `DieCutCategory` enum.
- Add `PartnerServiceDieCut` junction model.
- Add `DesignLibraryItem` model + `DesignLibrarySource` enum.
- Add foreign key: `Template.dieCutTemplateId` (every label template targets a specific physical shape).
- Update the seed script: auto-create a Brand for the sample creator; seed 6–10 standard die-cut templates; seed ~20 starter library items.

That's the entire V1 delta. About a half-day of schema work plus the design effort to produce 20–30 library items (separate workstream, designer not engineer); saves weeks of migration pain when the AI layer arrives.
