# V1 Asset Library — 4-layer architecture

> **STATUS: SPEC ONLY — NOTHING SHIPPED.** V1 Track D. Independent of Tracks A/B/C.

> Locked 2026-06-03 — Pavel-approved. Layer 1 partner/admin; Layer 2 Unsplash/Pexels free + Shutterstock paid behind Builder/Agency; Layer 3 Iconify free; Layer 4 stubbed in V1, built in V1.5.

## Architecture principle

Different asset categories require different sourcing strategies because they have different licensing realities. A single "API integration" framing is wrong. The four layers:

| Layer | Category | Sourcing | Licensing model | V1 |
|---|---|---|---|---|
| 1 | Compliance/regulatory graphics (cert marks, FDA panels, packaging symbols, hazard pictograms, recycling marks) | Admin-curated + partner-uploaded under license | Trademark/public domain | ✓ ship via C7 cert variant pipeline |
| 2 | Stock photography (lifestyle backgrounds, ingredient/hero photos) | API integration | Royalty-free + commercial license | ✓ Unsplash/Pexels free; Shutterstock paid |
| 3 | Vector elements (icons, decorative graphics, illustrations) | CDN + curated supplement | MIT / OFL / public domain | ✓ Iconify.design + curated |
| 4 | AI-generated assets (custom illustrations on demand) | Anthropic + Replicate/Together AI | Per-generation cost, no per-use fee | Schema in V1; build in V1.5 |

## Layer 1 — Compliance graphics

**Scope:** certification marks (USDA Organic, Non-GMO Project, Fair Trade), FDA panel templates (handled by Track C compliance templates), packaging symbols (recycling triangles 1-7, FSC marks, "this side up", "fragile"), hazard pictograms (GHS for chemicals), allergy icons, dietary marks (kosher, halal, vegan).

These are NOT on Shutterstock — they're trademark-controlled (Non-GMO Project, USDA Organic require licensing from the certifying body) or standardized public-domain symbols (recycling triangles, hazard pictograms).

**Sourcing:**
- **Partner-uploaded under license** — partner provides cert PDF + acknowledges they hold license to use the mark per Certificates V1.5 C6 partner document vault flow
- **Admin-curated** — standard public-domain symbols (recycling 1-7, accessibility marks, GHS pictograms) seeded by admin into the master library

**No automated scraping.** The certs roadmap C7 covers the contractor research pipeline for the ~85 cert variants — that work continues in V1.5 cert track.

**Schema:** uses existing `CertificateType` + `CertificateAssetVariant` from the certs roadmap. New additions:

```prisma
model RegulatoryAsset {
  // Generic compliance graphics not tied to a cert (recycling marks, hazard pictograms)
  id              String   @id @default(uuid())
  category        RegulatoryAssetCategory
  name            String                       // "Recycling Symbol 1 (PETE)"
  description     String?
  svgFileKey      String                       // R2
  pngFileKey      String?                      // optional raster fallback
  applicableMarkets String[]                   // ["US", "CA", "EU"]
  publicDomain    Boolean   @default(true)
  source          String?                      // attribution if required
  status          OfferingStatus
}

enum RegulatoryAssetCategory {
  RECYCLING_SYMBOL
  HAZARD_PICTOGRAM_GHS
  FSC_FOREST_STEWARDSHIP
  ACCESSIBILITY_MARK
  COUNTRY_OF_ORIGIN
  WARNING_SYMBOL
  DIETARY_MARK            // vegan, kosher, halal — generic versions; trademarked ones are CertificateType
  STORAGE_INSTRUCTION
  OTHER
}
```

Surfaced in the Studio "Compliance Symbols" drawer (new) alongside the existing certificate picker.

## Layer 2 — Stock photography

**Scope:** lifestyle backgrounds, ingredient photography, hero shots, abstract textures, food photography for packaging design.

**Sourcing strategy — two tiers:**

### Free tier (default, all creators)

