# Mockup & product-image strategy

**Status:** recommendation for discussion (2026-06-18). No build yet — this resolves "how do mockups live and operate" before we commit. Grounded in the existing Design Studio, packaging/die-line system, Asset model, DesignLibraryItem, and `docs/PACDORA_EVALUATION.md`.

## 0. The core reframe — three different things are being merged

The questions ("partner uploads real images", "platform mockup library", "admin recreates them", "AI mockups", "creator previews and checks out") are actually about **three distinct image layers**. Almost all the confusion dissolves once they're separated:

| Layer | What it is | Owned by | Where it lives | Shown where |
|---|---|---|---|---|
| **A. Product photo** | A real photo of the *white-label / unbranded* physical product (blank pouch, filled jar) | the **partner** (it's their product) | `Asset` (ownerType PRODUCT, type HERO/PRODUCT_IMAGE) → `ProductTemplate` | marketplace card + detail gallery (already wired) |
| **B. Mockup template** | The blank *print surface* a creator designs ON — a 2D photo with a defined print-area mask, or a 3D model with UV surfaces | the **platform/admin** (per packaging type) | `PackagingType` (`model3dKey` cols already exist) + `DesignLibraryItem` | Design Studio canvas substrate |
| **C. Rendered design** | The creator's artwork composited onto a mockup template → a realistic image of *their branded* product | the **creator** (per design) | `DesignVersion` (+ a render `Asset`) | creator preview, checkout, their own marketing |

Layer A is "what the product is." Layer B is "the canvas you design on." Layer C is "your design on the product." They have different owners, lifecycles, and storage. **The thing all your questions are really about is Layer B — the mockup template.**

## 1. Where mockups (Layer B) should live — on the PackagingType, not the product

Every product that uses the same physical container (e.g. "16 oz HDPE wide-mouth jar") shares the *same* mockup. So a mockup template belongs to the **PackagingType**, not to each ProductTemplate. Build one jar mockup → every jar product inherits it automatically. The schema is already pointed this way: `PackagingType.model3dKey / model3dSource / model3dThumbKey` exist, and `ProductTemplateVariant.packagingTypeId` binds a product to its packaging type.

This is the single biggest reuse win and it answers "how do they become live": admin attaches a mockup template to a PackagingType (DRAFT→ACTIVE), and it lights up for every product on that packaging type, with zero per-product work.

## 2. How mockup templates get created — the "what's best" answer (a hybrid, sequenced)

Not one method. A tier you can ship incrementally, cheapest-first:

**V1 — Admin-curated 2D photo-mockups (RECOMMENDED START).** Admin takes a real white-label product photo and draws the *printable region* on it (a 4-point perspective quad / mask). The creator's flat artwork warps into that region → a realistic 2D mockup. No Pacdora, no 3D pipeline, no AI. Works today with photos partners already have.
- **Where the photo comes from:** ask the **manufacturer to upload a clean white-label shot** of the bare product — they have these, it's literally their product. The partner-upload path already collects product photos (Layer A); admin *promotes* the best one into a Layer-B mockup template by adding the print-area mask. So "admin collects images from the partner and recreates them as mockups" = upload (partner) → mask (admin) → attach to PackagingType. No external recreation needed.

**V1.5 — Platform mockup LIBRARY (browseable).** Extend the existing `DesignLibraryItem` (12 already seeded, keyed by packaging type + styleTags) into an admin-curated, creator-browseable mockup library. This directly answers "admin adds his own at the start and can browse" — an admin library surface where admin uploads + tags mockups, creators filter by packaging type / style. Solves the "we might have none initially" worry: admin seeds it over time.

**V2 — 3D mockups via the in-house 3D packaging generator (schema already ready).** ~~Pacdora~~ **RESOLVED 2026-07-03: Pacdora no longer offers API integration → we BUILD** (per `PACDORA_EVALUATION.md` §7.4 fallback): parametric primitives + die-line-parse + fold-from-net engine producing geometry into `PackagingType.model3dKey`, rendered in three.js, creator design wrapped via CanvasTexture. Plan: `docs/PACKAGING_3D_GENERATOR_PLAN.md`.

**AI mockup generation — assist only, never the production-accurate preview.** This is a *production* marketplace: the checkout preview is a representation of the physical product the buyer will actually receive, so it must be faithful — same principle as Pavel's "labels are legal artifacts, build to spec, deterministic." An AI render can hallucinate a cap, finish, or proportion that doesn't match the real product → trust + liability problem at checkout. Use AI for: (a) clearly-labeled *placeholder* hero images when no real photo exists yet, and (b) future lifestyle/scene backgrounds. **Not** for the mockup substrate the creator designs on or approves at checkout.

## 3. How a creator uses them end-to-end (Layer C)

1. Creator picks a product → its variant resolves a `PackagingType` → that packaging type's **mockup template** (2D photo-mask now, 3D later) loads into the Design Studio.
2. Creator designs their label/artwork on the real die-line (this exists today — Fabric.js canvas + frames + compliance).
3. **Preview** = their Fabric artwork composited into the mockup's print region → a realistic image of their branded product (today: `MockupModal` shows it on stylized CSS shapes; the upgrade is to composite onto the real photo-mask / 3D model).
4. **Checkout** locks the `DesignVersion` (Fabric JSON) onto the `OrderItem` (already wired) and stores the rendered preview as an `Asset` for the order + the creator's own marketing.

So Layers B and C reuse infrastructure that's already built: Fabric canvas, die-line frames, DesignVersion capture, the Asset model.

## 4. Recommendation summary (decisions to confirm)

1. **Separate the three layers** in the data model + UI language. Stop calling all of it "images." (Layer A done; B+C are the work.)
2. **Mockup templates live on `PackagingType`**, inherited by every product on that packaging type.
3. **Start with admin-curated 2D photo-mockups**, sourced from **manufacturer-uploaded white-label photos** + an admin print-area mask. Cheapest, accurate, no dependency, leverages photos partners already have.
4. **Build the browseable library on existing `DesignLibraryItem` + `Asset` + `PackagingType`** — admin uploads/tags, creators browse by packaging type/style.
5. **3D = in-house build** (Pacdora API withdrawn 2026-07-03) — see `PACKAGING_3D_GENERATOR_PLAN.md`; the schema (`model3dKey`) is already staged.
6. **AI = labeled placeholders / scenes only**, never the production-accurate design-on-product preview.

## 5. Smallest first build (when you green-light it)

- Add `AssetType.MOCKUP_TEMPLATE` + a `PackagingTypeMockup` (or extend `DesignLibraryItem`) holding: packagingTypeId, base image Asset, print-area quad/mask JSON, status.
- Admin surface: upload a white-label photo for a packaging type + draw the print-area quad (reuse the Fabric frame editor that already exists partner-side).
- Studio: composite the creator's snapshot into the quad (CSS `clip-path`/perspective transform first; a server `sharp` warp for the checkout-grade render).
- Marketplace: the white-label product photo (Layer A) already shows; nothing new needed there.

Everything in §5 is 2D + reuses existing canvas/Asset code — no Pacdora, no three.js, no AI. It's the honest, cheap path that makes "design your branded product and see it real" work, and it stays compatible with the 3D upgrade later.

## 6. LOCKED decisions (Pavel 2026-06-18)

- **V1 source = 2D photo-mask, manufacturer-supplied.** Manufacturer uploads a white-label product photo → admin draws the print area → creator's artwork warps onto it. No Pacdora / 3D / AI dependency.
- **Owner = PackagingType.** One mockup per physical container, inherited by every product on it.
- **AI = labeled placeholders / scenes only**, never the production-accurate checkout preview.
- **3D = deferred** to the Pacdora decision (`PACDORA_EVALUATION.md`); schema staged (`PackagingType.model3dKey`). **UPDATE 2026-07-03: Pacdora withdrew API offering → resolved to in-house build (`PACKAGING_3D_GENERATOR_PLAN.md`).**

## 7. Build slices

**Substrate — DONE (commit `db07fbb`, additive; Mac migration pending):**
- `enum MockupTemplateStatus`, `model MockupTemplate` (packagingTypeId, baseImageAssetId, printAreaQuad JSON [TL,TR,BR,BL in 0..1], surfaceKey?, status, displayOrder), `PackagingType.mockupTemplates`, and `AssetType.MOCKUP_TEMPLATE`.

**Slice 1 — Admin curation (Cowork-buildable, admin app):** an admin surface to manage a packaging type's mockup templates — upload the white-label base photo (needs an admin R2 upload path; reuse the existing upload mechanism), draw/enter the print-area quad (reuse the partner-side Fabric frame editor), set status DRAFT→ACTIVE. `@@index([packagingTypeId, status])` already supports the read.

**Slice 2 — Studio composite (HAND TO CODE — creator Design Studio is its hot-file zone):** resolve the active mockup template for the variant's PackagingType; composite the creator's Fabric snapshot into the `printAreaQuad` (CSS `clip-path`/perspective for the live preview; a server `sharp` perspective-warp for the checkout-grade render). Replaces `MockupModal`'s stylized CSS shapes with the real photo-mockup. Store the render as an `Asset` linked to the `DesignVersion`.

**Slice 3 — Library + browse (Cowork-buildable):** roll mockup templates into a browseable library (extend `DesignLibraryItem` or a thin view), filterable by packaging type + style, for admin curation + creator selection.

Marketplace needs nothing new — the white-label product photo (Layer A) already renders on cards + detail (`getHeroImageMap` / `getTemplateGalleryImages`, commit `ac89ecb`).
