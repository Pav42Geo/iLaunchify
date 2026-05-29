# Print Finishes — architecture plan

**Status:** V1.5+ planning doc. V1 ships the Design Studio canvas + export PDF; the Finishes drawer is gated behind a partner-offers-finishes flag that always returns false in V1. This doc captures the full architecture so we can ship in phases when the first print partner is ready to offer them.

The goal: a real print partner (printer / co-packer with print capability) can describe their finish offerings in their service profile, the creator sees only the finishes their bound partner supports, picks where to apply them on the canvas, and the printer receives a precise machine-readable manifest at order time — with cost surfaced live in the studio at every step.

---

## 1. Finish catalog — what we'll support

Print finishes split into six functional categories. The list below is the master `FinishType` catalog the admin curates. Each is implemented progressively as partners request them.

### 1.1 Surface finishes (sit on top of the printed art)

| Slug | Name | Typical use | Notes |
|---|---|---|---|
| `spot-uv-gloss` | Spot UV Gloss | Selective gloss on matte stock | Most common premium effect; high-contrast |
| `flood-uv` | Flood UV / Full Gloss | Whole-design gloss | Overall protective + shine |
| `matte-laminate` | Matte Laminate | Velvet-soft feel | Adds durability |
| `gloss-laminate` | Gloss Laminate | High shine all-over | Wet-look |
| `soft-touch-coating` | Soft-Touch Coating | Velvet / suede feel | Tactile premium |
| `pearlescent-coating` | Pearlescent Coating | Subtle shimmer | Cosmetics / beauty |
| `aqueous-coating` | Aqueous Coating | Water-based protection | Eco-friendly seal |
| `anti-microbial-coating` | Anti-Microbial Coating | Food / medical | Health claim use |
| `scented-varnish` | Scented Varnish | Activate-by-rub | Personal care / promo |

### 1.2 Foil + metallic effects

| Slug | Name | Typical use |
|---|---|---|
| `hot-foil-stamping` | Hot Foil Stamping | Gold/silver/copper/rose/holo metallic application |
| `cold-foil` | Cold Foil | Applied during print run; cheaper than hot |
| `digital-foil` | Digital Foil (e.g. Scodix) | Foil without dies; short runs |
| `holographic-foil` | Holographic Foil | Rainbow-shifting iridescent |

### 1.3 Embossing / debossing / texture

| Slug | Name |
|---|---|
| `blind-embossing` | Blind Embossing — raised, no ink |
| `registered-embossing` | Registered Embossing — raised, aligned to ink |
| `debossing` | Debossing — recessed |
| `letterpress` | Letterpress — debossed with ink |
| `thermography` | Thermography — raised "engraving" ink |
| `3d-raised-print` | 3D Raised Print (e.g. Scodix Sense) |

### 1.4 Cut + die operations

| Slug | Name |
|---|---|
| `die-cut` | Custom die-cut shape |
| `kiss-cut` | Kiss-cut (stickers, label sheets) |
| `through-cut` | Through-cut (full cut) |
| `window-cut` | Window cut (transparent panel on box) |
| `perforation` | Perforation (tear strips) |
| `score-crease` | Score / crease lines (for folding) |

### 1.5 Ink types

| Slug | Name |
|---|---|
| `spot-pantone` | Pantone spot color match |
| `metallic-ink` | Metallic ink (gold/silver/copper) |
| `fluorescent-ink` | Fluorescent / neon ink |
| `white-ink` | White ink (for transparent / dark substrates) |
| `clear-uv-ink` | Clear UV-reactive ink |
| `security-microtext` | Security ink / microtext / UV taggant |
| `thermochromic-ink` | Thermochromic (heat-sensitive) ink |
| `photochromic-ink` | Photochromic (UV-sensitive) ink |

### 1.6 Substrate + material

**Out of scope for the Finishes drawer.** Pavel confirmed substrate / material selection lives in the **post-canvas checkout stepper** (Phase G), not in the Design Studio. The Finishes drawer is purely about effects applied ON the design — foil, varnish, embossing, ink type. Material happens after.