- **Unsplash API** — 150k+ photos, free for commercial use, no attribution required (recommended but optional). Rate-limited to 50 requests/hour on Demo tier; 5000/hour after approval. Free.
- **Pexels API** — 100k+ photos, free for commercial use, no attribution required. Rate limit: 200 requests/hour. Free.

Both APIs return image metadata + thumbnail + multiple resolutions. We display thumbnails inline in the Studio drawer; full-resolution downloads only when creator commits to use in a design.

### Paid tier (Builder + Agency)

- **Shutterstock API** — Enterprise license $200-500/mo for moderate volume; per-search and per-download counted against monthly quota
- Access tier-gated: free for Maker, unlocked for Builder ($49/mo creator subscription) and Agency ($199/mo)

```prisma
model StockPhotoSearchProvider {
  id              String   @id
  slug            String   @unique          // "unsplash" | "pexels" | "shutterstock"
  name            String
  isFreeForUser   Boolean                    // false for Shutterstock
  requiredTier    CreatorTier?               // null for free; "BUILDER" for Shutterstock
  apiEndpoint     String
  // Credentials stored in env, not DB
}

model StockPhotoUsage {
  // Audit log of which photos used in which designs
  id                  String   @id @default(uuid())
  designVersionId     String
  provider            String                  // "unsplash"
  externalAssetId     String                  // unsplash photo ID
  attribution         String?                 // photographer name if needed
  originalUrl         String
  cachedFileKey       String                  // R2 — our cached copy
  resolution          String                  // "1920x1080"
  usedAt              DateTime  @default(now())
}
```

### UI in the Studio

A new "Photos" drawer in the left rail with:
- Search box (queries the active provider)
- Provider switcher pill ("Unsplash" / "Pexels" / "Shutterstock" — last one with lock icon if tier-gated)
- Grid of thumbnail results
- On click: place full-resolution into canvas + log `StockPhotoUsage`
- Attribution footer when required (Unsplash recommends; Pexels recommends)

### Cost protection

- Cache hits to R2 for 90 days (avoid re-downloading the same photo across multiple creators)
- Tier check on every Shutterstock query (server action, not client)
- Per-creator quota for Shutterstock: 50 photos/month for Builder, 200/month for Agency (configurable via `PlanFeature`)
- Excess quota triggers upgrade prompt or hard cap

## Layer 3 — Vector elements

**Scope:** icons, decorative graphics, social-media-style stickers, illustrations, geometric shapes, dividers, emoji-style elements.

**Sourcing strategy:**

### Primary — Iconify.design CDN

- 200,000+ icons across 150+ icon sets
- MIT-licensed, OFL, public domain (Iconify aggregates icons that are individually licensed for commercial use)
- Free, no API key required, served via CDN at `https://api.iconify.design/{prefix}:{name}.svg`
- Search via Iconify's metadata API

```typescript
async function searchIconify(query: string, limit = 60): Promise<IconifyResult[]> {
  const response = await fetch(
    `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=${limit}`
  );
  const data = await response.json();
  return data.icons; // ["mdi:flower", "material-symbols:nature", ...]
}

function iconifySvgUrl(iconId: string): string {
  return `https://api.iconify.design/${iconId}.svg`;
}
```

### Supplement — curated library

Admin-curated set of brand-quality vector assets for high-value categories:
- Decorative ornaments
- Brand badges / sticker shapes
- Borders and frames
- iLaunchify-commissioned illustrations for popular niches (honey, supplements, beauty, etc.)

```prisma
model CuratedVectorAsset {
  id              String   @id @default(uuid())
  category        VectorAssetCategory
  name            String
  svgFileKey      String                       // R2
  tags            String[]
  niche           String?                      // tie to specific niche if relevant
  license         String                       // "iLaunchify-commissioned", "OFL-1.1", etc.
  status          OfferingStatus
}

