# Design Studio — Spec

**Status:** Locked V1 scope 2026-05-19. References `docs/PLATFORM_SPEC.md` Tier 4.
**Supersedes:** Earlier `docs/CANVAS_ENGINE.md` which planned full Fabric.js canvas as V1 — that's deferred to V2+ per Pavel decision.

## Headline

Design Studio is the surface where a creator turns a customized recipe into a print-ready label, then submits the result with their production order. Without it, no production order can ship — the label dispatch needs printable files.

**V1 ships two paths:**

| Path | Who it's for | Output |
| --- | --- | --- |
| **(A) Upload** | Experienced creators with their own designers | Print-ready PDF (CMYK, embedded fonts, correct dimensions, bleed, compliance regions visible) — validated server-side |
| **(B) Template + brand-fill** | New creators with no design resources | Pick a label-design template within their product variant's die-line → fill brand info (logo, colors, copy) → iLaunchify renders to a print-ready PDF server-side |

Both paths produce the same output shape (validated print-ready PDF stored in R2, referenced by the order). The print partner doesn't see a difference between an uploaded and a template-rendered file.

**V1.1+ adds:** Option D (AI-assisted template variations).
**V2+ adds:** Option C (full Fabric.js canvas) — only if creators actually demand it.

---

## Three-layer template model (revised 2026-05-19)

There are **three distinct templates**, all required, all authored separately. Earlier draft of this doc said two; that was wrong because real packaging has multiple printable surfaces (front, back, top, side wrap, cap, etc.) and each needs its own die-line.

### 1. PackagingSystem (NEW — physical packaging as a whole)

The complete physical packaging the creator is producing. Example: "12oz Aluminum Can — Full Wrap System" or "60-Capsule HDPE Bottle System" or "8oz Stand-Up Pouch System".

- Owned by: manufacturers, co-packers, or admin
- Defined by: name, description, packaging type (can / bottle / pouch / box / capsule jar), 3D model reference (V2)
- Lifecycle: published once → linked from `ProductTemplateVariant.packagingSystemId`
- Has **1..N child DieCutTemplates** — one per printable surface
- New model: `PackagingSystem`

### 2. DieCutTemplate (revised — per-surface within a PackagingSystem)

A single printable surface within a PackagingSystem. Example: "Front Panel" of the can wrap, "Back Panel", "Cap Top", "Side A Wrap".

- Owned by: same as PackagingSystem
- Defined by: surface name + kind (FRONT / BACK / TOP / BOTTOM / SIDE_LEFT / SIDE_RIGHT / WRAP_FULL / CAP / NECK / OTHER), display order, **required boolean** (must this surface be designed before the order can ship?), physical dimensions (W × H × bleed), die-cut SVG path, printable area polygon, legal-position sets for compliance regions, technical spec (substrate, finish, ink limits)
- Lifecycle: published as part of a PackagingSystem
- Existing `DieCutTemplate` model gets new fields: `packagingSystemId`, `surfaceName`, `surfaceKind`, `surfaceOrder`, `required`

### 3. LabelDesignTemplate (per-surface visual layout)

The visual composition that sits inside one DieCutTemplate. Example: "Modern Minimalist Front Panel" or "Bold Wellness Back Panel". One DieCutTemplate (one surface) can host many LabelDesignTemplates (different aesthetics for the same surface).

- Owned by: same as die-line, OR by admin (curated library), OR by `AI_AGENT` (V2 — generated then human-approved)
- Defined by: HTML/CSS or React template, fill zones (brand name, logo, hero image, color slots), compliance-zone anchors with legal-position sets, default-on field declarations (which fields appear by default), hidable-field declarations (which default-on fields can be hidden)
- **Compatibility fields (V1, drive Design Studio filtering):**
  - `compatiblePackagingTypeIds[]` — which canonical PackagingTypes (from `MANUFACTURER_PRODUCT_BUILDER.md` §6) this design fits
  - `compatibleSurfaces[]` — FRONT | BACK | LID | FULL_WRAP | SLEEVE | NECK
  - `productCategoryFit[]` — SUPPLEMENT | BEVERAGE | SAUCE | GUMMY | SNACK | POWDER | …
  - `styleTags[]` — MINIMALIST | VINTAGE | BOLD | ORGANIC | SCIENTIFIC | LUXURY | PLAYFUL | …
- **Tier + licensing (V1 schema, V1.5 billing):**
  - `tier enum` — REGULAR (free with any plan) | PREMIUM (paid one-time or per-use) | EXCLUSIVE (max N partners can license)
  - `priceCents Int?` — only for PREMIUM
  - `exclusiveSeats Int?` — only for EXCLUSIVE (default 5)
  - `exclusiveLicenseHolders String[]` — partnerIds that have claimed seats
- **Provenance (V2 AI integration):**
  - `createdBy enum` — ADMIN | DESIGNER (contractor) | AI_AGENT | PARTNER (V2+ — letting partners contribute)
  - `aiSubAgent String?` — when createdBy=AI_AGENT: which sub-agent produced it (Generator-v1, Generator-v2-personalized, …)
  - `trendReportId String?` — links back to the DesignTrendReport that informed the generation
  - `humanCuratorId String?` — who approved it for ACTIVE status
