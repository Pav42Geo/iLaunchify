# Handoff to Code — Mockup Slice 2: studio composite (design → real product mockup)

**Owner:** Code (the creator Design Studio is its hot-file zone).
**Goal:** replace `MockupModal`'s stylized CSS shapes with the **real photo-mockup** — composite the creator's flat artwork into the admin-curated print area on a white-label product photo, for the live preview and a checkout-grade render. Per `docs/MOCKUP_STRATEGY.md` (locked: 2D photo-mask, PackagingType-owned).

## 0. What already exists (do not rebuild)

- **Substrate (commit `db07fbb`, additive, Mac migration pending):** `model MockupTemplate { packagingTypeId, baseImageAssetId, printAreaQuad Json [TL,TR,BR,BL in 0..1], surfaceKey?, status, displayOrder }`, `PackagingType.mockupTemplates`, `AssetType.MOCKUP_TEMPLATE`.
- **Admin curation (Slice 1, commit `d2fe213`):** `/admin/asset-management/product-mockups` — admin uploads the white-label photo + drags the 4-corner print area + flips DRAFT→**ACTIVE**. So ACTIVE `MockupTemplate` rows exist with a real base photo (`Asset.publicUrl`) and a `printAreaQuad`.
- **Studio today:** `apps/creator/src/app/(studio)/products/[productId]/design/canvas/MockupModal.tsx` renders `<Mockup variant snapshot dieCut />` where `snapshot = snapshotCanvasTrimmed({ canvas, dieCut, pxPerMm, multiplier: 2 })` (a trim-cropped PNG **data URL** of the visible label). `variant` cycles FLAT/BOTTLE/TUB/POUCH/BOX/STICKER — pure CSS/SVG shapes, no real photo.
- **Capture:** `DesignVersion.designJson` (Fabric JSON) locks onto `OrderItem.designVersionId` at checkout. `DesignVersion.exportedPdfAssetId` is the precedent for attaching a rendered asset.

## 1. Resolve the mockup (loader)

In the canvas page loader `apps/creator/.../design/canvas/page.tsx` (already loads `product.variant`):
1. Add `packagingTypeId` to the `variant` select.
2. When set, resolve the ACTIVE mockup: `MockupTemplate` where `packagingTypeId = variant.packagingTypeId`, `status = 'ACTIVE'`, prefer `surfaceKey = 'front'` else `displayOrder` first. Cast-guard the read (pending migration), same pattern as Slice 1's page.
3. Resolve `baseImageAssetId → Asset.publicUrl`.
4. Pass down a `mockup?: { imageUrl: string; printAreaQuad: {x:number;y:number}[]; label: string } | null` prop through the canvas shell into `MockupModal`.

**Graceful fallback (REQUIRED):** if no ACTIVE mockup (null packagingTypeId, none curated, or no publicUrl) → `mockup` is `null` and `MockupModal` keeps the existing stylized CSS variants. Nothing breaks where mockups aren't curated yet.

## 2. MockupModal — add the "Real product" variant

`MockupModal` already has the trim-cropped `snapshot` (PNG data URL) and now also receives `mockup`. When `mockup` is present:
- Add a **"Product photo"** variant (make it the default when present) alongside the existing shapes.
- Render: the base photo (`mockup.imageUrl`) with the `snapshot` **perspective-warped into `mockup.printAreaQuad`** on top.

**Live-preview composite — recommended: CSS `matrix3d`.** Compute the homography that maps the snapshot's unit square → the quad (in container-relative px), express it as a CSS `matrix3d(...)`, and apply it to an `<img src={snapshot}>` absolutely positioned over the base photo. This is GPU-cheap, deterministic, and handles true perspective (4 arbitrary corners). Reference: general "rect-to-quad" projective transform → `matrix3d` (the standard `getTransform(from4, to4)` homography; e.g. the well-known `transformationFromTriangles`/`general2DProjection` snippet). Put the math in a small pure util `lib/quadTransform.ts` with a unit test (it's pure — testable without the canvas).
- Keep the existing download button; for the real variant it downloads the composited preview.

## 3. Checkout-grade render (server)

The live `matrix3d` preview is for the screen; the order needs a stable rendered image.
- On "add to order" / checkout (where `DesignVersion` is created/locked), generate a **server-side composite**: warp the snapshot PNG into the `printAreaQuad` over the base photo. `sharp` is affine-only, so use a homography warp (node-canvas per-triangle / a small perspective warp) → composite onto the base → output PNG. Keep it deterministic (no AI).
- Upload the result as an `Asset` (`ownerType 'DESIGN'`, `ownerId = designId`, `type 'PRODUCT_IMAGE'` or a new `RENDER` type, `source 'TEMPLATE_RENDER'`).
- Link it: add `DesignVersion.renderedMockupAssetId String?` (additive) **or** resolve by `Asset.ownerId = designId`. The render rides along with `OrderItem.designVersionId` already.
- This rendered image is also what should populate the creator's own product preview / marketing (Layer C in MOCKUP_STRATEGY.md).

If the server warp is more than you want in this slice, ship §1–§2 (live preview) first and stub §3 behind a follow-up — but the live preview alone already delivers "design your branded product and see it real."

## 4. Multi-surface (later, not this slice)

A packaging type may have several ACTIVE mockups (front/back/wrap). Slice 2 picks one (front). A surface switcher in `MockupModal` is a follow-up; the data (`surfaceKey`) is already there.

## 5. Acceptance

- Product whose variant's PackagingType has an ACTIVE mockup → MockupModal shows the artwork warped into the real photo's print area; dragging corners in admin moves where the art lands.
- Product with no ACTIVE mockup → existing stylized variants, no error.
- The `printAreaQuad` from admin maps 1:1 (0..1 image-relative) onto the displayed base photo at any size.
- Checkout stores a render Asset linked to the DesignVersion (if §3 shipped).
- `quadTransform` util has a unit test (identity quad → identity transform; known quad → known corners).
- Typecheck `apps/creator` + `packages/ui` clean.

## 6. Files

- `apps/creator/.../design/canvas/page.tsx` — resolve ACTIVE mockup (loader), thread `mockup` prop.
- `apps/creator/.../design/canvas/MockupModal.tsx` — "Product photo" variant + composite.
- `apps/creator/.../design/canvas/lib/quadTransform.ts` (new, pure) + test — rect→quad homography → `matrix3d`.
- Checkout/DesignVersion path (`apps/creator` cart/checkout actions) — server render + Asset + link (§3).
- `packages/db` — optional `DesignVersion.renderedMockupAssetId String?` (additive) and/or `AssetType.RENDER`.

No marketing change (Layer A product photos already render). No admin change (Slice 1 ships the curation). Substrate migration already staged.