enum VectorAssetCategory {
  ORNAMENT
  BADGE_SHAPE
  BORDER
  FRAME
  ILLUSTRATION
  STICKER
  DIVIDER
  DECORATIVE_ELEMENT
}
```

### UI

"Icons" drawer in Studio (or extend existing element drawer):
- Search box hitting Iconify API
- Filter: All / Iconify / Curated
- Grid of SVG thumbnails
- On click: insert into canvas as Fabric SVG group

## Layer 4 — AI-generated assets (V1.5 build, V1 schema only)

**Scope:** custom illustrations on demand, brand-specific imagery, on-brand iconography.

**Provider strategy:**
- **Anthropic API** for prompt refinement (Claude refines vague creator prompts into image-gen-ready instructions)
- **Replicate** or **Together AI** for image generation (Stable Diffusion XL, Flux, etc.) — cost $0.02-0.05 per image

**V1 deliverables (schema only):**

```prisma
model AiGeneratedAsset {
  id                  String   @id @default(uuid())
  designVersionId     String?                 // tied to design if used
  creatorUserId       String                  // who generated
  
  promptOriginal      String                  // creator's input
  promptRefined       String                  // Claude-refined version
  
  provider            String                  // "replicate-sdxl" | "together-flux"
  modelVersion        String
  
  costUsd             Decimal  @db.Decimal(8, 4)
  
  outputFileKey       String                  // R2
  thumbnailFileKey    String?
  
  status              AiAssetStatus
  generatedAt         DateTime @default(now())
}

enum AiAssetStatus { GENERATING COMPLETE FAILED REJECTED }
```

**Tier-gated per `PlanFeature`:**
- Maker: 0 generations/month (locked, upgrade prompt)
- Builder: 20 generations/month
- Agency: 100 generations/month

V1 ships only the schema + a stub "Coming in V1.5" UI placeholder in the Studio. V1.5 builds the full flow alongside the Recipe Builder AI parser (shared `@ilaunchify/ai` package).

## Studio drawer integration

The Studio left rail gains four new drawers (or extends existing ones) in V1:

```
LEFT RAIL DRAWERS (existing + new)
  Templates     ← existing
  Components    ← NEW — multi-component switcher (per _V1_PACKAGING_COMPONENTS.md)
  Text          ← existing
  Photos        ← NEW — Layer 2 stock photography (Unsplash/Pexels/Shutterstock)
  Icons         ← NEW — Layer 3 vectors (Iconify + curated)
  Compliance    ← NEW — Layer 1 regulatory graphics + certs
  Brand         ← existing — Brand identity assets (logos, colors, fonts)
  Backgrounds   ← existing
  AI Generate   ← V1 stub "Coming V1.5"
  Layers        ← existing
```

Each drawer maintains its own state, search context, and tier-aware controls.

## Attribution + license tracking

Every used asset writes a row to `AssetUsageLog`:

```prisma
model AssetUsageLog {
  id                  String   @id @default(uuid())
  designVersionId     String
  layer               AssetLayer              // LAYER_1 | LAYER_2 | LAYER_3 | LAYER_4
  assetReferenceId    String                  // ID in the relevant model
  assetReferenceType  String                  // "RegulatoryAsset" | "StockPhotoUsage" | "CuratedVectorAsset" | "IconifyIcon" | "AiGeneratedAsset"
  
  attributionRequired Boolean
  attributionText     String?                 // photographer name, etc.
  licenseDigest       String                  // hash of license terms snapshot at time of use
  
  usedAt              DateTime @default(now())
}