- Lifecycle: DRAFT → PENDING_REVIEW → ACTIVE → DEPRECATED (never hard-delete; existing products keep referencing)
- New model: `LabelDesignTemplate`

### Filtering in Design Studio (V1)

When a creator opens Design Studio for a product, the template gallery auto-filters by:

1. `compatiblePackagingTypeIds` ∋ the product's PackagingSystem's packagingTypeId
2. `compatibleSurfaces` ∋ the surface being designed
3. `productCategoryFit` ∋ the product's categoryId
4. `tier` ∈ tiers the partner / creator has access to (REGULAR always visible; PREMIUM if entitled; EXCLUSIVE only if already licensed OR seats available + creator willing to pay)
5. `status = ACTIVE`

Style tags + search are creator-side refinements on top. Default sort: featured first, then most-used by similar products, then most recent.

### How creator interacts with the three layers

```
ProductTemplateVariant (creator picked this in /customize)
   ↓ has-one
PackagingSystem (e.g., "12oz Can — Full Wrap System")
   ↓ has-many
DieCutTemplate × N (Front, Back, Top — each a separate surface)
   ↓ each has-many
LabelDesignTemplate × M per surface (Minimalist Front, Bold Front, etc.)
   ↓ creator picks one per surface (or uploads a PDF for the surface)
DesignSurface × N (one per DieCutTemplate, each with final PDF in R2)
   ↓ all required surfaces complete →
Design (the umbrella per product) — all surfaces approved together
```

So the creator's Design Studio session has them stepping through each surface in turn, picking a LabelDesignTemplate (or uploading a PDF) for each. The studio enforces that all `required=true` DieCutTemplates have a complete DesignSurface before allowing submission.

---

## V1 flows

### Authoring flow (partner or admin)

```
Partner / admin → marketplace authoring section →
  1. Publish a die-line template
     - Upload die-cut SVG (curated library available)
     - Set dimensions + bleed + safe areas
     - Map compliance-zone landing positions (where nutrition panel goes, ingredient list, allergens)
     - Technical specs (substrate, finish, ink limit)
     - Set status: DRAFT → ADMIN_REVIEW → PUBLISHED
  2. Publish one or more label-design templates within that die-line
     - Upload HTML/CSS template (V1) OR React component (V1.1+ for richer interactivity)
     - Declare fill zones with type hints (brand-name = short text, logo = image, hero = image, primary-color = hex, etc.)
     - Preview render with sample brand data
     - Status: DRAFT → ADMIN_REVIEW → PUBLISHED
```

Admin can approve, reject, or request changes on submitted templates. PUBLISHED templates appear in the creator selection UI.

### Creator flow — multi-surface stepper

```
Creator on /products/[id]/customize → compliance passes →
  → /products/[id]/design (Design Studio)
  → Studio loads the PackagingSystem + all child DieCutTemplates
  → Left panel: surface picker showing all surfaces
       Front Panel        [⚪ Empty]      [Required]
       Back Panel         [🟡 In progress] [Required]
       Top Cap            [✅ Complete]   [Optional]
       Side A             [⚪ Empty]      [Required]
  → Creator picks a surface → editor opens for that surface
  → Per-surface, creator chooses Path A (upload) OR Path B (template + brand-fill) — independently per surface
  → Creator can switch between surfaces freely
  → Surface-level progress badges update as work completes
  → "Approve & submit" button stays disabled until all required surfaces show ✅ Complete
  → Submission validates all surfaces + runs AI scan if any mandatory fields are hidden (see below)
  → On success → all DesignSurface rows finalized → Design status → APPROVED → Product.designId pointed at this Design → /order unlocks
```

### Per-surface flow — Path B (template + brand-fill)

For the chosen surface:
- Page shows LabelDesignTemplates filtered by this surface's DieCutTemplate
- Creator picks a template → preview opens with brand data pre-filled
- Editable zones in a form (not a canvas): change copy, swap logo, pick palette
- **Per-field visibility toggles** — see "Hideable mandatory fields" below
- Hit "Render preview" → server renders to JPG (fast)
- Hit "Approve this surface" → server renders final CMYK PDF for this surface → uploaded to R2 → DesignSurface row marked APPROVED → returns to surface picker

### Per-surface flow — Path A (upload)

For the chosen surface:
- Tab "Upload your own design"
- File picker: drop a PDF for this specific surface (max 50MB)
- Server validation pipeline (per-surface):
  - Dimensions match this surface's DieCutTemplate (within 1mm tolerance)
  - Single page
  - CMYK color mode
  - Fonts fully embedded
  - 300 DPI minimum (lower flagged with warning)
  - Bleed present (3mm minimum)
  - Compliance regions detectable (OCR + AI scan — see below)
- If validation fails → inline per-field error with fix instructions → re-upload
- If passes → uploaded PDF stored on R2 → DesignSurface APPROVED → returns to surface picker

### Hideable mandatory fields + AI compliance scan (Pavel decision 2026-05-19)

The trade-off: creators with strong design intent often **want** to hide system-injected fields because their custom design already includes them (baked into a logo, integrated into the artwork). Forcing visible system-injected fields would override their design choices.

The solution: **field visibility toggles + AI scan as compensating control**.