That said, the Finishes drawer still needs to know the chosen substrate so it can hide incompatible finishes (e.g. foil that doesn't bond to a specific film). The checkout-stepper substrate choice flows back into the design studio as read-only context, and a finish whose `compatibleSubstrates` doesn't include the chosen material gets greyed out with "Not compatible with selected packaging material."

See `docs/DESIGN_STUDIO_REBUILD.md` for the post-canvas wizard step inventory.

### 1.7 Special effects

| Slug | Name |
|---|---|
| `lenticular` | Lenticular (motion / 3D illusion) |
| `nfc-embedded` | NFC chip embedded |
| `scratch-off` | Scratch-off layer |
| `glow-in-the-dark` | Phosphorescent (glow-in-the-dark) ink |
| `glitter-coating` | Glitter / sparkle finish |

---

## 2. Schema

### 2.1 Admin-curated catalog

```prisma
model FinishType {
  id            String              @id @default(cuid())
  slug          String              @unique
  name          String
  category      FinishCategory      // SURFACE | FOIL_METALLIC | EMBOSS_TEXTURE | CUT | INK | SUBSTRATE | SPECIAL
  description   String              @db.Text
  // Default application modes this finish CAN support — partners can restrict
  // to a subset when they add their offering.
  applicationModes ApplicationMode[]
  // Reference / "what it looks like" sample (admin-uploaded)
  exampleAssetId String?
  // Printer-facing default spec text — used as a starting template when
  // partner doesn't override.
  defaultPrinterSpec String?        @db.Text
  status        BrandLibraryStatus  // DRAFT | ACTIVE | DEPRECATED
  createdAt     DateTime            @default(now())
  updatedAt     DateTime            @updatedAt
}

enum FinishCategory {
  SURFACE
  FOIL_METALLIC
  EMBOSS_TEXTURE
  CUT
  INK
  SPECIAL
  // SUBSTRATE intentionally absent — material selection lives in the
  // post-canvas checkout stepper (Phase G), not the Design Studio.
}

enum ApplicationMode {
  WHOLE_DESIGN          // Whole label/whole panel
  TEXT_ONLY             // All text objects
  IMAGE_ONLY            // All image objects
  TEXT_AND_IMAGES       // All non-NFR objects
  OBJECT_SELECTION      // Creator picks specific objects (most powerful)
  REGION_MASK           // Creator draws a polygon mask
  COLOR_BASED           // Apply wherever specific colors appear
  UPLOADED_MASK         // Creator uploads a separate mask layer PDF/PNG
}
```

### 2.2 Partner offering

A partner adds a `PartnerFinish` row per finish they offer. This is the live source of truth for what the creator sees in the Finishes drawer.

```prisma
model PartnerFinish {
  id              String        @id @default(cuid())
  partnerServiceId String                          // Scoped to a specific service
  finishTypeId    String
  // Partner-friendly overrides
  name            String?                          // "Premium Spot UV" instead of "Spot UV Gloss"
  description     String?       @db.Text           // Sales copy + technical notes for the creator
  // Pricing model — see PRICING_MODEL section below
  pricingMode     FinishPricingMode
  basePriceCents  Int           @default(0)        // Setup fee per order
  perUnitPriceCents Int         @default(0)        // Per printed unit
  pricePerSqInCents Int?                           // For PER_AREA mode
  pricePerObjectCents Int?                         // For PER_OBJECT mode
  pricePerColorCents Int?                          // For PER_COLOR mode
  pricingTiers    Json?                            // For TIERED — [{ minQty, perUnitCents }]
  // Lead-time + MOQ impact
  leadTimeDays    Int           @default(0)        // Added to base lead time
  moqMin          Int           @default(0)        // Min order qty for this finish
  // Application
  availableModes  ApplicationMode[]                // Subset of FinishType.applicationModes the partner supports
  // Substrate compatibility — slugs of substrates this finish works on
  compatibleSubstrates String[]
  maxCoveragePct  Float?                           // % of total area; e.g. some finishes max at 30% area
  // Sample assets — what this looks like on a real product
  sampleAssetIds  String[]
  // Status
  status          FinishStatus  // DRAFT | ACTIVE | DISCONTINUED
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt
  // Relations
  partnerService  PartnerService @relation(fields: [partnerServiceId], references: [id], onDelete: Cascade)
  finishType      FinishType     @relation(fields: [finishTypeId], references: [id])
  applications    DesignFinishApplication[]

  @@index([partnerServiceId, status])
  @@index([finishTypeId])
}

enum FinishPricingMode {
  FLAT_PER_ORDER     // One-time setup fee, no per-unit
  PER_UNIT           // Same cost per printed unit
  PER_AREA           // Per square inch (or square mm) of coverage
  PER_OBJECT         // Per object selected
  PER_COLOR          // Per spot color used
  TIERED             // Volume tiers
}

enum FinishStatus {
  DRAFT
  ACTIVE
  DISCONTINUED
}
```

### 2.3 Per-design finish application

When the creator picks a finish in the studio, we write a `DesignFinishApplication` linked to the active `DesignVersion`. This is what the printer ultimately receives.

```prisma
model DesignFinishApplication {
  id              String          @id @default(cuid())
  designVersionId String
  partnerFinishId String
  // Application detail
  applicationMode ApplicationMode
  // For OBJECT_SELECTION — fabric customId stamps the creator picked.
  objectRefs      String[]
  // For COLOR_BASED — hex colors the creator picked.
  colorFilters    String[]
  // For REGION_MASK — polygon points in mm, relative to trim box origin.
  regionPolygons  Json?           // [[{x,y}, ...], ...]
  // For UPLOADED_MASK — asset id of the mask layer (PDF / PNG with alpha).
  maskAssetId     String?
  // Creator note to the printer (free text)
  creatorNotes    String?         @db.Text
  // Cached cost at last save — re-computed on every change so the Studio
  // shows a live cost.
  estimatedPerUnitCents Int       @default(0)
  estimatedSetupCents   Int       @default(0)
  coverageSqIn    Float?
  objectCount     Int?
  spotColorCount  Int?
  // Relations
  designVersion   DesignVersion   @relation(fields: [designVersionId], references: [id], onDelete: Cascade)
  partnerFinish   PartnerFinish   @relation(fields: [partnerFinishId], references: [id])
  createdAt       DateTime        @default(now())
  updatedAt       DateTime        @updatedAt

  @@index([designVersionId])
}
```

### 2.4 Tiny additions elsewhere

- `Product` gains `pricingBreakdown: Json?` cache so the cost panel can avoid re-querying every render.
- `OrderItem` snapshots the finish applications at order placement so partner-side changes after the fact don't change a paid order.

---

## 3. Pricing model

A finish's contribution to the per-unit price has up to three layers:

1. **Setup fee** (`basePriceCents`) — one-time per order. Foil dies, etched plates, etc.
2. **Per-unit fee** that depends on the partner's pricing mode:
   - `FLAT_PER_ORDER` — already covered by setup
   - `PER_UNIT` — `perUnitPriceCents`
   - `PER_AREA` — `pricePerSqInCents × coverageSqIn`
   - `PER_OBJECT` — `pricePerObjectCents × objectCount`
   - `PER_COLOR` — `pricePerColorCents × spotColorCount`
   - `TIERED` — look up the unit price for the chosen order qty in `pricingTiers`
3. **Lead-time + MOQ impact** — surfaces alongside the cost in the studio so the creator sees the tradeoff.

The studio re-calculates on every finish change. The number shown in chat is always the partner's number — iLaunchify doesn't mark it up at the per-finish level (the platform fee is a separate line on the order).

---

## 4. Creator UX

### 4.1 Finishes left-rail icon — conditional

The Finishes icon in the left rail shows only when **all** of:
- The product has a manufacturer + printer assigned (or a single combined partner)
- That partner has ≥1 `PartnerFinish` with `status = 'ACTIVE'`
- The current die-cut's substrate is in at least one finish's `compatibleSubstrates`

When none of those is true, the icon is hidden — no "Coming soon" placeholder. The slot is reserved in the rail config but doesn't render.

### 4.2 Finishes drawer

Mirrors Vistaprint's flow but generalized.

**Top — finish picker.** List of available finishes from the partner, grouped by category, with sample image + headline price. Cards show:
- Name
- Category badge
- Sample image (or icon if no sample)
- Headline price (e.g. "+$0.45/unit")
- Lead-time impact (e.g. "+2 days")
- "Add" button

**Middle — applied finishes.** For each finish the creator added, a panel with:
- Application-mode picker (Vistaprint-style cards: Text only / Image only / Text and images / Pick objects / Color / Upload mask). Each card shows a preview of what gets affected.
- For **OBJECT_SELECTION**: enters "finish-picking mode" — the canvas shows a colored overlay on every clickable object; the creator clicks to toggle which get the finish. Selected objects show a colored ring matching the finish.
- For **COLOR_BASED**: a multi-select color picker showing colors used on the canvas, plus a custom hex entry.
- For **REGION_MASK**: enters polygon-draw mode on the canvas.
- For **UPLOADED_MASK**: file upload widget — accepts PDF (preferred) or PNG with alpha.
- Notes field — free text to the printer ("Apply to the red bottom border only, not the corner accent").
- Live cost breakdown for this finish.
- Delete button.

**Bottom — summary card.** Total per-unit cost across all finishes + total setup + total lead-time impact.

### 4.3 Cost surfacing — always visible

A persistent **Pricing chip** sits in the top bar (between Save status and Compliance). Always visible. Shows the running per-unit + setup totals. Click → expands a popover with the full breakdown:

- Base print cost (manufacturer/printer base)
- Finish A — $0.45/unit (200 units = $90)
- Finish B — $0.12/unit (setup $25)
- ─
- Lead time: 7 days (+2 for foil)
- MOQ: 500 (raised by foil minimum)
- Estimated per-unit: $X.XX
- Total order at current qty: $XX.XX

Updates live whenever the creator toggles a finish on/off.

### 4.4 Ready-to-go (imported) designs

This is the hard case Pavel called out. When the creator uploaded a finished PDF (no editable Fabric objects), `OBJECT_SELECTION` and `COLOR_BASED` modes can't infer anything — the canvas has nothing structured for the creator to click on.

Two compatible paths:

**Path 1 (preferred): UPLOADED_MASK mode.**
For each finish, the creator uploads a SEPARATE mask layer — typically a PDF with the same page size where black areas indicate "apply finish here." Vistaprint uses this for foil specifically. The studio shows the mask overlaid (in the finish's accent color) over the original artwork for visual confirmation.

**Path 2 (fallback): annotated PDF.**
If the creator can't produce a mask layer, the studio offers a "Mark up the existing design" interaction: a polygon/freeform overlay tool that draws REGION_MASKs directly on top of the uploaded PDF preview. Exported as the same mask spec the printer would have received from Path 1.

Either path produces the same `DesignFinishApplication.maskAssetId` so the printer's workflow doesn't fork.

### 4.5 What the partner sees

When the partner accepts the order, the finish manifest comes through alongside the print PDF:

```json
{
  "designVersionId": "...",
  "finishes": [
    {
      "partnerFinishId": "...",
      "name": "Spot UV Gloss",
      "category": "SURFACE",
      "applicationMode": "OBJECT_SELECTION",
      "objectRefs": ["logo-pavel-georgiev", "url-soundcrew"],
      "creatorNotes": "Only the metallic-looking text. Avoid the small red footnote.",
      "estimatedCoverageSqIn": 3.2,
      "maskAssetId": null
    },
    {
      "partnerFinishId": "...",
      "name": "Hot Foil Stamping",
      "category": "FOIL_METALLIC",
      "applicationMode": "UPLOADED_MASK",
      "maskAssetUrl": "https://r2.../foil-mask.pdf",
      "creatorNotes": "Gold foil only",
      "estimatedCoverageSqIn": 1.8
    }
  ]
}
```

For each finish, the partner's order detail page shows:
- The finish name + their own pricing
- The application mode + the parameters (object list / colors / polygon / mask preview)
- The creator's notes
- A "Confirm" / "Request clarification" pair so QC happens before press setup

The mask asset is downloadable in its original PDF form so it imports straight into Esko / Adobe / etc.

---

## 5. Partner Service UX (printer adds their finishes)

The partner's Service Profile gains a new "Finishes catalog" tab next to their existing Packaging Catalog and Certifications.

For each finish, the partner:
- Picks the FinishType slug from the admin master list (via a searchable picker)
- Optionally renames it ("Premium Foil" vs "Hot Foil Stamping")
- Writes sales copy + technical notes
- Picks the pricing mode + plugs in the numbers
- Selects which application modes they support (e.g. they may only support `WHOLE_DESIGN` and `UPLOADED_MASK` for foil)
- Selects compatible substrate slugs
- Uploads sample images
- Sets status → ACTIVE when done

Admin can review new partner finishes as part of the existing partner verification queue (same FSM, new section).

---

## 6. Phased implementation

**Phase F1 (schema only)** — current work area. Adds `FinishType`, `PartnerFinish`, `DesignFinishApplication` to the schema and seeds the admin catalog with the 30+ master finish types listed above. No UI; ships behind the hidden rail icon.

**Phase F2 (partner-side)** — partner Service Profile "Finishes" tab + admin verification queue extension. The first partner can describe their offerings. Still no creator-side UI; admin can preview.

**Phase F3 (creator-side, basic)** — Finishes drawer appears for products bound to a partner that has finishes. Supports the simpler application modes first: `WHOLE_DESIGN`, `TEXT_ONLY`, `IMAGE_ONLY`, `TEXT_AND_IMAGES`, `UPLOADED_MASK`. Cost chip in top bar. Live cost in drawer.

**Phase F4 (creator-side, advanced)** — `OBJECT_SELECTION` (canvas-picking mode with colored ring overlay), `COLOR_BASED`, `REGION_MASK` (polygon draw tool).

**Phase F5 (printer manifest)** — finish manifest delivered with print PDF on order dispatch + partner-side order-detail UI to confirm finish parameters.

**Phase F6 (ready-to-go designs)** — uploaded-PDF "mark up existing design" tool, so creators can flag finish regions on imported artwork without re-creating it in iLaunchify.

Each phase is independently shippable; partners and creators benefit incrementally.

---

## 7. Implementation gotchas to remember

- **Coverage calculation.** `PER_AREA` pricing means we need to know the area of selected objects. Fabric's `obj.getBoundingRect()` gives a px box; convert via the active `pxPerMm` and account for the bleed multiplier. For text objects, bounding box overestimates coverage — finishes that care (foil) typically charge by bounding box anyway, so this is fine. Document the convention.
- **Object IDs persist.** For `OBJECT_SELECTION` to work, every object needs a stable id that survives autosave + reload. We already stamp `customRole` for label sections (DS-55); extend to a `customId` UUID on every object at add time, persisted via `CANVAS_PROPERTIES_TO_INCLUDE`.
- **Substrate awareness.** When the creator changes the die-cut variant (which may imply a different substrate), recompute which finishes are still compatible and prompt before silently removing incompatible ones.
- **Cost snapshot at order placement.** OrderItem captures the finish applications + the pricing in effect at that moment. Partner price changes don't retroactively change paid orders.
- **MOQ ratcheting.** Some finishes ratchet the order MOQ upward (foil dies are expensive at small qty). The studio shows this BEFORE the creator commits.
- **Production-order checkout integration.** The order-placement flow (Phase G) reads finish applications + adds them to the line items. Each finish is a separate line so the partner sees them itemized.

---

## 8. What ships in DS-70 today

- This planning doc.
- A hidden rail entry for `'finishes'` with a `partnerOffersFinishes` flag. V1 always passes `false` (no partner data yet), so the icon doesn't render.
- A placeholder `FinishesDrawer` component used only when the flag is on. Renders an empty-state explaining what will appear here.

When Phase F1 (schema) lands, the seed populates `FinishType`. Phase F2 lights up the partner side. Phase F3 flips `partnerOffersFinishes` to true for products whose bound partner has ≥1 active finish, and the rail entry becomes visible without any further canvas-side change.