enum AssetLayer { LAYER_1 LAYER_2 LAYER_3 LAYER_4 }
```

Surface attribution requirements:
- In the export bundle's spec sheet
- In a per-DesignVersion "Asset attributions" report
- For Layer 2 Unsplash: photographer name included in design metadata even if attribution is "recommended not required"

## Cost projection (monthly)

| Source | Cost | Notes |
|---|---|---|
| Unsplash | $0 | Free API |
| Pexels | $0 | Free API |
| Iconify CDN | $0 | Free CDN |
| Shutterstock Enterprise | $200-500/mo | Paid tier — covered by Builder/Agency subscriptions |
| Anthropic API (prompt refinement for V1.5 Layer 4) | ~$0.001 per prompt | Cheap |
| Replicate/Together (image gen for V1.5) | $0.02-0.05/image | ~$50-200/mo at 100 creators × 30 gens average |
| R2 storage (cached assets) | ~$15/mo per 1TB | Scales with usage |
| **Total V1** | **~$200-500/mo at 100 creators** | Almost all from Shutterstock + R2 |
| **Total V1.5** | **~$250-700/mo** | Adds AI generation costs |

Well within Builder/Agency subscription revenue.

## Tasks for Claude Code

| # | Slice | Lift |
|---|---|---|
| D1.a | RegulatoryAsset schema + seed (recycling symbols 1-7, GHS pictograms, FSC mark, basic dietary marks) | ~½ day |
| D1.b | Existing CertificateType / CertificateAssetVariant integration with new Compliance drawer | covered in V1.5 cert track |
| D2.a | Unsplash API integration package — `@ilaunchify/asset-providers` with searchUnsplash + getUnsplashPhoto | ~½ day |
| D2.b | Pexels API integration — searchPexels + getPexelsPhoto | ~½ day |
| D2.c | Shutterstock API integration — searchShutterstock + tier gate + per-creator quota | ~1 day |
| D2.d | Photos drawer UI in Studio — search + provider switcher + grid + insert action | ~1 day |
| D2.e | StockPhotoUsage logging + R2 caching layer | ~½ day |
| D3.a | Iconify.design integration — search + svgUrl helpers | ~¼ day |
| D3.b | CuratedVectorAsset schema + admin CRUD | ~½ day |
| D3.c | Icons drawer UI in Studio — Iconify search + Curated filter | ~½ day |
| D4.a | AiGeneratedAsset schema + AiAssetStatus FSM | ~¼ day |
| D4.b | Studio "AI Generate" drawer stub — "Coming in V1.5" tier-gated placeholder | ~¼ day |
| D5.a | AssetUsageLog model + cross-cutting attribution tracking | ~½ day |
| D5.b | Attribution surfaces — spec sheet + per-DV report | ~½ day |
| D6.a | Compliance drawer UI — RegulatoryAsset grid + existing cert picker integration | ~½ day |

Total: **~7-8 days** focused. Mostly independent of Tracks A/B/C — can run in parallel.

## Paste-ready Claude Code prompt — D2.a (start with Unsplash)

```
Ship Slice D2.a — Unsplash API integration. Brief at
docs/builds/_V1_ASSET_LIBRARY.md.

Create new workspace package: packages/asset-providers/

1. package.json with @ilaunchify/asset-providers + zod dependency
2. src/unsplash.ts exporting:
   - searchUnsplash(query, page, perPage): Promise<UnsplashSearchResult>
   - getUnsplashPhoto(photoId): Promise<UnsplashPhoto>
   - Trigger Unsplash "download" tracking endpoint when full-resolution is fetched
   (Unsplash API ToS requires this for analytics)
3. Use UNSPLASH_ACCESS_KEY from env (add to .env.local)
4. Rate-limit guard — refuse requests if approaching 50/hour Demo tier

Verify: pnpm --filter @ilaunchify/asset-providers typecheck.

Then /ship "D2.a Unsplash API integration in @ilaunchify/asset-providers".
```

## See also

- `_V1_PACKAGING_COMPONENTS.md` — Components drawer in Studio
- `_certificates-roadmap.md` C7 — cert asset variant research pipeline
- `_recipe-builder-roadmap.md` — Layer 4 shares `@ilaunchify/ai` package with V1.5 AI Recipe Parser
- Memory: `ilaunchify-design-system-v1.md` — visual treatment for drawer chrome