**Behavior:**
- Per surface, default-on packaging labels (Net Weight, Address, Produced For, allergens, ingredient list, nutrition panel) appear visible by default
- Creator can toggle "Hide this field" on any of them — confirmation modal warns: "Hiding this means your uploaded/designed artwork MUST include it. We'll AI-scan the final design to verify."
- Hidden fields tracked on `DesignSurface.hiddenFields: string[]`
- On submit → server runs AI vision scan on the rendered/uploaded surface for each hidden field
- If scan finds the field (keyword + visual position match) → submission allowed
- If scan can't find it with confidence → submission blocked with: "We couldn't detect 'Net Weight' in your design for the Back Panel. Add it visibly or unhide the system field."

**AI scan implementation:**
- V1: Tesseract.js OCR + keyword matching for required-field text (e.g., "Net Wt", "Manufactured for", "Ingredients:", "Nutrition Facts")
- V1: Heuristic checks for nutrition panel structure (boxed text block, standard headings)
- V1.1+: Upgrade to vision LLM (Claude Vision / GPT-4 Vision) for higher accuracy + better explanations when rejecting
- All scans logged to AuditLog with the scan result, for debugging false-positives

**Default-on fields that can be hidden (creator choice):**
- Net Weight, Address, Produced For text, Country of origin, Best By placeholder, Storage instructions, certifications/badges

**Default-on fields that can NEVER be hidden (regulatory absolute):**
- Nutrition Facts panel (or Supplement Facts panel for supplements)
- Ingredient list
- Allergen statement
- Required FDA warning labels (e.g., dietary supplement disclaimer)

Per Pavel direction: **minimize back-and-forth with manufacturer**. Every validation should happen in the studio before submission. Once submitted, the LABEL dispatch to the print partner is print-ready and the partner doesn't kick back design issues.

### Completion checks before "Approve & submit"

The submit button stays disabled until:
1. Every `DieCutTemplate.required=true` surface has a `DesignSurface` in APPROVED status
2. Every approved surface passed its individual validation
3. If any field is hidden, the AI scan for that field on that surface returned PASS

Visual feedback:
- Surface picker shows ⚪/🟡/✅ per surface
- Bottom of studio: "X of Y required surfaces complete"
- Hover over disabled submit → tooltip lists what's missing
- "Skip optional surfaces" toggle (visible if any optional surfaces exist) — explicitly opts the creator out of designing optional surfaces, which prints them as blank/default-text from manufacturer's base spec

### Compliance region behavior (V1 = preset legal positions)

**Revised per Pavel decision 2026-05-19:** moved from "locked" to "preset legal positions" — creator picks from a small set of valid placements declared by the template. True free-form movement waits for V2 canvas.

For Path B (template render):
- The label-design template declares 1-N **legal positions** per compliance region. Example: `nutritionPanel: [{name: 'bottom-strip', x, y, w, h}, {name: 'right-side', x, y, w, h}]`
- Creator picks a position via radio button or thumbnail picker in the brand-fill form (no canvas needed)
- Server-side render pipeline pulls the recipe's nutrition data + ingredient list + allergens from the compliance service
- Renders the nutrition panel as an SVG using `NutritionFactsRenderer`
- Composites the SVG into the template at the **chosen** legal position
- Each compliance element type (nutrition / ingredients / allergens / net weight / address / produced-for) has its own legal-position set
- If a template only declares one legal position for a region → creator has no choice for that region (effectively locked, like the original V1 plan)

