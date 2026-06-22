# Handoff to Code — Design Studio "Brand" rail tool + "Save as template"

Single-writer handoff (Cowork → Code). These changes live in the Studio canvas hot
zone (`apps/creator/src/app/(studio)/products/[productId]/design/canvas/CanvasLayoutShell.tsx`
and siblings), which is Code's. Cowork has already shipped everything OUTSIDE the
canvas — schema, tier limits, db helpers, the `/brands` hub, and the Templates tab.
Code owns the in-canvas pieces below.

Spec + decisions: `docs/BRAND_KIT_PROPOSAL.md` (DECIDED 2026-06-22). Scope is locked
to `ilaunchify-brand-assets-not-design-system` (logos + colors + fonts only; NO
brand voice).

## Already shipped by Cowork (do NOT rebuild — just consume)

- `BrandTemplate` model + `Brand.brandTemplates` (additive; Mac `db push` pending).
- `@ilaunchify/auth`: `brandLimits(tier)` → `{ kits, templatesPerKit }`
  (Maker 1/3 · Builder 3/15 · Agency ∞/∞). Gate ONLY kit + template counts.
- `@ilaunchify/db`: `listBrandTemplates(brandId)`, `countBrandTemplates(brandId)`,
  `createBrandTemplate({brandId,name,canvasJson,thumbnailUrl?,packagingTypeId?})`,
  `deleteBrandTemplate(brandId,id)` (all cast-guarded).
- `/brands` Brand Kit hub + `/brands/[id]/assets` Templates section (list + delete).
- Audit entities `Brand`, `BrandTemplate` already in `AUDIT_ENTITY_TYPES`.

## 1. Add a "Brand" tool to the left rail

The rail today renders 11 tools (Product, Label, Text, Images, Graphics, Clipart,
Background, Pattern, QR Code, Barcode, Layers). Add **Brand** (suggest icon: a
palette/brand badge) near the top, after Label. Selecting it opens the standard
slide-out drawer (same 400px drawer pattern as the other tools).

The canvas already imports a `BrandCanvasAssets` type — wire the drawer to the
active brand's assets (logos/colors/fonts) the same way the color pickers + font
list already consume them.

## 2. Brand drawer contents

- **Active brand switcher** — creators are multi-brand. A dropdown of the creator's
  brands; selecting one sets the active kit for this Studio session (and re-pins its
  swatches/fonts). Source: `prisma.brand.findMany({ where: { creatorProfile: { userId } } })`.
- **Logos** — thumbnails of PRIMARY/ICON/HORIZONTAL (resolve via the existing
  `resolveAssetUrl` helper already in `cert-badge-actions.ts`). Click/drag → drop onto
  the canvas as an image object (reuse the Images-drawer drop path).
- **Colors** — the brand swatches (colorPrimary/Secondary/Accent + brandSwatches).
  Click → apply to the selected object's fill / text color.
- **Fonts** — brand fonts (`brandFontIds` → TypographyFont). Click → apply to the
  selected text object.
- **Templates** — `listBrandTemplates(activeBrandId)`; click a template → load its
  `canvasJson` onto the stage (a "start from template" / replace-design action, gated
  by your existing unsaved-changes guard).
- **Apply brand** (one-click) — recolor + font-swap the whole current design to the
  active kit. Nice-to-have; can land in a follow-up.
- Footer: **Edit brand kit →** linking to `/brands/[activeBrandId]/assets` (cross to
  the dashboard app — use the creator URL helper, plain `<a>`).

## 3. "Save as template" (creation)

Add to the Studio menu (the ☰ where "Save draft" lives): **Save as template**.

Flow:
1. Prompt for a template name.
2. Enforce the cap BEFORE saving: `countBrandTemplates(activeBrandId)` vs
   `brandLimits(tier).templatesPerKit`. At cap → toast "Template limit reached for
   this kit ({n}); upgrade or delete one." (mirror the `/brands` hub copy).
3. `createBrandTemplate({ brandId: activeBrandId, name, canvasJson: <current Fabric
   JSON>, thumbnailUrl: <reuse the snapshot-thumbnail capture you already do for
   EditSnapshot>, packagingTypeId: <current product's packaging type, if known> })`.
4. Audit: `logAuditAs(user, { entityType: 'BrandTemplate', entityId: id, action:
   'BRAND_TEMPLATE_CREATED' })`.

`canvasJson` is a bare `String` column (CockroachDB — no `@db.Text`); pass the
Fabric `toJSON()` string straight through.

## Guardrails

- Reuse existing canvas plumbing (Images drop, color/font apply, snapshot thumbnail,
  unsaved-changes guard) — don't introduce a parallel system.
- Ownership: only ever read/write brands where `creatorProfile.userId === session user`.
- Keep it additive to the rail array + drawer switch; no rewrite of the shell.
- After Mac `db push`, the cast-guarded db helpers return real data automatically.