For Path A (upload):
- Server validates the uploaded PDF contains the required text in **any** legal position the template declares
- Validates: nutrition facts panel present, ingredient list present, allergen statement present, net weight present, address present
- Validates each compliance element is within a legal-position bounding box (1mm tolerance)
- If missing or out-of-position → reject upload with field-level error: "Your nutrition facts panel must be in one of: bottom-strip, right-side, back-of-can. See [link to template requirements]."
- Server does NOT modify the uploaded PDF (creator's design intent preserved)

**V2+ adds:** true free-form canvas movement with real-time validation (font size minimums, contrast checks, overlap detection, legal-zone constraints).

### Default-on packaging labels (V1)

Beyond the compliance regions, the following appear on every template **by default**, populated from existing data:

- **Net Weight / Net Quantity** — pulled from `ProductTemplateVariant.containerSizeG` (or per FDA: weight in oz/g, fluid oz/mL for liquids)
- **"Manufactured for" / "Distributed by" address line** — pulled from creator's brand profile or, if creator is anonymous-tier-disclosed, from the manufacturer
- **"Produced for" text + brand name** — composed from disclosure level (FULL / CITY_STATE / ANONYMOUS) + brand info
- **Country of origin** — defaults to "Made in USA" for V1 (US-only launch); admin-editable per partner
- **Best By / Expiration date placeholder** — actual date filled at production time by partner; placeholder zone on template
- **Lot / Batch number placeholder** — filled at production time
- **Storage instructions** — pulled from product template's storage spec
- **Allergen statement** — auto-generated from recipe ingredients (Big 9 + sesame)

Each is a preset legal position per the template; creator can choose position within those bounds.

### Certificate badges (V1)

Templates can declare a "certification zone" where earned certifications appear as badge icons. Examples: USDA Organic, Non-GMO Project Verified, Kosher, Halal, Vegan, Gluten-Free, B Corp.

- Manufacturers register their certifications in the partner profile (Phase A has the framework)
- Brand certifications also live on the creator brand profile
- The set of badges shown = intersection of (recipe-eligible certifications based on ingredients) + (creator's brand certifications) + (manufacturer-supplied certifications relevant to product)
- Badge SVG library is admin-curated (one SVG per certification, sized standardized)
- Creator can hide/show individual badges from the brand-fill form (but can't add badges they haven't earned)

### Ready-to-use phrases library

Pavel has a library of FDA-compliant phrases from the old platform. These get imported as a `LabelPhrase` registry:

- Categorized by use (regulatory required, marketing claims, certifications, instructions)
- Each phrase tagged with: jurisdiction (FDA), product types (food/supplement/cosmetic), required-vs-optional, source citation (e.g., "21 CFR 101.13(d)")
- Creator can select from approved phrases in the brand-fill form
- Manufacturer/admin can add custom phrases to the registry (admin-reviewed)
- Compliance engine flags products missing required phrases for their product type

### Print partner flow

When the production order is placed, the LABEL dispatch goes to the chosen print partner with:
- The print-ready PDF (from R2)
- The die-line template's technical spec (substrate, finish, ink limits)
- Quantity + delivery address
- Order metadata

Print partner accepts the dispatch (existing flow) → prints → ships labels to the manufacturer (or to the warehouse / creator, depending on `Order.shipToType`). No change to the partner-side workflow.

---

## V1 implementation breakdown

### Models (Prisma) — three-layer + per-surface design

```prisma
// NEW: PackagingSystem — the whole physical packaging
model PackagingSystem {
  id              String   @id @default(cuid())
  name            String                                 // "12oz Aluminum Can — Full Wrap System"
  description     String?
  packagingKind   PackagingKind                          // CAN / BOTTLE / POUCH / BOX / CAPSULE_JAR / TUB / OTHER
  authorType      AuthorType
  authorPartnerId String?
  authorAdminId   String?
  status          PackagingSystemStatus @default(DRAFT)
  threeDModelKey  String?                                // R2 key for 3D model file (V2 visualizer)
  reviewedById    String?
  reviewNotes     String?
  reviewedAt      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  // Relations
  dieCutTemplates DieCutTemplate[]
  variants        ProductTemplateVariant[]
  authorPartner   Partner? @relation("PackagingSystemAuthor", fields: [authorPartnerId], references: [id])
  authorAdmin     User?    @relation("PackagingSystemAdminAuthor", fields: [authorAdminId], references: [id])
  reviewedBy      User?    @relation("PackagingSystemReviewer", fields: [reviewedById], references: [id])
}
enum PackagingKind { CAN BOTTLE POUCH BOX CAPSULE_JAR TUB OTHER }
enum PackagingSystemStatus { DRAFT ADMIN_REVIEW PUBLISHED ARCHIVED }

// REVISED: DieCutTemplate now belongs to a PackagingSystem; represents ONE printable surface
model DieCutTemplate {
  id                String   @id @default(cuid())
  packagingSystemId String                                 // mandatory: which packaging this surface belongs to
  surfaceName       String                                 // "Front Panel", "Back Panel", "Cap Top"
  surfaceKind       SurfaceKind                            // FRONT / BACK / TOP / BOTTOM / SIDE_LEFT / SIDE_RIGHT / WRAP_FULL / CAP / NECK / OTHER
  surfaceOrder      Int                                    // display order in the studio surface picker
  required          Boolean  @default(true)                // must this surface be designed before order can ship?
  // Physical specs
  widthMm           Decimal
  heightMm          Decimal
  bleedMm           Decimal  @default(3)
  dieCutSvgKey      String?                                // R2 key for the die-cut SVG path
  printableAreaSvg  String?                                // SVG path for safe printable area
  // Compliance anchors: legal positions per region (creator picks one per region in V1)
  complianceAnchors Json                                   // { nutritionPanel: [{name, x, y, w, h}, ...], ingredients: [...], allergens: [...], netWeight: [...], ... }
  // Technical print spec
  substrate         String?                                // "Aluminum", "PET label", "Kraft paper"
  finish            String?                                // "Matte", "Gloss", "Satin"
  inkLimitPct       Int?     @default(300)                 // Total Area Coverage limit
  status            DieCutTemplateStatus  @default(DRAFT)
  reviewedById      String?
  reviewNotes       String?
  reviewedAt        DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  // Relations
  packagingSystem   PackagingSystem      @relation(fields: [packagingSystemId], references: [id], onDelete: Cascade)
  labelDesignTemplates LabelDesignTemplate[]
  designSurfaces    DesignSurface[]
  reviewedBy        User? @relation("DieCutReviewer", fields: [reviewedById], references: [id])
  @@index([packagingSystemId, surfaceOrder])
}
enum SurfaceKind { FRONT BACK TOP BOTTOM SIDE_LEFT SIDE_RIGHT WRAP_FULL CAP NECK OTHER }
enum DieCutTemplateStatus { DRAFT ADMIN_REVIEW PUBLISHED ARCHIVED }

// NEW: LabelDesignTemplate — visual layout within a DieCutTemplate (surface)
model LabelDesignTemplate {
  id                String   @id @default(cuid())
  dieCutTemplateId  String                                 // mandatory: which surface this fits
  name              String                                 // "Modern Minimalist Front"
  description       String?
  authorType        AuthorType
  authorPartnerId   String?
  authorAdminId     String?
  isPremium         Boolean  @default(false)               // V1.1: Master-tier only
  status            LabelDesignTemplateStatus  @default(DRAFT)
  templateKind      TemplateKind  @default(HTML_CSS)
  templateBody      String                                 // raw HTML+CSS or React component path
  // Fill zones (what the creator edits in the brand-fill form)
  fillZones         Json                                   // [{key, type, maxLength, label, ...}]
  // Default-on fields with hideable flags (creator can toggle visibility on hideable ones)
  defaultOnFields   Json                                   // [{key: 'netWeight', hideable: true}, {key: 'allergenStatement', hideable: false}, ...]
  thumbnailKey      String?
  reviewedById      String?
  reviewNotes       String?
  reviewedAt        DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  // Relations
  dieCutTemplate    DieCutTemplate  @relation(fields: [dieCutTemplateId], references: [id], onDelete: Cascade)
  authorPartner     Partner?  @relation("LabelTemplateAuthor", fields: [authorPartnerId], references: [id])
  authorAdmin       User?     @relation("LabelTemplateAdminAuthor", fields: [authorAdminId], references: [id])
  reviewedBy        User?     @relation("LabelTemplateReviewer", fields: [reviewedById], references: [id])
  designSurfaces    DesignSurface[]
  @@index([dieCutTemplateId, status, isPremium])
}
enum LabelDesignTemplateStatus { DRAFT ADMIN_REVIEW PUBLISHED ARCHIVED }
enum AuthorType { PARTNER ADMIN }
enum TemplateKind { HTML_CSS REACT_COMPONENT }

// REVISED: Design is now an umbrella over multiple per-surface DesignSurfaces
model Design {
  id                String   @id @default(cuid())
  productId         String   @unique
  status            DesignStatus  @default(DRAFT)
  approvedAt        DateTime?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  // Relations
  product           Product  @relation(fields: [productId], references: [id], onDelete: Cascade)
  surfaces          DesignSurface[]
}
enum DesignStatus { DRAFT IN_PROGRESS ERROR APPROVED }

// NEW: per-surface design (one row per DieCutTemplate within the product's PackagingSystem)
model DesignSurface {
  id                       String   @id @default(cuid())
  designId                 String
  dieCutTemplateId         String                          // which surface this is
  source                   DesignSource
  // Path A: uploaded
  uploadedPdfKey           String?
  uploadValidationResult   Json?                           // {ok, warnings, errors, perFieldChecks}
  // Path B: template-based
  labelDesignTemplateId    String?
  brandFillData            Json?                           // {brand_name, logo_image_key, primary_color, ...}
  positionChoices          Json?                           // {nutritionPanel: 'bottom-strip', ingredients: 'right-side', ...} — which legal position picked per region
  hiddenFields             String[] @default([])           // ['netWeight', 'address'] — fields creator chose to hide (AI scan verifies presence)
  aiScanResult             Json?                           // {scannedAt, fieldsFound, fieldsMissed, confidence}
  // Output (both paths)
  finalPdfKey              String?                         // R2 key for final CMYK PDF
  finalPreviewJpgKey       String?
  status                   DesignSurfaceStatus  @default(DRAFT)
  approvedAt               DateTime?
  createdAt                DateTime @default(now())
  updatedAt                DateTime @updatedAt
  // Relations
  design                   Design               @relation(fields: [designId], references: [id], onDelete: Cascade)
  dieCutTemplate           DieCutTemplate       @relation(fields: [dieCutTemplateId], references: [id])
  labelDesignTemplate      LabelDesignTemplate? @relation(fields: [labelDesignTemplateId], references: [id])
  @@unique([designId, dieCutTemplateId])                   // one DesignSurface per (Design, DieCutTemplate)
  @@index([status])
}
enum DesignSource { TEMPLATE UPLOAD }
enum DesignSurfaceStatus { DRAFT IN_RENDER VALIDATION_FAILED AI_SCAN_FAILED APPROVED }

// ProductTemplateVariant gains FK to PackagingSystem (replacing the old single-dieCutTemplate link)
model ProductTemplateVariant {
  // ... existing fields ...
  packagingSystemId String?
  packagingSystem   PackagingSystem? @relation(fields: [packagingSystemId], references: [id])
  // Old `dieCutTemplateId` field is deprecated — kept temporarily for migration, then dropped in a follow-up migration
}
```

**Migration plan:**
- New models created (PackagingSystem, DesignSurface)
- DieCutTemplate gets new fields (packagingSystemId, surfaceName, etc.)
- For existing DieCutTemplates that aren't grouped: create a default PackagingSystem per template (1-surface system); set surfaceName = template.name; surfaceKind = OTHER
- Design.uploadedPdfKey / labelDesignTemplateId / brandFillData / finalPdfKey moved to DesignSurface (one per surface)
- After 1-2 weeks of dual-write, drop the deprecated fields on Design and DieCutTemplate

### Server pipelines

**Template render pipeline** (Path B):
- Server action: `renderLabelDesign({ designId })`
- Pull `LabelDesignTemplate.templateBody` (HTML+CSS) + `Design.brandFillData`
- Pull recipe nutrition + ingredients + allergens from compliance service
- Substitute fill zones (Handlebars-style or React server component if `templateKind=REACT_COMPONENT`)
- Composite the rendered compliance SVGs into the declared anchors
- Use Puppeteer (headless Chrome) to render HTML → PDF at print dimensions
- Convert to CMYK via Ghostscript post-processing
- Upload to R2 → store key on `Design.finalPdfKey`
- Lives in new `packages/design-render` package

**Upload validation pipeline** (Path A):
- Server action: `validateUploadedDesign({ designId, fileBuffer })`
- Use `pdf-lib` to inspect PDF metadata (page count, dimensions, color mode, embedded fonts)
- Use `pdf2pic` to rasterize the page → OCR via Tesseract.js → check for required compliance text
- Use Ghostscript to verify CMYK + DPI
- Return `{ok, warnings, errors}` → if `ok`, accept; if errors, reject with field-level messages
- Lives in `packages/design-validate` package

### UI surface (creator app)

| Route | Purpose |
| --- | --- |
| `/products/[id]/design` | Design Studio landing — two tabs: "Pick a template" (Path B) and "Upload your own" (Path A) |
| `/products/[id]/design/template/[templateId]` | Template editor — left panel: brand-fill form; right panel: live preview |
| `/products/[id]/design/upload` | Upload page with drag-drop + validation results |
| `/products/[id]/design/preview` | Full-resolution preview before final approval |

The existing product overview step 2 ("Design label") points here and unlocks once customize is complete + compliance passes.

### UI surface (partner + admin authoring)

| Route | Purpose |
| --- | --- |
| `/partner/templates/die-lines` | Partner's die-line library |
| `/partner/templates/die-lines/new` | Create a die-line (upload SVG, set specs) |
| `/partner/templates/labels` | Partner's label-design templates |
| `/partner/templates/labels/new` | Create a label-design template within a die-line |
| `/admin/templates/die-lines` | Admin's central die-line library + review queue |
| `/admin/templates/labels` | Admin's label-design library + review queue |
| `/admin/templates/queue` | All pending template submissions awaiting admin approval |

### Notifications wired

| Event | Audience | Channel |
| --- | --- | --- |
| Partner publishes a template (status → ADMIN_REVIEW) | Admin | in-app + email |
| Admin approves template (status → PUBLISHED) | Authoring partner | in-app + email |
| Admin requests template changes | Authoring partner | in-app + email |
| Creator's design upload fails validation | Creator | in-app toast |
| Creator's design approved | Creator | in-app |

---

## V1 effort estimate

Net new build (on top of existing schema scaffolding):

| Item | Effort |
| --- | --- |
| Schema additions (PackagingSystem, DieCutTemplate refactor, LabelDesignTemplate, Design, DesignSurface) + migration with backfill | 1 day |
| Packaging system authoring UI (partner + admin) — add many DieCutTemplates per system | 1.5 days |
| Per-surface DieCutTemplate authoring (dimensions, legal-position picker for compliance regions, default-on field flags) | 1.5 days |
| Label-design template authoring UI (HTML/CSS body editor with preview, hideable-fields declarations) | 2 days |
| Admin review queue UI | 0.5 day |
| Template render pipeline (Puppeteer + CMYK + R2 + compliance overlay + per-surface batching) | 2.5 days |
| Upload validation pipeline (pdf-lib + Tesseract OCR + Ghostscript + per-field detection) | 2 days |
| AI compliance scan for hidden fields (Tesseract keyword match + structural heuristics) | 1.5 days |
| Creator Design Studio with multi-surface stepper (surface picker + progress badges + completion check) | 2 days |
| Creator template editor (brand-fill form + visibility toggles + position picker + live preview) | 2 days |
| Creator upload page + per-surface validation UI | 1 day |
| Wire-up to order flow (Design.surfaces[].finalPdfKey passed to LABEL dispatch) | 0.5 day |
| Notification wiring (per-surface validation fail, AI scan fail, design approved) | 0.5 day |
| End-to-end smoke test | 1 day |

**Total: ~19.5 working days (~4 weeks)** — revised up from ~13.5 days after the multi-surface model + AI scan additions (Pavel direction 2026-05-19).

V1 total impact: Design Studio slot in PLATFORM_SPEC.md was Weeks 4-6 (3 weeks); now Weeks 4-7 (4 weeks). Pushes overall V1 from ~10 weeks to ~11 weeks. Net +1 week for substantially better correctness + creator experience.

---

## V1.1 additions (post-launch — Pavel-prioritized 2026-05-19)

| # | Feature |
| --- | --- |
| DS-V1.1-1 | **Regular vs Premium templates** with tier gating. Maker + Builder see Regular library; Master tier unlocks Premium templates (high-quality designs, exclusive artists/agencies). Tier filter built into the template picker. |
| DS-V1.1-2 | **Multiple Nutrition Facts panel variants** + **deterministic rules engine** to auto-select the right variant per 21 CFR 101.9. Variants: Standard Vertical, Tabular (limited surface area), Linear (very small packages), Dual-Column (per-serving + per-container), Aggregate (multiple-product display), Supplement Facts panel, Bilingual (English+Spanish). Admin or manufacturer can override the rules-engine pick per ProductTemplate. |
| DS-V1.1-3 | **Brand management assets library** — creator uploads logos, registers font choices, defines color palettes per brand. Reusable across all designs. Centralized brand-consistency check. |
| DS-V1.1-4 | **Color palette → template re-shuffle** — creator picks/selects a palette → template grid re-ranks templates that visually match that palette. Helps creators find brand-consistent templates faster. |
| DS-V1.1-5 | **Barcode + QR code generator** — GS1-compliant barcodes (UPC, EAN), custom QR codes with embedded creator URLs. Drag-to-template zones. |
| DS-V1.1-6 | **Version history** for designs — every "Save" creates a new version; creator can preview/restore any prior version. Production-ordered designs are pinned (immutable reference). |
| DS-V1.1-7 | **Side-by-side template comparison** — preview the same brand data across 3 templates at once |
| DS-V1.1-8 | **AI-assisted brand-fill suggestions** — creator describes brand vibe in natural language; AI suggests color palette + font pair + 2-3 best-fit templates. (Light-touch AI for V1.1, not full generation.) |
| DS-V1.1-9 | **Template marketplace browsing** — searchable library of label-design templates by aesthetic (minimal / bold / heritage / etc.), separate from product browsing |

## V2 additions

| # | Feature |
| --- | --- |
| DS-V2-1 | **Full Fabric.js canvas** — creator drags any element freely. Required for true free-form movement; opens up creative range beyond template+brand-fill. Per Pavel: this is the V2 target. |
| DS-V2-2 | **Movable compliance regions with real-time validation** (canvas-based) — drag nutrition panel anywhere; system validates font-size minimums, contrast ratio, overlap, legal zones in real-time |
| DS-V2-3 | **2D + 3D visualizer** — admin uploads 3D model per packaging (can, bottle, pouch); creator's design wraps the 3D mockup; creator can rotate 360° to preview |
| DS-V2-4 | **AI Nutrition Facts advisor** — natural-language explanation of why a particular Nutrition Facts variant was picked + suggested alternatives ("I picked Linear because container surface is <12 sq in...") |
| DS-V2-5 | **AI generation of label variations** (Option D from the V1 scope discussion) — creator describes brand vibe, AI generates 3-5 label variations within the chosen template structure. Uses image-gen API constrained to template's compliance zones. |
| DS-V2-6 | **AI font + color recommendations** based on brand vibe + target audience |
| DS-V2-7 | **Variant-specific label edits** — flavor X uses different color than flavor Y; same template, per-variant overrides |
| DS-V2-8 | **A/B testing labels** — split production: 250 units with Design A, 250 with Design B; track sell-through on creator's channel |

## V2 AI Template Agent — production engine for LabelDesignTemplate library

**Discussed with Pavel 2026-05-24.** DS-V2-5 above (AI generation of label variations) is *creator‑facing* — the creator describes their brand vibe and AI generates 3–5 templated variations. This subsection covers the separate but related *admin‑facing* engine that grows the LabelDesignTemplate library itself, so the V1‑seeded ~20 templates can scale to hundreds without proportional curator labor.

### Three‑sub‑agent pipeline

| Sub‑agent | Role | Input | Output |
|---|---|---|---|
| **Trend Researcher** | Monthly scan of design publications, packaging trend boards, recent product launches in each productCategoryFit. | A category + month | `DesignTrendReport` row: synthesized themes, reference image board (no copyrighted reproductions), recommended style direction |
| **Template Generator** | Per trend report + per PackagingType + die-line constraints (printable area, bleed, mandatory zones from `MANUFACTURER_PRODUCT_BUILDER.md` §6.1a's PackagingSurface), generates N visual variations via image-gen API (FLUX / Imagen / Midjourney). Validates output against mandatory zones before saving. | A trend report + a (PackagingType, surface) pair | Draft LabelDesignTemplate rows in status DRAFT |
| **Auto‑Tagger** | Vision LLM analyzes each generated template, fills out: styleTags, productCategoryFit, color-palette dominant tones, suggested tier (PREMIUM if luxury feel / fine detail, REGULAR otherwise), readability score, mandatory-zone-compliance score. | A DRAFT LabelDesignTemplate | Tags + tier suggestion + quality score populated |

A human curator then sees a queue at `/admin/library/label-templates/curator-queue` — drafts ranked by auto-tagger quality score. They approve/reject/edit/set price/publish. Approval moves DRAFT → PENDING_REVIEW → ACTIVE.

### IP + safety constraints (non-negotiable)

- Trend Researcher aggregates themes, never copies specific products or names competing brands in prompts.
- Generator prompts NEVER contain "in the style of Brand X" — themes only, never source attribution.
- Every template stores `createdBy = AI_AGENT` + `aiSubAgent = "Generator-vN"` + `trendReportId` so admin always knows provenance.
- Mandatory-zone validation runs post‑generation; templates that violate die-line printable area or required compliance zones auto‑reject before the curator queue.
- No template publishes without human approval in V2; even in V2.5 semi‑autonomous mode (see below), AI signals drive curator attention, never bypass it.

### Roadmap stages

| Stage | When | What |
|---|---|---|
| **V1** | Now | Schema (tier + compatibility + provenance fields on LabelDesignTemplate). Filtering in Design Studio. ~20 hand-curated templates seeded by contracted designer. |
| **V1.5** | Post-launch | Premium / Exclusive billing flow + Stripe entitlements. Necessary plumbing before AI-produced premium content has anywhere to land. |
| **V2** | Major release after V1.5 | Three sub-agent pipeline + curator queue. Targets ~50–100 templates / month with ~4–8h / month of curator labor. Estimated ~$100–200/month in AI API costs. |
| **V2.5** | Iteration | Auto-tagger trained on curator approve/reject signals; high-confidence templates auto-publish to a "Beta" shelf labeled as such; curator only reviews flagged ones. |
| **V3** | Differentiator | Per-partner brand-styled generation — Generator takes a partner's brand kit (logo, palette, voice from company profile) and produces templates already pre-styled for them. Premium-tier feature. |

### Cost model

At V2 production rate (~100 templates/month entering curator queue, ~50 published):
- Image generation: $0.04–0.08 per variant × 10 variants per source × 100 = ~$50/month
- Vision LLM auto-tagging: ~$0.01 × 100 = ~$1/month
- Trend Researcher (Claude or similar): $2–5 per report × monthly = ~$60/year
- Total: ~$50–60/month in API costs + ~4–8h/month curator labor

Compared to a contracted designer at ~5–10 templates/week for ~$5k/month, the economics flip fast once the platform has >100 active partners.

### Forward dependency

Requires the Asset Management library (FOD delta §1.2 — V1.1) to be in place before V2 can store generated templates with proper versioning. Don't schedule the AI agent until Asset Management has shipped.

## V3+ additions

| # | Feature |
| --- | --- |
| DS-V3-1 | **AI short video generator** — creator inputs product + brand → AI generates short video with branded text overlay → post to creator's connected social channels (Instagram, TikTok, YouTube Shorts). Marketing-asset generator on top of the design system. |
| DS-V3-2 | **Collaborative design** — invite a freelance designer to edit your label (real-time multiplayer on the canvas) |
| DS-V3-3 | **Multi-channel publishing automation** — design once, auto-generate channel-specific assets (Instagram square vs YouTube vertical vs Amazon listing thumbnail vs Shopify product photo) |

---

## Open items going into build

1. **Template body format** — HTML+CSS (Handlebars-substitution) vs React Server Components. HTML+CSS is simpler; React allows richer interactivity. Default: HTML+CSS for V1.
2. **CMYK conversion library** — Ghostscript (mature, GPL) vs commercial libs (PDFTron, $$$). Default: Ghostscript via subprocess.
3. **PDF render service location** — apps/creator API route vs separate `services/design-render` Fly.io Python service. Default: apps/creator API route for V1; extract to dedicated service in V1.1 if performance becomes an issue.
4. **OCR provider** — Tesseract.js (free, on-device) vs Google Cloud Vision (paid, more accurate). Default: Tesseract for V1; upgrade if OCR false-rejects are causing creator friction.
5. **Template preview rendering** — full Puppeteer (slower, exact) vs lighter HTML→canvas2png (faster, less accurate). Default: full Puppeteer for V1 since renders run server-side asynchronously.

---

## Changelog

- **2026-05-19** Spec locked: V1 ships Path A (upload) + Path B (template + brand-fill). Authoring by partners + admin. Compliance regions auto-injected and locked. 3-week build estimate. Supersedes `docs/CANVAS_ENGINE.md` (Fabric.js canvas deferred to V2+).
- **2026-05-19** Expanded vision pass: V1 compliance regions changed from "locked" to "preset legal positions" (creator picks from declared options via form, no canvas). V1 adds: ready-to-use phrases library, certificate badges, default-on packaging labels (Net Weight, Address, "Produced for", etc.). V1.1 substantially expanded: Regular/Premium template tiers, multiple Nutrition Facts variants + rules engine, brand assets library, color-palette template re-shuffle, barcode/QR generator, version history. V2 confirmed as Full Fabric.js canvas with 3D visualizer + AI advisor + AI variation generator. V3+ adds AI video generator + collaborative design.
- **2026-05-24** LabelDesignTemplate expanded with V1 compatibility fields (compatiblePackagingTypeIds, compatibleSurfaces, productCategoryFit, styleTags) + tier model (REGULAR/PREMIUM/EXCLUSIVE) + provenance fields (createdBy, aiSubAgent, trendReportId, humanCuratorId). Design Studio auto-filtering by those fields locked. New V2 section: AI Template Agent (three sub-agent pipeline — Trend Researcher + Template Generator + Auto-Tagger) with human curator queue, IP/safety constraints, cost model, and roadmap stages V1→V1.5→V2→V2.5→V3. Pavel-prioritized 2026-05-24 — depends on Asset Management (FOD_ADMIN_DELTA §1.2) landing first.
